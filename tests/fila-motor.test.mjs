// tests/fila-motor.test.mjs — motor de geração em api/fila.js (BLOCO 3 a/e).
// (a) pausar_primeiros_contatos=true → só follow-up (etapa >= 2) entra na fila.
// (e) MX: sem registro de e-mail no domínio → canal e-mail cai e email_valido=false.
// Rodar: node tests/fila-motor.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
process.env.CRON_SECRET = '';

// MX simulado: 'semmx.com' não existe (ENOTFOUND), o resto tem MX.
globalThis.__mxResolver = async (dom) => {
  if (dom === 'semmx.com') { const e = new Error('nx'); e.code = 'ENOTFOUND'; throw e; }
  return [{ exchange: 'mx.' + dom, priority: 10 }];
};

let PAUSA = 'false';
let ESCRITAS = [];
const DECISORES = () => ([
  { id: 'd1', nome: 'Ana Um',  cargo: 'CMO', empresa_id: 'e1', etapa_cadencia: 'etapa1',
    email: 'ana@semmx.com', wa: '5511988887777', crm_empresas: { id: 'e1', nome: 'Alfa' } },
  { id: 'd2', nome: 'Bob Dois', cargo: 'CEO', empresa_id: 'e2', etapa_cadencia: 'etapa2',
    email: 'bob@temmx.com', crm_empresas: { id: 'e2', nome: 'Beta' } },
  { id: 'd3', nome: 'Cao Tres', cargo: 'CMO', empresa_id: 'e3', etapa_cadencia: 'etapa1',
    email: 'cao@temmx.com', crm_empresas: { id: 'e3', nome: 'Gama' } },
]);

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });
  const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
  if (!m) return json({}, false, 404);
  const tabela = m[1], query = m[2] || '';

  if (method === 'GET') {
    if (tabela === 'crm_agencias') return json([{ id: 'ag1', nome: 'Agência X', slug: 'agx' }]);
    if (tabela === 'crm_configuracoes' && query.includes('pausar_primeiros_contatos')) return json([{ valor: PAUSA }]);
    if (tabela === 'crm_configuracoes') return json([]);        // limitesConfig → defaults
    if (tabela === 'crm_blocklist') return json([]);
    if (tabela === 'crm_empresa_agencia_estrelas') return json([]);
    if (tabela === 'crm_decisores') return json(DECISORES());
    if (tabela === 'crm_fila') return json([]);                 // contadosHoje → 0
    if (tabela === 'crm_templates') return json([]);
    if (tabela === 'crm_cases') return json([]);
    return json([]);
  }
  // escritas
  ESCRITAS.push({ tabela, method, query, body });
  if (tabela === 'crm_fila' && method === 'POST') return json([{ id: 'f_' + (body.canal || '?') + '_' + (body.decisor_id || '') }]);
  return json([{}]);
};

const { default: handler } = await import(new URL('../api/fila.js', import.meta.url).href);
function res() {
  const r = { code: 200, payload: null };
  r.status = c => { r.code = c; return r; };
  r.json = p => { r.payload = p; return r; };
  r.send = p => { r.payload = p; return r; };
  r.setHeader = () => {};
  return r;
}
const run = () => {
  ESCRITAS = [];
  const r = res();
  return handler({ method: 'POST', query: {}, headers: { authorization: 'Bearer service-key-fake' },
    body: { canais: ['email', 'whatsapp'], limite: 30, sem_ia: true } }, r).then(() => r);
};

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const inserts = () => ESCRITAS.filter(e => e.tabela === 'crm_fila' && e.method === 'POST');
const bloq = (r, motivoInc) => (r.payload?.bloqueados || []).filter(b => (b.motivo || '').includes(motivoInc));

console.log('Motor da fila — api/fila.js');

// ── RUN A: pausar_primeiros_contatos = true ──────────────────────────────────
PAUSA = 'true';
let r = await run();
const insA = inserts();
ok(insA.length === 1, 'com pausa: só 1 item enfileirado (etapa 2) — gerou ' + insA.length);
ok(insA.every(i => i.body.decisor_id === 'd2'), 'com pausa: o item é o follow-up d2 (etapa2)');
ok(bloq(r, 'primeiros_contatos_pausados').length === 2, 'com pausa: d1 e d3 (etapa1) barrados por pausa');

// ── RUN B: pausa desligada → MX entra em cena ────────────────────────────────
PAUSA = 'false';
r = await run();
const insB = inserts();
ok(insB.length === 3, 'sem pausa: 3 itens enfileirados — gerou ' + insB.length);
const d1ins = insB.find(i => i.body.decisor_id === 'd1');
ok(d1ins && d1ins.body.canal === 'whatsapp', 'd1 (e-mail sem MX) cai para whatsapp, não e-mail');
ok(insB.filter(i => i.body.decisor_id === 'd2' || i.body.decisor_id === 'd3').every(i => i.body.canal === 'email'),
  'd2 e d3 (domínio com MX) entram por e-mail');
const mxPatch = ESCRITAS.find(e => e.tabela === 'crm_decisores' && e.method === 'PATCH' &&
  e.query.includes('d1') && e.body && e.body.email_valido === false);
ok(!!mxPatch, 'marca email_valido=false no decisor sem MX (d1)');
ok(bloq(r, 'sem_mx:semmx.com').length === 1, 'registra sem_mx:semmx.com nos bloqueados');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
