// tests/sdr-envio.test.mjs — Bloco D: guarda de envio, aquecimento, cadência,
// jobs sdr-agendar/sdr-envio, e WhatsApp (SAIR do prospect, "pausar" do Pedro).
// Tudo simulado: nenhuma mensagem real sai. Rodar: node tests/sdr-envio.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_SERVICE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.WHATSAPP_CLOUD_TOKEN = 'tok'; process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
process.env.WHATSAPP_ALLOWED_NUMBERS = '5511999998888'; process.env.ANTHROPIC_API_KEY = 'sk-fake';
process.env.WHATSAPP_URL_SECRET = 'segredo-url';
import { podeEnviar, tetoEmailHoje, slotsDoDia, proximoPasso, corpoFinal, horaBRT } from '../lib/sdr-envio.js';
import { parametrosTemplate, normalizarWa } from '../lib/canais-envio.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

// Terça 2026-11-17 08:00 BRT = 11:00 UTC.
const TERCA_8H = new Date('2026-11-17T11:00:00Z');
const cfgBase = { piloto: true, feriados: ['2026-11-20'], janela: '07:30-11:00', aquecimento: { inicio: 15, passo_semanal: 5, bounce_max_pct: 2 }, aquecimentoDesde: '2026-11-17T00:00:00Z', emailDailyMax: 50, waDailyMax: 10, waTemplate: { nome: 'sdr_primeiro_contato', idioma: 'pt_BR' } };
const msgOk = { aprovado_autonomo: true };
const decOk = { email: 'a@b.com', email_valido: true, wa: '11999', opt_out: false, respondeu: false };
const pode = (over) => podeEnviar(Object.assign({ cfg: cfgBase, agora: TERCA_8H, canal: 'email', enviadosHoje: 0, bouncePct7d: 0, msg: msgOk, decisor: decOk }, over));

console.log('Guarda de envio (regra 3)');
ok(pode().ok, 'tudo certo: pode enviar');
ok(!pode({ cfg: { ...cfgBase, piloto: false } }).ok, 'piloto desligado: barra');
ok(!pode({ msg: { aprovado_autonomo: false } }).ok, 'QC reprovado: barra');
ok(!pode({ agora: new Date('2026-11-17T15:00:00Z') }).ok, '12h BRT, fora da janela: barra');
ok(!pode({ agora: new Date('2026-11-21T11:00:00Z') }).ok, 'sábado: barra');
ok(!pode({ agora: new Date('2026-11-20T11:00:00Z') }).ok, 'feriado (20/11): barra');
ok(!pode({ enviadosHoje: 15 }).ok, 'teto do aquecimento (15) atingido: barra');
ok(!pode({ bouncePct7d: 3 }).ok, 'bounce 3% > 2%: barra');
ok(!pode({ decisor: { ...decOk, opt_out: true } }).ok, 'opt-out: barra');
ok(!pode({ decisor: { ...decOk, respondeu: true } }).ok, 'já respondeu: barra (resposta só com o Pedro)');
ok(!pode({ canal: 'whatsapp', cfg: { ...cfgBase, waTemplate: null } }).ok, 'WhatsApp sem modelo aprovado: barra');
ok(pode({ canal: 'whatsapp' }).ok, 'WhatsApp com modelo aprovado: pode');

console.log('\nAquecimento, horários e cadência');
ok(tetoEmailHoje({ aquecimento: cfgBase.aquecimento, desde: '2026-11-01T00:00:00Z', tetoGlobal: 50, agora: TERCA_8H }) === 25, '16 dias de aquecimento: 15 + 2×5 = 25');
ok(tetoEmailHoje({ aquecimento: cfgBase.aquecimento, desde: '2026-01-01T00:00:00Z', tetoGlobal: 50, agora: TERCA_8H }) === 50, 'nunca passa do teto global');
const sl = slotsDoDia({ n: 5, dataISO: '2026-11-17', janela: '07:30-11:00', intervalo: { min: 3, max: 9 }, rnd: () => 0.5 });
ok(sl.length === 5 && sl.every(d => { const h = horaBRT(d).minutos; return h >= 450 && h < 660; }), '5 horários dentro da janela BRT');
ok(sl.every((d, i) => i === 0 || (d - sl[i - 1]) >= 3 * 60000), 'espaçados por pelo menos 3 minutos');
const cad = [{ dia: 0 }, { dia: 3 }, { dia: 7 }, { dia: 14 }];
ok(JSON.stringify(proximoPasso({ cadencia: cad, diaAtual: 0, dataEnvioISO: '2026-11-17', feriados: ['2026-11-20'] })) === JSON.stringify({ dia: 3, data: '2026-11-23' }), 'D3 cai no feriado (20/11) e sábado: vai para segunda 23/11');
ok(proximoPasso({ cadencia: cad, diaAtual: 14, dataEnvioISO: '2026-11-17' }) === null, 'depois do D14 a cadência termina');
ok(/responder "remover"/.test(corpoFinal('Oi Ana, texto. Pedro Ica', 'email')), 'e-mail automático leva a linha de saída');
ok(/responda SAIR/.test(corpoFinal('Oi Ana', 'whatsapp')), 'WhatsApp automático leva a linha de saída');
const pt = parametrosTemplate('Ana', 'Oi Ana, tudo bem?\n\nVi o lançamento.\nPedro Ica');
ok(pt[0].text === 'Ana' && !/\n/.test(pt[1].text) && !/^Oi/.test(pt[1].text), 'parâmetros do modelo sem quebra de linha e sem saudação duplicada');
ok(normalizarWa('(11) 99999-0000') === '5511999990000', 'normaliza número com 55');

