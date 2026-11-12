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
  if (u.includes('provider=graph-draft')) {
    (globalThis.__graph ||= []).push({ provider: 'draft', body, auth: opts.headers?.Authorization });
    if (globalThis.__draftFalha) return json({ error: 'Chrome indisponível' }, false, 502);
    return json({ outlook_message_id: 'AAMk' + Math.random().toString(36).slice(2, 8), rascunho_criado_em: new Date().toISOString() });
  }
  if (u.includes('provider=graph-send')) { (globalThis.__graph ||= []).push({ provider: 'send' }); return json({ sent: true }); }
  if (u.includes('provider=lusha-domain')) { LUSHA.dominioChamadas.push(body); return json({ domain: 'alvo.com.br', source: 'prospecting' }); }

  // PostgREST mockado
  const m = u.match(/\/rest\/v1\/([a-z_]+)\??(.*)$/);
  if (m) {
    const [, tabela, query] = m;
    if ((opts.method || 'GET') === 'GET') return json(TABELAS[tabela] ? TABELAS[tabela](query) : []);
    (TABELAS.__escritas ||= []).push({ tabela, query, method: opts.method, body });
    if (globalThis.__falhaEscrita && tabela === 'crm_oportunidade_eventos') return json({}, false, 403);
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
TABELAS = { __escritas: [], crm_logs: () => [{ contexto: { inseridas: 12 } }] };
r = await run('noticias-semanal', 'Bearer service-key-fake');
ok(r.payload?.motivo === 'ja_rodou_esta_semana', 'não roda 2x na mesma semana depois de uma rodada produtiva');

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

// ── T8 · agente matinal de rascunhos ───────────────────────────────────────
console.log('\nT8 — rascunhos matinais');
const filaAprovada = [
  { id: 'a1', assunto: 'Oi', corpo: 'texto', etapa_cadencia: 1, crm_decisores: { email: 'x@a.com', nome: 'X' } },
  { id: 'a2', assunto: 'Fup', corpo: 'texto', etapa_cadencia: 2, crm_decisores: { email: 'y@b.com', nome: 'Y' } },
  { id: 'a3', assunto: 'Sem email', corpo: 'texto', etapa_cadencia: 1, crm_decisores: { email: null } }
];
const montaTabelas = pausa => ({ __escritas: [],
  crm_configuracoes: q => q.includes('rascunhos_matinais_max') ? [{ valor: '25' }]
    : q.includes('pausar_primeiros_contatos') ? [{ valor: pausa }] : [],
  crm_fila: () => filaAprovada });

globalThis.__graph = []; globalThis.__draftFalha = false;
TABELAS = montaTabelas('false');
r = await run('rascunhos-matinais', 'Bearer service-key-fake');
ok(r.payload?.criados === 2, `cria rascunho para os 2 itens com e-mail (${r.payload?.criados})`);
ok(!globalThis.__graph.some(g => g.provider === 'send'), 'NUNCA chama graph-send — só prepara');
ok(globalThis.__graph.every(g => g.auth === 'Bearer service-key-fake'), 'autentica com a credencial do cron');
ok(globalThis.__graph[0]?.body?.decisor?.email === 'x@a.com', 'manda o decisor no payload que o graph-draft espera');

console.log('\nT9 — respeita pausar_primeiros_contatos');
globalThis.__graph = [];
TABELAS = montaTabelas('true');
r = await run('rascunhos-matinais', 'Bearer service-key-fake');
ok(r.payload?.criados === 1, `com a pausa ligada só o follow-up passa (${r.payload?.criados})`);
ok(globalThis.__graph[0]?.body?.fila_id === 'a2', 'o que passou foi a etapa 2, não o primeiro contato');
ok(r.payload?.pausado === true, 'reporta que estava pausado');

console.log('\nT10 — falha do Outlook fica registrada');
globalThis.__graph = []; globalThis.__draftFalha = true;
TABELAS = montaTabelas('false');
r = await run('rascunhos-matinais', 'Bearer service-key-fake');
ok(r.payload?.criados === 0, 'não conta rascunho que falhou');
const errPatch = esc().find(e => e.tabela === 'crm_fila' && e.method === 'PATCH' && e.body?.rascunho_erro);
ok(!!errPatch, 'grava rascunho_erro na linha da fila');
ok(/Chrome indispon/.test(errPatch?.body?.rascunho_erro || ''), 'guarda o erro real, não um genérico');
const logM = CHAMADAS.filter(c => c.url.includes('crm_logs') && c.body?.mensagem?.startsWith('fim')).pop();
ok(logM?.body?.nivel === 'aviso', '0 rascunhos criados registra aviso, não info');
globalThis.__draftFalha = false;

// ── T11 · oportunidades paradas ────────────────────────────────────────────
console.log('\nT11 — oportunidades paradas');
const dias = n => new Date(Date.now() - n*86400000).toISOString();
const opps = [
  { id: 'o1', titulo: 'Deal quente',  estagio: 'Negociação',       valor_estimado: 500000, aberta_em: dias(90), proximo_passo: 'Enviar proposta', proximo_passo_em: dias(20).slice(0,10) },
  { id: 'o2', titulo: 'Topo',         estagio: 'Contato direto',   valor_estimado: 1000,   aberta_em: dias(90), proximo_passo: null },
  { id: 'o3', titulo: 'Recente',      estagio: 'Negociação',       valor_estimado: 9000,   aberta_em: dias(90) },
  { id: 'o4', titulo: 'Ja cobrada',   estagio: 'Concorrências',    valor_estimado: 9000,   aberta_em: dias(90) },
  { id: 'o5', titulo: 'Cliente',      estagio: 'Cliente ativo',    valor_estimado: 999,    aberta_em: dias(90) },
  { id: 'o6', titulo: 'Perdida',      estagio: 'Perdido',          valor_estimado: 999,    aberta_em: dias(90) },
  { id: 'o7', titulo: 'Lista',        estagio: 'Wishlist',         valor_estimado: 999,    aberta_em: dias(90) }
];
TABELAS = { __escritas: [],
  crm_configuracoes: () => [{ valor: '14' }],
  crm_oportunidades: () => opps,
  crm_oportunidade_eventos: () => [
    { oportunidade_id: 'o3', tipo: 'estagio', criado_em: dias(2) },
    { oportunidade_id: 'o4', tipo: 'pedido_atualizacao', criado_em: dias(3) }
  ] };
CHAMADAS = [];
r = await run('oportunidades-paradas', 'Bearer service-key-fake');
const marc = esc().filter(e => e.tabela === 'crm_oportunidade_eventos' && e.method === 'POST');
const ids = marc.map(e => e.body.oportunidade_id);
ok(!ids.includes('o3'), 'ignora quem teve evento há 2 dias');
ok(!ids.includes('o4'), 'não cobra de novo quem já foi cobrado dentro da janela');
ok(!ids.some(i => ['o5','o6','o7'].includes(i)), 'ignora Cliente ativo, Perdido e Wishlist');
ok(ids.includes('o1') && ids.includes('o2'), 'marca as realmente paradas');
ok(ids[0] === 'o1', 'fundo do funil primeiro (Negociação antes de Contato direto)');
ok(marc[0]?.body?.tipo === 'pedido_atualizacao', 'usa o tipo de evento que já existe no sistema');
ok(/Parada há \d+ dias em "Negociação"/.test(marc[0]?.body?.texto || ''), 'texto diz há quanto tempo e em que estágio');
ok(/Próximo passo venceu/.test(marc[0]?.body?.texto || ''), 'aponta o próximo passo vencido');
ok(/Sem próximo passo definido/.test(marc.find(e => e.body.oportunidade_id === 'o2')?.body?.texto || ''), 'sinaliza quem não tem próximo passo');
ok(!esc().some(e => e.tabela === 'crm_oportunidades' && e.method === 'PATCH'), 'NÃO reescreve proximo_passo — o texto é do Pedro');
ok(r.payload?.fundo_funil === 1, `conta quantas estão no fundo do funil (${r.payload?.fundo_funil})`);

// ── T12 · regressões achadas na revisão do diff ────────────────────────────
console.log('\nT12 — higiene fatia o PATCH em lotes (URL de 11KB estourava o gateway)');
TABELAS = { __escritas: [],
  crm_configuracoes: () => [{ valor: '7' }],
  crm_fila: q => q.includes('gerado_em=lt.')
    ? Array.from({ length: 200 }, (_, i) => ({ id: '550e8400-e29b-41d4-a716-' + String(i).padStart(12, '0') }))
    : [] };
r = await run('higiene-fila', 'Bearer service-key-fake');
const patches = esc().filter(e => e.tabela === 'crm_fila' && e.method === 'PATCH');
ok(patches.length === 3, `200 ids viram 3 lotes de no máximo 80 (${patches.length})`);
ok(r.payload?.arquivados === 200, `soma todos os lotes (${r.payload?.arquivados})`);
const maiorUrl = Math.max(...patches.map(e => e.query.length));
ok(maiorUrl < 8192, `maior URL tem ${maiorUrl} chars, abaixo do limite de 8192 do gateway`);
ok(patches.every(e => (e.query.match(/,/g) || []).length < 80), 'nenhum lote passa de 80 ids');

console.log('\nT13 — rodada estéril de notícias não tranca a semana');
TABELAS = { __escritas: [],
  crm_logs: () => [{ contexto: { inseridas: 0 } }],
  crm_empresa_agencia_estrelas: () => [{ empresa_id: 'e1', estrelas_manual: 5 }],
  crm_fila: () => [],
  crm_noticias: () => [],
  crm_empresas: () => [{ id: 'e1', nome: 'Alvo SA' }] };
r = await run('noticias-semanal', 'Bearer service-key-fake');
ok(r.payload?.motivo !== 'ja_rodou_esta_semana', 'rodada anterior com 0 inseridas não bloqueia nova tentativa');
TABELAS.crm_logs = () => [{ contexto: { inseridas: 0 } }, { contexto: { inseridas: 42 } }];
r = await run('noticias-semanal', 'Bearer service-key-fake');
ok(r.payload?.motivo === 'ja_rodou_esta_semana', 'rodada que inseriu de verdade continua bloqueando');

console.log('\nT14 — oportunidades: nível reflete o que foi gravado');
globalThis.__falhaEscrita = true;
TABELAS = { __escritas: [],
  crm_configuracoes: () => [{ valor: '14' }],
  crm_oportunidades: () => [{ id: 'o1', titulo: 'X', estagio: 'Negociação', valor_estimado: 1, aberta_em: dias(90) }],
  crm_oportunidade_eventos: () => [] };
CHAMADAS = [];
r = await run('oportunidades-paradas', 'Bearer service-key-fake');
const logOp = CHAMADAS.filter(c => c.url.includes('crm_logs') && c.body?.mensagem === 'fim').pop();
ok(r.payload?.paradas === 1 && r.payload?.marcadas === 0, 'detectou 1 parada mas não conseguiu gravar');
ok(logOp?.body?.nivel === 'aviso', `detectar sem gravar registra aviso, não info (${logOp?.body?.nivel})`);
globalThis.__falhaEscrita = false;

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
