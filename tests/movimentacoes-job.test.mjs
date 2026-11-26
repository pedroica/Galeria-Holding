// Teste do job movimentacoes (imprensa) com imprensa, IA, Lusha e banco simulados.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
process.env.LUSHA_KEY = 'lusha-fake';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const RSS = `<rss><channel>
<item><title>Natura anuncia Ana Souza como nova CMO - Meio &amp; Mensagem</title><link>https://n/1</link><source>Meio &amp; Mensagem</source><pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate><description>Ex-Unilever, liderou Dove</description></item>
<item><title>Carlos Lima é o novo diretor de marketing da Ambev - Propmark</title><link>https://n/2</link><source>Propmark</source></item>
<item><title>Beatriz Melo assume como CMO da agência Africa Creative - M&amp;M</title><link>https://n/3</link><source>M&amp;M</source></item>
</channel></rss>`;
const T = { mov: [], emp: [{ id: 'eAmbev', nome: 'AMBEV S A' }], dec: [{ id: 'dCarloVelho', nome: 'Carlos Lima', empresa_id: 'eHeineken', email: 'carlos@heineken.com', crm_empresas: { nome: 'Heineken' } }], fila: [], cfg: { lusha_daily_limit: 8, lusha_creditos_dia: { data: hoje, usados: 0 } } };
let rpc = 0;
globalThis.__SDR_LLM_MOCK = ({ user, schema }) => {
  if (schema.properties.movimentos) return { obj: { movimentos: [
    { pessoa: 'Ana Souza', cargo: 'CMO', empresa: 'Natura', cargo_anterior: 'Diretora de Marca', empresa_anterior: 'Unilever', trajetoria: 'Ex-Unilever', feitos: 'liderou Dove', item: 0 },
    { pessoa: 'Carlos Lima', cargo: 'Diretor de Marketing', empresa: 'Ambev', cargo_anterior: '', empresa_anterior: 'Heineken', trajetoria: 'vem da Heineken', feitos: '', item: 1 },
    { pessoa: 'Beatriz Melo', cargo: 'CMO', empresa: 'Africa Creative (agência)', cargo_anterior: '', empresa_anterior: '', trajetoria: '', feitos: '', item: 2 }] }, custo: 0.01 };
  const nome = (user.match(/primeiro nome: (\w+)/) || [])[1];
  return { obj: { assunto: 'parabéns pelo novo desafio', email: nome + ', parabéns pelo novo cargo!\n\nVi a notícia e lembrei da sua trajetória.\n\nTopa um café para conversarmos?', linkedin: 'Parabéns! Topa um café?' }, custo: 0.03, modelo: 'claude-opus-5-5' };
};
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.startsWith('https://news.google.com')) return new Response(RSS, { status: 200 });
  const tab = (u.match(/\/rest\/v1\/(?:rpc\/)?([a-z_]+)/) || [])[1] || '';
  if (u.includes('api.lusha.com/v2/person')) return json({ contact: { isCreditCharged: /Ana/.test(u), data: /Ana/.test(u) ? { emailAddresses: [{ email: 'ana@natura.net', emailType: 'work' }], phoneNumbers: [] } : {}, error: /Ana/.test(u) ? undefined : { name: 'EMPTY_DATA' } } });
  if (u.includes('rpc/sdr_invoke')) { rpc++; return json(1); }
  if (tab === 'crm_logs') return json([], 201);
  if (tab === 'crm_configuracoes' && mt === 'GET') return json(Object.entries(T.cfg).map(([chave, valor]) => ({ chave, valor })));
  if (tab === 'crm_configuracoes') { T.cfg[body.chave] = body.valor; return json([], 201); }
  if (tab === 'crm_movimentacoes' && mt === 'POST') { if (T.mov.some(m => m.chave === body.chave)) return json([], 201); const m = Object.assign({ id: 'm' + T.mov.length, status: 'nova' }, body); T.mov.push(m); return json([m], 201); }
  if (tab === 'crm_movimentacoes' && mt === 'GET') return json(T.mov.filter(m => ['nova', 'sem_email'].includes(m.status)));
  if (tab === 'crm_movimentacoes' && mt === 'PATCH') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; Object.assign(T.mov.find(m => m.id === id), body); return new Response(null, { status: 204 }); }
  if (tab === 'crm_empresas' && mt === 'GET') return json(T.emp);
  if (tab === 'crm_empresas' && mt === 'POST') { const e = Object.assign({ id: 'eNova' + T.emp.length }, body); T.emp.push(e); return json([e], 201); }
  if (tab === 'crm_decisores' && mt === 'GET') {
    if (u.includes('nome=ilike.')) { const nm = (u.match(/nome=ilike\.([^&]+)/) || [])[1]; return json(T.dec.filter(d => d.nome.toLowerCase() === nm.toLowerCase())); }
    if (u.includes('email=ilike.')) return json([]);
    const e = (u.match(/empresa_id=eq\.(\w+)/) || [])[1]; const id = (u.match(/[?&]id=eq\.(\w+)/) || [])[1];
    return json(T.dec.filter(d => (e ? d.empresa_id === e : true) && (id ? d.id === id : true)));
  }
  if (tab === 'crm_decisores' && mt === 'POST') { const d = Object.assign({ id: 'dNovo' + T.dec.length }, body); T.dec.push(d); return json([d], 201); }
  if (tab === 'crm_decisores' && mt === 'PATCH') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; Object.assign(T.dec.find(d => d.id === id) || {}, body); return new Response(null, { status: 204 }); }
  if (tab === 'crm_fila' && mt === 'POST') { const f = Object.assign({ id: 'f' + T.fila.length }, body); T.fila.push(f); return json([f], 201); }
  return json([], mt === 'POST' ? 201 : 200);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => { const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {} }; cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res); });

