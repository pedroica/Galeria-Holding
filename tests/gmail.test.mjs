// tests/gmail.test.mjs — integração Gmail: conectar, rascunho de madrugada com
// assinatura e cópia, envio só com JWT do usuário, leitura de respostas.
// Google e Supabase simulados (endereços fictícios). Rodar: node tests/gmail.test.mjs
process.env.SUPA_CRM_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.SUPA_CRM_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.GOOGLE_CLIENT_ID = 'gid';
process.env.GOOGLE_CLIENT_SECRET = 'gsec';
import { montarMime, htmlDoRascunho, semAssinaturaTexto } from '../lib/gmail-token.js';

const COPIA = 'socio@empresa.example';
const CONTA = 'conta@gmail.example';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const dec = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

console.log('MIME e corpo');
const raw = montarMime({ para: 'ana@acme.example', cco: COPIA, assunto: 'Acme e a expansão', html: '<p>oi</p>' });
const txt = dec(raw);
ok(/^To: ana@acme.example/m.test(txt) && new RegExp('^Bcc: ' + COPIA, 'm').test(txt), 'destinatário e Cco no cabeçalho');
ok(/^Subject: =\?UTF-8\?B\?/m.test(txt) && Buffer.from(txt.match(/=\?UTF-8\?B\?([^?]+)\?=/)[1], 'base64').toString() === 'Acme e a expansão', 'assunto com acento em UTF-8');
ok(semAssinaturaTexto('Oi.\n\nTopa?\n\nPedro Ica\nVitrine, Galeria Holding') === 'Oi.\n\nTopa?', 'tira "Pedro Ica" e a linha da agência');
const h = htmlDoRascunho('Oi <b>Ana</b>.\n\nTopa?\n\nPedro Ica', '<img src="https://x/sig.png">Galeria Holding');
ok(/&lt;b&gt;Ana/.test(h) && /gmail_signature.*sig\.png/.test(h) && !/Pedro Ica/.test(h), 'HTML escapado + assinatura do Gmail no fim, sem a assinatura em texto');