// ── jobs ──────────────────────────────────────────────────────────────────────
const escritas = []; let saidas = [];
let CFG = [];
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
let ESTADOS_RASCUNHO = [], ESTADOS_AGENDADOS = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const metodo = (opts.method || 'GET').toUpperCase();
  const body = typeof opts.body === 'string' && /^[[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.startsWith('https://graph.microsoft.com') || u.startsWith('https://graph.facebook.com')) { saidas.push({ u, body }); return u.includes('facebook') ? json({ messages: [{ id: 'wamid.X' }] }) : new Response(null, { status: 202 }); }
  if (metodo !== 'GET' && !u.includes('crm_logs')) escritas.push({ u, metodo, body });
  if (u.includes('crm_logs')) return json([]);
  if (u.includes('crm_configuracoes') && metodo === 'GET') return json(CFG);
  if (u.includes('crm_oauth_tokens')) return json([{ id: 't', access_token: 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'pedro@galeria.ag' }]);
  if (u.includes('crm_sdr_estado') && metodo === 'GET') return json(u.includes('etapa=eq.agendado') ? ESTADOS_AGENDADOS : ESTADOS_RASCUNHO);
  if (u.includes('crm_decisores') && metodo === 'GET') return json(u.includes('wa=like') ? (u.includes('77776666') ? [{ id: 'dp', nome: 'Paula', wa: '5511977776666', empresa_id: 'ep' }] : []) : [{ id: 'd1', nome: 'Ana Souza', email: 'ana@acme.com', email_valido: true, wa: null, opt_out: false, respondeu: false }]);
  if (u.includes('crm_sdr_mensagens') && metodo === 'GET') return json([{ id: 'm1', assunto: 'Acme e a linha X', corpo: 'Ana, vi a linha X. Faz sentido?\n\nPedro Ica', aprovado_autonomo: true }]);
  if (u.includes('crm_fila') && metodo === 'GET') return json(u.includes('id=eq.') ? [{ id: 'f1', assunto: 'Acme e a linha X', corpo: 'Ana, vi a linha X. Faz sentido?\n\nPedro Ica', status: 'aprovado' }] : []);
  if (u.includes('crm_toques') && metodo === 'GET') return json([]);
  if (u.includes('crm_sdr_respostas') && metodo === 'POST') return json([{ id: 'r1' }], 201);
  if (u.includes('rpc/sdr_pausar_tudo')) return json({ ok: true, agendados_cancelados: 2 });
  return json([], metodo === 'POST' ? 201 : 200);
};
const cfgRows = (piloto) => [
  { chave: 'sdr_piloto_automatico', valor: piloto }, { chave: 'sdr_feriados', valor: [] },
  { chave: 'sdr_janelas', valor: { envios: '00:00-23:59' } }, { chave: 'sdr_email_aquecimento', valor: { inicio: 15, passo_semanal: 5, bounce_max_pct: 2 } },
  { chave: 'sdr_aquecimento_desde', valor: new Date().toISOString() }, { chave: 'email_daily_max', valor: 50 },
  { chave: 'sdr_cadencia', valor: [{ dia: 0, canal: 'email' }, { dia: 3, canal: 'whatsapp' }] }, { chave: 'sdr_wa_template', valor: null }
];
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job, h = cron, q = {}, body) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, send(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); } };
  h({ method: body ? 'POST' : 'GET', query: Object.assign({ job }, q), body, headers: { authorization: 'Bearer cron-vercel' } }, res);
});
const diaUtil = (() => { const d = horaBRT(new Date()); return d.diaSemana >= 1 && d.diaSemana <= 5; })();

