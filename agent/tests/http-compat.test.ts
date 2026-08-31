import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { absoluteUrl, getHeader, readRawBody, reply } from "../src/channels/http.ts";

// Os dois formatos que a Vercel já entregou na prática.
const webReq = (url: string, headers: Record<string, string>) => ({
  url,
  headers: new Headers(headers),
});
const nodeReq = (url: string, headers: Record<string, string | string[]>) => ({ url, headers });

test("getHeader lê Headers web e objeto Node, sem diferenciar caixa", () => {
  assert.equal(getHeader(webReq("https://x/a", { "X-Hub-Signature-256": "sha256=abc" }), "x-hub-signature-256"), "sha256=abc");
  assert.equal(getHeader(nodeReq("/a", { "X-Hub-Signature-256": "sha256=abc" }), "x-hub-signature-256"), "sha256=abc");
  assert.equal(getHeader(nodeReq("/a", { host: "x.vercel.app" }), "HOST"), "x.vercel.app");
});

test("getHeader devolve o primeiro valor quando o header repete", () => {
  assert.equal(getHeader(nodeReq("/a", { "x-forwarded-proto": ["https", "http"] }), "x-forwarded-proto"), "https");
});

test("getHeader não explode sem headers", () => {
  assert.equal(getHeader({}, "host"), undefined);
  assert.equal(getHeader(null, "host"), undefined);
});

test("absoluteUrl monta URL a partir do host quando req.url é relativa", () => {
  // Era exatamente isto que derrubava o handshake do webhook.
  const u = absoluteUrl(nodeReq("/api/whatsapp?hub.challenge=123", { host: "galeria.vercel.app" }));
  assert.equal(u.origin, "https://galeria.vercel.app");
  assert.equal(u.searchParams.get("hub.challenge"), "123");
});

test("absoluteUrl preserva URL já absoluta", () => {
  const u = absoluteUrl(webReq("https://galeria.vercel.app/api/whatsapp?a=1", {}));
  assert.equal(u.searchParams.get("a"), "1");
});

test("absoluteUrl prefere x-forwarded-host e respeita o protocolo", () => {
  const u = absoluteUrl(nodeReq("/x", { host: "interno", "x-forwarded-host": "publico.com", "x-forwarded-proto": "http" }));
  assert.equal(u.origin, "http://publico.com");
});

// ── Corpo cru: é sobre ele que a assinatura da Meta é calculada ────────────
test("readRawBody lê Request web", async () => {
  const req = { text: async () => '{"a":1}' };
  const r = await readRawBody(req);
  assert.deepEqual(r, { ok: true, raw: '{"a":1}', fonte: "text" });
});

test("readRawBody lê stream Node não consumido", async () => {
  const stream: any = Readable.from([Buffer.from('{"b":'), Buffer.from("2}")]);
  stream.headers = {};
  const r = await readRawBody(stream);
  assert.equal(r.ok && r.raw, '{"b":2}');
  assert.equal(r.ok && r.fonte, "stream");
});

test("readRawBody aceita rawBody como Buffer ou string", async () => {
  assert.equal((await readRawBody({ rawBody: '{"c":3}' })).ok, true);
  const r = await readRawBody({ rawBody: Buffer.from('{"c":3}') });
  assert.equal(r.ok && r.raw, '{"c":3}');
  assert.equal(r.ok && r.fonte, "rawBody");
});

test("readRawBody aceita body string ou Buffer (parser desligado)", async () => {
  const s = await readRawBody({ body: '{"d":4}' });
  assert.equal(s.ok && s.raw, '{"d":4}');
  const b = await readRawBody({ body: Buffer.from('{"d":4}') });
  assert.equal(b.ok && b.raw, '{"d":4}');
});

test("rawBody vence o stream — ler stream já consumido devolveria vazio", async () => {
  const req: any = Readable.from([Buffer.from("do stream")]);
  req.rawBody = "do rawBody";
  const r = await readRawBody(req);
  assert.equal(r.ok && r.raw, "do rawBody");
});

test("corpo já desserializado é recusado, não aceito às cegas", async () => {
  // Sem os bytes originais a assinatura não fecha; aceitar seria abrir o
  // webhook para qualquer um que descubra a URL.
  const r = await readRawBody({ body: { entry: [] }, readableEnded: true });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /desserializou/);
});

test("corpo ausente é recusado", async () => {
  const r = await readRawBody({});
  assert.equal(r.ok, false);
});

test("readRawBody cai para o stream se text() falhar", async () => {
  const req: any = Readable.from([Buffer.from("do stream")]);
  req.text = async () => { throw new Error("sem corpo"); };
  const r = await readRawBody(req);
  assert.equal(r.ok && r.raw, "do stream");
});

// ── Resposta ───────────────────────────────────────────────────────────────
test("reply devolve Response quando não há res (runtime web)", async () => {
  const r = reply(undefined, 200, "ok");
  assert.ok(r instanceof Response);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "ok");
});

test("reply escreve no res e devolve undefined (runtime Node)", () => {
  const escrito: any = { headers: {} };
  const res = {
    statusCode: 0,
    setHeader(n: string, v: string) { escrito.headers[n] = v; },
    end(body?: string) { escrito.body = body; },
  };
  const r = reply(res, 403, "forbidden");
  assert.equal(r, undefined);
  assert.equal(res.statusCode, 403);
  assert.equal(escrito.body, "forbidden");
  assert.match(escrito.headers["Content-Type"], /text\/plain/);
});
