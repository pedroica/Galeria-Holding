// tests/enrich-lusha.test.mjs — jobEnriquecimento do api/cron.js (BLOCO 4).
// (a) nunca grava o e-mail de um contato no decisor errado: sobrenome que não
//     bate → cria novo decisor, não usa "|| dec"; e-mail duplicado é descartado.
// (b) respeita e alimenta crm_configuracoes.lusha_sem_contato.
// (d) teto diário de crédito (lusha_daily_limit) para o loop.
// (e) rotação: marca enriquecimento_tentado_em e ordena por ele.
// Rodar: node tests/enrich-lusha.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.LUSHA_API_KEY = 'lusha-fake';
process.env.LUSHA_KEY = 'lusha-fake';
process.env.CRON_SECRET = '';
process.env.VERCEL_URL = 'app.fake';

let DECISORES, EMPRESAS, ESTRELAS, CONFIG, SEARCH, REVEAL, EMAIL_EXISTS, BALANCE;
let ESCRITAS, CHAMADAS, SEARCHES;

function reset() {
  DECISORES = [{ id: 'd1', nome: 'Ana Souza', empresa_id: 'e1' }];
  EMPRESAS = [{ id: 'e1', nome: 'Alvo SA', dominio: 'alvo.com.br' }];
  ESTRELAS = [{ empresa_id: 'e1', estrelas_manual: 5 }];
  CONFIG = { enriquecimento_diario_max: '10', lusha_daily_limit: '60', lusha_sem_contato: [] };
  SEARCH = [{ id: 'v1.a', firstName: 'Ana', lastName: 'Souza', title: 'CMO' }];
  REVEAL = [{ firstName: 'Ana', lastName: 'Souza', email: 'ana@alvo.com.br', phoneNumber: '+5511999' }];
  EMAIL_EXISTS = [];
  BALANCE = 2520;
  ESCRITAS = []; CHAMADAS = []; SEARCHES = [];
}

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  CHAMADAS.push({ u, method, body });
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });

  if (u.includes('/v3/account/usage')) return json({ credits: { remaining: BALANCE } });
  if (u.includes('/v3/contacts/prospecting')) { SEARCHES.push(body); return json({ contacts: SEARCH }); }
  if (u.includes('/v3/contacts/enrich')) {
    const withPhones = (body.reveal || []).includes('phones');
    return json({ results: REVEAL.map(r => ({ ...r, phoneNumber: withPhones ? r.phoneNumber : null })) });
  }
  if (u.includes('provider=lusha-domain')) return json({ domain: 'alvo.com.br', source: 'prospecting' });

  const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
  if (!m) return json({}, false, 404);
  const tabela = m[1], query = m[2] || '';
  if (method === 'GET') {
    if (tabela === 'crm_configuracoes') {
      const chave = (query.match(/chave=eq\.([a-z_]+)/) || [])[1];
      const v = CONFIG[chave];
      return json(v === undefined ? [] : [{ valor: v }]);
    }
    if (tabela === 'crm_kanban') return json([]);
    if (tabela === 'crm_decisores') {
      if (query.includes('email=eq.')) return json(EMAIL_EXISTS);
      return json(DECISORES);
    }
    if (tabela === 'crm_empresas') return json(EMPRESAS);
    if (tabela === 'crm_empresa_agencia_estrelas') return json(ESTRELAS);
    return json([]);
  }
  ESCRITAS.push({ tabela, method, query, body });
  return json([{ id: 'novo' }]);
};

const { default: handler } = await import(new URL('../api/cron.js', import.meta.url).href);
function res() { const r = { code: 200, payload: null }; r.status = c => { r.code = c; return r; }; r.json = p => { r.payload = p; return r; }; return r; }
const run = () => { const r = res(); return handler({ query: { job: 'enriquecimento-diario' }, headers: { authorization: 'Bearer service-key-fake' } }, r).then(() => r); };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const patchesDecisor = () => ESCRITAS.filter(e => e.tabela === 'crm_decisores' && e.method === 'PATCH');
const postsDecisor = () => ESCRITAS.filter(e => e.tabela === 'crm_decisores' && e.method === 'POST');