console.log('\nJob sdr-agendar');
CFG = cfgRows(false); ESTADOS_RASCUNHO = [{ id: 'e1', canal: 'email', fila_id: 'f1' }];
let r = await chamar('sdr-agendar');
ok(r.body.piloto === false && r.body.rascunhos_aguardando_pedro === 1 && !escritas.some(e => e.u.includes('crm_sdr_estado')), 'piloto desligado: não agenda nada, só informa');
escritas.length = 0; CFG = cfgRows(true);
r = await chamar('sdr-agendar');
ok(r.body.agendados === 1 && escritas.some(e => e.u.includes('crm_fila?id=eq.f1') && e.body.status === 'aprovado'), 'piloto ligado: agenda e aprova o item da fila');

console.log('\nJob sdr-envio (guarda relida no instante do envio)');
escritas.length = 0; saidas = []; CFG = cfgRows(false);
ESTADOS_AGENDADOS = [{ id: 'e1', decisor_id: 'd1', empresa_id: 'e', agencia_id: 'a', canal: 'email', dia_cadencia: 0, fila_id: 'f1' }];
r = await chamar('sdr-envio');
ok(saidas.length === 0 && r.body.barrados === 1, 'piloto desligado entre agendar e enviar: NADA sai');
ok(escritas.some(e => e.u.includes('crm_sdr_estado?id=eq.e1') && e.body.etapa === 'rascunho'), 'item barrado volta para rascunho');
if (diaUtil) {
  escritas.length = 0; saidas = []; CFG = cfgRows(true);
  r = await chamar('sdr-envio');
  ok(r.body.enviados === 1 && saidas.length === 1 && /sendMail/.test(saidas[0].u), 'piloto ligado + guarda ok: envia pelo Graph');
  ok(/remover/.test(saidas[0].body.message.body.content), 'e-mail enviado leva a linha de saída');
  ok(escritas.some(e => e.u.includes('crm_sdr_estado') && e.body.etapa === 'aguardando' && e.body.dia_cadencia === 3), 'agenda o próximo passo (D3) como aguardando');
  ok(escritas.some(e => e.u.includes('crm_toques') && e.body.direcao === 'enviado'), 'grava o toque');
} else console.log('  (fim de semana/feriado: teste de envio real-simulado pulado; a guarda barra, como deve)');

console.log('\nWhatsApp: prospect responde SAIR, Pedro manda "pausar"');
const { default: enrich } = await import(new URL('../api/enrich.js', import.meta.url).href);
const wa = (de, texto, id) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id, from: de, type: 'text', text: { body: texto } }] } }] }] });
escritas.length = 0; saidas = [];
await chamar(null, enrich, { provider: 'whatsapp', s: 'segredo-url' }, wa('5511977776666', 'SAIR', 'w1'));
ok(escritas.some(e => e.u.includes('crm_decisores?id=eq.dp') && e.body.opt_out === true), 'SAIR do prospect marca opt-out');
ok(saidas.length === 0, 'nenhuma resposta enviada ao prospect');
escritas.length = 0; saidas = [];
await chamar(null, enrich, { provider: 'whatsapp', s: 'segredo-url' }, wa('5511999998888', 'pausar', 'w2'));
ok(escritas.some(e => e.u.includes('rpc/sdr_pausar_tudo')), '"pausar" do Pedro chama sdr_pausar_tudo');
ok(saidas.length === 1 && /Pausado/.test(saidas[0].body.text.body), 'Pedro recebe a confirmação');

console.log('\nModelos de WhatsApp para a Meta');
saidas = []; delete process.env.WHATSAPP_WABA_ID;
r = await chamar('sdr-wa-modelos');
ok(r.body.pulado === true && r.body.faltando.includes('WHATSAPP_WABA_ID'), 'sem WABA id: não tenta, diz o que falta');
process.env.WHATSAPP_WABA_ID = '999';
r = await chamar('sdr-wa-modelos');
const subm = saidas.filter(x => /message_templates/.test(x.u) && x.body);
ok(subm.length === 4 && subm.every(x => /SAIR/.test(x.body.components[0].text)), 'submete 4 modelos, todos com saída SAIR');
ok(!saidas.some(x => /\/messages$/.test(x.u)), 'submeter modelo não envia mensagem a ninguém');
ok(r.body.primeiro_contato_aprovado === false, 'enquanto pendente, o envio por WhatsApp segue bloqueado');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
