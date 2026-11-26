// Teste do job blitz-redacao com banco e IA simulados.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

const BZ = { id: 'bz1', lista_id: 'l1', nome: 'Blitz Educação', tema: 'Matrículas 2027', agencia_id: null, canais: ['email', 'whatsapp'], status: 'escrevendo', total: 4, escritos: 0, custo_usd: 0, criado_em: new Date().toISOString(), lease_ate: null };
const emp = (id, nome) => ({ id, nome, setor_canonico: 'Educação', dominio: id + '.com.br' });
const ITENS = [
  { decisor_id: 'd1', crm_decisores: { id: 'd1', nome: 'Ana Souza', cargo: 'CMO', email: 'ana@a.com', wa: '5511999990001', status: 'ativo', empresa_id: 'eA', crm_empresas: emp('eA', 'Colégio A') } },
  { decisor_id: 'd2', crm_decisores: { id: 'd2', nome: 'Beto', cargo: 'CEO', email: 'beto@b.com', wa: null, status: 'ativo', empresa_id: 'eB', crm_empresas: emp('eB', 'Faculdade B') } },
  { decisor_id: 'd3', crm_decisores: { id: 'd3', nome: 'Caio', cargo: 'CEO', email: 'c@c.com', wa: '5511999990003', status: 'ativo', opt_out: true, empresa_id: 'eC', crm_empresas: emp('eC', 'Escola C') } },
  { decisor_id: 'd4', crm_decisores: { id: 'd4', nome: 'Dani', cargo: 'CMO', email: 'd@bloq.com', wa: null, status: 'ativo', empresa_id: 'eD', crm_empresas: emp('eD', 'Bloqueada SA') } }
];
const FILA = []; let llm = 0;
globalThis.__SDR_LLM_MOCK = ({ user }) => {
  llm++;
  const nome = (user.match(/primeiro nome: (\w+)/) || [])[1] || 'Olá';
  const vi = /Faculdade B/.test(user) && llm < 3;   // primeira resposta para a Faculdade B alega fato: deve refazer
  return { obj: { assunto: 'Matrículas 2027', email: nome + ', ' + (vi ? 'vi que vocês anunciaram nova unidade. ' : '') + 'palavra '.repeat(70), whatsapp: 'Oi ' + nome + ', aqui é o Pedro Ica, da Galeria Holding. Topa 20 minutos?', gancho: 'setor' }, custo: 0.02, modelo: 'claude-opus-5-5' };
};
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_blitz') && mt === 'GET') return json(BZ.status === 'escrevendo' ? [BZ] : []);
  if (u.includes('crm_blitz') && mt === 'PATCH') {
    if (u.includes('lease_ate.lt') && BZ.lease_ate && new Date(BZ.lease_ate) > new Date()) return json([]);
    Object.assign(BZ, body); return json([BZ]);
  }
  if (u.includes('crm_lista_itens')) return json(ITENS);
  if (u.includes('crm_fila') && mt === 'GET') return json(FILA.map(f => ({ decisor_id: f.decisor_id, canal: f.canal })));
  if (u.includes('crm_fila') && mt === 'POST') { if (FILA.some(f => f.blitz_id === body.blitz_id && f.decisor_id === body.decisor_id && f.canal === body.canal)) return json({ code: '23505' }, 409); FILA.push(body); return json([], 201); }
  if (u.includes('crm_blocklist')) return json([{ nome_canonico: 'Bloqueada SA', aliases: [], dominios: ['bloq.com'], ativo: true }]);
  if (u.includes('crm_cases')) return json([]);
  if (u.includes('crm_agencias')) return json([]);
  if (u.includes('crm_memoria_comercial')) return json([]);
  return json([], mt === 'POST' ? 201 : 200);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});

let r = await chamar('blitz-redacao');
ok(r.status === 200 && r.body.escritos === 3, 'escreve 3 mensagens: Ana e-mail + WhatsApp, Beto só e-mail (' + JSON.stringify(r.body) + ')');
ok(!FILA.some(f => f.decisor_id === 'd3') && !FILA.some(f => f.decisor_id === 'd4'), 'opt-out e empresa da blocklist ficam fora');
ok(FILA.every(f => f.status === 'rascunho' && f.origem === 'blitz' && f.blitz_id === 'bz1'), 'tudo entra como rascunho da blitz (nada aprovado nem enviado)');
const beto = FILA.find(f => f.decisor_id === 'd2');
ok(beto && !/vi que/.test(beto.corpo), 'mensagem que alegava fato foi refeita antes de entrar na fila');
ok(FILA.find(f => f.decisor_id === 'd1' && f.canal === 'whatsapp').corpo.startsWith('Oi Ana'), 'WhatsApp personalizado pelo primeiro nome');
ok(BZ.status === 'pronta' || BZ.status === 'escrevendo', 'blitz atualizada (' + BZ.status + ')');
const antes = FILA.length;
BZ.status = 'escrevendo'; BZ.lease_ate = null;
r = await chamar('blitz-redacao');
ok(FILA.length === antes && BZ.status === 'pronta', 'rodar de novo não duplica nada e fecha a blitz');
BZ.status = 'escrevendo'; BZ.lease_ate = new Date(Date.now() + 30000).toISOString();
r = await chamar('blitz-redacao');
ok(r.body.ocupado === true, 'outra execução no meio: respeita a trava');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
