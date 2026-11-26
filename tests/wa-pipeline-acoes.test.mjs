// Follow-up do Pipeline: ações de contatos e envio (api/enrich?provider=wa-pipeline) com banco,
// Gmail, Lusha e IA simulados.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
process.env.LUSHA_KEY = 'lusha-fake';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const b64 = (t) => Buffer.from(t).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const DEC = [{ id: 'dRenan', nome: 'Renan Pereira', cargo: 'Compras', email: 'renan@xpi.com.br', wa: null, empresa_id: 'eXP' }, { id: 'dMarcelo', nome: 'Marcelo Bronze', cargo: 'Diretor de Marketing', email: null, wa: null, empresa_id: 'eXP' }];
const T = { toques: [], eventos: [], msgs: [], cfg: { lusha_daily_limit: 8, lusha_creditos_dia: { data: hoje, usados: 7 } }, gmail: [], lusha: 0, aud: 0 };
globalThis.__SDR_LLM_MOCK = () => ({ texto: '```json\n{"assunto":"café na XP","mensagem":"Marcelo, tudo bem?\\n\\nTopa um café?","fato_usado":"","fontes":[]}\n```', urls: [], buscas: 1 });
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.includes('/auth/v1/user')) return json({ email: 'pedro@galeria.test' });
  if (u.includes('crm_usuarios')) return json([{ email: 'pedro@galeria.test', ativo: true }]);
  if (u.includes('crm_oportunidades')) return json([{ id: 'op1', titulo: 'XP Inc — 404', estagio: 'Wishlist', empresa_id: 'eXP' }]);
  if (u.includes('crm_empresas')) return json([{ id: 'eXP', nome: 'XP INC', website: 'https://www.xpi.com.br' }]);
  if (u.includes('crm_decisores') && mt === 'GET') return json(DEC);
  if (u.includes('crm_decisores') && mt === 'POST') { const d = Object.assign({ id: 'dNovo' + DEC.length }, body); DEC.push(d); return json([d], 201); }
  if (u.includes('crm_decisores') && mt === 'PATCH') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; Object.assign(DEC.find(d => d.id === id) || {}, body); return new Response(null, { status: 204 }); }
  if (u.includes('crm_auditoria')) { T.aud++; return new Response(null, { status: 201 }); }
  if (u.includes('crm_configuracoes') && mt === 'GET') return json(Object.entries(T.cfg).map(([chave, valor]) => ({ chave, valor })));
  if (u.includes('crm_configuracoes')) { T.cfg[body.chave] = body.valor; return new Response(null, { status: 201 }); }
  if (u.includes('crm_oportunidade_mensagens') && mt === 'GET') return json(T.msgs.filter(m => !m.enviado_em));
  if (u.includes('crm_oportunidade_mensagens') && mt === 'POST') { const m = Object.assign({ id: 'm' + T.msgs.length }, body); T.msgs.push(m); return json([m], 201); }
  if (u.includes('crm_oportunidade_mensagens') && mt === 'PATCH') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; Object.assign(T.msgs.find(m => m.id === id) || {}, body); return new Response(null, { status: 204 }); }
  if (u.includes('crm_toques') && mt === 'POST') { T.toques.push(body); return new Response(null, { status: 201 }); }
  if (u.includes('crm_oportunidade_eventos') && mt === 'POST') { T.eventos.push(body); return new Response(null, { status: 201 }); }
  if (u.includes('crm_oauth_tokens')) return json([{ id: 1, access_token: 'tok', refresh_token: 'rt', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'pedro@galeria.test' }]);
  if (u.includes('gmail.googleapis.com')) {
    T.gmail.push(mt + ' ' + u);
    if (/\/messages\?/.test(u)) return json({ messages: [{ id: 'g1' }, { id: 'g2' }] });
    if (u.includes('/messages/g1')) return json({ id: 'g1', payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'Marcelo Bronze <marcelo.bronze@xpi.com.br>' }, { name: 'To', value: 'pedro@galeria.test' }, { name: 'Date', value: 'Wed, 25 Nov 2026 10:00:00 -0300' }], body: { data: b64('Oi Pedro\nMarcelo Bronze\n+55 11 97777-6666') } } });
    if (u.includes('/messages/g2')) return json({ id: 'g2', payload: { headers: [{ name: 'From', value: 'pedro@galeria.test' }, { name: 'To', value: 'renan@xpi.com.br' }] } });
    if (u.includes('sendAs')) return json({ sendAs: [] });
    if (u.includes('/drafts/send')) return json({ id: 'enviado1' });
    if (u.includes('/drafts') && mt === 'POST') return json({ id: 'r-9', message: { id: 'm9' } });
    return json({});
  }
  if (u.includes('api.lusha.com/v3/contacts/prospecting')) return json({ results: [{ id: 'L1', firstName: 'Lisandro', lastName: 'Lopez' }, { id: 'L2', firstName: 'Marcelo', lastName: 'Bronze' }] });
  if (u.includes('api.lusha.com/v3/contacts/enrich')) return json({ results: [{ id: 'L1', jobTitle: { title: 'CMO' } }] });
  if (u.includes('api.lusha.com/v2/person')) { T.lusha++; return json({ contact: { isCreditCharged: true, data: { emailAddresses: [{ email: 'lisandro@xpi.com.br' }], phoneNumbers: [] } } }); }
  if (u.includes('crm_logs')) return new Response(null, { status: 201 });
  return json([]);
};
const { default: enrich } = await import(new URL('../api/enrich.js', import.meta.url).href);
const chamar = (body) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); }, redirect() {} };
  enrich({ method: 'POST', query: { provider: 'wa-pipeline' }, headers: { authorization: 'Bearer jwt' }, body: JSON.stringify(Object.assign({ oportunidade_id: 'op1' }, body)) }, res);
});

