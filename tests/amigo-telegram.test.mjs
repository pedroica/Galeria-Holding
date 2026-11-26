// Amigo no Telegram (api/enrich?provider=telegram): instalação, pareamento, só o dono, "manda".
import { createHash } from 'node:crypto';
process.env.TELEGRAM_BOT_TOKEN = '123:abc'; process.env.CRON_SECRET = 'cron-x';
process.env.SUPA_CRM_SERVICE_KEY = 'service-falso'; process.env.ANTHROPIC_API_KEY = 'sk-falso';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const SEG = createHash('sha256').update('tg:123:abc').digest('hex').slice(0, 48);
const cfg = {}; const tg = []; const inbox = new Set(); const sess = {}; const gmail = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.startsWith('https://api.telegram.org/')) { const metodo = u.split('/').pop(); tg.push([metodo, body]); return json({ ok: true, result: metodo === 'getMe' ? { username: 'pedro_crm_bot' } : true }); }
  if (u.includes('crm_configuracoes') && mt === 'GET') { const k = (u.match(/chave=eq\.(\w+)/) || [])[1]; return json(cfg[k] !== undefined && cfg[k] !== null ? [{ valor: cfg[k] }] : []); }
  if (u.includes('crm_configuracoes')) { cfg[body.chave] = body.valor; return new Response(null, { status: 201 }); }
  if (u.includes('crm_wa_inbox')) { if (inbox.has(body.wamid)) return json({ code: '23505', message: 'duplicate key' }, 409); inbox.add(body.wamid); return new Response(null, { status: 201 }); }
  if (u.includes('crm_wa_sessoes') && mt === 'GET') { const k = (u.match(/telefone=eq\.([^&]+)/) || [])[1]; return json(sess[k] ? [sess[k]] : []); }
  if (u.includes('crm_wa_sessoes')) { const l = body[0]; sess[l.telefone] = Object.assign(sess[l.telefone] || {}, l); return new Response(null, { status: 201 }); }
  if (u.includes('crm_oauth_tokens')) return json([{ id: 1, access_token: 'tok', refresh_token: 'rt', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'p@g.test' }]);
  if (u.includes('gmail.googleapis.com')) { gmail.push(mt + ' ' + u); if (u.includes('sendAs')) return json({ sendAs: [] }); if (u.includes('/drafts/send')) return json({ id: 'm9' }); if (u.includes('/drafts')) return json({ id: 'r-9', message: { id: 'm8' } }); return json({}); }
  return new Response(null, { status: 201 });
};
const { default: handler } = await import('../api/enrich.js');
const chamar = (method, query, body, headers = {}) => new Promise(async (resolve) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { this.corpo = o; resolve(this); return this; }, setHeader() {}, end() { resolve(this); return this; } };
  await handler({ method, query: Object.assign({ provider: 'telegram' }, query), body, headers }, res);
});
let uid = 1;
const msg = (from, text) => chamar('POST', {}, { update_id: uid++, message: { chat: { id: from }, from: { id: from }, text } }, { 'x-telegram-bot-api-secret-token': SEG });

let r = await chamar('GET', { acao: 'instalar' }, null, { authorization: 'Bearer errado' });
ok(r.statusCode === 401, 'instalar exige o segredo do servidor');
r = await chamar('GET', { acao: 'instalar' }, null, { authorization: 'Bearer cron-x', host: 'galeria.test' });
const codigo = (r.corpo.link || '').split('start=')[1];
ok(r.corpo.ok && r.corpo.bot === 'pedro_crm_bot' && /^[a-f0-9]{24}$/.test(codigo) && tg.some(([m, b]) => m === 'setWebhook' && b.secret_token === SEG && b.url === 'https://galeria.test/api/enrich?provider=telegram'), 'instala o webhook com segredo e gera o link de pareamento');
r = await chamar('POST', {}, { update_id: 99, message: { chat: { id: 5 }, from: { id: 5 }, text: 'oi' } }, { 'x-telegram-bot-api-secret-token': 'falso' });
ok(r.statusCode === 401, 'webhook sem o segredo do Telegram é recusado');
await msg(666, 'oi');
ok(!cfg.telegram_dono_id && tg.some(([m, b]) => m === 'sendMessage' && b.chat_id === 666 && /privado/.test(b.text)), 'antes do pareamento, estranho recebe "bot privado"');
await msg(777, '/start ' + 'f'.repeat(24));
ok(!cfg.telegram_dono_id, 'código errado não pareia');
await msg(42, '/start ' + codigo);
ok(cfg.telegram_dono_id === '42' && cfg.telegram_pareamento && cfg.telegram_pareamento.usado_em && !cfg.telegram_pareamento.hash && tg.some(([m, b]) => b && b.chat_id === 42 && /braço direito/.test(b.text)), 'link certo pareia o Telegram do Pedro (uma vez só)');
const antes = tg.length;
await msg(666, 'me passa os dados do CRM');
ok(tg.length === antes, 'depois de pareado, estranho é ignorado em silêncio');
sess['tg:42'] = { telefone: 'tg:42', mensagens: [], pendente: { tipo: 'email', decisor_id: 'd1', para: 'ana@x.com', nome: 'Ana', assunto: 'oi', corpo: 'Ana, tudo bem?' } };
await msg(42, 'manda');
ok(gmail.some(g => /drafts\/send/.test(g)) && tg.some(([m, b]) => b && b.chat_id === 42 && /Enviado para \*Ana\*/.test(b.text)) && sess['tg:42'].pendente === null, '"manda" no Telegram envia o e-mail pendente');
console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
