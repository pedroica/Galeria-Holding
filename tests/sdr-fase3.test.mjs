// tests/sdr-fase3.test.mjs — Fase 3: estrategista, redação de 1 versão com
// refação, QC com modelo configurável e modo rascunho (nada é enviado).
// Supabase e modelo simulados. Rodar: node tests/sdr-fase3.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
import { validarTese, construirPromptEstrategia, resumoEcossistema, OFERTA_BLITZ_PADRAO } from '../lib/sdr-estrategista.js';
import { construirPromptRedacao } from '../lib/sdr-redacao.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

const SINAIS = [{ tipo: 'expansao', fato: 'Acme abre 40 lojas no Nordeste', fonte: 'Exame', url: 'https://x/1', trecho: 'Acme abre 40 lojas', data: '2026-11-10' }];
const KN = {
  holding: { nome: 'Galeria Holding', descricao: 'O maior grupo independente' },
  agencias: [{ id: 'ag-vit', slug: 'vitrine', especialidade: 'OOH e varejo' }, { id: 'ag-hol', slug: 'holding', especialidade: 'Planejamento' }],
  cases_destaque: [{ titulo: 'Rede X no ponto de venda', marca: 'Rede X', agencia_slug: 'vitrine', resultado: '+12% de fluxo', tags: ['varejo'] }]
};
const tese = (extra) => Object.assign({
  cenario: 'Acme está expandindo rápido no Nordeste.', fato_url: 'https://x/1', dor_do_cargo: 'Marca nova em praças novas.',
  alavanca: 'fala_comercial', oportunidade: 'Treinar a fala das lojas novas.', agencias: ['vitrine'],
  oferta: 'Blitz de planejamento', prova: 'Rede X no ponto de venda', nota_encaixe: 9, seguir: true, motivo: 'fato forte'
}, extra || {});

console.log('validarTese');
let v = validarTese(tese(), { sinais: SINAIS, knowledge: KN, clientes: [], notaMin: 8 });
ok(v.seguir && v.tese.prova === 'Rede X no ponto de venda', 'tese boa segue, com prova da base');
v = validarTese(tese({ prova: 'Case Coca-Cola com +300% de vendas' }), { sinais: SINAIS, knowledge: KN, clientes: [], notaMin: 8 });
ok(v.seguir && v.tese.prova === '' && /Coca/.test(v.tese.prova_descartada), 'prova inventada é apagada (nunca chega à mensagem)');
v = validarTese(tese({ prova: 'cliente Beta Varejo' }), { sinais: SINAIS, knowledge: KN, clientes: [{ nome: 'Beta Varejo' }], notaMin: 8 });
ok(v.tese.prova === 'cliente Beta Varejo', 'cliente ativo do grupo vale como prova');
v = validarTese(tese({ nota_encaixe: 7 }), { sinais: SINAIS, knowledge: KN, notaMin: 8 });
ok(!v.seguir && /encaixe 7 < 8/.test(v.motivo), 'encaixe abaixo do mínimo não segue');
v = validarTese(tese({ seguir: false, motivo: 'notícia de demissão' }), { sinais: SINAIS, knowledge: KN, notaMin: 8 });
ok(!v.seguir && /não abordar/.test(v.motivo), 'estrategista pode decidir não abordar');
v = validarTese(tese({ fato_url: 'https://inventada' }), { sinais: SINAIS, knowledge: KN, notaMin: 8 });
ok(v.seguir && v.tese.fato_url === 'https://x/1', 'URL fora do dossiê é trocada pelo fato real');
v = validarTese(tese(), { sinais: [], knowledge: KN, notaMin: 8 });
ok(!v.seguir, 'sem fato do dossiê, sem tese');

console.log('\nPrompts');
const eco = resumoEcossistema(KN, { vitrine: [{ nome: 'Beta Varejo', setor: 'varejo' }] });
ok(/vitrine: OOH e varejo\. Clientes ativos: Beta Varejo/.test(eco) && /Rede X/.test(eco), 'ecossistema traz especialidade, clientes e cases');
const pe = construirPromptEstrategia({ ecossistema: eco, oferta: OFERTA_BLITZ_PADRAO, empresa: { nome: 'Acme', setor: 'varejo' }, decisor: { nome: 'Ana', cargo: 'CMO' }, sinais: SINAIS });
ok(/não é só comprar mídia/.test(pe.system) && /NUNCA invente/.test(pe.system) && /Acme abre 40 lojas/.test(pe.user), 'estrategista recebe a blitz, a regra de não inventar e o fato');
const pr = construirPromptRedacao({ dossie: { sinais: SINAIS }, nome: 'Ana', cargo: 'CMO', empresa: { nome: 'Acme' }, agencia: { nome: 'Vitrine', slug: 'vitrine' }, canal: 'whatsapp', angulo: 'tese', sinal: SINAIS[0], tese: tese(), feedback: 'naturalidade 7' });
ok(/TESE DO ESTRATEGISTA/.test(pr.user) && /Formato WhatsApp/.test(pr.user) && /reprovada pelo revisor por: naturalidade 7/.test(pr.user), 'redação segue a tese, formato do canal e o motivo da refação');

