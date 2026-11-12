// Testes do agente de WhatsApp (api/enrich.js, provider=whatsapp).
// Exercitam o handler real com req/res falsos — sem rede, sem Anthropic.
//   node --test tests/whatsapp-agente.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const APP_SECRET = 'segredo-de-teste';

// Env mínimo para o provider considerar a configuração completa. Valores
// falsos de propósito: nenhum teste aqui chega a fazer chamada externa.
function prepararEnv() {
  process.env.WHATSAPP_CLOUD_TOKEN = 'token-falso';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-falso';
  process.env.WHATSAPP_ALLOWED_NUMBERS = '5511999998888';
  process.env.SUPA_CRM_SERVICE_KEY = process.env.SUPA_CRM_SERVICE_KEY || 'service-falso';
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-falso';
  delete process.env.WHATSAPP_URL_SECRET;
}
prepararEnv();

const { default: handler } = await import('../api/enrich.js');

function fakeRes() {
  const r = {
    statusCode: null, corpo: null, headers: {},
    status(c) { r.statusCode = c; return r; },
    json(o) { r.corpo = o; return r; },
    send(o) { r.corpo = o; return r; },
    end() { return r; },
    setHeader(k, v) { r.headers[k] = v; },
  };
  return r;
}

function payload(de, texto, wamid = 'wamid.T1') {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id: wamid, from: de, type: 'text', text: { body: texto } }] } }] }] };
}
function assinar(corpo) {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(JSON.stringify(corpo)).digest('hex');
}
function req(method, query, body, headers = {}) {
  return { method, query: Object.assign({ provider: 'whatsapp' }, query), body, headers };
}

// ── Handshake ──────────────────────────────────────────────────────────────
test('GET devolve o challenge com o verify token certo', async () => {
  const res = fakeRes();
  await handler(req('GET', { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-falso', 'hub.challenge': '98765' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo, '98765');
});

test('GET com token errado é recusado', async () => {
  const res = fakeRes();
  await handler(req('GET', { 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '1' }), res);
  assert.equal(res.statusCode, 403);
});

// ── Autenticação do POST ───────────────────────────────────────────────────
test('POST sem assinatura nem segredo na URL é recusado', async () => {
  const res = fakeRes();
  await handler(req('POST', {}, payload('5511999998888', 'oi')), res);
  assert.equal(res.statusCode, 401);
});

test('POST com assinatura adulterada é recusado', async () => {
  const corpo = payload('5511999998888', 'oi');
  const res = fakeRes();
  await handler(req('POST', {}, corpo, { 'x-hub-signature-256': assinar(payload('5511999998888', 'outra coisa')) }), res);
  assert.equal(res.statusCode, 401);
});

test('segredo na URL autentica quando a assinatura não bate', async () => {
  process.env.WHATSAPP_URL_SECRET = 'segredo-url';
  const { default: h2 } = await import('../api/enrich.js?v=url');
  const res = fakeRes();
  // Número fora da allowlist: passa na autenticação e para no filtro, sem rede.
  await h2(req('POST', { s: 'segredo-url' }, payload('5511000000000', 'oi')), res);
  assert.equal(res.statusCode, 200);
  delete process.env.WHATSAPP_URL_SECRET;
});

// ── Allowlist ──────────────────────────────────────────────────────────────
test('número fora da allowlist recebe 200 e silêncio', async () => {
  const corpo = payload('5511000000000', 'quem é você?');
  const res = fakeRes();
  await handler(req('POST', {}, corpo, { 'x-hub-signature-256': assinar(corpo) }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.corpo, { ok: true });
});

// ── Payloads que não são mensagem ──────────────────────────────────────────
test('evento de status (entrega/leitura) é ignorado sem erro', async () => {
  const corpo = { entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'read' }] } }] }] };
  const res = fakeRes();
  await handler(req('POST', {}, corpo, { 'x-hub-signature-256': assinar(corpo) }), res);
  assert.equal(res.statusCode, 200);
});

// ── Configuração incompleta ────────────────────────────────────────────────
test('sem config o webhook não explode: 200 e aviso no log', async () => {
  const salvo = process.env.WHATSAPP_CLOUD_TOKEN;
  delete process.env.WHATSAPP_CLOUD_TOKEN;
  const { default: h3 } = await import('../api/enrich.js?v=semconfig');
  const res = fakeRes();
  await h3(req('POST', {}, payload('5511999998888', 'oi')), res);
  assert.equal(res.statusCode, 200);
  assert.match(JSON.stringify(res.corpo), /config incompleta/);
  process.env.WHATSAPP_CLOUD_TOKEN = salvo;
});

// ── Health ─────────────────────────────────────────────────────────────────
test('health reporta a configuração do WhatsApp sem vazar valor', async () => {
  const res = fakeRes();
  await handler(req('GET', { provider: 'health' }, null), res);
  assert.equal(res.statusCode, 200);
  const wa = res.corpo.whatsapp;
  assert.equal(wa.token, true);
  assert.equal(wa.numeros_permitidos, 1);
  // Nenhum valor de segredo pode aparecer na resposta.
  assert.ok(!JSON.stringify(res.corpo).includes(APP_SECRET));
  assert.ok(!JSON.stringify(res.corpo).includes('token-falso'));
});
