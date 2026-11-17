// tests/sdr-auth.test.mjs — Bloco A: authCheck (cron.js) e isCron (fila.js)
// aceitam SDR_CRON_SECRET, usado pelas chamadas do pg_cron/pg_net do Supabase.
// Rodar: node tests/sdr-auth.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.SDR_CRON_SECRET = 'sdr-pgcron-secret';
process.env.ANTHROPIC_API_KEY = 'sk-fake';

globalThis.fetch = async (url) => {
  const u = String(url);
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });
  // verifyJWT: nenhum JWT é válido neste teste (só os segredos de cron autenticam)
  if (u.includes('/auth/v1/user')) return json({}, false, 401);
  // fila: agencias vazio → gera 0, sem tocar no resto
  if (u.includes('crm_agencias')) return json([]);
  return json([]);
};

const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const { default: fila } = await import(new URL('../api/fila.js', import.meta.url).href);

function res() { const r = { code: 200, payload: null }; r.status = c => { r.code = c; return r; }; r.json = p => { r.payload = p; return r; }; r.send = p => { r.payload = p; return r; }; r.setHeader = () => {}; return r; }
const runCron = (auth) => { const r = res(); return cron({ query: { job: '__invalido__' }, headers: auth ? { authorization: auth } : {} }, r).then(() => r); };
const runFila = (auth) => { const r = res(); return fila({ method: 'POST', query: {}, headers: auth ? { authorization: auth } : {}, body: { canais: ['email'], limite: 1, sem_ia: true } }, r).then(() => r); };

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

console.log('Auth SDR_CRON_SECRET');

// cron.js: SDR_CRON_SECRET passa pelo authCheck (job inválido → 400, não 401)
let r = await runCron('Bearer sdr-pgcron-secret');
ok(r.code === 400, 'cron: SDR_CRON_SECRET passa o authCheck (job inválido → 400, código ' + r.code + ')');

r = await runCron('Bearer cron-vercel');
ok(r.code === 400, 'cron: CRON_SECRET segue válido (400)');

r = await runCron('Bearer service-key-fake');
ok(r.code === 400, 'cron: service key segue válida (400)');

r = await runCron('Bearer intruso-qualquer');
ok(r.code === 401, 'cron: segredo desconhecido → 401');

r = await runCron(null);
ok(r.code === 401, 'cron: sem header → 401');

// fila.js: SDR_CRON_SECRET autentica o cron
r = await runFila('Bearer sdr-pgcron-secret');
ok(r.code !== 401, 'fila: SDR_CRON_SECRET autentica (código ' + r.code + ')');

r = await runFila('Bearer intruso-qualquer');
ok(r.code === 401, 'fila: segredo desconhecido → 401');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
