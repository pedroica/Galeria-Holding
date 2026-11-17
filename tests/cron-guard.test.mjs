// tests/cron-guard.test.mjs — BLOCO 6b: leitura de banco que falha vira 'error' e para.
// sg() passa a devolver null em falha (não []), e cada job guarda sua leitura
// primária: null → logCron('error') + HTTP 500, em vez de seguir sobre base vazia.
// Rodar: node tests/cron-guard.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.LUSHA_API_KEY = 'lusha-fake';
process.env.LUSHA_KEY = 'lusha-fake';
process.env.CRON_SECRET = 'cron-xyz';

let FALHAR;   // conjunto de tabelas cujo GET deve falhar (simula erro de banco)
let LOGS;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });

  if (u.includes('/v3/account/usage')) return json({ credits: { remaining: 5000 } });

  const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
  if (!m) return json({}, false, 404);
  const tabela = m[1];
  if (tabela === 'crm_logs' && method === 'POST') { LOGS.push(body); return json({}, true, 201); }
  if (method === 'GET') {
    if (FALHAR.has(tabela)) return json({ message: 'db down' }, false, 503);  // falha de leitura
    return json([]);  // sucesso vazio
  }
  return json({}, true, 204);
};

const { default: handler } = await import(new URL('../api/cron.js', import.meta.url).href);
function res() { const r = { code: 200, payload: null }; r.status = c => { r.code = c; return r; }; r.json = p => { r.payload = p; return r; }; return r; }
const run = (job, falhar = []) => { FALHAR = new Set(falhar); LOGS = []; const r = res(); return handler({ query: { job }, headers: { authorization: 'Bearer cron-xyz' } }, r).then(() => r); };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const logouErro = (job) => LOGS.some(l => l.nivel === 'error' && l.origem === 'cron:' + job);

console.log('Guard de leitura de banco — api/cron.js');

// enriquecimento: crm_decisores falha → 500 + error
let r = await run('enriquecimento-diario', ['crm_decisores']);
ok(r.code === 500 && logouErro('enriquecimento-diario'), 'enriquecimento: leitura de crm_decisores falha → 500 + log error');

// fechamento: crm_toques falha → 500 + error
r = await run('fechamento-sexta', ['crm_toques']);
ok(r.code === 500 && logouErro('fechamento-sexta'), 'fechamento: leitura de crm_toques falha → 500 + log error');

// oportunidades: crm_oportunidades falha → 500 + error
r = await run('oportunidades-paradas', ['crm_oportunidades']);
ok(r.code === 500 && logouErro('oportunidades-paradas'), 'oportunidades: leitura falha → 500 + log error');

// Caso saudável (leitura vazia, sem falha) NÃO é 500: base vazia é diferente de erro.
r = await run('oportunidades-paradas', []);
ok(r.code !== 500, 'leitura vazia (sem falha) não vira 500 — base vazia ≠ erro (código ' + r.code + ')');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
