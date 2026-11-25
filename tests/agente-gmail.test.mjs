// tests/agente-gmail.test.mjs — rascunho real no Gmail: MIME texto+HTML,
// idempotência pelo Message-ID da fila, retry controlado, sucesso só com id
// gravado, edição via drafts.update e regras de rejeição. Gmail e Supabase
// simulados. Rodar: node tests/agente-gmail.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';

import { montarMime, messageIdDaFila, textoDaAssinatura, criarRascunhoGmail, atualizarRascunhoGmail } from '../lib/gmail-token.js';
import { selecionarLote } from '../lib/sdr-selecao.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const dec = (raw) => Buffer.from(String(raw).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const partes = (mime) => [...mime.matchAll(/Content-Type: text\/(plain|html); charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)].map(m => ({ tipo: m[1], txt: Buffer.from(m[2].replace(/\r\n/g, ''), 'base64').toString('utf8') }));

console.log('MIME');
const mime = dec(montarMime({ para: 'ana@acme.com', assunto: 'Conversa de março', html: '<p>Oi Ana</p>', texto: 'Oi Ana', messageId: messageIdDaFila('f-1') }));
ok(/^To: ana@acme\.com/m.test(mime) && /^Message-ID: <fila-f-1@agente\.galeriaholding\.crm>/m.test(mime), 'destinatário e Message-ID determinístico');
ok(/multipart\/alternative/.test(mime), 'multipart/alternative');
const ps = partes(mime);
ok(ps.length === 2 && ps[0].tipo === 'plain' && ps[0].txt === 'Oi Ana' && ps[1].tipo === 'html' && /<p>Oi Ana<\/p>/.test(ps[1].txt), 'texto puro + HTML, nessa ordem');
ok(/Subject: =\?UTF-8\?B\?/.test(dec(montarMime({ para: 'a@b.c', assunto: 'Conversa de março', html: 'x', texto: 'x' }))), 'assunto com acento em UTF-8');
ok(textoDaAssinatura('<div>Pedro Ica<br>Galeria Holding &amp; Co</div>') === 'Pedro Ica\nGaleria Holding & Co', 'assinatura HTML vira texto');

console.log('criar / adotar / atualizar');
const chamadas = [];
let existente = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const m = (opts.method || 'GET').toUpperCase();
  chamadas.push({ u, m, body: opts.body ? JSON.parse(opts.body) : null });
  if (u.includes('/settings/sendAs')) return json({ sendAs: [{ isDefault: true, signature: '<div>Pedro Ica</div>' }] });
  if (u.includes('/drafts?') && u.includes('rfc822msgid:')) return json(existente ? { drafts: [existente] } : {});
  if (u.endsWith('/drafts') && m === 'POST') return json({ id: 'r-100', message: { id: 'm100' } });
  if (/\/drafts\/r-100$/.test(u) && m === 'PUT') return json({ id: 'r-100', message: { id: 'm101' } });
  return json({}, 404);
};
let d = await criarRascunhoGmail('tok', { para: 'ana@acme.com', assunto: 'A', corpo: 'Oi Ana\n\nPedro Ica', conta: 'p@gmail.com', filaId: 'f-1' });
ok(d.id === 'r-100' && d.adotado === false && /authuser=p%40gmail\.com/.test(d.link), 'cria e devolve id + link na conta certa');
ok(chamadas.some(c => c.u.includes('rfc822msgid:fila-f-1@agente.galeriaholding.crm')), 'procura antes de criar (idempotência)');
const raw = dec(chamadas.find(c => c.m === 'POST').body.message.raw);
ok(/Message-ID: <fila-f-1@/.test(raw) && /text\/plain/.test(raw), 'rascunho leva Message-ID da fila e parte em texto');
existente = { id: 'r-100', message: { id: 'm100' } };
const antes = chamadas.filter(c => c.m === 'POST').length;
d = await criarRascunhoGmail('tok', { para: 'ana@acme.com', assunto: 'A', corpo: 'x', conta: 'p@gmail.com', filaId: 'f-1' });
ok(d.adotado === true && d.id === 'r-100' && chamadas.filter(c => c.m === 'POST').length === antes, 'segunda chamada adota o mesmo rascunho: não duplica');
d = await atualizarRascunhoGmail('tok', 'r-100', { para: 'ana@acme.com', assunto: 'Novo assunto', corpo: 'Texto novo', conta: 'p@gmail.com', filaId: 'f-1' });
const put = chamadas.find(c => c.m === 'PUT');
ok(put && /\/drafts\/r-100$/.test(put.u) && /Novo assunto|=\?UTF-8/.test(dec(put.body.message.raw)) && d.id === 'r-100', 'edição usa drafts.update no mesmo rascunho');

