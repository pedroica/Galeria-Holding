// Cola de tudo: monta as dependências uma vez e responde uma mensagem.
// As funções da Vercel são finas de propósito — a lógica mora aqui, onde dá
// para testar sem HTTP.

import { loadEnv, missingSupabase, type AgentEnv } from "../config.ts";
import { createSupabase, logEvent, type SupabaseClient } from "../tools/supabase.ts";
import { createToolbox, type Toolbox, type ToolContext } from "../tools/registry.ts";
import { createCrmTools } from "../tools/crm.ts";
import { createLushaClient, type LushaClient } from "../lusha/client.ts";
import { BlocklistMatcher } from "../lib/blocklist.ts";
import { BLOCKLIST_SEED } from "../data/blocklist.seed.ts";
import { createProvider, decideBrain } from "../llm/router.ts";
import { runAgentLoop } from "../llm/loop.ts";
import type { AgentMessage } from "../llm/types.ts";
import { getPersona, PERSONAS } from "./personas.ts";
import { parseCommand, textoAjuda } from "./routing.ts";
import { clearSession, loadSession, saveSession } from "../session/store.ts";

export interface Runtime {
  env: AgentEnv;
  db: SupabaseClient;
  toolbox: Toolbox;
  lusha?: LushaClient;
  blocklist: BlocklistMatcher;
}

/** Monta o runtime. Lança se faltar Supabase — sem banco não há agente. */
export async function createRuntime(envSrc = process.env): Promise<Runtime> {
  const env = loadEnv(envSrc);
  const faltando = missingSupabase(env);
  if (faltando.length) throw new Error("Faltam variáveis: " + faltando.join(", "));

  const db = createSupabase({ url: env.supabaseUrl!, serviceKey: env.supabaseServiceKey! });

  // Blocklist vem do banco (fonte da verdade em produção) com fallback no seed.
  let entradas = BLOCKLIST_SEED;
  try {
    const rows = await db.select<any>(
      "blocklist",
      "select=id,canonical_name,aliases,domains,economic_group,note,active&active=is.true",
    );
    if (rows.length) {
      entradas = rows.map((r) => ({
        id: r.id,
        canonicalName: r.canonical_name,
        aliases: r.aliases || [],
        domains: r.domains || [],
        economicGroup: r.economic_group || undefined,
        note: r.note || undefined,
        active: r.active,
      }));
    }
  } catch {
    // Banco indisponível para a blocklist → seed local, que é conservador.
  }
  const blocklist = new BlocklistMatcher(entradas);

  const lusha = env.lushaApiKey
    ? createLushaClient({
        apiKey: env.lushaApiKey,
        baseUrl: process.env.LUSHA_BASE_URL,
        searchPath: process.env.LUSHA_SEARCH_PATH,
        enrichPath: process.env.LUSHA_ENRICH_PATH,
      })
    : undefined;

  const toolbox = createToolbox(
    createCrmTools({
      db,
      blocklist,
      lusha,
      cotaDiaria: env.cmoDailyQuota,
      limiteCreditos: env.lushaDailyLimit,
      revelarTelefone: env.cmoRevealPhone,
    }),
  );

  return { env, db, toolbox, lusha, blocklist };
}

export interface RespostaAgente {
  texto: string;
  agentId: string;
  modelo: string;
  iteracoes: number;
  ferramentas: string[];
}

/** Responde UMA mensagem de UM número. Salva a sessão no fim. */
export async function responder(
  rt: Runtime,
  phone: string,
  textoRecebido: string,
  opts: { deadlineMs?: number } = {},
): Promise<RespostaAgente> {
  const sessao = await loadSession(rt.db, phone);
  const cmd = parseCommand(textoRecebido, sessao.agentId);

  if (cmd.tipo === "vazio") {
    return { texto: "", agentId: sessao.agentId, modelo: "-", iteracoes: 0, ferramentas: [] };
  }
  if (cmd.tipo === "ajuda") {
    return { texto: textoAjuda(), agentId: sessao.agentId, modelo: "-", iteracoes: 0, ferramentas: [] };
  }
  if (cmd.tipo === "novo") {
    await clearSession(rt.db, phone, cmd.agente);
    const p = getPersona(cmd.agente);
    return {
      texto: `${p.emoji} Conversa zerada. Falando com *${p.nome}*.`,
      agentId: cmd.agente,
      modelo: "-",
      iteracoes: 0,
      ferramentas: [],
    };
  }
  if (cmd.tipo === "status") {
    const p = getPersona(sessao.agentId);
    const rota = decideBrain(p.id, p.brain, rt.env);
    const cfg = await rt.db
      .select<any>("settings", "select=key,value&key=in.(agent_paused,dry_run)")
      .catch(() => []);
    const mapa = Object.fromEntries((cfg as any[]).map((r) => [r.key, r.value]));
    return {
      texto: [
        `${p.emoji} Agente: *${p.nome}*`,
        `Modelo: ${rota.brain === "claude" ? rt.env.claudeModel : rt.env.qwenModel}` +
          (rota.reason === "qwen_unavailable" ? " _(Qwen não configurado, caiu para Claude)_" : ""),
        `Robô de prospecção: ${mapa.agent_paused ? "*pausado*" : "ativo"}`,
        `DRY_RUN: ${rt.env.dryRun ? "*ligado* (nada externo acontece)" : "desligado"}`,
        `Histórico: ${sessao.messages.length} mensagens`,
      ].join("\n"),
      agentId: sessao.agentId,
      modelo: "-",
      iteracoes: 0,
      ferramentas: [],
    };
  }

  // Mensagem normal para um agente.
  const persona = getPersona(cmd.agente);
  const rota = decideBrain(persona.id, persona.brain, rt.env);
  const provider = createProvider(rota.brain, rt.env, { effort: persona.effort });

  // Trocou de agente → histórico anterior não serve (ferramentas e voz mudam).
  const historico: AgentMessage[] = cmd.trocou ? [] : sessao.messages;
  const mensagens: AgentMessage[] = [...historico, { role: "user", text: cmd.texto }];

  const ctx: ToolContext = { agentId: persona.id, from: phone, dryRun: rt.env.dryRun };
  const resultado = await runAgentLoop(
    provider,
    persona.systemPrompt,
    rt.toolbox.specs(persona.tools),
    mensagens,
    (call) => rt.toolbox.execute(call, persona.tools, ctx),
    { maxIterations: persona.maxIterations, deadlineMs: opts.deadlineMs },
  );

  await saveSession(rt.db, { phone, agentId: persona.id, messages: resultado.messages });

  await logEvent(rt.db, {
    kind: "agent_reply",
    channel: "whatsapp",
    level: resultado.stoppedBy === "end_turn" ? "info" : "warn",
    message: `${persona.id} → ${phone} (${resultado.stoppedBy}, ${resultado.iterations} iter)`,
    payload: {
      modelo: resultado.model,
      cerebro: rota.brain,
      motivo_rota: rota.reason,
      ferramentas: resultado.trace.map((t) => t.tool),
      tokens: resultado.usage,
    },
    dry_run: rt.env.dryRun,
  });

  const prefixo = cmd.trocou ? `${persona.emoji} *${persona.nome}*\n\n` : "";
  return {
    texto: prefixo + (resultado.text || "Não consegui formular resposta. Tenta de novo?"),
    agentId: persona.id,
    modelo: resultado.model,
    iteracoes: resultado.iterations,
    ferramentas: resultado.trace.map((t) => t.tool),
  };
}

export { PERSONAS };
