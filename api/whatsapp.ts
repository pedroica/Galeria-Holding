// Webhook do WhatsApp Cloud API.
//
// Assinatura Web (Request/Response) de propósito: só assim dá para ler o corpo
// CRU e conferir o X-Hub-Signature-256. Com o parser clássico (req, res) o body
// já chega desserializado e a assinatura nunca bate.
//
//   GET  → handshake de verificação da Meta (uma vez, na configuração)
//   POST → mensagens recebidas
//
// Configuração na Meta: Webhook URL = https://<seu-dominio>/api/whatsapp

import { loadEnv, missingWhatsApp } from "../agent/src/config.ts";
import {
  createWhatsApp,
  handleVerification,
  isAllowed,
  parseInbound,
  verifySignature,
} from "../agent/src/channels/whatsapp.ts";
import { createRuntime, responder } from "../agent/src/agents/orchestrator.ts";
import { claimMessage } from "../agent/src/session/store.ts";
import { logEvent } from "../agent/src/tools/supabase.ts";

export const config = { maxDuration: 60 };

// Deixa margem para responder antes de a função ser morta pela plataforma.
const DEADLINE_MS = 45_000;

export default async function handler(req: Request): Promise<Response> {
  const env = loadEnv();
  const url = new URL(req.url);

  // ── Handshake de verificação ─────────────────────────────────────────────
  if (req.method === "GET") {
    const query = Object.fromEntries(url.searchParams.entries());
    const v = handleVerification(query, env.waVerifyToken || "");
    return v.ok
      ? new Response(v.challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
      : new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const faltando = missingWhatsApp(env);
  if (faltando.length) {
    console.error("[whatsapp] faltam variáveis:", faltando.join(", "));
    return new Response("misconfigured", { status: 500 });
  }

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256") || undefined, env.waAppSecret!)) {
    console.warn("[whatsapp] assinatura inválida — requisição descartada");
    return new Response("invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const mensagens = parseInbound(body).filter((m) => m.from);
  // Confirmações de entrega/leitura e outros eventos: 200 e segue a vida.
  if (!mensagens.length) return new Response("ok", { status: 200 });

  const wa = createWhatsApp({ token: env.waToken!, phoneNumberId: env.waPhoneNumberId! });

  let rt;
  try {
    rt = await createRuntime();
  } catch (e) {
    console.error("[whatsapp] runtime:", e);
    // 200 para a Meta não reenviar em loop uma mensagem que vai falhar igual.
    return new Response("ok", { status: 200 });
  }

  for (const msg of mensagens) {
    try {
      if (!isAllowed(msg.from, env.waAllowedNumbers)) {
        await logEvent(rt.db, {
          kind: "wa_negado",
          channel: "whatsapp",
          level: "warn",
          message: `número fora da allowlist: ${msg.from}`,
        });
        continue; // silêncio: não confirmamos nem que o número existe
      }

      // Reentrega da Meta cai aqui e para.
      if (!(await claimMessage(rt.db, msg.id))) continue;

      await wa.markRead(msg.id);

      if (!msg.text) {
        await wa.send(
          msg.from,
          "Por enquanto eu só leio texto. Manda escrito que eu resolvo. 🙂",
        );
        continue;
      }

      const r = await responder(rt, msg.from, msg.text, { deadlineMs: DEADLINE_MS });
      if (r.texto) await wa.send(msg.from, r.texto);
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : String(e);
      console.error("[whatsapp] erro processando", msg.id, detalhe);
      await logEvent(rt.db, {
        kind: "erro",
        channel: "whatsapp",
        level: "error",
        message: detalhe,
        payload: { wamid: msg.id, from: msg.from },
      });
      try {
        await wa.send(msg.from, `Deu erro aqui do meu lado: ${detalhe.slice(0, 200)}`);
      } catch {
        // Se nem o envio de erro funciona, o log já registrou.
      }
    }
  }

  return new Response("ok", { status: 200 });
}
