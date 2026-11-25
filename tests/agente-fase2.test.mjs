// tests/agente-fase2.test.mjs — score de oportunidade, sincronização Gmail
// (History API) e aprendizado comercial. Gmail e Supabase simulados.
// Rodar: node tests/agente-fase2.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';

import { scoreOportunidade, solucaoAderente, nivelCargo } from '../lib/sdr-score.js';
import { selecionarLote } from '../lib/sdr-selecao.js';
import { analisarEdicao, propostasDeAprendizado, perfilDeComunicacao, montarMemoriaPrompt } from '../lib/sdr-aprendizado.js';
import { eventosDoHistorico, filaIdDoMessageId, textoDoPayload } from '../lib/gmail-sync.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const AG = Date.parse('2026-11-26T12:00:00Z');

console.log('Score de oportunidade');
const forte = scoreOportunidade({ agora: AG, estrelas: 5,
  decisor: { cargo: 'Diretora de Marketing', email: 'a@x.com', wa: '11999' },
  empresa: { nome: 'Rede Sabor', setor: 'franquias de alimentação', rank: 80 },
  sinais: [{ tipo: 'expansao', fonte: 'Exame', url: 'https://x/1', data: '2026-11-10', fato: 'abre 120 franquias' }],
  contexto: [{ tipo: 'conversa', texto: 'respondeu em 03/2026' }], setoresComCase: new Set(['franquias']), clienteAtivoMesmoSetor: true });
ok(forte.score >= 85 && forte.score <= 100, 'lead completo pontua alto (' + forte.score + ')');
ok(forte.solucao === 'brandsync' && /franquias/.test(forte.solucao_nome + forte.fatores.find(f => f.fator === 'oportunidade').motivo), 'rede de franquias + expansão → BrandSync');
ok(forte.fatores.length === 8 && forte.fatores.every(f => f.motivo && f.pontos <= f.max), 'explicável: 8 fatores, cada um com motivo e teto');
ok(forte.fatores.reduce((a, f) => a + f.max, 0) === 100, 'os tetos somam 100');
ok(forte.gatilho && forte.gatilho.url === 'https://x/1' && /expansão/.test(forte.gatilho.relevancia), 'gatilho com fonte, data e por que importa');
const vazio = scoreOportunidade({ agora: AG, decisor: {}, empresa: { nome: 'X' } });
ok(vazio.score <= 5 && /sem dado de porte/.test(vazio.fatores.find(f => f.fator === 'porte_relevancia').motivo) && /revelar contato/.test(vazio.proxima_acao), 'sem dados: score baixo, diz que não há dado; sem contato, manda revelar antes');
ok(/não abordar/.test(scoreOportunidade({ agora: AG, decisor: { email: 'a@x.com' }, empresa: {} }).proxima_acao), 'com contato mas sem gatilho nem contexto: não abordar');
ok(solucaoAderente({ setor: 'aplicativo de delivery' }, []).id === 'catalyst' && solucaoAderente({ setor: 'moda' }, [{ tipo: 'lancamento' }]).id === 'cria', 'app → Catalyst; moda com lançamento → CR.IA');
ok(nivelCargo('CEO').pontos === 10 && nivelCargo('Analista').pontos === 1, 'senioridade');
const velho = scoreOportunidade({ agora: AG, decisor: { cargo: 'CMO', email: 'a@x.com' }, empresa: {}, sinais: [{ tipo: 'troca_cmo', url: 'u', data: '2025-06-01' }] });
const novo = scoreOportunidade({ agora: AG, decisor: { cargo: 'CMO', email: 'a@x.com' }, empresa: {}, sinais: [{ tipo: 'troca_cmo', url: 'u', data: '2026-11-20' }] });
ok(novo.score > velho.score, 'gatilho recente vale mais que antigo');

