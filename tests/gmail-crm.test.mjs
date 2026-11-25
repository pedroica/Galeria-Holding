// tests/gmail-crm.test.mjs — o CRM se completa pelo Gmail: casamento de e-mail com
// contato/empresa, regras do pipeline e o job gmail-crm (Gmail, Supabase e modelo
// simulados). Rodar: node tests/gmail-crm.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';

import { parseEnderecos, montarIndice, casarMensagem, decidirPipeline, semCitacao, construirPromptStatus } from '../lib/gmail-crm.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const EU = 'dono@exemplo.test';

console.log('Endereços e índice');
const ends = parseEnderecos('"Silva, Ana" <Ana@Acme.com.br>, bia@beta.com, Caio <caio@gama.io>');
ok(ends.length === 3 && ends[0].email === 'ana@acme.com.br' && ends[0].nome === 'Silva, Ana' && ends[1].email === 'bia@beta.com', 'lê nomes com vírgula e normaliza e-mail');
const indice = montarIndice({
  decisores: [{ id: 'd1', email: 'ana@acme.com.br', empresa_id: 'eAcme' }, { id: 'd2', email: 'joao@gmail.com', empresa_id: 'eX' }, { id: 'd3', email: 'x@shared.com', empresa_id: 'e1' }, { id: 'd4', email: 'y@shared.com', empresa_id: 'e2' }],
  empresas: [{ id: 'eBeta', dominio: 'www.beta.com' }]
});
ok(indice.porDominio.get('acme.com.br') === 'eAcme' && indice.porDominio.get('beta.com') === 'eBeta', 'domínio vem do cadastro e dos e-mails dos contatos');
ok(!indice.porDominio.has('gmail.com') && !indice.porDominio.has('shared.com'), 'gmail.com e domínio de duas empresas não identificam empresa');

console.log('Casamento de mensagens');
const proprios = new Set([EU]);
let m = casarMensagem({ labelIds: ['INBOX'], de: 'Ana <ana@acme.com.br>' }, indice, proprios);
ok(m && m.direcao === 'recebido' && m.decisores[0].id === 'd1' && m.empresaIds[0] === 'eAcme', 'recebido de contato conhecido');
m = casarMensagem({ labelIds: ['SENT'], de: EU, para: 'Novo Diretor <novo@acme.com.br>', cc: EU }, indice, proprios);
ok(m && m.direcao === 'enviado' && m.novos[0].email === 'novo@acme.com.br' && m.novos[0].empresa_id === 'eAcme', 'enviado para pessoa nova de empresa conhecida vira contato novo');
ok(casarMensagem({ labelIds: ['INBOX'], de: 'Mãe <mae@gmail.com>' }, indice, proprios) === null, 'e-mail pessoal é ignorado');
ok(casarMensagem({ labelIds: ['INBOX'], de: 'noreply@acme.com.br' }, indice, proprios) === null, 'e-mail automático da empresa é ignorado');

console.log('Regras do pipeline');
ok(decidirPipeline({ sinal: 'reuniao_marcada', confianca: 'alta', estagioAtual: 'Contato direto' }).acao === 'aplicar', 'reunião marcada (alta) avança sozinho');
ok(decidirPipeline({ sinal: 'reuniao_marcada', confianca: 'media', estagioAtual: 'Contato direto' }).acao === 'sugerir', 'confiança média só sugere');
ok(decidirPipeline({ sinal: 'interesse', confianca: 'alta', estagioAtual: 'Negociação' }).acao === 'nada', 'nunca recua o funil');
ok(decidirPipeline({ sinal: 'perdido', confianca: 'alta', estagioAtual: 'Negociação' }).acao === 'sugerir', 'Perdido nunca é automático');
ok(decidirPipeline({ sinal: 'fechado_ganho', confianca: 'alta', estagioAtual: 'Negociação' }).acao === 'sugerir', 'Cliente ativo nunca é automático');
ok(decidirPipeline({ sinal: 'interesse', confianca: 'alta', estagioAtual: null }).acao === 'criar', 'interesse claro sem oportunidade abre uma');
ok(decidirPipeline({ sinal: 'interesse', confianca: 'alta', estagioAtual: 'Perdido' }).acao === 'sugerir', 'reabrir oportunidade perdida é decisão do Pedro');
ok(decidirPipeline({ sinal: 'sem_sinal', confianca: 'alta', estagioAtual: 'Contato direto' }).acao === 'nada', 'sem sinal, nada muda');

