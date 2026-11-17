// tests/relatorio-route.test.mjs — rota pública do relatório (BLOCO 5c, bug do link).
// /api/relatorio/:token → /api/fila?action=relatorio&token= renderiza HTML.
// Rodar: node tests/relatorio-route.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.ANTHROPIC_API_KEY = 'sk-fake';

let RELAT = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('crm_relatorios')) return json(RELAT);
  return json([], false, 404);
};
const { default: handler } = await import(new URL('../api/fila.js', import.meta.url).href);
function res() { const r = { code: 200, body: '' }; r.status = c => { r.code = c; return r; }; r.json = p => { r.body = p; return r; }; r.send = p => { r.body = p; return r; }; r.setHeader = () => {}; return r; }
const get = (token) => { const r = res(); return handler({ method: 'GET', query: { action: 'relatorio', token }, headers: {} }, r).then(() => r); };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

console.log('Rota do relatório — api/fila.js');

RELAT = [{ dados: { semana_inicio: '2026-11-10', gerado_em: '2026-11-14', resumo_texto: 'Semana boa.', reunioes_total: 2, enviados_total: 40, respostas_total: 5, taxa_resposta_pct: 12, por_canal: { email: 30 }, por_agencia: { Alfa: { enviados: 30, respostas: 4, reunioes: 2 } }, top5: ['Empresa X'] }, semana_inicio: '2026-11-10' }];
let r = await get('60bd33eaea250ed8');
ok(r.code === 200 && /Relat[óo]rio semanal/.test(String(r.body)), 'token válido → HTML 200 do relatório');
ok(/Semana boa\./.test(String(r.body)) && /Empresa X/.test(String(r.body)), 'inclui resumo e top5 renderizados');

RELAT = [];
r = await get('deadbeefdeadbeef');
ok(r.code === 404, 'token inexistente → 404');

r = await get('xx');
ok(r.code === 404, 'token mal-formado → 404 (não consulta banco)');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
