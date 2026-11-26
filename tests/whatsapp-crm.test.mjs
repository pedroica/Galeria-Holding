// Job whatsapp-crm: lê conversas de trabalho do WhatsApp e atualiza o pipeline (banco e IA simulados).
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
import { construirPromptStatus } from '../lib/gmail-crm.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const futuro = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
const recente = new Date(Date.now() - 3600e3).toISOString();

const pw = construirPromptStatus({ empresa: 'Livelo', estagioAtual: 'Wishlist', canal: 'whatsapp', mensagens: [{ direcao: 'enviado', data: recente, texto: 'bora quinta 10h?' }, { direcao: 'recebido', data: recente, de: 'Camila', texto: 'fechado!' }] });
ok(/conversas de WhatsApp/.test(pw.system) && /"fechado"/.test(pw.system) && /PEDRO: bora quinta 10h\?\n.*Camila: fechado!/.test(pw.user), 'prompt em modo WhatsApp (aceite informal, conversa em linhas)');
ok(/conversas de e-mail/.test(construirPromptStatus({ mensagens: [] }).system), 'Gmail continua igual');

const T = { conv: [
  { jid: '5511999990000@s.whatsapp.net', nome: 'Camila', empresa_id: 'eLiv', decisor_id: 'dCam', ultima_em: recente, analisada_ate: null },
  { jid: '5511988880000@s.whatsapp.net', nome: 'Rui', empresa_id: 'eOutra', decisor_id: 'dRui', ultima_em: recente, analisada_ate: recente }
], patches: [], ops: [{ id: 'opLiv', empresa_id: 'eLiv', estagio: 'Wishlist', proximo_passo: null, proximo_passo_em: null, atualizado_em: '2026-11-01T00:00:00Z' }], eventos: [], toques: [], sug: [] };
let ia = 0;
globalThis.__SDR_LLM_MOCK = ({ user }) => { ia++; return { obj: { sinal: 'reuniao_marcada', confianca: 'alta', resumo: 'Reunião com a Camila combinada', proximo_passo: 'Preparar a reunião com a Livelo', data_proximo_passo: futuro, evidencia: 'fechado!' }, custo: 0.01 }; };
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.includes('crm_wa_conversas') && mt === 'GET') return json(T.conv);
  if (u.includes('crm_wa_conversas') && mt === 'PATCH') { T.patches.push(body); return new Response(null, { status: 204 }); }
  if (u.includes('crm_wa_mensagens')) return json([{ de_mim: false, texto: 'fechado!', enviada_em: recente }, { de_mim: true, texto: 'bora quinta 10h?', enviada_em: recente }]);
  if (u.includes('crm_empresas')) return json([{ id: 'eLiv', nome: 'LIVELO' }]);
  if (u.includes('crm_oportunidades') && mt === 'GET') return json(T.ops.filter(o => u.includes(o.empresa_id)));
  if (u.includes('crm_oportunidades') && mt === 'PATCH') { Object.assign(T.ops[0], body); return new Response(null, { status: 204 }); }
  if (u.includes('crm_oportunidade_eventos')) { T.eventos.push(body); return new Response(null, { status: 201 }); }
  if (u.includes('crm_toques') && mt === 'GET') return json([]);
  if (u.includes('crm_toques') && mt === 'POST') { T.toques.push(body); return new Response(null, { status: 201 }); }
  if (u.includes('crm_gmail_sugestoes') && mt === 'POST' && /representation/.test((opts.headers || {}).Prefer || '')) { const r = Object.assign({ id: 's' + T.sug.length }, body); T.sug.push(r); return json([r], 201); }
  if (u.includes('crm_gmail_sugestoes') && mt === 'GET') return json([]);
  if (u.includes('crm_gmail_sugestoes')) { if (mt === 'POST') T.sug.push(body); return new Response(null, { status: 201 }); }
  if (u.includes('crm_logs') && mt === 'GET') return json([]);
  if (u.includes('crm_logs')) return new Response(null, { status: 201 });
  if (u.includes('crm_configuracoes')) return json([]);
  return json([]);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const r = await new Promise((resolve) => { const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {} }; cron({ method: 'GET', query: { job: 'whatsapp-crm' }, headers: { authorization: 'Bearer cron-vercel' } }, res); });
ok(r.status === 200 && r.body.conversas_lidas === 1 && ia === 1, 'lê só a conversa com mensagem nova (a já lida fica) — ' + JSON.stringify(r.body));
ok(T.ops[0].estagio === 'Primeira reunião' && T.eventos.some(e => /^WhatsApp: Reunião com a Camila/.test(e.texto) && e.autor_email === 'agente-whatsapp'), 'reunião marcada no WhatsApp avança a oportunidade para Primeira reunião');
ok(T.ops[0].proximo_passo_em === futuro && T.eventos.some(e => /Prazo pelo WhatsApp/.test(e.texto)), 'data combinada vira o prazo da oportunidade');
ok(T.toques.some(t => t.canal === 'whatsapp' && t.resultado === 'reuniao_marcada' && t.reuniao_em.startsWith(futuro)), 'reunião entra na meta semanal (toque de reunião)');
ok(T.patches.some(p => p.sinal === 'reuniao_marcada' && p.analisada_ate === recente), 'guarda o estado da conversa e até onde leu');
ok(T.sug.some(s => s.thread_id === 'wa:5511999990000@s.whatsapp.net' && s.decidido_por === 'agente-whatsapp'), 'registro da mudança marcado como do WhatsApp');
console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