console.log('Texto da conversa');
ok(semCitacao('Pode ser quinta 10h.\n\nEm seg., 24 de nov. de 2026 às 10:00, Pedro <p@x.com> escreveu:\n> texto antigo') === 'Pode ser quinta 10h.', 'tira a citação da mensagem anterior');
const pr = construirPromptStatus({ empresa: 'Acme', estagioAtual: 'Contato direto', mensagens: [{ direcao: 'recebido', de: 'Ana', assunto: 'Re: blitz', texto: 'Vamos quinta 10h', data: '2026-11-26T10:00:00Z' }] });
ok(/SÓ o que está escrito/.test(pr.system) && /Acme/.test(pr.user) && /Vamos quinta 10h/.test(pr.user), 'prompt só com o que está escrito');

// ── Job ─────────────────────────────────────────────────────────────────────────
console.log('Job gmail-crm (carga inicial)');
const b64 = (t) => Buffer.from(t).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const MSGS = {
  m1: { id: 'm1', threadId: 'tA', labelIds: ['INBOX'], internalDate: String(Date.parse('2026-11-26T12:00:00Z')), snippet: 'Pode ser quinta 10h', payload: { headers: [{ name: 'From', value: 'Ana <ana@acme.com.br>' }, { name: 'Subject', value: 'Re: blitz' }], parts: [{ mimeType: 'text/plain', body: { data: b64('Pode ser quinta às 10h, mando o convite.') } }] } },
  m2: { id: 'm2', threadId: 'tA', labelIds: ['SENT'], internalDate: String(Date.parse('2026-11-26T12:30:00Z')), snippet: 'Combinado', payload: { headers: [{ name: 'From', value: EU }, { name: 'To', value: 'Ana <ana@acme.com.br>, Novo <novo@acme.com.br>' }, { name: 'Subject', value: 'Re: blitz' }], parts: [{ mimeType: 'text/plain', body: { data: b64('Combinado, quinta 10h.') } }] } },
  m3: { id: 'm3', threadId: 'tP', labelIds: ['INBOX'], internalDate: String(Date.now()), snippet: 'Oi filho', payload: { headers: [{ name: 'From', value: 'Mãe <mae@gmail.com>' }, { name: 'Subject', value: 'Almoço' }] } },
  m4: { id: 'm4', threadId: 'tB', labelIds: ['INBOX'], internalDate: String(Date.parse('2026-11-25T09:00:00Z')), snippet: 'Seguimos com outra agência', payload: { headers: [{ name: 'From', value: 'Bia <bia@beta.com>' }, { name: 'Subject', value: 'Proposta' }], parts: [{ mimeType: 'text/plain', body: { data: b64('Obrigada, mas seguimos com outra agência.') } }] } }
};
const DEC = [{ id: 'd1', nome: 'Ana', email: 'ana@acme.com.br', empresa_id: 'eAcme' }, { id: 'dB', nome: 'Bia', email: 'bia@beta.com', empresa_id: 'eBeta' }];
const OPS = { eAcme: [{ id: 'opA', estagio: 'Contato direto', proximo_passo: null }], eBeta: [{ id: 'opB', estagio: 'Negociação', proximo_passo: 'x' }] };
const cfg = {}; const evs = new Set(); const escritas = []; const sugestoes = []; let chamadasLLM = 0;
globalThis.__SDR_LLM_MOCK = ({ user }) => {
  chamadasLLM++;
  if (/Acme/.test(user)) return { obj: { sinal: 'reuniao_marcada', confianca: 'alta', resumo: 'Reunião marcada para quinta 10h.', proximo_passo: 'Preparar a blitz', data_proximo_passo: '2026-11-27', evidencia: 'Pode ser quinta às 10h' }, custo: 0.01, usage: {} };
  return { obj: { sinal: 'perdido', confianca: 'alta', resumo: 'Escolheram outra agência.', proximo_passo: '', data_proximo_passo: '', evidencia: 'seguimos com outra agência' }, custo: 0.01, usage: {} };
};
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (mt !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, mt, body });
  if (u.startsWith('https://gmail.googleapis.com')) {
    if (u.includes('/profile')) return json({ historyId: '900', emailAddress: EU });
    if (u.includes('/messages?')) return json({ messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }] });
    const mm = u.match(/\/messages\/(m\d)/); if (mm) return json(MSGS[mm[1]]);
    const tt = u.match(/\/threads\/(t\w)/); if (tt) return json({ messages: Object.values(MSGS).filter(x => x.threadId === tt[1]) });
    return json({}, 404);
  }
  if (u.includes('crm_oauth_tokens')) return json([{ id: 't', access_token: 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: EU }]);
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_configuracoes') && mt === 'GET') return json(Object.entries(cfg).map(([chave, valor]) => ({ chave, valor })));
  if (u.includes('crm_configuracoes')) { cfg[body.chave] = body.valor; return json([], 201); }
  if (u.includes('crm_decisores') && mt === 'GET') return json(DEC);
  if (u.includes('crm_decisores') && mt === 'POST') return json([Object.assign({ id: 'dNovo' }, body)], 201);
  if (u.includes('crm_empresas')) return json([{ id: 'eAcme', nome: 'Acme', dominio: 'acme.com.br' }, { id: 'eBeta', nome: 'Beta', dominio: 'beta.com' }]);
  if (u.includes('crm_gmail_eventos')) { const k = body.gmail_id + body.tipo; if (evs.has(k)) return json([], 201); evs.add(k); return json([body], 201); }
  if (u.includes('crm_gmail_sugestoes') && mt === 'POST') { const k = body.empresa_id + body.thread_id + body.sinal; if (sugestoes.some(x => x.k === k)) return json([], 201); const row = Object.assign({ id: sugestoes.length + 1, k }, body); sugestoes.push(row); return json([row], 201); }
  if (u.includes('crm_oportunidades') && mt === 'GET') { const e = (u.match(/empresa_id=eq\.(\w+)/) || [])[1]; return json(OPS[e] || []); }
  if (u.includes('crm_oportunidades') && mt === 'PATCH') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; for (const l of Object.values(OPS)) for (const o of l) if (o.id === id) Object.assign(o, body); return json([], 200); }
  return json([], mt === 'POST' ? 201 : 200);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});