let r = await chamar({ acao: 'contatos' });
ok(r.status === 200 && r.body.dominio === 'xpi.com.br' && r.body.contatos.length === 2 && r.body.contatos[0].id === 'dRenan' && /linkedin\.com/.test(r.body.linkedin_busca), 'lista as pessoas da conta (quem tem canal primeiro), domínio e busca no LinkedIn');

r = await chamar({ acao: 'gmail-contatos' });
const mb = r.body.candidatos && r.body.candidatos.find(c => c.email === 'marcelo.bronze@xpi.com.br');
ok(r.status === 200 && mb && mb.wa === '5511977776666' && !mb.ja_no_crm && T.gmail.some(g => g.includes('from:xpi.com.br')), 'acha no Gmail quem é da XP, com o celular da assinatura');
ok(r.body.candidatos.find(c => c.email === 'renan@xpi.com.br').ja_no_crm, 'marca quem já está no CRM');

r = await chamar({ acao: 'gravar-contato', contato: { nome: 'Marcelo Bronze', email: 'marcelo.bronze@xpi.com.br', wa: '5511977776666', origem: 'gmail' } });
ok(r.status === 200 && r.body.contato.id === 'dMarcelo' && DEC[1].email === 'marcelo.bronze@xpi.com.br' && DEC[1].wa === '5511977776666', 'completa o Marcelo que já existia (sem duplicar)');
r = await chamar({ acao: 'gravar-contato', contato: { nome: 'Joana Reis', cargo: 'Head de Marca', email: 'joana@xpi.com.br', wa: '(11) 96666-5555' } });
ok(r.status === 200 && DEC.some(d => d.nome === 'Joana Reis' && d.wa === '5511966665555' && d.fonte === 'pipeline' && d.empresa_id === 'eXP'), 'contato digitado é criado na empresa');
ok((await chamar({ acao: 'gravar-contato', contato: { nome: 'X', email: 'nao-email' } })).status === 400, 'e-mail inválido é recusado');

r = await chamar({ acao: 'lusha-pessoas' });
ok(r.status === 200 && r.body.candidatos.length === 2 && r.body.candidatos[0].cargo === 'CMO' && r.body.candidatos[1].ja_no_crm, 'Lusha: lista líderes da empresa e marca quem já está no CRM');
r = await chamar({ acao: 'lusha-email', contato: { nome: 'Lisandro Lopez', cargo: 'CMO', origem: 'lusha' } });
ok(r.status === 200 && r.body.contato.email === 'lisandro@xpi.com.br' && r.body.lusha.achou && T.cfg.lusha_creditos_dia.usados === 8, 'revela o e-mail no Lusha e conta o crédito no teto');
r = await chamar({ acao: 'lusha-email', contato: { nome: 'Pessoa Nova', origem: 'lusha' } });
ok(r.body.lusha && /Teto/.test(r.body.lusha.erro) && T.lusha === 1, 'teto do dia atingido: não consulta o Lusha');

r = await chamar({ canal: 'email', decisor_id: 'dMarcelo' });
ok(r.status === 200 && r.body.id && T.msgs.length === 1 && T.msgs[0].canal === 'email' && T.msgs[0].decisor_id === 'dMarcelo', 'mensagem gerada fica guardada pronta');
r = await chamar({ acao: 'contatos' });
ok(r.body.prontas.length === 1 && r.body.prontas[0].assunto === 'café na XP', 'ao abrir de novo, a mensagem pronta volta');

const antes = T.gmail.length;
r = await chamar({ acao: 'enviar-email', decisor_id: 'dMarcelo', assunto: 'café na XP', corpo: 'Marcelo, tudo bem?\n\nTopa um café?', mensagem_id: T.msgs[0].id });
ok(r.status === 200 && r.body.enviado && T.gmail.slice(antes).some(g => /POST .*\/drafts\/send/.test(g)), 'envia pelo Gmail no clique do Pedro');
ok(T.toques.some(t => t.canal === 'email' && t.decisor_id === 'dMarcelo' && t.direcao === 'enviado') && T.eventos.some(e => /E-mail enviado para Marcelo/.test(e.texto)) && T.msgs[0].enviado_em, 'registra toque, histórico e marca a mensagem como enviada');
ok((await chamar({ acao: 'enviar-email', decisor_id: 'dNaoExiste', assunto: 'a', corpo: 'b' })).status === 400, 'sem e-mail do contato: não envia');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
