// Teste das rotas captura-ler / captura-gravar (api/enrich.js) com banco, IA e Lusha simulados.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
process.env.LUSHA_KEY = 'lusha-fake';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

const EMP = [{ id: 'eLopes', nome: 'LOPES SUPERMERCADOS LTDA' }];
const DEC = [{ id: 'dJoao', nome: 'João Lopes', email: null, wa: null, cargo: 'CMO', linkedin_url: null, empresa_id: 'eLopes' }];
const cfg = { lusha_daily_limit: 2, lusha_creditos_dia: { data: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), usados: 0 } };
const criados = []; let lushaCalls = 0;
globalThis.__SDR_LLM_MOCK = () => ({ obj: { pessoas: [
  { nome: 'João Lopes', cargo: 'CMO', empresa: 'Lopes Supermercados', email: '', celular: '', linkedin: '', observacao: 'evento ABA' },
  { nome: 'Marina Costa', cargo: 'Head de Marca', empresa: 'Padaria Nova Era', email: '', celular: '(11) 98765-4321', linkedin: '', observacao: '' },
  { nome: 'Rui Alves', cargo: 'CEO', empresa: 'Padaria Nova Era', email: '', celular: '', linkedin: '', observacao: '' }
] } });
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.includes('/auth/v1/user')) return json({ email: 'pedro@galeria.test' });
  if (u.includes('crm_usuarios')) return json([{ email: 'pedro@galeria.test', ativo: true }]);
  if (u.includes('crm_configuracoes') && mt === 'GET') return json(Object.entries(cfg).map(([chave, valor]) => ({ chave, valor })));
  if (u.includes('crm_configuracoes')) { cfg[body.chave] = body.valor; return new Response(null, { status: 201 }); }
  if (u.includes('crm_empresas') && mt === 'GET') return json(EMP);
  if (u.includes('crm_empresas') && mt === 'POST') { const e = Object.assign({ id: 'eNova' + EMP.length }, body); EMP.push(e); criados.push(['empresa', e]); return json([e], 201); }
  if (u.includes('crm_decisores') && mt === 'GET') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; return json(id ? DEC.filter(d => d.id === id) : DEC); }
  if (u.includes('crm_decisores') && mt === 'POST') { const d = Object.assign({ id: 'dNovo' + DEC.length }, body); DEC.push(d); criados.push(['pessoa', d]); return json([d], 201); }
  if (u.includes('crm_decisores') && mt === 'PATCH') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; Object.assign(DEC.find(d => d.id === id) || {}, body); return new Response(null, { status: 204 }); }
  if (u.includes('api.lusha.com/v2/person')) { lushaCalls++; return json({ contact: { isCreditCharged: true, data: { emailAddresses: [{ address: 'joao@lopes.com.br' }], phoneNumbers: [], jobTitle: { title: 'CMO' }, socialLinks: { linkedin: 'https://linkedin.com/in/joaolopes' } } } }); }
  if (u.includes('crm_logs')) return new Response(null, { status: 201 });
  return json([]);
};
const { default: enrich } = await import(new URL('../api/enrich.js', import.meta.url).href);
const chamar = (provider, body) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); }, redirect() {} };
  enrich({ method: 'POST', query: { provider }, headers: { authorization: 'Bearer jwt-do-pedro' }, body: JSON.stringify(body) }, res);
});

const semLogin = await new Promise((resolve) => { const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s }); return this; }, setHeader() {} }; enrich({ method: 'POST', query: { provider: 'captura-ler' }, headers: {}, body: '{}' }, res); });
ok(semLogin.status === 401, 'sem login: 401');
let r = await chamar('captura-ler', { texto: 'Fui no evento da ABA...' });
ok(r.status === 200 && r.body.itens.length === 3, 'lê 3 pessoas');
ok(r.body.itens[0].empresa_match && r.body.itens[0].empresa_match.id === 'eLopes' && r.body.itens[0].pessoa_match && r.body.itens[0].pessoa_match.id === 'dJoao', 'acha a empresa (com Ltda) e o João que já existe');
ok(!r.body.itens[1].empresa_match && r.body.itens[1].celular === '5511987654321', 'empresa nova sem casamento; celular padronizado');
ok(r.body.saldo.restantes === 2, 'mostra o saldo do Lusha do dia');

const itens = r.body.itens.map(x => Object.assign({}, x, { empresa_id: x.empresa_match && x.empresa_match.id, decisor_id: x.pessoa_match && x.pessoa_match.id, enriquecer: true, celular_lusha: false }));
r = await chamar('captura-gravar', { itens });
ok(r.status === 200, 'grava');
ok(criados.filter(c => c[0] === 'empresa').length === 1, 'cria a Padaria Nova Era UMA vez (a segunda pessoa reaproveita)');
ok(criados.filter(c => c[0] === 'pessoa').length === 2 && !criados.some(c => c[1].nome === 'João Lopes'), 'cria Marina e Rui; João não é duplicado');
ok(DEC.find(d => d.id === 'dJoao').email === 'joao@lopes.com.br' && DEC.find(d => d.id === 'dJoao').linkedin_url.includes('joaolopes'), 'Lusha completou e-mail e LinkedIn do João');
ok(lushaCalls === 2 && cfg.lusha_creditos_dia.usados === 2, 'gastou só até o teto (2 créditos)');
ok(r.body.resultados[2].erro && /teto/.test(r.body.resultados[2].erro), 'terceira pessoa fica para o enriquecimento diário (teto)');
ok(DEC.find(d => d.nome === 'Marina Costa').wa === '5511987654321' && DEC.find(d => d.nome === 'Marina Costa').fonte === 'captura', 'celular digitado gravado e origem "captura"');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
