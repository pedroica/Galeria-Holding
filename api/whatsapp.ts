// Webhook do WhatsApp Cloud API.
//
//   GET  → handshake de verificação da Meta (uma vez, na configuração)
//   POST → mensagens recebidas
//
// Configuração na Meta: Webhook URL = https://<seu-dominio>/api/whatsapp
//
// A Vercel entrega o request ora como `Request` web, ora como `IncomingMessage`
// estilo Node. Tudo que depende desse formato — header, URL, corpo cru,
// resposta — passa por agent/src/channels/http.ts, que trata os dois.

import { loadEnv, missingWhatsApp } from "../agent/src/config.ts";
import {
  absoluteUrl,
  getHeader,
  readRawBody,
  reply,
  type NodeLikeResponse,
} from "../agent/src/channels/http.ts";
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

// bodyParser desligado para o corpo cru chegar intacto — a assinatura da Meta
// cobre os bytes exatos. Runtime que ignora esta config cai no fallback de
// leitura de stream em readRawBody().
export const config = { maxDuration: 60, api: { bodyParser: false } };

// Deixa margem para responder antes de a função ser morta pela plataforma.
const DEADLINE_MS = 45_000;

export default async function handler(req: any, res?: NodeLikeResponse) {
  const env = loadEnv();
  const metodo = String(req?.method || "GET").toUpperCase();

  // ── Handshake de verificação ─────────────────────────────────────────────
  if (metodo === "GET") {
    const query = Object.fromEntries(absoluteUrl(req).searchParams.entries());
    const v = handleVerification(query, env.waVerifyToken || "");
    return v.ok ? reply(res, 200, v.challenge || "") : reply(res, 403, "forbidden");
  }

  if (metodo !== "POST") return reply(res, 405, "method not allowed");

  const faltando = missingWhatsApp(env);
  if (faltando.length) {
    console.error("[whatsapp] faltam variáveis:", faltando.join(", "));
    return reply(res, 500, "misconfigured");
  }

  const corpo = await readRawBody(req);
  if (!corpo.ok) {
    // Sem os bytes originais não há como provar que veio da Meta. Recusar é a
    // única saída segura: aceitar aqui deixaria qualquer um que descubra a URL
    // comandar os agentes fingindo ser você.
    console.error("[whatsapp] corpo cru indisponível —", corpo.motivo);
    return reply(res, 400, "raw body unavailable");
  }

  if (!verifySignature(corpo.raw, getHeader(req, "x-hub-signature-256"), env.waAppSecret!)) {
    console.warn("[whatsapp] assinatura inválida — requisição descartada");
    return reply(res, 401, "invalid signature");
  }

  let body: unknown;
  try {
    body = JSON.parse(corpo.raw);
  } catch {
    return reply(res, 400, "bad json");
  }

  const mensagens = parseInbound(body).filter((m) => m.from);
  // Confirmações de entrega/leitura e outros eventos: 200 e segue a vida.
  if (!mensagens.length) return reply(res, 200, "ok");

  const wa = createWhatsApp({ token: env.waToken!, phoneNumberId: env.waPhoneNumberId! });

  let rt;
  try {
    rt = await createRuntime();
  } catch (e) {
    console.error("[whatsapp] runtime:", e);
    // 200 para a Meta não reenviar em loop uma mensagem que vai falhar igual.
    return reply(res, 200, "ok");
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
        await wa.send(msg.from, "Por enquanto eu só leio texto. Manda escrito que eu resolvo. 🙂");
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

  return reply(res, 200, "ok");
}
