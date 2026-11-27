// Amigo no WhatsApp: ferramentas (lib/amigo-wa.js) e o "manda" no webhook (api/enrich.js).
import { createHmac } from 'node:crypto';
process.env.WHATSAPP_CLOUD_TOKEN = 'token-falso'; process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
process.env.WHATSAPP_APP_SECRET = 'segredo'; process.env.WHATSAPP_VERIFY_TOKEN = 'v'; process.env.WHATSAPP_ALLOWED_NUMBERS = '5511999998888';
process.env.SUPA_CRM_SERVICE_KEY = 'service-falso'; process.env.ANTHROPIC_API_KEY = 'sk-falso';
import { AMIGO_TOOL_DEFS, execAmigo, CONFIRMA, CANCELA } from '../lib/amigo-wa.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const ontem = new Date(Date.parse(hoje + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10); // relativo ao dia de Brasília (à noite o UTC já virou)

const T = { patch: [], post: [], gmail: [], wa: [], sess: { pendente: null, mensagens: [] } };
const rota = async (u0, mt, body) => {
  const tab = (u0.match(/\/rest\/v1\/([a-z_]+)/) || [])[1] || ''; const u = tab + '?' + (u0.split('?')[1] || '');
  if (tab === 'crm_empresas') return [{ id: 'eXP', nome: 'XP INC', setor: 'Financeiro' }];
  if (tab === 'crm_oportunidades' && mt === 'GET' && u.includes('proximo_passo_em=lte')) return [{ titulo: 'XP Inc — 404', estagio: 'Wishlist', proximo_passo: 'Cobrar o Marcelo', proximo_passo_em: ontem, crm_empresas: { nome: 'XP INC' } }, { titulo: 'Livelo', estagio: 'Contato direto', proximo_passo: 'Mandar deck', proximo_passo_em: hoje, crm_empresas: { nome: 'LIVELO' } }, { titulo: 'Old', estagio: 'Perdido', proximo_passo: 'x', proximo_passo_em: hoje }];
  if (tab === 'crm_oportunidades' && mt === 'GET') return [{ id: 'opXP', titulo: 'XP Inc — 404', estagio: 'Wishlist', empresa_id: 'eXP' }];
  if (tab === 'crm_decisores' && mt === 'GET') return [{ id: 'dMar', nome: 'Marcelo Bronze', cargo: 'Diretor de Marketing', email: 'marcelo@xpi.com.br', wa: '11988887777', empresa_id: 'eXP', crm_empresas: { id: 'eXP', nome: 'XP INC' } }];
  if (tab === 'crm_reunioes_v') return [{ empresa: 'Santa Helena', reuniao_em: new Date(Date.now() + 2 * 864e5).toISOString(), titulo: 'Reunião' }];
  if (tab === 'crm_toques' && mt === 'GET') return [{ canal: 'whatsapp', resumo: 'Vamos marcar sim', data: new Date().toISOString(), crm_empresas: { nome: 'SKY' }, crm_decisores: { nome: 'Ana' } }];
  if (tab === 'crm_gmail_sugestoes') return [{ estagio_para: 'Pausado', resumo: 'Cobasi pediu dezembro', crm_empresas: { nome: 'COBASI' } }];
  if (tab === 'crm_wa_conversas') return [{ jid: 'j1', nome: 'Marcelo Bronze' }];
  if (tab === 'crm_wa_mensagens') return [{ jid: 'j1', de_mim: false, texto: 'bora falar quinta', enviada_em: new Date().toISOString() }, { jid: 'j1', de_mim: true, texto: 'fechado', enviada_em: new Date(Date.now() - 6e4).toISOString() }];
  if (tab === 'crm_configuracoes') return [];
  if (mt === 'PATCH') { T.patch.push([u, body]); return null; }
  if (mt === 'POST') { T.post.push([u, body]); return [Object.assign({ id: 'novo' }, body)]; }
  return [];
};
const ctx = { req: async (p, o = {}) => rota(decodeURIComponent(p), (o.method || 'GET').toUpperCase(), o.body ? JSON.parse(o.body) : null), supaUrl: 'x', serviceKey: 'y', envKey: 'z', pendente: null,
  gmail: { obter: async () => ({ token: 't', email: 'pedro@g.test' }), criar: async (tk, a) => { T.gmail.push(['criar', a]); return { id: 'r-1', link: 'https://mail/r-1' }; }, enviar: async (tk, id) => { T.gmail.push(['enviar', id]); return { id: 'm1' }; } } };