console.log('Seleção pelo score, com diversidade');
const cands = [];
for (let i = 0; i < 12; i++) cands.push({ id: 'v' + i, empresa_id: 'ev' + i, email: 'v' + i + '@x.com', cargo: 'CMO', empresa: { id: 'ev' + i, nome: 'Varejo ' + i, setor: 'varejo', rank: 50 } });
for (let i = 0; i < 4; i++) cands.push({ id: 's' + i, empresa_id: 'es' + i, email: 's' + i + '@x.com', cargo: 'Analista', empresa: { id: 'es' + i, nome: 'Saúde ' + i, setor: 'saúde', rank: 3000 } });
const est = {}; cands.forEach(c => { est[c.empresa_id] = c.empresa.setor === 'varejo' ? 5 : 1; });
const r = selecionarLote({ candidatos: cands, estrelas: est, config: { lote_max: 10, intercalar_agencias: false }, agora: AG });
ok(r.lote.slice(0, 6).filter(l => l.setor === 'saúde').length === 3 && r.lote.length === 10, 'diversifica primeiro (3 de cada setor, saúde entra mesmo com score menor) e completa as vagas');
ok(r.lote.slice(7).every(l => l.diversidade) && r.excluidos.some(e => e.motivo === 'concentracao_setor'), 'vagas completadas ficam marcadas; o excedente do setor concentrado fica de fora');
ok(r.lote[0].score_oportunidade >= r.lote[r.lote.length - 1].score_oportunidade && r.lote[0].score_detalhe && r.lote[0].solucao, 'lote ordenado pelo score, com detalhe e solução');

console.log('Aprendizado: original x final');
const orig = { assunto: 'Uma ideia incrível para a Acme', corpo: 'Olá Ana, espero que esteja bem. Vi que a Acme abriu 40 lojas e isso é um movimento incrível e estratégico. A Galeria tem uma solução completa e inovadora para isso. Podemos marcar 30 minutos para eu apresentar a nossa plataforma?\n\nPedro Ica' };
const fin = { assunto: 'Acme: 40 lojas novas', corpo: 'Ana, vi que a Acme abriu 40 lojas. Manter a marca igual em todas é o que costuma travar. Faz sentido conversarmos 20 minutos?\n\nPedro Ica' };
const df = analisarEdicao(orig, fin);
ok(!df.sem_alteracao && ['assunto', 'encurtou', 'introducao', 'cta', 'adjetivos', 'linguagem_artificial'].every(c => df.categorias.includes(c)), 'detecta assunto, encurtou, abertura, CTA, adjetivos e linguagem artificial (' + df.categorias.join(',') + ')');
ok(analisarEdicao(orig, { assunto: orig.assunto, corpo: orig.corpo.replace('\n\nPedro Ica', '\n\nAbraço,\nPedro Ica') }).sem_alteracao, 'só a assinatura mudou = sem alteração');
ok(!analisarEdicao({ assunto: 'a', corpo: 'Contato, para nos ajudar no teste do agente.' }, { assunto: 'a', corpo: 'Contato, versão editada curta.' }).categorias.includes('solucao'), '"nos" comum não é a solução NOS (falso positivo do teste real)');
ok(analisarEdicao({ assunto: 'a', corpo: 'Ana, o BrandSync resolve.' }, { assunto: 'a', corpo: 'Ana, o CR.IA resolve.' }).categorias.includes('solucao'), 'troca real de solução continua detectada');

