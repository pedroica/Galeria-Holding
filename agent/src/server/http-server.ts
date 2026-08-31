// Servidor HTTP do Mac — o webhook do WhatsApp mora aqui agora.
//
// Escuta só em 127.0.0.1: quem alcança de fora é o túnel, não a internet
// direto. Isso mantém a máquina fechada mesmo se o roteador estiver aberto.
//
// Rotas:
//   GET  /webhook  → handshake da Meta
//   POST /webhook  → mensagens (assinatura conferida sobre os bytes crus)
//   GET  /health   → diagnóstico local

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AgentEnv } from "../config.ts";
import { handleVerification, isAllowed, parseInbound, verifySignature, createWhatsApp } from "../channels/whatsapp.ts";
import { claimMessage } from "../session/store.ts";
import { logEvent } from "../tools/supabase.ts";
import type { Runtime } from "../agents/orchestrator.ts";
import { responder } from "../agents/orchestrator.ts";

export const CAMINHO_WEBHOOK = "/webhook";

/** Lê o corpo cru. Aqui é simples: o stream é nosso, ninguém consumiu antes. */
export function lerCorpo(req: IncomingMessage, limiteBytes = 2_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > limiteBytes) {
        reject(new Error("corpo grande demais"));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function responder404(res: ServerResponse) {
  res.statusCode = 404;
  res.end("not found");
}

export interface OpcoesServidor {
  porta: number;
  env: AgentEnv;
  /** O runtime é criado uma vez e reaproveitado — sem cold start a cada mensagem. */
  runtime: Runtime;
  log?: (...args: unknown[]) => void;
  /** Estado exposto no /health. */
  estado?: () => Record<string, unknown>;
}

export function criarServidor(opts: OpcoesServidor): Server {
  const log = opts.log || console.log;
  const { env, runtime } = opts;
  const wa =
    env.waToken && env.waPhoneNumberId
      ? createWhatsApp({ token: env.waToken, phoneNumberId: env.waPhoneNumberId })
      : null;

  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const metodo = (req.method || "GET").toUpperCase();

    if (url.pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, ...(opts.estado ? opts.estado() : {}) }));
      return;
    }

    if (url.pathname !== CAMINHO_WEBHOOK) return responder404(res);

    // ── Handshake ──────────────────────────────────────────────────────────
    if (metodo === "GET") {
      const query = Object.fromEntries(url.searchParams.entries());
      const v = handleVerification(query, env.waVerifyToken || "");
      res.statusCode = v.ok ? 200 : 403;
      res.end(v.ok ? v.challenge || "" : "forbidden");
      if (v.ok) log("webhook: handshake da Meta aceito");
      return;
    }

    if (metodo !== "POST") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }

    let raw: string;
    try {
      raw = await lerCorpo(req);
    } catch (e) {
      res.statusCode = 400;
      res.end("bad body");
      return;
    }

    const assinatura = req.headers["x-hub-signature-256"];
    if (!verifySignature(raw, Array.isArray(assinatura) ? assinatura[0] : assinatura, env.waAppSecret || "")) {
      log("webhook: assinatura inválida — descartado");
      res.statusCode = 401;
      res.end("invalid signature");
      return;
    }

    // Responde ANTES de processar: a Meta reentrega se demorarmos, e aqui não
    // há limite de execução — o processamento continua tranquilo em segundo
    // plano, protegido pelo dedupe por wamid.
    res.statusCode = 200;
    res.end("ok");

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return;
    }

    for (const msg of parseInbound(body).filter((m) => m.from)) {
      try {
        if (!isAllowed(msg.from, env.waAllowedNumbers)) {
          await logEvent(runtime.db, {
            kind: "wa_negado",
            channel: "whatsapp",
            level: "warn",
            message: `número fora da allowlist: ${msg.from}`,
          });
          continue;
        }
        if (!(await claimMessage(runtime.db, msg.id))) continue;
        if (!wa) {
          log("webhook: sem credenciais de envio — não dá para responder");
          continue;
        }

        await wa.markRead(msg.id);
        if (!msg.text) {
          await wa.send(msg.from, "Por enquanto eu só leio texto. Manda escrito que eu resolvo. 🙂");
          continue;
        }

        log(`← ${msg.from}: ${msg.text.slice(0, 60)}`);
        const r = await responder(runtime, msg.from, msg.text);
        if (r.texto) {
          await wa.send(msg.from, r.texto);
          log(`→ ${r.agentId} respondeu (${r.iteracoes} iter, ${r.ferramentas.join(", ") || "sem tools"})`);
        }
      } catch (e) {
        const detalhe = e instanceof Error ? e.message : String(e);
        log("webhook: erro em", msg.id, detalhe);
        await logEvent(runtime.db, {
          kind: "erro",
          channel: "whatsapp",
          level: "error",
          message: detalhe,
          payload: { wamid: msg.id, from: msg.from },
        });
        try {
          if (wa) await wa.send(msg.from, `Deu erro aqui do meu lado: ${detalhe.slice(0, 200)}`);
        } catch {
          // já registrado
        }
      }
    }
  });
}
