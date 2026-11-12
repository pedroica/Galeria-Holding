// tests/cron-jobs.test.mjs — api/cron.js com fetch e PostgREST mockados.
// Cobre os consertos de 12/11/2026: authCheck fechado, higiene da fila,
// enriquecimento com descoberta de domínio, custo real de crédito Lusha,
// no-op registrado como aviso e dedupe de notícias.
// Rodar: npm run test:cron
// Harness do api/cron.js: roda o handler real com fetch mockado.
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.LUSHA_API_KEY = 'lusha-fake';
process.env.CRON_SECRET = '';           // cenário: secret NÃO configurado
process.env.VERCEL_URL = 'app.fake';

let CHAMADAS = [];
let TABELAS = {};
const LUSHA = { searchChamadas: [], revealChamadas: [], dominioChamadas: [] };

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  CHAMADAS.push({ url: u, method: opts.method || 'GET', body });
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });

  if (u.includes('api.lusha.com/v3/account/usage')) return json({ credits: { remaining: 2520 } });
  if (u.includes('api.lusha.com/v3/contacts/prospecting')) {
    LUSHA.searchChamadas.push(body);
    return json({ contacts: [{ id: 'v1.abc', firstName: 'Ana', lastName: 'Souza', title: 'CMO' }] });
  }
  if (u.includes('api.lusha.com/v3/contacts/enrich')) {
    LUSHA.revealChamadas.push(body);
    return json({ results: [{ firstName: 'Ana', lastName: 'Souza', email: 'ana@alvo.com.br',
      phoneNumber: body.reveal.includes('phones') ? '+5511999999999' : null }] });
  }
  if (u.includes('news.google.com/rss')) return { ok: true, status: 200, text: async () => `<rss><channel>
    <item><title><![CDATA[Notícia já existente]]></title><link>https://ja.com/1</link><source>G1</source><pubDate>Tue, 11 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title><![CDATA[Notícia nova]]></title><link>https://novo.com/2</link><source>Valor</source><pubDate>Tue, 11 Nov 2026 11:00:00 GMT</pubDate></item>
    <item><title><![CDATA[Notícia nova 2]]></title><link>https://novo.com/3</link><source>Exame</source><pubDate>Tue, 11 Nov 2026 12:00:00 GMT</pubDate></item>
  </channel></rss>`, json: async () => ({}) };
  if (u.includes('provider=lusha-domain')) { LUSHA.dominioChamadas.push(body); return json({ domain: 'alvo.com.br', source: 'prospecting' }); }

  // PostgREST mockado
  const m = u.match(/\/rest\/v1\/([a-z_]+)\??(.*)$/);
  if (m) {
    const [, tabela, query] = m;
    if ((opts.method || 'GET') === 'GET') return json(TABELAS[tabela] ? TABELAS[tabela](query) : []);
    (TABELAS.__escritas ||= []).push({ tabela, query, method: opts.method, body });
    return json({}, true, 204);
  }
  return json({}, false, 404);
};

const { default: handler } = await import(new URL('../api/cron.js', import.meta.url).href);

function res() {
  const r = { code: null, payload: null };
  r.status = c => { r.code = c; return r; };
  r.json = p => { r.payload = p; return r; };
  return r;
}
const run = (job, auth) => { const r = res(); return handler({ query: { job }, headers: auth ? { authorization: auth } : {} }, r).then(() => r); };
const esc = () => (TABELAS.__escritas || []);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

// ── T1 · authCheck falha fechado sem CRON_SECRET ───────────────────────────
console.log('\nT1 — authCheck com CRON_SECRET vazio');
TABELAS = {}; CHAMADAS = [];
let r = await run('higiene-fila');
ok(r.code === 401, `requisição sem auth é rejeitada (recebeu ${r.code})`);
const logAuth = CHAMADAS.find(c => c.url.includes('crm_logs') && c.method === 'POST');
ok(!!logAuth && /CRON_SECRET ausente/.test(logAuth.body.contexto?.hint || ''), 'grava o motivo real em crm_logs');
r = await run('higiene-fila', 'Bearer service-key-fake');
ok(r.code !== 401, `service key continua passando (recebeu ${r.code})`);

// ── T2 · higiene arquiva rascunho vencido ──────────────────────────────────
console.log('\nT2 — higiene da fila');
TABELAS = { __escritas: [],
  crm_configuracoes: () => [{ valor: '7' }],
  crm_fila: q => q.includes('status=eq.rascunho') && q.includes('gerado_em=lt.')
    ? [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }] : [] };
CHAMADAS = [];
r = await run('higiene-fila', 'Bearer service-key-fake');
const patch = esc().find(e => e.tabela === 'crm_fila' && e.method === 'PATCH');
ok(r.payload?.arquivados === 3, `arquivou os 3 vencidos (recebeu ${r.payload?.arquivados})`);
ok(!!patch && patch.body.status === 'pulado', "muda status para 'pulado', não apaga");
ok(/arquivado automaticamente/.test(patch?.body?.motivo_pulo || ''), 'grava motivo rastreável para reverter');
ok(patch?.query.includes('id=in.(f1,f2,f3)'), 'faz UM patch em lote, não 3 requisições');

// ── T3 · higiene roda ANTES do pré-check de fila cheia ─────────────────────
console.log('\nT3 — gerar-fila destrava a fila antes do pré-check');
let rascunhosVivos = 31;
TABELAS = { __escritas: [],
  crm_configuracoes: () => [{ valor: '7' }],
  crm_fila: q => {
    if (q.includes('gerado_em=lt.')) return Array.from({ length: 28 }, (_, i) => ({ id: 'v' + i }));
    if (q.includes('status=eq.rascunho')) return Array.from({ length: rascunhosVivos -= 28 }, (_, i) => ({ id: 'r' + i }));
    return [];
  },
  crm_templates: () => [] };