console.log('Propostas: nada com pouca amostra; nada ativo sozinho');
const poucos = [{ tipo: 'editado', diff: { categorias: ['encurtou'] } }, { tipo: 'editado', diff: { categorias: ['encurtou'] } }];
ok(propostasDeAprendizado(poucos).length === 0, '2 edições não viram aprendizado');
const muitos = Array.from({ length: 6 }, () => ({ tipo: 'enviado_com_alteracao', diff: { categorias: ['encurtou', 'cta'] } })).concat(Array.from({ length: 4 }, () => ({ tipo: 'enviado_sem_alteracao', contexto: {} })));
const pr = propostasDeAprendizado(muitos);
ok(pr.some(p => p.chave === 'edicao:encurtou' && p.evidencias === 6) && pr.every(p => !p.status), '6 de 10 encurtados → proposta com evidência (status decidido pelo Pedro)');
const rej = Array.from({ length: 3 }, () => ({ tipo: 'rejeitado', motivo: 'Não é o perfil: pequena', contexto: { setor: 'saúde' } }));
ok(propostasDeAprendizado(rej).some(p => p.tipo === 'argumento_nao_funciona' && p.escopo.setor === 'saúde'), '3 rejeições iguais no mesmo setor → "não funciona" com escopo');
ok(propostasDeAprendizado([], { desempenho: [{ setor: 'varejo', solucao: 'cria', nivel_cargo: 'c-level', alavanca: 'x', enviados: 5, respostas_positivas: 3, reunioes: 1 }] }).length === 0, 'desempenho com 5 envios não conclui nada');
const pd = propostasDeAprendizado([], { desempenho: [{ setor: 'varejo', solucao: 'cria', nivel_cargo: 'c-level', alavanca: 'x', enviados: 12, respostas_positivas: 2, reunioes: 1 }] });
ok(pd.length === 1 && /correlação, não prova de causa/.test(pd[0].texto), 'com amostra, registra como correlação');
ok(perfilDeComunicacao([{ corpo: 'a b c?' }]).amostra_suficiente === false, 'perfil não é inventado com 1 e-mail');
const pf = perfilDeComunicacao(Array.from({ length: 10 }, (_, i) => ({ assunto: 'Acme lojas', corpo: 'Ana, vi que você abriu lojas. Faz sentido conversarmos?' })));
ok(pf.amostra_suficiente && pf.termina_com_pergunta_pct === 100 && pf.formalidade === 'direta (você)', 'perfil com 10 e-mails');

console.log('Memória no prompt');
const mem = [
  { tipo: 'restricao', texto: 'Nunca inventar fato', escopo: {}, evidencias: 0 },
  { tipo: 'argumento_funciona', texto: 'BrandSync em franquias: abrir pela consistência entre lojas', escopo: { solucao: 'brandsync', setor: 'franquias' }, evidencias: 6 },
  { tipo: 'argumento_funciona', texto: 'Catalyst em apps', escopo: { solucao: 'catalyst' }, evidencias: 5 }];
const mp = montarMemoriaPrompt(mem, { setor: 'franquias de alimentação', solucao: 'brandsync' });
ok(/Nunca inventar/.test(mp) && /consistência entre lojas/.test(mp) && !/Catalyst/.test(mp), 'filtra pelo escopo (setor/solução) e mantém as regras gerais');
ok(montarMemoriaPrompt([], {}) === '', 'sem memória ativa, nada entra no prompt');

console.log('Gmail: histórico');
ok(filaIdDoMessageId('<fila-0d9a4b0d-67f8-473d-a370-8ed0a3bf0829@agente.galeriaholding.crm>') === '0d9a4b0d-67f8-473d-a370-8ed0a3bf0829' && filaIdDoMessageId('<abc@mail.gmail.com>') === null, 'Message-ID do agente → id da fila');
const evs = eventosDoHistorico([
  { messagesAdded: [{ message: { id: 'm1', threadId: 't1', labelIds: ['SENT'] } }] },
  { messagesAdded: [{ message: { id: 'm1', threadId: 't1', labelIds: ['SENT'] } }] },
  { messagesAdded: [{ message: { id: 'm2', threadId: 't2', labelIds: ['DRAFT'] } }] },
  { messagesAdded: [{ message: { id: 'm3', threadId: 't9', labelIds: ['DRAFT'] } }] },
  { messagesAdded: [{ message: { id: 'm4', threadId: 't3', labelIds: ['INBOX'] } }] }], new Map([['t2', 'f2']]));
ok(evs.length === 2 && evs[0].tipo === 'enviado_candidato' && evs[1].tipo === 'rascunho_editado', 'dedup no lote; rascunho só conta em conversa rastreada; inbox ignorado');
const b64 = (t) => Buffer.from(t).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
ok(textoDoPayload({ parts: [{ mimeType: 'text/plain', body: { data: b64('Oi Ana') } }, { mimeType: 'text/html', body: { data: b64('<p>Oi Ana</p>') } }] }) === 'Oi Ana', 'corpo em texto da mensagem enviada');

