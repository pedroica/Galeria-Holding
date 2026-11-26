// tests/enrich-lusha.test.mjs — jobEnriquecimento do api/cron.js (reescrito em 26/11).
// Invariantes do enriquecimento diário (v2 /person por nome + empresa):
// (a) nunca grava no decisor um e-mail que já pertence a outro contato;
// (b) não achou: não gasta crédito contado e marca a tentativa (volta em 60 dias);
// (c) erro de limite/plano do Lusha (429/402/403) para o loop na hora;
// (d) só pede candidatos ainda não tentados ou tentados há 60+ dias.
// Rodar: node tests/enrich-lusha.test.mjs
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.LUSHA_API_KEY = 'lusha-fake';
process.env.CRON_SECRET = 'cron-fake';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FALHOU: ' + m); } };
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
let CHAMADAS = [], ESCRITAS = [], LUSHA = [], RESP_LUSHA = null, DONO_EMAIL = [];
const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  CHAMADAS.push({ u, mt, body });
  if (u.includes('api.lusha.com/v2/person')) { LUSHA.push(u); return RESP_LUSHA(u); }
  const m = u.match(/\/rest\/v1\/([a-z_]+)\??(.*)$/);
  if (!m) return json({}, 404);
  const [, tab, q] = m;
  if (mt !== 'GET') { ESCRITAS.push({ tab, q, mt, body }); return json({}, 204); }
  if (tab === 'crm_configuracoes') return json([{ chave: 'lusha_daily_limit', valor: 5 }, { chave: 'lusha_creditos_dia', valor: { data: hoje, usados: 0 } }]);
  if (tab === 'crm_decisores' && q.includes('email=ilike.')) return json(DONO_EMAIL);
  if (tab === 'crm_decisores') return json([{ id: 'dAna', nome: 'Ana Souza', empresa_id: 'e1', crm_empresas: { nome: 'Alvo SA' } }, { id: 'dBia', nome: 'Bia Lima', empresa_id: 'e2', crm_empresas: { nome: 'Beta SA' } }]);
  return json([]);
};
const pessoa = (email) => () => json({ contact: { isCreditCharged: true, data: { emailAddresses: [{ address: email }], phoneNumbers: [], jobTitle: { title: 'CMO' } } } });
const { default: handler } = await import(new URL('../api/cron.js', import.meta.url).href);
const run = () => new Promise(resolve => { const r = { status(c) { this.c = c; return this; }, json(p) { resolve(p); return this; } }; handler({ query: { job: 'enriquecimento-diario' }, headers: { authorization: 'Bearer cron-fake' } }, r); });
const patchDec = () => ESCRITAS.filter(e => e.tab === 'crm_decisores' && e.mt === 'PATCH');

console.log('\n(a) e-mail que já é de outro contato não é gravado');
CHAMADAS = []; ESCRITAS = []; LUSHA = []; RESP_LUSHA = pessoa('dono@alvo.com.br'); DONO_EMAIL = [{ id: 'dOutro' }];
let p = await run();
ok(patchDec().every(e => !e.body.email), 'nenhum PATCH grava e-mail duplicado');
ok(p.duplicados === 2 && p.emails === 0, 'conta como duplicado, não como e-mail ganho');
ok(patchDec().every(e => e.body.enriquecimento_tentado_em), 'mesmo assim marca a tentativa');

console.log('\n(b) não achou: marca a tentativa, sem gravar dado');
CHAMADAS = []; ESCRITAS = []; LUSHA = []; DONO_EMAIL = []; RESP_LUSHA = () => json({ contact: { error: { code: 3, message: 'Could not find requested data.' }, isCreditCharged: false } });
p = await run();
ok(p.nao_achados === 2 && p.usados_depois === 0, 'não achou: 0 crédito contado');
ok(patchDec().length === 2 && patchDec().every(e => Object.keys(e.body).join() === 'enriquecimento_tentado_em'), 'só marca enriquecimento_tentado_em');

console.log('\n(c) limite do Lusha para o loop');
CHAMADAS = []; ESCRITAS = []; LUSHA = []; RESP_LUSHA = () => json({ error: { code: 429 } }, 429);
p = await run();
ok(LUSHA.length === 1 && p.erros.length === 1, 'parou na primeira resposta 429');

console.log('\n(d) rotação: só não tentados ou tentados há 60+ dias');
const busca = CHAMADAS.find(c => c.u.includes('/crm_decisores?email=is.null'));
ok(busca && /enriquecimento_tentado_em\.is\.null/.test(busca.u) && /enriquecimento_tentado_em\.lt\./.test(busca.u), 'filtro de rotação na consulta');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