CHAMADAS = [];
r = await run('gerar-fila-diario', 'Bearer service-key-fake');
ok(r.payload?.motivo !== 'fila_cheia', `não trava mais em fila_cheia (motivo: ${r.payload?.motivo})`);
ok(r.payload?.higiene?.arquivados === 28, `higiene rodou primeiro e limpou 28 (${r.payload?.higiene?.arquivados})`);

// ── T4 · enriquecimento descobre domínio antes de desistir ─────────────────
console.log('\nT4 — enriquecimento resolve domínio ausente');
TABELAS = { __escritas: [],
  crm_configuracoes: () => [{ valor: '10' }],
  crm_kanban: () => [],
  crm_decisores: () => [{ id: 'd1', nome: 'Ana Souza', empresa_id: 'e1' }],
  crm_empresas: () => [{ id: 'e1', nome: 'Alvo SA', dominio: null, website: null, site: null }],
  crm_empresa_agencia_estrelas: () => [{ empresa_id: 'e1', estrelas_manual: 5 }] };
CHAMADAS = []; LUSHA.searchChamadas = []; LUSHA.revealChamadas = []; LUSHA.dominioChamadas = [];
r = await run('enriquecimento-diario', 'Bearer service-key-fake');
ok(LUSHA.dominioChamadas.length === 1, 'chama lusha-domain quando as 3 colunas de web estão vazias');
ok(LUSHA.searchChamadas[0]?.filters?.companies?.include?.domains?.[0] === 'alvo.com.br',
   'busca por domains:[...] (array), não pelo filtro name que a API rejeita');
ok(r.payload?.dominios_descobertos === 1, 'contabiliza domínio descoberto');
ok(r.payload?.revelados === 1, `revelou o decisor (${r.payload?.revelados})`);
ok(r.payload?.empresas_tentadas === 1, `empresas_tentadas agora conta tentativa, não sucesso (${r.payload?.empresas_tentadas})`);
ok(r.payload?.creditos_usados === 6, `custo real 1 email + 5 telefone = 6 (recebeu ${r.payload?.creditos_usados})`);
ok(r.payload?.creditos_restantes === 2520, 'lê o saldo da Lusha em vez de null');
const decPatch = esc().find(e => e.tabela === 'crm_decisores' && e.method === 'PATCH');
ok(decPatch?.body?.email === 'ana@alvo.com.br', 'grava o e-mail no decisor');

// ── T5 · telefone só nas empresas 4-5 estrelas ─────────────────────────────
console.log('\nT5 — telefone (5 créditos) só onde vale');
TABELAS.crm_empresa_agencia_estrelas = () => [{ empresa_id: 'e1', estrelas_manual: 2 }];
TABELAS.__escritas = []; LUSHA.revealChamadas = [];
r = await run('enriquecimento-diario', 'Bearer service-key-fake');
ok(!LUSHA.revealChamadas[0]?.reveal.includes('phones'), 'empresa 2 estrelas: não revela telefone');
ok(r.payload?.creditos_usados === 1, `gasta só 1 crédito (recebeu ${r.payload?.creditos_usados})`);

// ── T6 · no-op não registra sucesso ────────────────────────────────────────
console.log('\nT6 — no-op deixa de parecer sucesso');
TABELAS = { __escritas: [], crm_configuracoes: () => [{ valor: '10' }], crm_kanban: () => [], crm_decisores: () => [] };
CHAMADAS = [];
r = await run('enriquecimento-diario', 'Bearer service-key-fake');
const logFim = CHAMADAS.filter(c => c.url.includes('crm_logs') && c.body?.mensagem?.startsWith('fim')).pop();
ok(logFim?.nivel !== 'info', `nível do log não é 'info' (é '${logFim?.body?.nivel}')`);
ok(logFim?.body?.nivel === 'aviso', 'registra nivel=aviso quando não fez trabalho');

// ── T7 · notícias: guarda semanal e dedupe por URL ─────────────────────────
console.log('\nT7 — notícias');
TABELAS = { __escritas: [], crm_logs: () => [{ id: 'l1' }] };
r = await run('noticias-semanal', 'Bearer service-key-fake');
ok(r.payload?.motivo === 'ja_rodou_esta_semana', 'não roda 2x na mesma semana');

TABELAS = { __escritas: [],
  crm_logs: () => [],
  crm_empresa_agencia_estrelas: () => [{ empresa_id: 'e1', estrelas_manual: 5 }],
  crm_fila: () => [],
  crm_noticias: q => q.includes('empresa_id=in.') ? [{ empresa_id: 'e1', url: 'https://ja.com/1' }] : [],
  crm_empresas: () => [{ id: 'e1', nome: 'Alvo SA' }] };
globalThis.__noticiasFake = true;
r = await run('noticias-semanal', 'Bearer service-key-fake');
const ins = esc().filter(e => e.tabela === 'crm_noticias' && e.method === 'POST');
ok(ins.every(e => e.body.criado_em), 'todo insert leva criado_em explícito (a rotação depende dele)');
ok(r.payload?.duplicadas_evitadas === 1, `pulou a URL que a empresa já tinha (${r.payload?.duplicadas_evitadas})`);
ok(r.payload?.inseridas === 2, `inseriu só as 2 novas (${r.payload?.inseridas})`);
ok(!ins.some(e => e.body.url === 'https://ja.com/1'), 'não reinsere a URL duplicada');

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