// ── Job: sincronização incremental ─────────────────────────────────────────────
console.log('Job sdr-envios (History API)');
const FILA = {
  'aaaaaaaa-1111-4111-8111-111111111111': { id: 'aaaaaaaa-1111-4111-8111-111111111111', status: 'aprovado', decisor_id: 'd1', empresa_id: 'e1', agencia_id: null, assunto: 'Acme', corpo: 'Ana, texto do agente.', assunto_original: 'Acme', corpo_original: 'Ana, texto do agente.', solucao: 'brandsync', enviado_real_em: null, outlook_message_id: 'r-1', thread_ref: 't1', crm_decisores: { cargo: 'CMO', email: 'ana@acme.com' }, crm_empresas: { setor: 'franquias' } },
  'bbbbbbbb-2222-4222-8222-222222222222': { id: 'bbbbbbbb-2222-4222-8222-222222222222', status: 'enviado', enviado_em: '2026-11-18T12:00:00Z', enviado_estimado_em: '2026-11-18T12:00:00Z', decisor_id: 'd2', empresa_id: 'e2', assunto: 'Beta', corpo: 'Bia, texto.', assunto_original: 'Beta', corpo_original: 'Bia, texto.', enviado_real_em: null, outlook_message_id: 'r-2', thread_ref: 't2', crm_decisores: { cargo: 'CEO', email: 'bia@beta.com' }, crm_empresas: { setor: 'varejo' } }
};
let cfg = { gmail_history_id: '100', gmail_reconciliado_em: new Date().toISOString() };
const eventosG = new Set(); const escritas = [];
let historico = [{ messagesAdded: [{ message: { id: 's1', threadId: 't1', labelIds: ['SENT'] } }] }, { messagesAdded: [{ message: { id: 's2', threadId: 't2', labelIds: ['SENT'] } }] }, { messagesAdded: [{ message: { id: 'p1', threadId: 'tp', labelIds: ['SENT'] } }] }];
let historicoExpirado = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const m = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
  if (m !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, m, body });
  if (u.startsWith('https://gmail.googleapis.com')) {
    if (u.includes('/history?')) return historicoExpirado ? json({ error: { message: 'not found' } }, 404) : json({ history: historico, historyId: '200' });
    if (u.includes('/profile')) return json({ historyId: '300', emailAddress: 'p@gmail.com' });
    if (u.includes('/messages/s1?format=metadata')) return json({ id: 's1', threadId: 't1', labelIds: ['SENT'], internalDate: String(Date.parse('2026-11-26T10:05:00Z')), payload: { headers: [{ name: 'Message-ID', value: '<fila-aaaaaaaa-1111-4111-8111-111111111111@agente.galeriaholding.crm>' }, { name: 'Subject', value: 'Acme' }] } });
    if (u.includes('/messages/s2?format=metadata')) return json({ id: 's2', threadId: 't2', labelIds: ['SENT'], internalDate: String(Date.parse('2026-11-19T09:00:00Z')), payload: { headers: [{ name: 'Message-ID', value: '<CAxyz@mail.gmail.com>' }, { name: 'Subject', value: 'Beta' }] } });
    if (u.includes('/messages/p1?format=metadata')) return json({ id: 'p1', threadId: 'tp', labelIds: ['SENT'], internalDate: '1', payload: { headers: [{ name: 'Message-ID', value: '<pessoal@mail.gmail.com>' }] } });
    if (u.includes('/messages/s1?format=full')) return json({ payload: { parts: [{ mimeType: 'text/plain', body: { data: b64('Ana, texto que o Pedro mudou bastante antes de enviar. Faz sentido?') } }] } });
    if (u.includes('/messages/s2?format=full')) return json({ payload: { parts: [{ mimeType: 'text/plain', body: { data: b64('Bia, texto.') } }] } });
    if (u.includes('/drafts')) return json({});
    return json({}, 404);
  }
  if (u.includes('crm_oauth_tokens')) return json([{ id: 't', access_token: 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'p@gmail.com' }]);
  if (u.includes('crm_logs')) return json([], 201);
  if (u.includes('crm_configuracoes') && m === 'GET') return json(Object.entries(cfg).map(([chave, valor]) => ({ chave, valor })));
  if (u.includes('crm_configuracoes') && m === 'POST') { cfg[body.chave] = body.valor; return json([], 201); }
  if (u.includes('crm_gmail_eventos') && m === 'POST') { const k = body.gmail_id + '|' + body.tipo; if (eventosG.has(k)) return json([], 201); eventosG.add(k); return json([body], 201); }
  if (u.includes('crm_aprendizado_eventos') && m === 'POST') return json([], 201);
  if (u.includes('crm_sdr_estado') && m === 'GET') return json([]);
  if (u.includes('crm_fila') && m === 'GET') {
    if (u.includes('thread_ref=not.is.null')) return json(Object.values(FILA).filter(f => !f.enviado_real_em).map(f => ({ id: f.id, thread_ref: f.thread_ref })));
    const id = (u.match(/id=eq\.([0-9a-f-]{36})/) || [])[1];
    return json(id ? [FILA[id]].filter(Boolean) : []);
  }
  if (u.includes('crm_fila') && m === 'PATCH') {
    const id = (u.match(/id=eq\.([0-9a-f-]{36})/) || [])[1]; const f = FILA[id];
    if (!f || (u.includes('enviado_real_em=is.null') && f.enviado_real_em)) return json([]);
    Object.assign(f, body); return json([f]);
  }
  return json([], m === 'POST' ? 201 : 200);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  cron({ method: 'GET', query: { job }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});
