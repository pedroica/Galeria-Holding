// A rotina diária, num lugar só. Chamada por dois donos:
//   • api/cron/agent-daily.ts    — Vercel Cron, se o Mac não estiver ligado
//   • agent/src/worker/daemon.ts — o Mac 24h
// Quem chamar primeiro no dia executa; o segundo vê a marca em `settings` e
// não repete. Assim os dois coexistem sem gastar crédito em dobro.

import type { AgentEnv } from "../config.ts";
import type { Runtime } from "../agents/orchestrator.ts";
import { createWhatsApp } from "../channels/whatsapp.ts";
import { logEvent, type SupabaseClient } from "../tools/supabase.ts";
import { formatCmoReport, runCmoBatch, todayInSaoPaulo } from "./daily-cmo.ts";

export const CHAVE_ULTIMA_RODADA = "ultima_rodada_diaria";
export const CHAVE_HEARTBEAT = "worker_heartbeat";

export async function lerSetting<T = unknown>(
  db: SupabaseClient,
  key: string,
): Promise<T | undefined> {
  try {
    const rows = await db.select<{ value: T }>("settings", `select=value&key=eq.${key}`);
    return rows.length ? rows[0].value : undefined;
  } catch {
    return undefined;
  }
}

export async function gravarSetting(db: SupabaseClient, key: string, value: unknown): Promise<void> {
  try {
    await db.upsert("settings", [{ key, value, updated_at: new Date().toISOString() }], "key");
  } catch (e) {
    // Não derruba a rotina, mas também não some: se a marca de "já rodei hoje"
    // não grava, a rotina repete o dia inteiro e ninguém fica sabendo por quê.
    console.error(
      `[settings] falhei ao gravar '${key}':`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

export interface ResultadoRotina {
  executou: boolean;
  motivo?: string;
  dia: string;
  texto: string;
  entrega: "texto" | "template" | null;
}

/**
 * Lote de CMOs + lembretes do dia + relatório no WhatsApp.
 * `forcar` ignora a marca de "já rodei hoje" (usado no disparo manual).
 */
export async function runDailyRoutine(
  rt: Runtime,
  env: AgentEnv,
  opts: { forcar?: boolean } = {},
): Promise<ResultadoRotina> {
  const hoje = todayInSaoPaulo();

  if (!opts.forcar) {
    const ultima = await lerSetting<string>(rt.db, CHAVE_ULTIMA_RODADA);
    if (ultima === hoje) {
      return { executou: false, motivo: "já rodou hoje", dia: hoje, texto: "", entrega: null };
    }
  }

  const partes: string[] = [];

  // 1. Lote do buscador ─────────────────────────────────────────────────────
  if (rt.lusha) {
    try {
      const resumo = await runCmoBatch({
        db: rt.db,
        lusha: rt.lusha,
        blocklist: rt.blocklist,
        dryRun: env.dryRun,
        revelarTelefone: env.cmoRevealPhone,
        cotaDiaria: env.cmoDailyQuota,
        limiteCreditos: env.lushaDailyLimit,
        hoje,
      });
      partes.push(formatCmoReport(resumo, env.dryRun));
      await logEvent(rt.db, {
        kind: "cmo_lote_diario",
        channel: "lusha",
        message: `${resumo.processadas} processadas, ${resumo.novosContatos} contatos, ${resumo.creditosGastos} créditos`,
        payload: resumo,
        dry_run: env.dryRun,
      });
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : String(e);
      partes.push(`🔎 *Buscador de CMOs* falhou hoje: ${detalhe.slice(0, 200)}`);
      await logEvent(rt.db, {
        kind: "erro",
        channel: "lusha",
        level: "error",
        message: "lote diário de CMO: " + detalhe,
      });
    }
  } else {
    partes.push("🔎 Buscador parado: `LUSHA_API_KEY` não está configurada.");
  }

  // 2. Lembretes de hoje ────────────────────────────────────────────────────
  try {
    const lembretes = await rt.db.select<{ id: string; texto: string }>(
      "reminders",
      `select=id,texto&done=is.false&due_date=lte.${hoje}&order=due_date.asc&limit=20`,
    );
    if (lembretes.length) {
      partes.push(["", "🗂️ *Lembretes de hoje*", ...lembretes.map((l) => `• ${l.texto}`)].join("\n"));
      await rt.db.update("reminders", `id=in.(${lembretes.map((l) => l.id).join(",")})`, {
        done: true,
        delivered_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error("[rotina] lembretes:", e);
  }

  // 3. Relatório no WhatsApp ────────────────────────────────────────────────
  const texto = partes.join("\n");
  let entrega: ResultadoRotina["entrega"] = null;
  if (env.waOwnerNumber && env.waToken && env.waPhoneNumberId) {
    const wa = createWhatsApp({ token: env.waToken, phoneNumberId: env.waPhoneNumberId });
    entrega = await wa.sendProactive(env.waOwnerNumber, texto, process.env.WHATSAPP_TEMPLATE_NAME);
    if (!entrega) {
      // Fora da janela de 24h e sem template aprovado: fica no log e chega na
      // próxima vez que você mandar qualquer mensagem.
      await logEvent(rt.db, {
        kind: "relatorio_nao_entregue",
        channel: "whatsapp",
        level: "warn",
        message: "fora da janela de 24h da Meta e sem WHATSAPP_TEMPLATE_NAME",
        payload: { texto },
      });
    }
  }

  await gravarSetting(rt.db, CHAVE_ULTIMA_RODADA, hoje);
  return { executou: true, dia: hoje, texto, entrega };
}