// ── jobs ponta a ponta ────────────────────────────────────────────────────────
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
let cfgRows = [], db = {}, escritas = [];
const estadoBase = (id, extra) => Object.assign({
  id, decisor_id: 'd' + id, empresa_id: 'e' + id, agencia_id: 'ag-hol', agencia_motivo: 'padrão', dia_cadencia: 0, dossie_id: 'k' + id, canal: null, sombra: false, refacoes: 0,
  crm_decisores: { id: 'd' + id, nome: 'Ana', cargo: 'CMO', email: 'ana@acme.com', wa: '5511999990000' },
  crm_empresas: { id: 'e' + id, nome: 'Acme', setor: 'varejo' }, crm_agencias: { id: 'ag-hol', nome: 'Galeria Holding', slug: 'holding' },
  crm_dossies: { sinais: SINAIS }
}, extra || {});
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const m = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (m !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, m, body });
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_configuracoes')) return json(cfgRows);
  if (u.includes('crm_sdr_estado') && m === 'GET') {
    if (u.includes('etapa=eq.dossie')) return json(db.dossie || []);
    if (u.includes('etapa=eq.estrategia')) return json(db.estrategia || []);
    if (u.includes('etapa=eq.redigido')) return json(db.redigido || []);
    return json([]);
  }
  if (u.includes('crm_sdr_mensagens') && m === 'GET') return json(db.msgs || []);
  if (u.includes('crm_cases')) return json([{ titulo: 'Rede X no ponto de venda', marca: 'Rede X', resultado: '+12% de fluxo', tags: ['varejo'], agencia_id: 'ag-vit', crm_agencias: { slug: 'vitrine' } }]);
  if (u.includes('crm_oportunidades')) return json([{ empresa_id: 'eX', crm_agencias: { slug: 'vitrine' }, crm_empresas: { nome: 'Beta Varejo', setor: 'varejo' } }]);
  if (u.includes('crm_agencias')) return json(KN.agencias);
  if (u.includes('crm_fila') && m === 'POST') return json([{ id: 'fila-1' }], 201);
  return json([], m === 'POST' ? 201 : 200);
};
const modelos = [];
let respEstrategia = tese(), notas = { aderencia: 9, especificidade: 9, naturalidade: 9, clareza: 9, risco: 1, motivo: 'bom' };
const corpoWa = 'Ana, vi que a Acme vai abrir 40 lojas no Nordeste este ano com operação nova. Dá para treinar a fala das equipes novas antes da abertura. Topa 20 minutos?';
globalThis.__SDR_LLM_MOCK = async ({ schema, model }) => {
  modelos.push({ model, tipo: schema.properties.cenario ? 'estrategia' : schema.properties.corpo ? 'redacao' : 'qc' });
  const usage = { input_tokens: 1000, output_tokens: 200 };
  if (schema.properties.cenario) return { obj: respEstrategia, erro: null, usage, custo: 0.03, modelo: model };
  if (schema.properties.corpo) return { obj: { assunto: '', corpo: corpoWa }, erro: null, usage, custo: 0.02, modelo: model };
  return { obj: notas, erro: null, usage, custo: 0.001, modelo: model };
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(x) { this._s = x; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() {} };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});
const CFG = (extra) => [
  { chave: 'sdr_estrategista', valor: true }, { chave: 'sdr_modelo_qc', valor: 'claude-haiku-5-5' },
  { chave: 'sdr_modelo_redacao', valor: 'claude-sonnet-5-5' }, { chave: 'sdr_mix_whatsapp', valor: 1 },
  { chave: 'sdr_cadencia', valor: [{ dia: 0, canal: 'email' }] }
].concat(extra || []);