console.log('seleção respeita rejeição');
const rs = selecionarLote({ candidatos: [{ id: 'd1', empresa_id: 'e1', email: 'a@x.com', empresa: { id: 'e1', nome: 'X' } }], rejeitados: new Set(['d1']), config: { lote_max: 5 }, agora: Date.now() });
ok(rs.lote.length === 0 && rs.excluidos[0].motivo === 'rejeitado_pelo_pedro', 'rejeitado pelo Pedro não volta para a seleção');

console.log('job rascunhos-matinais');
const fila = { id: 'f-9', assunto: 'Oi', corpo: 'Oi Bia', etapa_cadencia: 1, origem: 'sdr', rascunho_tentativas: 0, crm_decisores: { email: 'bia@beta.com', nome: 'Bia' }, outlook_message_id: null };
let modo = 'ok';            // ok | 503-uma-vez | patch-falha | 401
let postsGmail = 0, gravacoes = [], tentativasGravadas = [];
let rascunhoNoGmail = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const m = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
  if (u.startsWith('https://gmail.googleapis.com')) {
    if (u.includes('/settings/sendAs')) return json({ sendAs: [] });
    if (u.includes('rfc822msgid:')) return json(rascunhoNoGmail ? { drafts: [rascunhoNoGmail] } : {});
    if (u.endsWith('/drafts') && m === 'POST') {
      postsGmail++;
      if (modo === '401') return json({ error: { message: 'Invalid Credentials' } }, 401);
      if (modo === '503-uma-vez' && postsGmail === 1) { rascunhoNoGmail = { id: 'r-9', message: { id: 'm9' } }; return json({ error: { message: 'backend' } }, 503); }
      rascunhoNoGmail = { id: 'r-9', message: { id: 'm9' } };
      return json({ id: 'r-9', message: { id: 'm9' } });
    }
    return json({});
  }
  if (u.includes('crm_oauth_tokens')) return json([{ id: 't', access_token: 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'p@gmail.com' }]);
  if (u.includes('crm_logs')) return json([], 201);
  if (u.includes('crm_configuracoes')) return json([]);
  if (u.includes('crm_fila') && m === 'GET') return json(fila.outlook_message_id ? [] : [fila]);
  if (u.includes('crm_fila') && m === 'PATCH') {
    if (body && body.outlook_message_id) {
      if (modo === 'patch-falha') return json({ message: 'falhou' }, 500);
      gravacoes.push(body); Object.assign(fila, body); return json([], 200);
    }
    if (body && body.rascunho_tentativas) { tentativasGravadas.push(body); Object.assign(fila, body); }
    return json([], 200);
  }
  return json([]);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});

modo = '503-uma-vez';
let r = await chamar('rascunhos-matinais');
ok(r.body.criados + r.body.adotados === 1 && postsGmail === 1 && fila.outlook_message_id === 'r-9', 'Gmail 503: retry adota o rascunho que chegou a ser criado (1 só rascunho) ' + JSON.stringify({ c: r.body.criados, a: r.body.adotados, posts: postsGmail }));

Object.assign(fila, { outlook_message_id: null, rascunho_tentativas: 0, rascunho_erro: null }); rascunhoNoGmail = null; postsGmail = 0; gravacoes = []; tentativasGravadas = [];
modo = 'patch-falha';
r = await chamar('rascunhos-matinais');
ok(r.body.criados === 0 && r.body.falhas.length === 1 && /banco não gravou/.test(r.body.falhas[0].erro), 'Gmail criou mas o banco não gravou: NÃO conta como produzido');
ok(tentativasGravadas.length === 1, 'a falha conta como tentativa');
modo = 'ok';
r = await chamar('rascunhos-matinais');
ok(r.body.adotados === 1 && postsGmail === 1 && fila.outlook_message_id === 'r-9', 'próxima rodada adota o rascunho existente: sem duplicata no Gmail');

Object.assign(fila, { outlook_message_id: null, rascunho_tentativas: 0, rascunho_erro: null }); rascunhoNoGmail = null; postsGmail = 0;
modo = '401';
r = await chamar('rascunhos-matinais');
ok(r.body.criados === 0 && postsGmail === 1 && fila.outlook_message_id === null && /gmail:/.test(fila.rascunho_erro || ''), 'Gmail recusou (401): sem retry cego, erro gravado, item NÃO marcado como produzido');

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
