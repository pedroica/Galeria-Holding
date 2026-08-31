import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  handleVerification,
  isAllowed,
  parseInbound,
  splitForWhatsApp,
  verifySignature,
  WA_MAX_CHARS,
} from "../src/channels/whatsapp.ts";

const SECRET = "segredo-do-app";
const assinar = (body: string) =>
  "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");

test("assinatura válida passa", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  assert.equal(verifySignature(body, assinar(body), SECRET), true);
});

test("assinatura de outro corpo é rejeitada", () => {
  const body = JSON.stringify({ a: 1 });
  assert.equal(verifySignature(JSON.stringify({ a: 2 }), assinar(body), SECRET), false);
});

test("sem header ou sem segredo, rejeita", () => {
  const body = "{}";
  assert.equal(verifySignature(body, undefined, SECRET), false);
  assert.equal(verifySignature(body, assinar(body), ""), false);
});

test("assinatura de tamanho diferente não quebra o timingSafeEqual", () => {
  assert.equal(verifySignature("{}", "sha256=abc", SECRET), false);
});

test("handshake devolve o challenge só com o token certo", () => {
  const q = { "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "12345" };
  assert.deepEqual(handleVerification(q, "tok"), { ok: true, challenge: "12345" });
  assert.deepEqual(handleVerification(q, "outro"), { ok: false });
  assert.deepEqual(handleVerification({ ...q, "hub.mode": "unsubscribe" }, "tok"), { ok: false });
});

test("parseInbound extrai texto, remetente e nome do perfil", () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: "5511999998888", profile: { name: "Pedro" } }],
          messages: [{
            id: "wamid.ABC",
            from: "5511999998888",
            timestamp: "1700000000",
            type: "text",
            text: { body: "quantos CMOs faltam?" },
          }],
        },
      }],
    }],
  };
  const [m] = parseInbound(payload);
  assert.equal(m.id, "wamid.ABC");
  assert.equal(m.from, "5511999998888");
  assert.equal(m.text, "quantos CMOs faltam?");
  assert.equal(m.profileName, "Pedro");
});

test("parseInbound ignora payload de status (entrega/leitura)", () => {
  const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "read" }] } }] }] };
  assert.deepEqual(parseInbound(payload), []);
});

test("parseInbound aceita resposta de botão como texto", () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: "wamid.B", from: "5511999998888", type: "interactive",
            interactive: { button_reply: { title: "Sim, pode rodar" } },
          }],
        },
      }],
    }],
  };
  assert.equal(parseInbound(payload)[0].text, "Sim, pode rodar");
});

test("allowlist compara pelos últimos 11 dígitos (nono dígito / +55)", () => {
  assert.equal(isAllowed("5511999998888", ["+55 11 99999-8888"]), true);
  assert.equal(isAllowed("5511999998888", ["5511999998888"]), true);
  assert.equal(isAllowed("5511777776666", ["5511999998888"]), false);
});

test("allowlist vazia bloqueia todo mundo", () => {
  assert.equal(isAllowed("5511999998888", []), false);
});

test("splitForWhatsApp respeita o limite e corta em parágrafo", () => {
  const bloco = "linha ".repeat(600); // ~3600 chars
  const texto = bloco + "\n\n" + bloco;
  const partes = splitForWhatsApp(texto);
  assert.ok(partes.length >= 2);
  for (const p of partes) assert.ok(p.length <= WA_MAX_CHARS, `parte com ${p.length} chars`);
  assert.equal(partes.join(" ").replace(/\s+/g, " ").trim(), texto.replace(/\s+/g, " ").trim());
});

test("texto curto sai em uma parte só; vazio sai como lista vazia", () => {
  assert.deepEqual(splitForWhatsApp("oi"), ["oi"]);
  assert.deepEqual(splitForWhatsApp("   "), []);
});

test("texto sem espaço nenhum é cortado no limite bruto", () => {
  const partes = splitForWhatsApp("x".repeat(9000));
  assert.equal(partes.length, 3);
  assert.ok(partes.every((p) => p.length <= WA_MAX_CHARS));
});