console.log('\nJob sdr-estrategia');
cfgRows = CFG(); escritas = []; modelos.length = 0;
db = { dossie: [estadoBase(1), estadoBase(2, { crm_dossies: { sinais: [] }, crm_decisores: { id: 'd2', nome: 'Rui', cargo: 'Gerente Financeiro', email: 'rui@acme.com', wa: null } })] };
let r = await chamar('sdr-estrategia');
ok(r.status === 200 && r.body.seguem === 1 && r.body.sem_sinal === 1, 'com fato: tese; sem fato: não gasta modelo (' + JSON.stringify(r.body) + ')');
ok(modelos.filter(x => x.tipo === 'estrategia').length === 1, 'uma chamada ao estrategista');
const w1 = escritas.find(e => e.u.includes('crm_sdr_estado?id=eq.1'));
ok(w1 && w1.body.etapa === 'estrategia' && w1.body.tese && w1.body.nota_encaixe === 9 && w1.body.agencia_id === 'ag-vit', 'estado vai para estrategia com tese, nota e a agência escolhida');
ok(w1 && w1.body.canal === 'whatsapp', 'mix WhatsApp no primeiro toque (quem tem os dois canais)');
respEstrategia = tese({ nota_encaixe: 6, motivo: 'fato fraco' }); escritas = [];
db = { dossie: [estadoBase(3)] };
r = await chamar('sdr-estrategia');
const w3 = escritas.find(e => e.u.includes('crm_sdr_estado?id=eq.3'));
ok(r.body.descartados === 1 && w3.body.etapa === 'avaliado' && /encaixe 6/.test(w3.body.motivo), 'encaixe baixo para antes da redação');

console.log('\nJob sdr-redacao com tese');
escritas = []; modelos.length = 0;
db = { estrategia: [estadoBase(1, { canal: 'whatsapp', tese: tese() })] };
r = await chamar('sdr-redacao');
const ins = escritas.filter(e => e.u.includes('crm_sdr_mensagens') && e.m === 'POST');
ok(r.body.redigidos === 1 && ins.length === 1 && ins[0].body.angulo === 'tese' && ins[0].body.canal === 'whatsapp', 'uma versão só, no canal da tese (' + JSON.stringify(r.body) + ')');
ok(modelos.every(x => x.model === 'claude-sonnet-5-5'), 'usa o modelo de redação configurado');
ok(ins[0].body.case_titulo === 'Rede X no ponto de venda', 'case da tese registrado para o QC conferir números');

console.log('\nJob sdr-qualidade: refação e modo rascunho');
const msg = { id: 'm1', assunto: '', corpo: corpoWa, sinal_url: 'https://x/1', canal: 'whatsapp', angulo: 'tese', versao: 1, case_titulo: null, etapa: 'etapa1' };
notas = { aderencia: 9, especificidade: 6, naturalidade: 9, clareza: 9, risco: 1, motivo: 'genérica' };
escritas = []; modelos.length = 0;
db = { redigido: [estadoBase(1, { canal: 'whatsapp', tese: tese(), refacoes: 0 })], msgs: [msg] };
r = await chamar('sdr-qualidade');
ok(r.body.refeitos === 1 && !escritas.some(e => e.u.includes('crm_fila')), 'reprovado volta para refazer, sem item na fila');
ok(escritas.some(e => e.u.includes('crm_sdr_estado?id=eq.1') && e.body.etapa === 'estrategia' && e.body.refacoes === 1 && /especificidade/.test(e.body.motivo)), 'refação leva o motivo do revisor');
ok(modelos.every(x => x.model === 'claude-haiku-5-5'), 'QC usa o modelo configurado');

cfgRows = CFG([{ chave: 'sdr_modo_rascunho', valor: true }]); escritas = [];
db = { redigido: [estadoBase(1, { canal: 'whatsapp', tese: tese(), refacoes: 1 })], msgs: [msg] };
r = await chamar('sdr-qualidade');
ok(r.body.retidos === 1 && !escritas.some(e => e.u.includes('crm_fila')), 'depois da refação, retido fica fora da fila no modo rascunho');

notas = { aderencia: 9, especificidade: 9, naturalidade: 9, clareza: 9, risco: 1, motivo: 'bom' }; escritas = [];
db = { redigido: [estadoBase(1, { canal: 'whatsapp', tese: tese(), refacoes: 0 })], msgs: [msg] };
r = await chamar('sdr-qualidade');
const fila = escritas.find(e => e.u.includes('crm_fila') && e.m === 'POST');
ok(r.body.aprovados_qc === 1 && fila && fila.body.status === 'aprovado' && fila.body.origem === 'sdr', 'modo rascunho: aprovado no QC entra na fila como aprovado (para virar rascunho)');
ok(fila && /tese:/.test(fila.body.contexto_para_aprovacao) && fila.body.tema === 'fala_comercial', 'contexto mostra a tese para o Pedro revisar');
ok(!escritas.some(e => /graph\.microsoft|graph-send|sdr-envio/.test(e.u)), 'nada é enviado');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
