// tests/sdr-respostas.test.mjs — Bloco E: classificação de respostas e job sdr-respostas
// com Graph e Supabase simulados. Rodar: node tests/sdr-respostas.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
import { classificarResposta, acaoPara, extrairEmails } from '../lib/sdr-respostas.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const tipo = (o) => classificarResposta(o).tipo;

console.log('Classificação');
ok(tipo({ remetente: 'MAILER-DAEMON@x.com', assunto: 'Undeliverable: Acme', preview: 'ana@acme.com' }) === 'bounce', 'bounce pelo remetente');
ok(tipo({ remetente: 'postmaster@acme.com', assunto: 'Não foi possível entregar: ideia', preview: '' }) === 'bounce', 'bounce em português');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'Resposta automática: ideia', preview: 'Estou de férias até dia 20' }) === 'auto_resposta', 'auto-resposta de férias');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'RE: ideia', preview: 'Por favor me remova da lista.' }) === 'opt_out', 'pedido de remoção');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'RE: ideia', preview: 'Não tenho interesse, obrigada.' }) === 'opt_out', 'sem interesse vira opt-out');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'RE', preview: 'SAIR' }) === 'opt_out', 'SAIR sozinho é opt-out');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'RE: ideia', preview: 'Faz sentido sim, podemos marcar na quinta?' }) === 'interesse', 'interesse');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'RE: ideia', preview: 'Quem cuida disso é a Bia, bia@acme.com' }) === 'indicacao', 'indicação com e-mail');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'RE: ideia', preview: 'Agora não, o orçamento já está fechado. Volte a falar em março.' }) === 'nao_agora', 'não agora');
ok(tipo({ remetente: 'ana@acme.com', assunto: 'RE: ideia', preview: 'Recebido.' }) === 'indefinido', 'indefinido fica para o Pedro');
ok(extrairEmails('falhou para Ana@Acme.com e x@y.com.br').join() === 'ana@acme.com,x@y.com.br', 'extrai e-mails');
ok(acaoPara('auto_resposta').parar_cadencia === false && acaoPara('interesse').oportunidade === true && acaoPara('opt_out').opt_out === true, 'ações por tipo');

// ── job ponta a ponta ─────────────────────────────────────────────────────────
const escritas = [];
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const vistas = new Set();
const INBOX = [
  { id: 'g1', conversationId: 'c1', subject: 'RE: Acme e a linha X', from: { emailAddress: { address: 'ana@acme.com' } }, receivedDateTime: '2026-11-17T12:00:00Z', bodyPreview: 'Faz sentido, podemos marcar quinta?' },
  { id: 'g2', subject: 'Undeliverable: Beta', from: { emailAddress: { address: 'postmaster@beta.com' } }, receivedDateTime: '2026-11-17T12:05:00Z', bodyPreview: 'Your message to joao@beta.com could not be delivered' },
  { id: 'g3', subject: 'RE: ideia', from: { emailAddress: { address: 'carla@gama.com' } }, receivedDateTime: '2026-11-17T12:10:00Z', bodyPreview: 'Por favor, me remova.' },
  { id: 'g4', subject: 'Newsletter', from: { emailAddress: { address: 'news@qualquer.com' } }, receivedDateTime: '2026-11-17T12:15:00Z', bodyPreview: 'Ofertas da semana' },
];
const DEC = {
  'ana@acme.com': { id: 'd1', nome: 'Ana', email: 'ana@acme.com', wa: null, empresa_id: 'e1', crm_empresas: { nome: 'Acme' } },
  'joao@beta.com': { id: 'd2', nome: 'João', email: 'joao@beta.com', wa: null, empresa_id: 'e2', crm_empresas: { nome: 'Beta' } },
  'carla@gama.com': { id: 'd3', nome: 'Carla', email: 'carla@gama.com', wa: '5511999', empresa_id: 'e3', crm_empresas: { nome: 'Gama' } },
};
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const metodo = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
  if (metodo !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, metodo, body });
  if (u.includes('crm_oauth_tokens') && u.includes('provider=eq.google')) return json([]);   // Gmail não conectado neste teste
  if (u.includes('crm_oauth_tokens')) return json([{ id: 't1', access_token: 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'pedro@galeria.ag' }]);
  if (u.startsWith('https://graph.microsoft.com')) return json({ value: INBOX });
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_configuracoes') && metodo === 'GET') return json([]);
  if (u.includes('crm_decisores') && metodo === 'GET') { const k = Object.keys(DEC).find(e => u.includes('"' + e + '"')); return json(k ? [DEC[k]] : []); }
  if (u.includes('crm_sdr_respostas') && metodo === 'POST') { if (vistas.has(body.graph_message_id)) return json([], 201); vistas.add(body.graph_message_id); return json([{ id: 'r-' + body.graph_message_id }], 201); }
  if (u.includes('crm_oportunidades') && metodo === 'GET') return json([]);
  if (u.includes('crm_oportunidades') && metodo === 'POST') return json([{ id: 'op1' }], 201);
  if (u.includes('crm_sdr_estado') && metodo === 'GET') return json([{ agencia_id: 'a1' }]);
  return json([], metodo === 'POST' ? 201 : 200);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});

console.log('\nJob sdr-respostas');
let r = await chamar('sdr-respostas');
ok(r.status === 200 && r.body.de_decisores === 3 && r.body.ignoradas === 1, 'só grava e-mails de decisores; newsletter ignorada (' + JSON.stringify(r.body) + ')');
ok(r.body.interesse === 1 && r.body.oportunidades === 1, 'interesse cria oportunidade');
const op = escritas.find(e => e.u.includes('crm_oportunidades') && e.metodo === 'POST');
ok(op && op.body.estagio === 'Contato direto' && op.body.agencia_id === 'a1' && !/[—–]/.test(op.body.titulo), 'oportunidade no estágio certo, com agência e sem travessão');
ok(escritas.some(e => e.u.includes('crm_decisores?id=eq.d2') && e.body.email_valido === false), 'bounce marca e-mail inválido');
ok(escritas.some(e => e.u.includes('crm_sdr_estado?decisor_id=eq.d2') && e.body.status === 'bounce'), 'bounce sem WhatsApp encerra a cadência');
ok(escritas.some(e => e.u.includes('crm_decisores?id=eq.d3') && e.body.opt_out === true && e.body.etapa_cadencia === 'off'), 'opt-out marcado e cadência desligada');
ok(escritas.some(e => e.u.includes('crm_fila?decisor_id=eq.d3') && e.body.status === 'pulado'), 'opt-out cancela itens pendentes da fila');
ok(escritas.some(e => e.u.includes('crm_fila?decisor_id=eq.d1&status=eq.enviado') && e.body.status === 'respondido'), 'envio anterior vira respondido');
ok(!escritas.some(e => e.u.startsWith('https://graph.microsoft.com')), 'nenhuma escrita no Graph (nada é respondido nem enviado)');
ok(escritas.some(e => e.u.includes('crm_configuracoes') && e.body.valor === '2026-11-17T12:15:00Z'), 'cursor avança até o último e-mail lido');

escritas.length = 0;
r = await chamar('sdr-respostas');
ok(r.body.de_decisores === 0 && !escritas.some(e => e.u.includes('crm_toques')), 'segunda leitura é idempotente (nada repetido)');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