let r = await chamar('movimentacoes');
ok(r.status === 200 && r.body.novas === 2, 'grava 2 movimentações (a da agência fica fora) — ' + JSON.stringify(r.body));
ok(!T.mov.some(m => /Africa/.test(m.empresa)), 'quem foi para agência não é prospect');
const ana = T.mov.find(m => m.pessoa === 'Ana Souza');
ok(ana.status === 'rascunho' && T.fila.some(f => f.origem === 'movimentacao' && f.status === 'aprovado' && /parabéns/i.test(f.corpo) && /café/.test(f.corpo)), 'Ana: e-mail achado no Lusha → rascunho de parabéns com convite para café');
ok(T.emp.some(e => e.nome === 'Natura' && e.fonte === 'movimentacao') && T.dec.some(d => d.nome === 'Ana Souza' && d.email === 'ana@natura.net' && d.fonte === 'movimentacao'), 'cria empresa e contato, com o e-mail do Lusha');
const carlos = T.mov.find(m => m.pessoa === 'Carlos Lima');
ok(carlos.status === 'sem_email' && /Topa um café/.test(carlos.mensagem_email) && carlos.mensagem_linkedin, 'Carlos: sem e-mail → mensagem pronta para o LinkedIn');
ok(T.dec.find(d => d.id === 'dCarloVelho').status === 'saiu_da_empresa', 'Carlos estava na base pela Heineken: marcado como "saiu da empresa"');
ok(T.dec.some(d => d.nome === 'Carlos Lima' && d.empresa_id === 'eAmbev'), 'Carlos casado com a AMBEV S A que já existia');
ok(rpc === 1, 'pede a criação dos rascunhos no Gmail (não envia)');
ok(T.cfg.movimentacoes_ultima_busca === hoje && T.cfg.lusha_creditos_dia.usados === 1, 'marca a busca do dia e conta 1 crédito do Lusha');
const filaAntes = T.fila.length;
r = await chamar('movimentacoes');
ok(T.fila.length === filaAntes && r.body.novas === 0 && r.body.itens === 0, 'rodar de novo no mesmo dia não busca nem repete ninguém');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