ok(AMIGO_TOOL_DEFS.some(t => t.name === 'preparar_mensagem') && AMIGO_TOOL_DEFS.every(t => t.input_schema), 'ferramentas declaradas');
let r = await execAmigo('minha_agenda', {}, ctx);
ok(r.vencidos.length === 1 && r.vencidos[0].empresa === 'XP INC' && r.para_hoje[0].empresa === 'LIVELO' && !JSON.stringify(r).includes('Old') && r.reunioes.length === 1 && r.respostas_recentes[0].empresa === 'SKY' && r.sugestoes_pendentes[0].empresa === 'COBASI', 'agenda: vencidos, hoje, reuniões, respostas e sugestões (sem oportunidade encerrada)');
r = await execAmigo('ler_whatsapp', { pessoa: 'Marcelo' }, ctx);
ok(r.mensagens.length === 2 && r.mensagens[0].quem === 'Pedro' && r.mensagens[1].texto === 'bora falar quinta', 'lê a conversa do WhatsApp em ordem');
globalThis.__SDR_LLM_MOCK = () => ({ texto: '```json\n{"assunto":"café na XP","mensagem":"Marcelo, tudo bem?\\n\\nTopa um café?","fato_usado":"XP patrocina a NFL","fontes":[]}\n```', urls: [], buscas: 1 });
r = await execAmigo('preparar_mensagem', { empresa: 'XP', canal: 'email' }, ctx);
ok(r.assunto === 'café na XP' && /marcelo@xpi/.test(r.para) && ctx.pendente && ctx.pendente.tipo === 'email' && ctx.pendente.para === 'marcelo@xpi.com.br', 'e-mail preparado fica pendente do "manda" (não envia)');
ok(!T.gmail.length, 'nada foi para o Gmail ainda');
ctx.pendente = null;
r = await execAmigo('preparar_mensagem', { empresa: 'XP', canal: 'whatsapp', pessoa: 'Marcelo' }, ctx);
ok(r.link.startsWith('https://wa.me/5511988887777?text=') && !ctx.pendente, 'WhatsApp preparado vem com link que abre o app do Pedro; nada pendente');
r = await execAmigo('definir_prazo', { empresa: 'XP', passo: 'Cobrar o Marcelo', data: '2026-12-04' }, ctx);
ok(r.ok && T.patch.some(([u, b]) => /crm_oportunidades\?id=eq\.opXP/.test(u) && b.proximo_passo_em === '2026-12-04'), 'prazo marcado direto');
r = await execAmigo('mover_etapa', { empresa: 'XP', etapa: 'Primeira reunião' }, ctx);
ok(r.pronto && ctx.pendente.tipo === 'etapa' && !T.patch.some(([u, b]) => b.estagio), 'mover etapa fica pendente do "manda"');
ok(CONFIRMA.test('manda') && CONFIRMA.test('Pode mandar!') && CONFIRMA.test('sim') && !CONFIRMA.test('manda pro João também') && CANCELA.test('não') && CANCELA.test('cancela'), 'reconhece "manda" e "cancela"');

// Webhook: o "manda" executa a ação pendente
const sessoes = { '5511999998888': { mensagens: [], pendente: { tipo: 'email', decisor_id: 'dMar', para: 'marcelo@xpi.com.br', nome: 'Marcelo Bronze', empresa_id: 'eXP', oportunidade_id: 'opXP', assunto: 'café na XP', corpo: 'Marcelo, tudo bem?' } } };
const W = { gmail: [], wa: [], toques: [], sess: [] };
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.includes('graph.facebook.com')) { W.wa.push(body.text.body); return json({}); }
  if (u.includes('crm_wa_inbox')) return new Response(null, { status: 201 });
  if (u.includes('crm_wa_sessoes') && mt === 'GET') { const s = sessoes['5511999998888']; return json([{ mensagens: s.mensagens, pendente: s.pendente }]); }
  if (u.includes('crm_wa_sessoes')) { W.sess.push(body[0]); Object.assign(sessoes['5511999998888'], body[0]); return new Response(null, { status: 201 }); }
  if (u.includes('crm_oauth_tokens')) return json([{ id: 1, access_token: 'tok', refresh_token: 'rt', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'pedro@g.test' }]);
  if (u.includes('gmail.googleapis.com')) { W.gmail.push(mt + ' ' + u); if (u.includes('sendAs')) return json({ sendAs: [] }); if (u.includes('/drafts/send')) return json({ id: 'm9' }); if (u.includes('/drafts')) return json({ id: 'r-9', message: { id: 'm8' } }); return json({}); }
  if (u.includes('crm_toques')) { W.toques.push(body); return new Response(null, { status: 201 }); }
  return new Response(null, { status: 201 });
};
const { default: handler } = await import('../api/enrich.js');
const enviarMsg = (texto, id) => new Promise(async (resolve) => {
  const corpo = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id, from: '5511999998888', type: 'text', text: { body: texto } }] } }] }] };
  const res = { statusCode: null, status(c) { this.statusCode = c; return this; }, json(o) { resolve(this); return this; }, setHeader() {}, end() { resolve(this); return this; } };
  await handler({ method: 'POST', query: { provider: 'whatsapp' }, body: corpo, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'segredo').update(JSON.stringify(corpo)).digest('hex') } }, res);
});
await enviarMsg('manda', 'w1');
ok(W.gmail.some(g => /POST .*\/drafts\/send/.test(g)) && /Enviado para \*Marcelo Bronze\*/.test(W.wa[0]) && W.toques.some(t => t.canal === 'email' && t.direcao === 'enviado'), '"manda" envia o e-mail pelo Gmail, responde no WhatsApp e registra o toque');
ok(sessoes['5511999998888'].pendente === null, 'ação pendente some depois de executada');
sessoes['5511999998888'].pendente = { tipo: 'email', decisor_id: 'dMar', para: 'x@y.com', nome: 'X', assunto: 'a', corpo: 'b' };
const antes = W.gmail.length;
await enviarMsg('não', 'w2');
ok(W.gmail.length === antes && /cancelei/.test(W.wa[W.wa.length - 1]) && sessoes['5511999998888'].pendente === null, '"não" cancela sem enviar nada');
console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