console.log('Enriquecimento Lusha — api/cron.js');

// ── (a) sobrenome não bate → NÃO contamina; cria novo decisor ────────────────
reset();
DECISORES = [{ id: 'd1', nome: 'Ana Souza', empresa_id: 'e1' }, { id: 'd2', nome: 'Bruno Lima', empresa_id: 'e1' }];
SEARCH = [{ id: 'v1.c', firstName: 'Carla', lastName: 'Mendes', title: 'CMO' }];
REVEAL = [{ firstName: 'Carla', lastName: 'Mendes', email: 'carla@alvo.com.br', phoneNumber: null }];
let r = await run();
const emailPatchErrado = patchesDecisor().some(p => p.body?.email && (p.query.includes('d1') || p.query.includes('d2')));
ok(!emailPatchErrado, 'NÃO grava e-mail de Carla em cima de Ana nem de Bruno (fim do "|| dec")');
const novoDec = postsDecisor().find(p => p.body?.email === 'carla@alvo.com.br');
ok(!!novoDec && /Carla Mendes/.test(novoDec.body.nome || ''), 'cria um novo decisor para o contato sem correspondência');

// ── (a) e-mail já existente em outro decisor → descarta ──────────────────────
reset();
EMAIL_EXISTS = [{ id: 'outro' }];   // ana@alvo.com.br já existe
r = await run();
ok(patchesDecisor().every(p => !p.body?.email) && postsDecisor().length === 0, 'e-mail duplicado não é regravado nem recriado');
ok(r.payload?.revelados === 0, 'duplicado não conta como revelado');

// ── (b) search sem contatos → marca empresa em lusha_sem_contato ─────────────
reset();
SEARCH = [];
r = await run();
const upsert = ESCRITAS.find(e => e.tabela === 'crm_configuracoes' && e.method === 'POST' && e.body?.chave === 'lusha_sem_contato');
ok(!!upsert && (upsert.body.valor || []).includes('e1'), 'empresa sem contato é gravada em lusha_sem_contato');

// ── (b) empresa já em lusha_sem_contato → nem busca ──────────────────────────
reset();
CONFIG.lusha_sem_contato = ['e1'];
r = await run();
ok(SEARCHES.length === 0, 'empresa já marcada sem contato não é reconsultada (0 buscas)');

// ── (d) teto de crédito interrompe o loop ────────────────────────────────────
reset();
DECISORES = [{ id: 'd1', nome: 'Ana Souza', empresa_id: 'e1' }, { id: 'd2', nome: 'Bia Rocha', empresa_id: 'e2' }];
EMPRESAS = [{ id: 'e1', nome: 'Alvo SA', dominio: 'alvo.com.br' }, { id: 'e2', nome: 'Beta SA', dominio: 'beta.com.br' }];
ESTRELAS = [{ empresa_id: 'e1', estrelas_manual: 5 }, { empresa_id: 'e2', estrelas_manual: 5 }];
CONFIG.lusha_daily_limit = '5';            // 1 reveal com telefone (6) já estoura
r = await run();
ok(SEARCHES.length === 1, 'para no teto de crédito após a 1ª empresa (não busca a 2ª)');
ok(r.payload?.teto_creditos === 5, 'expõe o teto de crédito no contexto');

// ── (e) rotação: marca enriquecimento_tentado_em e ordena por ele ────────────
reset();
r = await run();
ok(patchesDecisor().some(p => p.body?.enriquecimento_tentado_em), 'marca enriquecimento_tentado_em no decisor tentado');
ok(CHAMADAS.some(c => c.u.includes('enriquecimento_tentado_em.asc.nullsfirst')), 'ordena candidatos por menos-recentemente-tentado');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
