// tests/sdr-auth-vault.test.mjs — Fase 2, item 1: o Bearer do relógio é validado
// contra o segredo do Vault (RPC sdr_cron_token_valido), sem SDR_CRON_SECRET na env.
// Rodar: node tests/sdr-auth-vault.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
delete process.env.SDR_CRON_SECRET;            // o cenário real: env vazia na Vercel
process.env.ANTHROPIC_API_KEY = 'sk-fake';

const SEGREDO_VAULT = 'a'.repeat(64);
let rpcChamadas = 0, rpcFora = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('/rpc/sdr_cron_token_valido')) {
    rpcChamadas++;
    if (rpcFora) return json({ message: 'down' }, false, 503);
    const h = opts.headers || {};
    if (h.Authorization !== 'Bearer service-key-fake') return json({ message: 'permission denied' }, false, 401);
    return json(JSON.parse(opts.body).token === SEGREDO_VAULT);
  }
  if (u.includes('/auth/v1/user')) return json({}, false, 401);
  return json([]);
};

const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const { default: fila } = await import(new URL('../api/fila.js', import.meta.url).href);
const { _limparCache } = await import(new URL('../lib/sdr-auth.js', import.meta.url).href);

function res() { const r = { code: 200 }; r.status = c => { r.code = c; return r; }; r.json = () => r; r.send = () => r; r.setHeader = () => {}; return r; }
const runCron = (auth) => { const r = res(); return cron({ query: { job: '__invalido__' }, headers: { authorization: auth } }, r).then(() => r); };
const runFila = (auth) => { const r = res(); return fila({ method: 'POST', query: {}, headers: { authorization: auth }, body: { canais: ['email'], limite: 1, sem_ia: true } }, r).then(() => r); };

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

console.log('Auth do relógio pelo Vault');
let r = await runCron('Bearer ' + SEGREDO_VAULT);
ok(r.code === 400, 'cron: segredo do Vault passa sem env (job inválido → 400, veio ' + r.code + ')');
r = await runCron('Bearer ' + 'b'.repeat(64));
ok(r.code === 401, 'cron: token errado → 401');
r = await runCron('Bearer curto');
ok(r.code === 401, 'cron: token curto nem consulta o banco → 401');
r = await runFila('Bearer ' + SEGREDO_VAULT);
ok(r.code !== 401, 'fila: segredo do Vault autentica (veio ' + r.code + ')');

console.log('\nCache e falhas');
_limparCache(); rpcChamadas = 0;
await runCron('Bearer ' + SEGREDO_VAULT); await runCron('Bearer ' + SEGREDO_VAULT); await runCron('Bearer ' + SEGREDO_VAULT);
ok(rpcChamadas === 1, 'token válido fica em cache: 3 chamadas, 1 consulta ao banco (' + rpcChamadas + ')');
rpcChamadas = 0;
await runCron('Bearer ' + 'c'.repeat(64)); await runCron('Bearer ' + 'c'.repeat(64));
ok(rpcChamadas === 2, 'token recusado NÃO entra no cache');
_limparCache(); rpcFora = true;
r = await runCron('Bearer ' + SEGREDO_VAULT);
ok(r.code === 401, 'banco fora do ar: falha fechado (401)');
rpcFora = false;
r = await runCron('Bearer cron-vercel');
ok(r.code === 400, 'CRON_SECRET da Vercel segue valendo');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
