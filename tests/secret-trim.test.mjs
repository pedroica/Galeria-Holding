// O CRON_SECRET salvo na Vercel pode ter espaço ou quebra de linha no fim.
// cron.js, fila.js e crm-backup.js precisam aceitar o mesmo segredo, senão o
// cron autentica e a chamada interna para /api/fila leva 401 em silêncio.
// Rodar: node tests/secret-trim.test.mjs
process.env.CRON_SECRET = 'segredo-forte\n';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';

globalThis.fetch = async (url) => String(url).includes('/auth/v1/user')
  ? ({ ok: false, status: 401, json: async () => ({}), text: async () => '{}' })   // JWT desconhecido
  : ({ ok: true, status: 200, json: async () => [], text: async () => '[]' });

let falhas = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log('  ✓ ' + m); else { falhas++; console.log('  ✗ ' + m); } };
function resFake() {
  const r = { code: 200, body: null, headers: {} };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.send = b => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const cron = (await import('../api/cron.js')).default;
const fila = (await import('../api/fila.js')).default;
const backup = (await import('../api/crm-backup.js')).default;

async function chama(h, method, query, auth) {
  const res = resFake();
  try { await h({ method, query, headers: auth ? { authorization: auth } : {}, body: {} }, res); } catch (e) { res.code = res.code || 500; }
  return res.code;
}
// Vercel manda exatamente "Bearer <valor>"; HTTP descarta o \n final.
const BOM = 'Bearer segredo-forte';
ok(await chama(cron, 'GET', { job: 'inexistente' }, BOM) !== 401, 'cron.js aceita o segredo com \\n no fim da env');
ok(await chama(cron, 'GET', { job: 'inexistente' }, 'Bearer errado') === 401, 'cron.js recusa segredo errado');
ok(await chama(cron, 'GET', { job: 'inexistente' }, 'Bearer ') === 401, 'cron.js recusa bearer vazio');
ok(await chama(fila, 'POST', {}, BOM) !== 401, 'fila.js aceita o mesmo segredo (antes: 401)');
ok(await chama(fila, 'POST', {}, 'Bearer errado') === 401, 'fila.js recusa segredo errado');
ok(await chama(backup, 'POST', {}, BOM) !== 401, 'crm-backup.js aceita o mesmo segredo (antes: 401)');
ok(await chama(backup, 'POST', {}, '') === 401, 'crm-backup.js recusa sem header');
console.log(`\n${total - falhas}/${total} ok`);
process.exit(falhas ? 1 : 0);
