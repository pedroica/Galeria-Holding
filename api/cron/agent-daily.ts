// Rotina diária (Vercel Cron). Três coisas, nesta ordem:
//   1. lote do buscador de CMOs — "um pouquinho todo dia"
//   2. lembretes que vencem hoje
//   3. relatório no seu WhatsApp
//
// Protegido por CRON_SECRET: a URL é pública, o gatilho não pode ser.

import { loadEnv } from "../../agent/src/config.ts";
import { createRuntime } from "../../agent/src/agents/orchestrator.ts";
import { createWhatsApp } from "../../agent/src/channels/whatsapp.ts";
import { logEvent } from "../../agent/src/tools/supabase.ts";
import {
  formatCmoReport,
  runCmoBatch,
  todayInSaoPaulo,
} from "../../agent/src/jobs/daily-cmo.ts";

export const config = { maxDuration: 300 };

function autorizado(req: Request, segredo: string | undefined): boolean {
  if (!segredo) return false; // sem segredo configurado, ninguém dispara
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${segredo}` || req.headers.get("x-cron-secret") === segredo;
}

export default async function handler(req: Request): Promise<Response> {
  const env = loadEnv();
  if (!autorizado(req, env.cronSecret)) {
    return new Response("forbidden", { status: 403 });
  }

  const rt = await createRuntime();
  const hoje = todayInSaoPaulo();
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
      partes.push(
        ["", "🗂️ *Lembretes de hoje*", ...lembretes.map((l) => `• ${l.texto}`)].join("\n"),
      );
      await rt.db.update(
        "reminders",
        `id=in.(${lembretes.map((l) => l.id).join(",")})`,
        { done: true, delivered_at: new Date().toISOString() },
      );
    }
  } catch (e) {
    console.error("[cron] lembretes:", e);
  }

  // 3. Relatório no WhatsApp ────────────────────────────────────────────────
  const texto = partes.join("\n");
  let entrega: string | null = null;
  if (env.waOwnerNumber && env.waToken && env.waPhoneNumberId) {
    const wa = createWhatsApp({ token: env.waToken, phoneNumberId: env.waPhoneNumberId });
    entrega = await wa.sendProactive(
      env.waOwnerNumber,
      texto,
      process.env.WHATSAPP_TEMPLATE_NAME,
    );
    if (!entrega) {
      // Fora da janela de 24h e sem template aprovado. O relatório fica no log
      // e chega na próxima vez que você mandar qualquer mensagem.
      await logEvent(rt.db, {
        kind: "relatorio_nao_entregue",
        channel: "whatsapp",
        level: "warn",
        message: "fora da janela de 24h da Meta e sem WHATSAPP_TEMPLATE_NAME",
        payload: { texto },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, hoje, entrega, texto }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