let db, escritas, gmailCalls;
function reset() {
  db = {
    tokens: [{ id: 'tk1', access_token: 'gtok', refresh_token: 'r1', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: CONTA }],
    fila: [
      { id: 'f1', origem: 'sdr', assunto: 'Acme e a expansão', corpo: 'Ana, li que a Acme...\n\nTopa 20 minutos?\n\nPedro Ica', etapa_cadencia: 1, rascunho_tentativas: 0, crm_decisores: { email: 'ana@acme.example', nome: 'Ana' } },
      { id: 'f9', origem: null, assunto: 'Fila antiga', corpo: 'Texto genérico', etapa_cadencia: 1, rascunho_tentativas: 0, crm_decisores: { email: 'bia@beta.example', nome: 'Bia' } }
    ],
    filaItem: { status: 'aprovado', outlook_message_id: 'dr1' },
    inbox: [{ id: 'g1', threadId: 't1', internalDate: String(Date.now()), snippet: 'Faz sentido, podemos marcar quinta?', payload: { headers: [{ name: 'From', value: 'Ana <ana@acme.example>' }, { name: 'Subject', value: 'Re: Acme e a expansão' }] } }]
  };
  escritas = []; gmailCalls = [];
}
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const m = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
  if (u.startsWith('https://gmail.googleapis.com')) {
    gmailCalls.push({ u, m, body });
    if (u.endsWith('/settings/sendAs')) return json({ sendAs: [{ sendAsEmail: CONTA, isDefault: true, signature: '<img src="https://x/sig.png">Galeria Holding' }] });
    if (u.endsWith('/drafts') && m === 'POST') return json({ id: 'dr1', message: { id: 'msg1' } });
    if (u.endsWith('/drafts/send')) return json({ id: 'msg1', labelIds: ['SENT'] });
    if (u.includes('/messages?')) return json({ messages: db.inbox.map(x => ({ id: x.id })) });
    if (u.includes('/messages/')) return json(db.inbox.find(x => u.includes('/messages/' + x.id)));
    if (u.endsWith('/profile')) return json({ emailAddress: CONTA });
    return json({}, 404);
  }
  if (u.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'novo', refresh_token: 'rnovo', expires_in: 3600 });
  if (u.includes('/auth/v1/user')) return (opts.headers && String(opts.headers.Authorization || '').includes('jwt-ok')) ? json({ id: 'u1' }) : json({}, 401);
  if (m !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, m, body });
  if (u.includes('crm_oauth_tokens') && u.includes('provider=eq.google') && m === 'GET') return json(u.includes('pkce_state=eq.') ? [{ id: 'st1' }] : db.tokens);
  if (u.includes('crm_oauth_tokens')) return m === 'GET' ? json([]) : new Response('', { status: 201 });
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_configuracoes') && m === 'GET' && u.includes('pausar_primeiros_contatos')) return json([{ valor: true }]);
  if (u.includes('crm_configuracoes') && m === 'GET') return json(u.includes('email_copia') ? [{ chave: 'email_copia', valor: COPIA }, { chave: 'email_copia_tipo', valor: 'bcc' }] : []);
  if (u.includes('crm_fila') && m === 'GET' && u.includes('id=eq.')) return json([db.filaItem]);
  if (u.includes('crm_fila') && m === 'GET') return json(db.fila);
  if (u.includes('crm_decisores') && m === 'GET') return json(u.includes('ana@acme.example') ? [{ id: 'd1', nome: 'Ana', email: 'ana@acme.example', wa: null, empresa_id: 'e1', crm_empresas: { nome: 'Acme' } }] : []);
  if (u.includes('crm_sdr_respostas') && m === 'POST') return json([{ id: 'r1' }], 201);
  if (u.includes('crm_oportunidades') && m === 'POST') return json([{ id: 'op1' }], 201);
  if (u.includes('crm_sdr_estado') && m === 'GET') return json([{ agencia_id: 'a1' }]);
  return m === 'GET' ? json([]) : new Response(null, { status: 204 });
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const { default: enrich } = await import(new URL('../api/enrich.js', import.meta.url).href);
const chamar = (h, req) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(x) { this._s = x; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, end() { resolve({ status: this._s }); }, redirect(code, loc) { resolve({ status: code, loc }); } };
  h(req, res);
});

console.log('\nConectar');
reset();
let r = await chamar(enrich, { method: 'POST', query: { provider: 'gmail-init' }, headers: { authorization: 'Bearer jwt-ok' }, body: {} });
ok(r.status === 200 && /accounts\.google\.com/.test(r.body.authUrl) && /access_type=offline/.test(r.body.authUrl) && /gmail\.compose/.test(decodeURIComponent(r.body.authUrl)) && /state=gmailoauth_/.test(r.body.authUrl), 'gmail-init devolve a URL do Google com escopos e offline');
r = await chamar(enrich, { method: 'POST', query: { provider: 'gmail-init' }, headers: {}, body: {} });
ok(r.status === 401, 'sem login do CRM não conecta');
reset();
r = await chamar(enrich, { method: 'GET', query: { code: 'c1', state: 'gmailoauth_abc' }, headers: {} });
const salvo = escritas.find(e => e.u.includes('crm_oauth_tokens?id=eq.st1'));
ok(r.status === 302 && /gmail_connected=1/.test(r.loc) && salvo && salvo.body.refresh_token === 'rnovo' && salvo.body.account_email === CONTA, 'callback grava os tokens no banco e volta conectado');
ok(!/rnovo|novo/.test(r.loc), 'token não aparece no redirecionamento');

