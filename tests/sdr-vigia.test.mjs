// tests/sdr-vigia.test.mjs — monitor da manhã: detecta noite que não rodou e
// avisa por um rascunho no Gmail do próprio Pedro, uma vez por dia; noite boa
// não gera aviso; nada é enviado. Rodar: node tests/sdr-vigia.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

let selecaoRodou = false;
const logs = [];
const gmail = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const metodo = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
  if (u.startsWith('https://gmail.googleapis.com')) {
    gmail.push({ u, metodo, body });
    if (u.includes('/settings/sendAs')) return json({ sendAs: [] });
    if (u.endsWith('/drafts') && metodo === 'POST') return json({ id: 'r-9', message: { id: 'm9' } });
    return json({});
  }
  if (u.includes('crm_oauth_tokens')) return json([{ id: 't1', access_token: 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'pedro@gmail.com' }]);
  if (u.includes('crm_logs') && metodo === 'POST') { logs.push(body); return json([], 201); }
  if (u.includes('crm_logs') && u.includes('origem=eq.cron:sdr-selecao')) return json(selecaoRodou ? [{ contexto: {}, criado_em: new Date().toISOString() }] : []);
  if (u.includes('crm_logs') && u.includes('origem=eq.cron:sdr-vigia')) return json(logs.filter(l => l.origem === 'cron:sdr-vigia' && l.mensagem === 'fim — alerta no Gmail').map(() => ({ id: 1 })));
  if (u.includes('crm_logs') && u.includes('nivel=eq.error')) return json([]);
  if (u.includes('crm_configuracoes')) return json([{ chave: 'sdr_relogio_ativo', valor: true }, { chave: 'sdr_meta_rascunhos_dia', valor: 20 }]);
  if (u.includes('crm_fila')) return json([{ id: 'f1', outlook_message_id: 'r-1', rascunho_erro: null }]);
  return json([]);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});

console.log('Job sdr-vigia');
let r = await chamar('sdr-vigia');
ok(r.status === 200 && r.body.alerta === true && r.body.problemas.some(p => /seleção da noite/.test(p)), 'noite sem seleção: detecta e alerta ' + JSON.stringify(r.body.problemas));
const rasc = gmail.filter(g => g.u.endsWith('/drafts') && g.metodo === 'POST');
ok(rasc.length === 1, 'aviso vai como UM rascunho no Gmail');
const raw = rasc[0] && Buffer.from(String(rasc[0].body.message.raw).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
ok(/^To: pedro@gmail\.com/m.test(raw || ''), 'o rascunho é para o próprio Pedro');
ok(!gmail.some(g => /\/(drafts|messages)\/send/.test(g.u)), "nada é enviado");
ok(logs.some(l => l.origem === 'cron:sdr-vigia' && l.nivel === 'error'), 'falha fica registrada como error no crm_logs');

r = await chamar('sdr-vigia');
ok(gmail.filter(g => g.u.endsWith('/drafts') && g.metodo === 'POST').length === 1, 'segunda execução no mesmo dia não repete o aviso');

selecaoRodou = true;
const antes = gmail.length;
r = await chamar('sdr-vigia');
ok(r.body.problemas.length === 0 && gmail.length === antes, 'noite boa: sem problema e sem aviso');
ok(logs[logs.length - 1].nivel === 'info', 'noite boa fica como info');

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
