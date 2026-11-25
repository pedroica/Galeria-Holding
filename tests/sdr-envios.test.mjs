// tests/sdr-envios.test.mjs — job sdr-envios: rascunho do Gmail enviado pelo
// Pedro vira toque + follow-up; apagado sai da fila; idempotente. Gmail e
// Supabase simulados. Rodar: node tests/sdr-envios.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const FILA = {
  f1: { id: 'f1', decisor_id: 'd1', empresa_id: 'e1', agencia_id: 'a1', assunto: 'Acme', corpo: 'Ana, ...', outlook_message_id: 'r-111', rascunho_criado_em: '2026-11-24T06:00:00Z', crm_decisores: { email: 'ana@acme.com' }, status: 'aprovado' },
  f2: { id: 'f2', decisor_id: 'd2', empresa_id: 'e2', agencia_id: 'a1', assunto: 'Beta', corpo: 'Bia, ...', outlook_message_id: 'r-222', rascunho_criado_em: '2026-11-24T06:00:00Z', crm_decisores: { email: 'bia@beta.com' }, status: 'aprovado' },
  f3: { id: 'f3', decisor_id: 'd3', empresa_id: 'e3', agencia_id: 'a1', assunto: 'Gama', corpo: 'Caio, ...', outlook_message_id: 'r-333', rascunho_criado_em: '2026-11-24T06:00:00Z', crm_decisores: { email: 'caio@gama.com' }, status: 'aprovado' },
  f4: { id: 'f4', decisor_id: 'd4', empresa_id: 'e4', agencia_id: 'a1', assunto: 'Outlook', corpo: '...', outlook_message_id: 'AAMkAGI2=', rascunho_criado_em: '2026-11-24T06:00:00Z', crm_decisores: { email: 'x@y.com' }, status: 'aprovado' }
};
const ESTADO = [{ id: 's1', decisor_id: 'd1', empresa_id: 'e1', agencia_id: 'a1', dossie_id: null, dia_cadencia: 0, fila_id: 'f1', etapa: 'rascunho' }];
const escritas = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const metodo = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
  if (metodo !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, metodo, body });
  if (u.includes('crm_oauth_tokens')) return json([{ id: 't1', access_token: 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'pedro@gmail.com' }]);
  if (u.startsWith('https://gmail.googleapis.com')) {
    if (u.includes('/drafts/r-111') || u.includes('/drafts/r-222')) return json({ error: { message: 'not found' } }, 404);   // sumiram
    if (u.includes('/drafts/r-333')) return json({ id: 'r-333' });                                                          // ainda é rascunho
    if (u.includes('/messages?') && u.includes('to:ana@acme.com')) return json({ messages: [{ id: 'm1' }] });
    if (u.includes('/messages?')) return json({});
    if (u.includes('/messages/m1')) return json({ id: 'm1', threadId: 'th1', internalDate: String(Date.parse('2026-11-24T13:00:00Z')), payload: { headers: [{ name: 'Subject', value: 'Acme editado' }] } });
    return json({}, 404);
  }
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_configuracoes')) return json([{ chave: 'sdr_cadencia', valor: [{ dia: 0, canal: 'email' }, { dia: 3, canal: 'whatsapp' }, { dia: 7, canal: 'email' }] }, { chave: 'sdr_feriados', valor: [] }]);
  if (u.includes('crm_sdr_estado') && metodo === 'GET') {
    return json(ESTADO.filter(e => e.etapa === 'rascunho').map(e => Object.assign({}, e, { crm_fila: { status: FILA[e.fila_id].status, enviado_em: FILA[e.fila_id].enviado_em } })));
  }
  if (u.includes('crm_sdr_estado') && metodo === 'PATCH' && u.includes('id=eq.')) {
    const id = (u.match(/[?&]id=eq\.(\w+)/) || [])[1]; const e = ESTADO.find(x => x.id === id);
    if (!e || (u.includes('etapa=eq.rascunho') && e.etapa !== 'rascunho')) return json([]);
    Object.assign(e, body); return json([e]);
  }
  if (u.includes('crm_fila') && metodo === 'GET') return json(Object.values(FILA).filter(f => f.status === 'aprovado'));
  if (u.includes('crm_fila') && metodo === 'PATCH') {
    const id = (u.match(/id=eq\.(\w+)/) || [])[1]; const f = FILA[id];
    if (!f || (u.includes('status=eq.aprovado') && f.status !== 'aprovado')) return json([]);
    Object.assign(f, body); return json([f]);
  }
  return json([], metodo === 'POST' ? 201 : 200);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});

console.log('Job sdr-envios');
let r = await chamar('sdr-envios');
ok(r.status === 200 && r.body.verificados === 3, 'confere só rascunhos do Gmail (id do Outlook fica de fora) ' + JSON.stringify(r.body));
ok(FILA.f1.status === 'enviado' && FILA.f1.enviado_em === '2026-11-24T13:00:00.000Z' && FILA.f1.thread_ref === 'th1', 'rascunho enviado no Gmail: fila vira enviado com data e thread');
ok(escritas.some(e => e.u.includes('crm_toques') && e.body.decisor_id === 'd1' && e.body.assunto === 'Acme editado'), 'toque registrado com o assunto que de fato saiu');
ok(escritas.some(e => e.u.includes('crm_decisores?id=eq.d1') && e.body.ultimo_toque_em), 'último toque do decisor atualizado');
ok(FILA.f2.status === 'pulado' && /apagado/.test(FILA.f2.motivo_pulo), 'rascunho apagado sem envio sai da fila');
ok(FILA.f3.status === 'aprovado', 'rascunho ainda no Gmail fica como está');
ok(ESTADO[0].etapa === 'enviado', 'lead do SDR fecha o ciclo');
const fu = escritas.find(e => e.u.includes('crm_sdr_estado') && e.metodo === 'POST' && e.body.etapa === 'aguardando');
ok(fu && fu.body.dia_cadencia === 3 && fu.body.data_lote > '2026-11-24', 'follow-up D3 agendado depois do envio');
ok(!escritas.some(e => e.u.startsWith('https://gmail.googleapis.com')), 'nada é escrito no Gmail (nem envio, nem rascunho)');

const antes = escritas.filter(e => e.u.includes('crm_toques')).length;
r = await chamar('sdr-envios');
ok(escritas.filter(e => e.u.includes('crm_toques')).length === antes && r.body.followups === 0, 'segunda execução não duplica toque nem follow-up');

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