console.log('\nRascunhos de madrugada');
reset();
r = await chamar(cron, { method: 'GET', query: { job: 'rascunhos-matinais' }, headers: { authorization: 'Bearer cron-vercel' } });
const draft = gmailCalls.find(c => c.u.endsWith('/drafts') && c.m === 'POST');
const mime = draft ? dec(draft.body.message.raw) : '';
ok(r.status === 200 && r.body.provedor === 'gmail' && r.body.criados === 1, 'cria o rascunho no Gmail (' + JSON.stringify(r.body) + ')');
ok(new RegExp('^Bcc: ' + COPIA, 'm').test(mime), 'rascunho com Cco para o endereço configurado');
const corpoHtml = mime ? Buffer.from(mime.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8') : '';
ok(/sig\.png/.test(corpoHtml) && !/Pedro Ica/.test(corpoHtml), 'assinatura do Gmail no fim e sem "Pedro Ica" duplicado');
ok(escritas.some(e => e.u.includes('crm_fila?id=eq.f1&outlook_message_id=is.null') && e.body.outlook_message_id === 'dr1'), 'grava o id do rascunho (nunca cria duas vezes)');
ok(!gmailCalls.some(c => c.u.includes('/drafts/send')), 'madrugada não envia nada');
ok(!escritas.some(e => e.u.includes('crm_fila?id=eq.f9')) && gmailCalls.filter(c => c.u.endsWith('/drafts') && c.m === 'POST').length === 1, 'com a pausa de primeiros contatos ligada, só o SDR vira rascunho (fila antiga continua pausada)');
const linkSalvo = (escritas.find(e => e.u.includes('crm_fila?id=eq.f1&outlook_message_id=is.null')) || {}).body || {};
ok(new RegExp('authuser=' + encodeURIComponent(CONTA).replace(/\./g, '\\.') + '#drafts\\?compose=msg1').test(linkSalvo.outlook_draft_link || ''), 'link do rascunho abre na conta certa (authuser), não na primeira conta logada (' + linkSalvo.outlook_draft_link + ')');

console.log('\nEnvio só com o clique do Pedro');
reset();
r = await chamar(enrich, { method: 'POST', query: { provider: 'gmail-send' }, headers: { authorization: 'Bearer cron-vercel' }, body: { fila_id: 'f1', outlook_message_id: 'dr1' } });
ok(r.status === 401 && !gmailCalls.some(c => c.u.includes('/drafts/send')), 'o segredo do cron NÃO consegue enviar');
r = await chamar(enrich, { method: 'POST', query: { provider: 'gmail-send' }, headers: { authorization: 'Bearer jwt-ok' }, body: { fila_id: 'f1', outlook_message_id: 'dr1', decisor_id: 'd1', empresa_id: 'e1', assunto: 'Acme' } });
ok(r.status === 200 && r.body.enviado && gmailCalls.some(c => c.u.endsWith('/drafts/send') && c.body.id === 'dr1'), 'com o login do Pedro, envia o rascunho');
ok(escritas.some(e => e.u.includes('crm_toques') && e.body.fonte === 'gmail') && escritas.some(e => e.u.includes('crm_fila?id=eq.f1') && e.body.status === 'enviado'), 'registra o toque e marca enviado');
reset(); db.filaItem = { status: 'rascunho', outlook_message_id: 'dr1' };
r = await chamar(enrich, { method: 'POST', query: { provider: 'gmail-send' }, headers: { authorization: 'Bearer jwt-ok' }, body: { fila_id: 'f1', outlook_message_id: 'dr1' } });
ok(r.status === 400 && !gmailCalls.some(c => c.u.includes('/drafts/send')), 'item não aprovado não é enviado');

console.log('\nRespostas no Gmail');
reset();
r = await chamar(cron, { method: 'GET', query: { job: 'sdr-respostas' }, headers: { authorization: 'Bearer cron-vercel' } });
ok(r.status === 200 && r.body.de_decisores === 1 && r.body.interesse === 1, 'lê a caixa do Gmail e classifica interesse (' + JSON.stringify(r.body) + ')');
ok(escritas.some(e => e.u.includes('crm_configuracoes') && e.body && e.body.chave === 'sdr_inbox_cursor_gmail'), 'cursor próprio do Gmail');
ok(!gmailCalls.some(c => c.m === 'POST'), 'não responde ninguém');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
