// WhatsApp Cloud API (oficial, Meta).
//
// Três coisas acontecem aqui e as três são de segurança:
//   1. verifySignature — a Meta assina cada webhook com o App Secret. Sem
//      conferir, qualquer um que descubra sua URL comanda seus agentes.
//   2. allowlist — só os números em WHATSAPP_ALLOWED_NUMBERS são atendidos.
//   3. splitForWhatsApp — a Cloud API corta em 4096 chars; cortar no lugar
//      errado vira mensagem sem sentido.

import { createHmac, timingSafeEqual } from "node:crypto";

export const WA_MAX_CHARS = 4000; // margem sobre o limite de 4096 da Meta

export interface InboundMessage {
  /** wamid — id único da mensagem, usado para não responder duas vezes. */
  id: string;
  from: string; // E.164 só dígitos
  text: string;
  timestamp: number;
  type: string;
  profileName?: string;
}

/**
 * Confere X-Hub-Signature-256 sobre o corpo CRU (bytes exatos recebidos).
 * Usar o JSON re-serializado aqui quebra a assinatura — precisa ser o raw body.
 */
export function verifySignature(rawBody: string | Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const esperado = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Handshake de verificação do webhook (GET) que a Meta faz uma vez. */
export function handleVerification(
  query: Record<string, string | string[] | undefined>,
  verifyToken: string,
): { ok: boolean; challenge?: string } {
  const mode = String(query["hub.mode"] || "");
  const token = String(query["hub.verify_token"] || "");
  const challenge = String(query["hub.challenge"] || "");
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

/** Extrai as mensagens de texto do payload (ignora status, reações, etc). */
export function parseInbound(body: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const perfis = new Map<string, string>(
        (value.contacts || []).map((c: any) => [String(c.wa_id), c?.profile?.name || ""]),
      );
      for (const msg of value.messages || []) {
        const tipo = String(msg.type || "");
        // Texto e botão interativo viram texto; áudio/imagem/documento não são
        // tratados ainda e recebem resposta explicando isso.
        const texto =
          tipo === "text"
            ? String(msg.text?.body || "")
            : tipo === "interactive"
              ? String(msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "")
              : tipo === "button"
                ? String(msg.button?.text || "")
                : "";
        out.push({
          id: String(msg.id || ""),
          from: String(msg.from || "").replace(/\D/g, ""),
          text: texto,
          timestamp: Number(msg.timestamp || 0),
          type: tipo,
          profileName: perfis.get(String(msg.from)) || undefined,
        });
      }
    }
  }
  return out;
}

/** Quebra em pedaços de até WA_MAX_CHARS, preferindo cortar em parágrafo/linha. */
export function splitForWhatsApp(texto: string, max: number = WA_MAX_CHARS): string[] {
  const t = (texto || "").trim();
  if (!t) return [];
  if (t.length <= max) return [t];

  const partes: string[] = [];
  let resto = t;
  while (resto.length > max) {
    const janela = resto.slice(0, max);
    let corte = janela.lastIndexOf("\n\n");
    if (corte < max * 0.5) corte = janela.lastIndexOf("\n");
    if (corte < max * 0.5) corte = janela.lastIndexOf(" ");
    if (corte < max * 0.5) corte = max;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

export interface WhatsAppSender {
  send(to: string, texto: string): Promise<void>;
  markRead(messageId: string): Promise<void>;
  /**
   * Mensagem proativa (relatório diário). A Cloud API só aceita texto livre
   * dentro de 24h da última mensagem DELE; fora disso é obrigatório template
   * aprovado. Tenta texto, e se a Meta recusar por janela, cai no template.
   * Retorna como a mensagem saiu — ou null se não saiu.
   */
  sendProactive(to: string, texto: string, templateName?: string): Promise<"texto" | "template" | null>;
}

export interface WhatsAppOptions {
  token: string;
  phoneNumberId: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

export function createWhatsApp(opts: WhatsAppOptions): WhatsAppSender {
  const version = opts.apiVersion || "v21.0";
  const url = `https://graph.facebook.com/${version}/${opts.phoneNumberId}/messages`;
  const doFetch = opts.fetchImpl || fetch;
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + opts.token,
  };

  async function post(payload: unknown) {
    const res = await doFetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!res.ok) {
      throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }

  async function enviarTexto(to: string, texto: string) {
    for (const parte of splitForWhatsApp(texto)) {
      await post({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: parte },
      });
    }
  }

  return {
    send: enviarTexto,
    async sendProactive(to, texto, templateName) {
      try {
        await enviarTexto(to, texto);
        return "texto";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 131047 / 470: fora da janela de 24h → só template resolve.
        const foraDaJanela = /131047|131026|\b470\b|re-?engagement/i.test(msg);
        if (!foraDaJanela || !templateName) return null;
        try {
          await post({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: { name: templateName, language: { code: "pt_BR" } },
          });
          return "template";
        } catch {
          return null;
        }
      }
    },

    async markRead(messageId) {
      try {
        await post({ messaging_product: "whatsapp", status: "read", message_id: messageId });
      } catch {
        // Confirmação de leitura falhar não pode derrubar a resposta.
      }
    },
  };
}

export function isAllowed(from: string, allowlist: string[]): boolean {
  const n = (from || "").replace(/\D/g, "");
  if (!n || !allowlist.length) return false;
  // Compara pelos últimos 11 dígitos: resolve o 9º dígito e o +55 que a Meta
  // às vezes normaliza diferente do que você digitou na env.
  const cauda = (v: string) => v.slice(-11);
  return allowlist
    .map((a) => (a || "").replace(/\D/g, ""))
    .filter(Boolean)
    .some((a) => a === n || cauda(a) === cauda(n));
}
