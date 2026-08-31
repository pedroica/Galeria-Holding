import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { extrairUrlCloudflared } from "../src/server/tunnel.ts";
import {
  appAccessToken,
  corpoSubscription,
  registrarWebhook,
  urlAceitavel,
} from "../src/server/meta-webhook.ts";
import { lerCorpo } from "../src/server/http-server.ts";

// ── Túnel ──────────────────────────────────────────────────────────────────
test("extrai a URL do banner do cloudflared", () => {
  const banner = `
+--------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:       |
|  https://weird-panda-tune-42.trycloudflare.com          |
+--------------------------------------------------------+`;
  assert.equal(extrairUrlCloudflared(banner), "https://weird-panda-tune-42.trycloudflare.com");
});

test("acha a URL solta no meio de log estruturado", () => {
  const linha = `2026-03-03T10:00:00Z INF |  https://abc-def-123.trycloudflare.com  |`;
  assert.equal(extrairUrlCloudflared(linha), "https://abc-def-123.trycloudflare.com");
});

test("não inventa URL quando não tem", () => {
  assert.equal(extrairUrlCloudflared("INF Registered tunnel connection connIndex=0"), null);
  assert.equal(extrairUrlCloudflared(""), null);
});

// ── Registro na Meta ───────────────────────────────────────────────────────
test("token de app é appId|appSecret", () => {
  assert.equal(appAccessToken("123", "abc"), "123|abc");
});

test("corpo da inscrição leva os campos que a Meta exige", () => {
  const b = corpoSubscription({
    callbackUrl: "https://x.trycloudflare.com/webhook",
    verifyToken: "tok",
    appId: "123",
    appSecret: "sec",
  });
  assert.equal(b.get("object"), "whatsapp_business_account");
  assert.equal(b.get("fields"), "messages");
  assert.equal(b.get("callback_url"), "https://x.trycloudflare.com/webhook");
  assert.equal(b.get("verify_token"), "tok");
  assert.equal(b.get("access_token"), "123|sec");
});

test("URL local ou http é recusada antes de gastar chamada na Meta", () => {
  assert.equal(urlAceitavel("http://exemplo.com/webhook").ok, false);
  assert.equal(urlAceitavel("https://localhost:8787/webhook").ok, false);
  assert.equal(urlAceitavel("https://127.0.0.1/webhook").ok, false);
  assert.equal(urlAceitavel("não-é-url").ok, false);
  assert.equal(urlAceitavel("https://abc.trycloudflare.com/webhook").ok, true);
});

test("registro bem-sucedido nas duas etapas", async () => {
  const chamadas: string[] = [];
  const fakeFetch = async (url: any) => {
    chamadas.push(String(url));
    return new Response("{\"success\":true}", { status: 200 });
  };
  const r = await registrarWebhook({
    appId: "123", appSecret: "sec", verifyToken: "tok",
    callbackUrl: "https://abc.trycloudflare.com/webhook",
    wabaId: "999", token: "EAAG",
    fetchImpl: fakeFetch as any,
  });
  assert.equal(r.ok, true);
  assert.equal(r.etapas.length, 2);
  assert.match(chamadas[0], /\/123\/subscriptions$/);
  assert.match(chamadas[1], /\/999\/subscribed_apps$/);
});

test("sem WABA ID roda só a primeira etapa", async () => {
  const fakeFetch = async () => new Response("{}", { status: 200 });
  const r = await registrarWebhook({
    appId: "123", appSecret: "sec", verifyToken: "tok",
    callbackUrl: "https://abc.trycloudflare.com/webhook",
    fetchImpl: fakeFetch as any,
  });
  assert.equal(r.etapas.length, 1);
  assert.equal(r.ok, true);
});

test("erro da Meta vira detalhe legível, não exceção", async () => {
  const fakeFetch = async () =>
    new Response('{"error":{"message":"Invalid verify token"}}', { status: 400 });
  const r = await registrarWebhook({
    appId: "123", appSecret: "sec", verifyToken: "errado",
    callbackUrl: "https://abc.trycloudflare.com/webhook",
    fetchImpl: fakeFetch as any,
  });
  assert.equal(r.ok, false);
  assert.match(r.etapas[0].detalhe || "", /Invalid verify token/);
});

test("URL inaceitável nem chega a chamar a Meta", async () => {
  let chamou = false;
  const r = await registrarWebhook({
    appId: "1", appSecret: "s", verifyToken: "t",
    callbackUrl: "http://localhost:8787/webhook",
    fetchImpl: (async () => { chamou = true; return new Response("", { status: 200 }); }) as any,
  });
  assert.equal(r.ok, false);
  assert.equal(chamou, false);
});

// ── Corpo cru no servidor do Mac ───────────────────────────────────────────
test("lerCorpo junta os chunks na ordem", async () => {
  const req: any = Readable.from([Buffer.from('{"entry"'), Buffer.from(":[]}")]);
  assert.equal(await lerCorpo(req), '{"entry":[]}');
});

test("corpo cru preserva os bytes que a assinatura cobre", async () => {
  // Espaçamento e ordem das chaves importam: re-serializar quebraria a conta.
  const payload = '{ "object":"whatsapp_business_account",  "entry":[] }';
  const req: any = Readable.from([Buffer.from(payload)]);
  const raw = await lerCorpo(req);
  const esperado = "sha256=" + createHmac("sha256", "segredo").update(payload).digest("hex");
  const calculado = "sha256=" + createHmac("sha256", "segredo").update(raw).digest("hex");
  assert.equal(calculado, esperado);
});

test("lerCorpo recusa corpo acima do limite", async () => {
  const req: any = Readable.from([Buffer.alloc(2048, 0x61)]);
  await assert.rejects(() => lerCorpo(req, 1024), /grande demais/);
});
