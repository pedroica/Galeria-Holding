// Estado da conversa por número de WhatsApp.
//
// Guardar no Supabase (e não em memória) é obrigatório aqui: na Vercel cada
// mensagem pode cair numa instância diferente, e memória de processo evapora.

import type { AgentMessage } from "../llm/types.ts";
import type { SupabaseClient } from "../tools/supabase.ts";
import { AGENTE_PADRAO } from "../agents/personas.ts";

export interface Session {
  phone: string;
  agentId: string;
  messages: AgentMessage[];
}

/** Quantas mensagens de histórico sobrevivem entre turnos. */
export const MAX_HISTORY = 24;

/**
 * Corta histórico antigo SEM quebrar o contrato da API: a janela não pode
 * começar com um tool_result órfão (o tool_use que o gerou ficou para trás) nem
 * com um assistant. Então recuamos até a primeira mensagem de usuário.
 */
export function trimHistory(messages: AgentMessage[], max: number = MAX_HISTORY): AgentMessage[] {
  if (messages.length <= max) return messages;
  let corte = messages.length - max;
  while (corte < messages.length && messages[corte].role !== "user") corte++;
  // Se não sobrou nenhum "user" no fim, é melhor recomeçar limpo.
  return corte >= messages.length ? [] : messages.slice(corte);
}

export async function loadSession(db: SupabaseClient, phone: string): Promise<Session> {
  const rows = await db.select<{ agent_id: string; messages: AgentMessage[] }>(
    "agent_sessions",
    `select=agent_id,messages&phone=eq.${encodeURIComponent(phone)}`,
  );
  if (!rows.length) return { phone, agentId: AGENTE_PADRAO, messages: [] };
  return {
    phone,
    agentId: rows[0].agent_id || AGENTE_PADRAO,
    messages: Array.isArray(rows[0].messages) ? rows[0].messages : [],
  };
}

export async function saveSession(db: SupabaseClient, s: Session): Promise<void> {
  await db.upsert(
    "agent_sessions",
    [{
      phone: s.phone,
      agent_id: s.agentId,
      messages: trimHistory(s.messages),
      updated_at: new Date().toISOString(),
    }],
    "phone",
  );
}

export async function clearSession(db: SupabaseClient, phone: string, agentId: string): Promise<void> {
  await saveSession(db, { phone, agentId, messages: [] });
}

/**
 * Idempotência. A Meta reentrega o webhook quando não recebe 200 rápido; sem
 * isto o agente responde a mesma mensagem duas ou três vezes.
 * Retorna true se a mensagem é nova (e portanto deve ser processada).
 */
export async function claimMessage(db: SupabaseClient, wamid: string): Promise<boolean> {
  if (!wamid) return true;
  try {
    await db.insert("wa_inbox", [{ wamid, received_at: new Date().toISOString() }], { returning: false });
    return true;
  } catch (e) {
    // 23505 = unique_violation → já processamos esta mensagem.
    const msg = e instanceof Error ? e.message : String(e);
    if (/23505|duplicate key/i.test(msg)) return false;
    throw e;
  }
}