let r = await chamar('gmail-crm');
ok(r.status === 200 && r.body.modo === 'carga_inicial' && r.body.do_crm === 3, 'carga inicial: 3 de 4 e-mails são do CRM (' + JSON.stringify(r.body) + ')');
ok(!escritas.some(e => JSON.stringify(e.body || '').includes('mae@gmail.com') || JSON.stringify(e.body || '').includes('Almoço')), 'e-mail pessoal não é gravado em lugar nenhum');
const toques = escritas.filter(e => e.u.includes('crm_toques'));
ok(toques.some(t => t.body.decisor_id === 'd1' && t.body.direcao === 'recebido') && toques.some(t => t.body.direcao === 'enviado'), 'toques recebido e enviado registrados');
ok(escritas.some(e => e.u.includes('crm_decisores') && e.mt === 'POST' && e.body.email === 'novo@acme.com.br' && e.body.etapa_cadencia === 'off' && e.body.fonte === 'gmail'), 'pessoa nova da Acme vira contato (fora da cadência do agente)');
ok(OPS.eAcme[0].estagio === 'Primeira reunião' && OPS.eAcme[0].proximo_passo === 'Preparar a blitz', 'reunião marcada: Contato direto → Primeira reunião, com próximo passo');
ok(escritas.some(e => e.u.includes('crm_oportunidade_eventos') && e.body.de === 'Contato direto' && e.body.para === 'Primeira reunião' && e.body.autor_email === 'agente-gmail'), 'mudança fica no histórico da oportunidade (auditoria)');
ok(OPS.eBeta[0].estagio === 'Negociação' && sugestoes.some(s => s.sinal === 'perdido' && s.status === 'pendente' && s.estagio_para === 'Perdido'), '"outra agência": NÃO marca Perdido sozinho, vira sugestão');
ok(sugestoes.some(s => s.status === 'aplicada' && s.estagio_de === 'Contato direto'), 'atualização automática fica registrada (permite desfazer)');
ok(escritas.some(e => e.u.includes('crm_gmail_status') && e.body.sinal === 'reuniao_marcada' && e.body.proximo_passo_em === '2026-11-27'), 'status da prospecção gravado (resumo, próximo passo, data)');
ok(cfg.gmail_crm_history_id === '900' && cfg.gmail_crm_backfill && cfg.gmail_crm_backfill.fim === true, 'fim da carga: passa para o modo incremental');
ok(!escritas.some(e => e.u.startsWith('https://gmail.googleapis.com')), 'nada é escrito no Gmail');

const nT = escritas.filter(e => e.u.includes('crm_toques')).length; const nL = chamadasLLM;
cfg.gmail_crm_backfill = null; cfg.gmail_crm_history_id = null;   // força reler a mesma lista
r = await chamar('gmail-crm');
ok(escritas.filter(e => e.u.includes('crm_toques')).length === nT && chamadasLLM === nL && r.body.do_crm === 0, 'reler os mesmos e-mails não duplica toque nem gasta modelo');

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
