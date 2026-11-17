// tests/sdr-jobs-c.test.mjs — Bloco C: jobs sdr-redacao e sdr-qualidade ponta a ponta,
// com Supabase e modelo simulados (sem rede, sem custo).
// Rodar: node tests/sdr-jobs-c.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

const SINAL = { tipo: 'lancamento', fato: 'Acme lança linha X', fonte: 'Exame', url: 'https://x/1', trecho: 'Acme lança linha X' };
const estado = (id, extra) => Object.assign({
  id, decisor_id: 'd' + id, empresa_id: 'e' + id, agencia_id: 'a1', agencia_motivo: 'inovação', dia_cadencia: 0, dossie_id: 'dos' + id,
  canal: 'email',
  crm_decisores: { nome: 'Ana Souza', cargo: 'CMO', email: 'ana@acme.com', wa: null },
  crm_empresas: { id: 'e' + id, nome: 'Acme', setor: 'tecnologia' },
  crm_agencias: { id: 'a1', nome: '404', slug: '404' },
  crm_dossies: { sinais: [SINAL] }
}, extra || {});

let db; const escritas = [];
function reset() {
  db = {
    estadosDossie: [estado(1), estado(2, { crm_dossies: { sinais: [] } })],
    estadosRedigido: [estado(1)],
    mensagens: [],
  };
  escritas.length = 0;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); const metodo = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (metodo !== 'GET') escritas.push({ u, metodo, body });
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_configuracoes')) return json([]);
  if (u.includes('crm_sdr_estado') && metodo === 'GET') return json(u.includes('etapa=eq.dossie') ? db.estadosDossie : db.estadosRedigido);
  if (u.includes('crm_sdr_mensagens') && metodo === 'GET') return json(db.mensagens);
  if (u.includes('crm_fila') && metodo === 'POST') return json([{ id: 'fila-1' }], 201);
  return json([], metodo === 'POST' ? 201 : 200);
};

// Modelo simulado: redação devolve mensagem bem formada; avaliador devolve notas.
const corpo = 'Ana, vi que a Acme lançou a linha X ' + Array.from({ length: 60 }, (_, i) => 'termo' + i).join(' ') + ' faz sentido te mandar a ideia?';
let notas = { aderencia: 9, especificidade: 9, naturalidade: 9, clareza: 9, risco: 1, motivo: 'bom' };
let chamadas = 0;
globalThis.__SDR_LLM_MOCK = async ({ schema }) => {
  chamadas++;
  const usage = { input_tokens: 1000, output_tokens: 200 };
  if (schema.properties.corpo) return { obj: { assunto: 'Acme e a linha X', corpo }, erro: null, usage, custo: 0.008, modelo: 'claude-opus-5-5' };
  return { obj: notas, erro: null, usage, custo: 0.008, modelo: 'claude-opus-5-5' };
};

const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
function chamar(job) {
  return new Promise((resolve) => {
    const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
    cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
  });
}

console.log('sdr-redacao');
reset(); chamadas = 0;
let r = await chamar('sdr-redacao');
ok(r.status === 200 && r.body.redigidos === 1, 'lead com sinal é redigido (' + JSON.stringify(r.body) + ')');
ok(r.body.sem_sinal === 1, 'lead sem sinal não gasta modelo e fica retido');
ok(chamadas === 3, '3 versões (ângulos fato/ideia/case) para o lead com sinal');
const ins = escritas.filter(e => e.u.includes('crm_sdr_mensagens') && e.metodo === 'POST');
ok(ins.length === 3 && ins.every(e => e.body.sinal_url === 'https://x/1' && e.body.modelo === 'claude-opus-5-5'), 'cada versão gravada com lastro (sinal_url) e modelo');
ok(new Set(ins.map(e => e.body.angulo)).size === 3, 'ângulos distintos');
ok(escritas.some(e => e.u.includes('crm_sdr_estado?id=eq.1') && e.body.etapa === 'redigido'), 'estado avança para redigido');
ok(escritas.some(e => e.u.includes('crm_sdr_estado?id=eq.2') && /pesquisa manual/.test(e.body.motivo || '')), 'sem sinal: motivo registrado');

console.log('\nsdr-qualidade');
reset();
db.mensagens = [1, 2, 3].map(v => ({ id: 'm' + v, assunto: 'Acme e a linha X', corpo, sinal_url: 'https://x/1', canal: 'email', angulo: ['fato', 'ideia', 'case'][v - 1], versao: v, case_titulo: null, etapa: 'etapa1', tokens_prompt: 1000, tokens_resposta: 200, custo_usd: 0.008, modelo: 'claude-opus-5-5' }));
r = await chamar('sdr-qualidade');
ok(r.status === 200 && r.body.aprovados_qc === 1 && r.body.nota_media === 9, 'notas 9 + checagens ok → aprovado no QC (' + JSON.stringify(r.body) + ')');
const fila = escritas.find(e => e.u.includes('crm_fila') && e.metodo === 'POST');
ok(fila && fila.body.status === 'rascunho', 'cria item em crm_fila SEMPRE como rascunho (nada é enviado)');
ok(fila && /nota 9/.test(fila.body.contexto_para_aprovacao) && /https:\/\/x\/1/.test(fila.body.contexto_para_aprovacao), 'contexto mostra nota e fonte do fato');
ok(escritas.filter(e => e.u.includes('crm_sdr_mensagens?id=eq.') && e.body.escolhida === true).length === 1, 'exatamente uma versão escolhida');
ok(escritas.some(e => e.u.includes('crm_sdr_estado?id=eq.1') && e.body.etapa === 'rascunho' && e.body.fila_id === 'fila-1'), 'estado vai para rascunho com fila_id');

reset(); notas = { aderencia: 9, especificidade: 6, naturalidade: 9, clareza: 9, risco: 1, motivo: 'genérica' };
db.mensagens = [{ id: 'm1', assunto: 'Acme e a linha X', corpo, sinal_url: 'https://x/1', canal: 'email', angulo: 'fato', versao: 1, etapa: 'etapa1' }];
r = await chamar('sdr-qualidade');
ok(r.body.retidos === 1 && r.body.aprovados_qc === 0, 'nota < 8 → retido para o Pedro');
ok(escritas.some(e => e.u.includes('crm_sdr_estado?id=eq.1') && e.body.etapa === 'avaliado' && /especificidade/.test(e.body.motivo)), 'motivo da retenção registrado');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