let rr = await chamar('sdr-envios');
const A = FILA['aaaaaaaa-1111-4111-8111-111111111111'], B = FILA['bbbbbbbb-2222-4222-8222-222222222222'];
ok(rr.body.modo === 'incremental' && rr.body.enviados_gmail === 2, 'incremental: 2 envios do agente detectados (' + JSON.stringify(rr.body) + ')');
ok(A.status === 'enviado' && A.enviado_real_em === '2026-11-26T10:05:00.000Z' && A.gmail_message_id === 's1', 'envio manual pelo Gmail: ENVIADO, data real e id da mensagem');
ok(escritas.some(e => e.u.includes('crm_toques') && e.body.decisor_id === 'd1' && e.body.data === '2026-11-26T10:05:00.000Z'), 'toque no histórico com a data real');
ok(escritas.some(e => e.u.includes('crm_decisores?id=eq.d1') && e.body.ultimo_toque_em), 'último contato atualizado');
ok(B.enviado_real_em === '2026-11-19T09:00:00.000Z' && B.enviado_estimado_em === '2026-11-18T12:00:00Z' && !escritas.some(e => e.u.includes('crm_toques') && e.body.decisor_id === 'd2'), 'estimado vira real (associado pela conversa); a estimativa fica guardada; sem toque duplicado');
const ap = escritas.filter(e => e.u.includes('crm_aprendizado_eventos'));
ok(ap.some(e => e.body.tipo === 'enviado_com_alteracao' && e.body.fila_id === A.id) && ap.some(e => e.body.tipo === 'enviado_sem_alteracao' && e.body.fila_id === B.id), 'aprendizado: o que saiu x o que o agente escreveu');
ok(!escritas.some(e => e.u.includes('gmail.googleapis.com') && e.m !== 'GET'), 'nada é escrito no Gmail');
ok(cfg.gmail_history_id === '200', 'cursor do histórico avança');
const nToques = escritas.filter(e => e.u.includes('crm_toques')).length;
rr = await chamar('sdr-envios');
ok(rr.body.enviados_gmail === 0 && escritas.filter(e => e.u.includes('crm_toques')).length === nToques, 'mesmo histórico de novo: deduplicado, nada reaplicado');
B.enviado_real_em = '2026-11-19T09:00:00.000Z';
historicoExpirado = true;
rr = await chamar('sdr-envios');
ok(/completa/.test(rr.body.modo) && rr.body.historico_expirado && cfg.gmail_history_id === '300', 'histórico expirado: reconciliação completa e cursor novo do perfil');

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
