// tests/sdr-topo.test.mjs — Bloco G: topo de funil (cross-sell, sinais de compra, lookalike).
// Rodar: node tests/sdr-topo.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
import { crossSell, sinaisDeCompra, filtrarLookalikes } from '../lib/sdr-topo.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

const AGS = [{ slug: 'gaia', nome: 'GAIA' }, { slug: '404', nome: '404' }, { slug: 'catalyst', nome: 'Catalyst' }, { slug: 'galeria', nome: 'Galeria' }, { slug: 'vitrine', nome: 'Vitrine' }, { slug: 'holding', nome: 'Galeria Holding' }];
const KN = { cases_destaque: [{ agencia_slug: '404', tags: ['tecnologia'] }] };

console.log('Cross-sell interno');
let c = crossSell([{ empresa_id: 'e1', nome: 'TechCo', setor: 'tecnologia app', agencias_ativas: ['gaia'] }], AGS, KN);
ok(c.length === 2 && c[0].agencia_slug === '404' && /case no setor/.test(c[0].motivo), 'cliente tech da GAIA: 404 (com case) vem primeiro');
ok(c.every(x => x.agencia_slug !== 'gaia' && x.agencia_slug !== 'holding'), 'nunca sugere a própria agência nem a holding');
ok(c.every(x => x.score > 10), 'cross-sell pontua acima de qualquer outra fonte');
c = crossSell([{ empresa_id: 'e2', nome: 'Padaria X', setor: 'alimentos', agencias_ativas: ['gaia'] }], AGS, KN);
ok(c.length === 1 && c[0].agencia_slug === 'galeria', 'sem match de setor: Galeria (campanha integrada)');

console.log('\nSinais de compra');
const agora = new Date('2026-11-17T12:00:00Z');
const nots = [
  { empresa_id: 'a', titulo: 'Acme anuncia nova agência após concorrência', url: 'u1', data: '2026-11-10' },
  { empresa_id: 'a', titulo: 'Acme lança linha X', url: 'u2', data: '2026-11-12' },
  { empresa_id: 'b', titulo: 'Beta nomeia novo CMO', url: 'u3', data: '2026-11-01' },
  { empresa_id: 'c', titulo: 'Gama demite 300 após crise', url: 'u4', data: '2026-11-05' },
  { empresa_id: 'd', titulo: 'Delta lança produto', url: null, data: '2026-11-05' },
  { empresa_id: 'e', titulo: 'Épsilon lança app', url: 'u5', data: '2026-08-01' },
];
const s = sinaisDeCompra(nots, { a: { nome: 'Acme' }, b: { nome: 'Beta' } }, { agora });
ok(s.length === 2, 'uma linha por empresa; descarta sem URL, gancho proibido e antigo (' + s.map(x => x.empresa_id).join() + ')');
ok(s.find(x => x.empresa_id === 'a').dados.tipo === 'concorrencia_agencia', 'fica com o sinal mais forte (concorrência > lançamento)');
ok(s.find(x => x.empresa_id === 'b').dados.tipo === 'troca_cmo', 'troca de CMO detectada');

console.log('\nLookalike');
const L = filtrarLookalikes([
  { name: 'Grande', domain: 'www.grande.com.br', employeeCount: { exact: 450 }, location: { state: 'SP' } },
  { name: 'Pequena', domain: 'pequena.com.br', employeeCount: { exact: 4 } },
  { name: 'SAAE', domain: 'www.saaebm.rj.gov.br', employeeCount: { exact: 1800 } },
  { name: 'Já temos', domain: 'jatemos.com.br', employeeCount: { exact: 300 } },
], new Set(['jatemos.com.br']));
ok(L.length === 1 && L[0].dominio === 'grande.com.br', 'só porte >= 100, sem órgão público, sem quem já está na base');

console.log('\nSeleção usa o topo aceito');
const { selecionarLote } = await import('../lib/sdr-selecao.js');
const sel = selecionarLote({ candidatos: [
    { id: 'd1', nome: 'A', empresa_id: 'e1', email: 'a@x.com', crm_empresas: { nome: 'Alfa', setor: 'varejo' }, ultimo_toque_em: null },
    { id: 'd2', nome: 'B', empresa_id: 'e2', email: 'b@x.com', crm_empresas: { nome: 'Beta', setor: 'varejo' }, ultimo_toque_em: null } ],
  agencias: [{ slug: 'vitrine', id: 'v' }, { slug: '404', id: 'q' }], topoAceitos: { e2: { fonte: 'sinal_compra', agencia_slug: '404', motivo: 'troca de CMO' } },
  config: { lote_max: 1 }, agora: Date.now() });
ok(sel.lote[0].empresa_id === 'e2' && sel.lote[0].agencia_slug === '404' && sel.lote[0].prioridade === 'topo_sinal_compra', 'aceito no topo vence e usa a agência sugerida');

console.log('\nJob sdr-topo');
const escritas = [];
const json = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const m = (opts.method || 'GET').toUpperCase();
  if (m !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, body: JSON.parse(opts.body) });
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_oportunidades') && u.includes('Cliente ativo')) return json([{ empresa_id: 'e1', crm_agencias: { slug: 'gaia' }, crm_empresas: { id: 'e1', nome: 'TechCo', setor: 'tecnologia' } }]);
  if (u.includes('crm_oportunidades')) return json([{ empresa_id: 'e1', crm_agencias: { slug: 'gaia' } }, { empresa_id: 'e1', crm_agencias: { slug: '404' } }]);
  if (u.includes('crm_agencias')) return json(AGS);
  if (u.includes('crm_noticias')) return json([{ empresa_id: 'b', titulo: 'Beta nomeia novo CMO', url: 'u3', data: new Date().toISOString().slice(0, 10) }]);
  if (u.includes('crm_empresas')) return json([{ id: 'b', nome: 'Beta' }]);
  if (u.includes('crm_sdr_topo')) return json(JSON.parse(opts.body), 201);
  return json([]);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const r = await new Promise((resolve) => {
  const res = { _s: 200, status(x) { this._s = x; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() {} };
  cron({ method: 'GET', query: { job: 'sdr-topo' }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});
ok(r.status === 200 && r.body.sinais_compra === 1, 'job grava sinal de compra (' + JSON.stringify(r.body) + ')');
const lote = (escritas.find(e => e.u.includes('crm_sdr_topo')) || {}).body || [];
ok(!lote.some(x => x.fonte === 'cross_sell' && x.agencia_slug === '404'), 'não sugere cross-sell onde já há oportunidade aberta da agência');
ok(escritas.every(e => /crm_sdr_topo/.test(e.u)), 'só escreve em crm_sdr_topo (não cria contato nem fila)');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
