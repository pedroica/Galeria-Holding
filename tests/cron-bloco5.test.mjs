// tests/cron-bloco5.test.mjs — BLOCO 5 (fechamento, oportunidades, rascunhos).
// Rodar: node tests/cron-bloco5.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-xyz';
process.env.PROD_BASE_URL = 'https://prod.test';

let DATA, GRAPH, ESCRITAS, RELAT_POST;
const dia = (n) => new Date(Date.now() - n * 86400000).toISOString();

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });

  if (u.includes('provider=graph-draft')) return json(GRAPH.body, GRAPH.ok, GRAPH.status);

  const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
  if (!m) return json({}, false, 404);
  const tabela = m[1], q = m[2] || '';
  if (method === 'GET') {
    if (tabela === 'crm_configuracoes') {
      const chave = (q.match(/chave=eq\.([a-z_]+)/) || [])[1];
      return json(DATA.config[chave] !== undefined ? [{ valor: DATA.config[chave] }] : []);
    }
    if (tabela === 'crm_empresas' && q.includes('id=in.')) return json(DATA.empNomes || []);
    if (tabela === 'crm_empresas') return json(DATA.empresasNovas || []);
    if (tabela === 'crm_relatorios') return json(DATA.relatExist || []);
    return json(DATA[tabela] || []);
  }
  ESCRITAS.push({ tabela, method, q, body });
  if (tabela === 'crm_relatorios' && method === 'POST') return json(RELAT_POST);
  return json([{ id: 'x' }]);
};

const { default: handler } = await import(new URL('../api/cron.js', import.meta.url).href);
function res() { const r = { code: 200, payload: null }; r.status = c => { r.code = c; return r; }; r.json = p => { r.payload = p; return r; }; r.send = p => { r.payload = p; return r; }; r.setHeader = () => {}; return r; }
const run = (job) => { ESCRITAS = []; const r = res(); return handler({ query: { job }, headers: { authorization: 'Bearer cron-xyz' } }, r).then(() => r); };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

// ── fechamento-sexta (c) ─────────────────────────────────────────────────────
console.log('fechamento-sexta');
DATA = {
  config: {},
  crm_fila: [ { id: 'f1', canal: 'email', agencia_id: 'ag1', empresa_id: 'e1' },
              { id: 'f2', canal: 'whatsapp', agencia_id: 'ag2', empresa_id: 'e2' } ],
  crm_agencias: [ { id: 'ag1', nome: 'Alfa' }, { id: 'ag2', nome: 'Beta' } ],
  empresasNovas: [],
  crm_toques: [ { empresa_id: 'e1', resultado: 'respondeu' },
                { empresa_id: 'e1', resultado: 'reuniao_marcada' },
                { empresa_id: 'e2', resultado: 'respondeu' } ],
  crm_oportunidades: [],
  empNomes: [ { id: 'e1', nome: 'Empresa Um' }, { id: 'e2', nome: 'Empresa Dois' } ],
  relatExist: []
};
RELAT_POST = [{ token: 'abc123' }];
let r = await run('fechamento-sexta');
ok(r.payload?.respostas_total === 3, `respostas vêm de crm_toques (3), não do status inexistente (${r.payload?.respostas_total})`);
ok(r.payload?.reunioes_total === 1, `reuniões vêm de crm_toques (1), não da crm_kanban (${r.payload?.reunioes_total})`);
ok(r.payload?.por_agencia?.Alfa?.respostas === 2 && r.payload?.por_agencia?.Beta?.respostas === 1,
   `cada agência tem seu total de respostas (Alfa 2 / Beta 1), não o global`);
ok(r.payload?.por_agencia?.Alfa?.reunioes === 1, 'reunião atribuída à agência certa via empresa→agência');
ok(Array.isArray(r.payload?.top5) && r.payload.top5[0] === 'Empresa Um' && !r.payload.top5.includes('ag1'),
   'top5 é por empresa (nome), nunca agencia_id');
ok(r.payload?.link === 'https://prod.test/api/relatorio/abc123', `link do relatório usa a rota real (${r.payload?.link})`);

// ── oportunidades-paradas (b) ────────────────────────────────────────────────
console.log('\noportunidades-paradas');
const opps = Array.from({ length: 15 }, (_, i) => ({
  id: 'o' + i, titulo: 'Op ' + i, estagio: 'Negociação', empresa_id: 'e' + i,
  valor_estimado: 1000 - i, proximo_passo: null, proximo_passo_em: null, aberta_em: dia(120)
}));
DATA = {
  config: { oportunidade_parada_dias: '14' },
  crm_oportunidades: opps,
  // o0: evento real há 100d + cobrança do cron há 20d (fora da janela de 14d).
  crm_oportunidade_eventos: [
    { oportunidade_id: 'o0', tipo: 'estagio', criado_em: dia(100) },
    { oportunidade_id: 'o0', tipo: 'pedido_atualizacao', criado_em: dia(20) }
  ]
};
r = await run('oportunidades-paradas');
const cobrancas = ESCRITAS.filter(e => e.tabela === 'crm_oportunidade_eventos' && e.method === 'POST');
ok(cobrancas.length === 10, `no máximo 10 cobranças por rodada (foram ${cobrancas.length})`);
const o0 = cobrancas.find(c => c.body?.oportunidade_id === 'o0');
ok(!!o0 && /há (9\d|1\d\d) dias/.test(o0.body?.texto || ''),
   `dias-parado medido pela última atividade REAL (~100d), não pela cobrança do cron (texto: ${o0?.body?.texto?.slice(0,40)})`);

// ── rascunhos-matinais (a) ───────────────────────────────────────────────────
console.log('\nrascunhos-matinais');
DATA = {
  config: { rascunhos_matinais_max: '25', pausar_primeiros_contatos: 'false' },
  crm_fila: [ { id: 'r1', assunto: 'A', corpo: 'B', etapa_cadencia: 2, rascunho_tentativas: 0, crm_decisores: { email: 'a@x.com', nome: 'A' } } ]
};
GRAPH = { ok: true, status: 200, body: { skipped: true } };
r = await run('rascunhos-matinais');
ok(r.payload?.criados === 0 && r.payload?.pulados === 1, `'skipped' conta como pulado, não como criado (criados ${r.payload?.criados}, pulados ${r.payload?.pulados})`);

DATA.crm_fila = [ { id: 'r2', assunto: 'A', corpo: 'B', etapa_cadencia: 2, rascunho_tentativas: 1, crm_decisores: { email: 'b@x.com', nome: 'B' } } ];
GRAPH = { ok: false, status: 502, body: { error: 'Chrome indisponível' } };
r = await run('rascunhos-matinais');
const tent = ESCRITAS.find(e => e.tabela === 'crm_fila' && e.method === 'PATCH' && e.body?.rascunho_tentativas !== undefined);
ok(tent?.body?.rascunho_tentativas === 2, `falha incrementa rascunho_tentativas (1→2) para sair da frente após 3 (${tent?.body?.rascunho_tentativas})`);

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
