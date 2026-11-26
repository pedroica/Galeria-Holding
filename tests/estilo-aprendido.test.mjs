// Jeito de escrever do Pedro: parte pura (lib/estilo-aprendido.js) e o job aprender-estilo.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
import { falasDoDeposito, textoProprio, escolherAmostras, promptAprenderEstilo, linhasEstiloAprendido, similaridade, lerConversaWhatsapp, autoresDaConversa, falasDoAutor, amostrasColadas } from '../lib/estilo-aprendido.js';
import { promptWhatsappPipeline } from '../lib/wa-pipeline.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

const BASE = [
  'Fala Ricardo, tudo certo? Passando rapidinho pra te contar que a gente fechou o projeto com a equipe e ficou bem legal. Queria muito te mostrar o resultado e ouvir o que você acha. Bora marcar um café semana que vem? Abs',
  'Oi Bia, obrigado pelo papo de ontem, foi ótimo. Conversei aqui com o time de mídia e acho que dá pra montar uma proposta enxuta já pra janeiro. Te mando um rascunho até sexta e a gente ajusta junto, combinado? Beijo',
  'Marcão, que notícia boa a da expansão pro Nordeste! Acompanhei pelo Meio e Mensagem. Se precisarem de braço pra campanha de lançamento, a 404 tá com agenda aberta em dezembro. Me fala quando der pra gente trocar uma ideia.',
  'Juliana, segue o deck que comentei na reunião. Coloquei os cases de varejo no começo porque acho que conversam mais com o momento de vocês. Qualquer dúvida me chama no WhatsApp mesmo que é mais rápido.',
  'Pessoal, alinhando os próximos passos: o briefing fica com a Carol até quarta, eu valido a estratégia na quinta e a gente apresenta na segunda. Se alguém tiver conflito de agenda me avisa hoje ainda, por favor.',
  'Rafa, tudo bem? Faz tempo que não nos falamos! Vi que você assumiu a diretoria de marca na Ambev, parabéns de verdade. Adoraria tomar um café e entender os desafios novos. Que tal na próxima terça?',
  'Oi Fernanda, desculpa a demora pra responder, semana de fechamento foi puxada por aqui. Sobre o orçamento, consigo rever a parte de produção sem mexer no escopo criativo. Te ligo amanhã de manhã pra fechar isso?',
  'Thiago, valeu pela indicação do Bruno! Já mandei mensagem pra ele e marcamos de conversar na quinta. Te devo uma, quando vier pra São Paulo o almoço é por minha conta. Grande abraço',
  'Carla, acabei de ver a campanha nova de vocês no metrô e ficou linda demais. Parabéns pro time todo. Quando quiserem pensar a próxima fase com dados e IA, a gente tem umas ideias bem interessantes pra mostrar.',
  'Gu, consegue me mandar os números de alcance da última flight até amanhã cedo? Preciso fechar o relatório pro cliente antes das dez. Se não der tudo, manda o que tiver que eu completo aqui. Valeu demais',
  'Oi Paula, tudo bom? Seguindo nossa conversa, separei três caminhos de posicionamento pra marca e acho que o segundo é o mais ousado e o que mais tem a cara de vocês. Topa vinte minutinhos por vídeo pra eu te mostrar?'
];
const meu = (i) => BASE[i % BASE.length];
ok(textoProprio('Oi Ana, tudo bem?\n\nAbs\n\nEm qui., 26 de nov. Ana escreveu:\n> texto dela') === 'Oi Ana, tudo bem?\n\nAbs', 'tira a parte citada');
ok(!/Pedro Ica\n/.test(textoProprio('Valeu!\n-- \nPedro Ica\nGaleria')), 'tira a assinatura');
const agente = 'Ricardo, vi que a Natura lançou a nova linha. A Galeria Holding ajuda marcas como a sua com estratégia, criação e mídia. Topa um café de 20 minutos para conversarmos sobre o desafio de vocês?';
const msgs = [
  { assunto: 'projeto', para: 'r@x.com', texto: meu(0) },
  { assunto: 'Fwd: relatório', para: 'r@x.com', texto: meu(2) + ' encaminhando' },
  { assunto: 'oi', para: 'r@x.com', texto: 'ok, valeu' },
  { assunto: 'agente', para: 'r@x.com', texto: agente },
  { assunto: 'massa', para: 'a@x,b@x,c@x,d@x,e@x,f@x,g@x', texto: meu(3) },
  { assunto: 'repetido', para: 'r@x.com', texto: meu(0) },
  { assunto: 'outro', para: 'r@x.com', texto: meu(1) }
];
const am = escolherAmostras(msgs, [agente]);
ok(am.length === 2 && am[0].assunto === 'projeto' && am[1].assunto === 'outro', 'fica só o que o Pedro escreveu (sem encaminhado, curto, do agente, em massa ou repetido) — ' + am.map(a => a.assunto));
ok(similaridade(agente, agente) === 1 && similaridade('a b c', 'x y z') === 0, 'similaridade');
const pr = promptAprenderEstilo(am);
ok(/EXATAMENTE como ela/.test(pr.system) && /\[1\] \(email · assunto: projeto\)/.test(pr.user), 'prompt de aprendizado com as amostras');
const perfil = { perfil: { resumo: 'Direto e informal, fala como amigo.', regras: ['Começa com "Fala, <nome>"'], aberturas: ['Fala Ricardo, tudo certo?'], fechamentos: ['Abs'], expressoes: ['bora', 'rapidinho'], evitar: ['linguagem corporativa'], whatsapp: 'Curto, sem pontuação final.', exemplos: ['Bora marcar um café semana que vem?'] } };
const ls = linhasEstiloAprendido(perfil, 'whatsapp').join('\n');
ok(/JEITO DE ESCREVER DO PEDRO/.test(ls) && /bora, rapidinho/.test(ls) && /No WhatsApp: Curto/.test(ls) && /"Bora marcar/.test(ls), 'linhas do estilo para o prompt (com WhatsApp)');
ok(!/No WhatsApp/.test(linhasEstiloAprendido(perfil, 'email').join('\n')) && linhasEstiloAprendido(null).length === 0, 'sem perfil, nada; e-mail não leva a regra de WhatsApp');
ok(/JEITO DE ESCREVER DO PEDRO/.test(promptWhatsappPipeline({ op: { estagio: 'Wishlist' }, estiloAprendido: linhasEstiloAprendido(perfil, 'whatsapp') }).system), 'follow-up do Pipeline usa o estilo aprendido');

// Filtro de automação e de e-mail para si mesmo
const auto = Array.from({ length: 6 }, (_, i) => ({ assunto: 'Leads ' + i + ' Anunciantes novos', para: 'r@x.com', texto: BASE[i] }));
ok(escolherAmostras(auto, []).length === 0, 'assunto repetido 5+ vezes é automação');
ok(escolherAmostras([{ assunto: 'nota', para: 'Pedro <p@g.test>', texto: BASE[2] }], [], { eu: 'p@g.test' }).length === 0, 'e-mail para si mesmo fica de fora');

// WhatsApp exportado
const android = '26/11/2026 13:45 - Pedro Ica: Fala Bia, tudo certo?\n26/11/2026 13:45 - Pedro Ica: bora um café semana que vem?\nlinha de continuação\n26/11/2026 13:50 - Bia: Bora sim!\n26/11/2026 13:51 - Pedro Ica: <Mídia oculta>\n26/11/2026 13:52 - Pedro Ica: show, te mando o convite agora mesmo';
const ios = '‎[26/11/2026, 13:45:12] Pedro Ica: Oi Rafa, conseguiu ver a proposta?\n[26/11/2026, 13:46:00] Rafa: vi sim';
ok(lerConversaWhatsapp(android).length === 4 && /continuação/.test(lerConversaWhatsapp(android)[1].texto), 'lê exportação do Android (com continuação, sem mídia)');
ok(lerConversaWhatsapp(ios)[0].autor === 'Pedro Ica' && lerConversaWhatsapp(ios)[1].autor === 'Rafa', 'lê exportação do iPhone');
ok(autoresDaConversa(android)[0].autor === 'Pedro Ica', 'lista quem fala mais');
const fal = falasDoAutor(android, 'Pedro Ica');
ok(fal.length === 2 && /Fala Bia[\s\S]*bora um café/.test(fal[0].texto) && fal[0].canal === 'whatsapp' && !fal.some(f => /Bora sim/.test(f.texto)), 'junta as falas seguidas do Pedro e ignora as dos outros');
ok(amostrasColadas('Oi Ana, tudo bem? Segue a proposta revisada.\n---\nCarlos, valeu pelo papo de hoje cedo.\n---\nok').length === 2, 'texto colado separado por ---');

const dep = [
  { jid: 'a', de_mim: true, texto: 'Fala Bia, tudo certo?', enviada_em: '2026-11-20T12:00:00Z' },
  { jid: 'a', de_mim: true, texto: 'consegue me mandar o briefing até amanhã cedo pra eu fechar a proposta?', enviada_em: '2026-11-20T12:01:00Z' },
  { jid: 'a', de_mim: false, texto: 'mando sim', enviada_em: '2026-11-20T12:02:00Z' },
  { jid: 'a', de_mim: true, texto: 'ok', enviada_em: '2026-11-20T13:00:00Z' },
  { jid: 'b', de_mim: true, texto: 'olha esse link https://x.com que legal demais vale ver', enviada_em: '2026-11-21T12:00:00Z' }
];
const fd = falasDoDeposito(dep);
ok(fd.length === 1 && /Fala Bia[\s\S]*briefing/.test(fd[0].texto) && fd[0].canal === 'whatsapp', 'WhatsApp do Mac: junta mensagens seguidas do Pedro, ignora curtas, links e as dos outros');

// Job
const b64 = (t) => Buffer.from(t).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const salvo = {}; let ia = null;
const textos = BASE.slice(0, 10);
globalThis.__SDR_LLM_MOCK = (a) => { ia = a; return { obj: perfil.perfil, custo: 0.2 }; };
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.includes('crm_oauth_tokens')) return json([{ id: 1, access_token: 'tok', refresh_token: 'rt', expires_at: new Date(Date.now() + 3600e3).toISOString(), account_email: 'p@g.test' }]);
  if (u.includes('gmail.googleapis.com') && /\/messages\?/.test(u)) return json({ messages: textos.map((_, i) => ({ id: 'm' + i })).concat([{ id: 'mAg' }]) });
  if (u.includes('gmail.googleapis.com')) { const id = u.match(/messages\/(\w+)/)[1]; const t = id === 'mAg' ? agente : textos[Number(id.slice(1))]; return json({ id, labelIds: ['SENT'], internalDate: String(Date.now()), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: ['projeto','proposta','expansão','deck','próximos passos','parabéns','orçamento','indicação','campanha','relatório','posicionamento','agente'][id === 'mAg' ? 11 : Number(id.slice(1))] }, { name: 'To', value: 'r@x.com' }], body: { data: b64(t) } } }); }
  if (u.includes('crm_wa_conversas')) return json([{ jid: 'jw' }]);
  if (u.includes('crm_wa_mensagens')) return json([{ jid: 'jw', de_mim: true, texto: 'Fala Gu, consegue me mandar os números da campanha até amanhã? Preciso fechar o relatório cedo.', enviada_em: '2026-11-20T12:00:00Z' }]);
  if (u.includes('crm_fila')) return json([{ corpo: agente }]);
  if (u.includes('crm_oportunidade_mensagens')) return json([{ canal: 'whatsapp', corpo: 'Fala Bia! bora um café essa semana?', corpo_original: 'Olá, Bia. Topa um café?', enviado_em: '2026-11-26' }]);
  if (u.includes('crm_configuracoes') && mt === 'POST') { salvo[body.chave] = body.valor; return new Response(null, { status: 201 }); }
  if (u.includes('crm_logs')) return new Response(null, { status: 201 });
  return json([]);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const r = await new Promise((resolve) => { const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {} }; cron({ method: 'GET', query: { job: 'aprender-estilo' }, headers: { authorization: 'Bearer cron-vercel' } }, res); });
ok(r.status === 200 && r.body.ok && r.body.amostras === 12 && r.body.fontes.whatsapp_do_mac === 1, 'job lê os Enviados, tira o do agente e soma o WhatsApp editado — ' + JSON.stringify({ ok: r.body.ok, amostras: r.body.amostras, enviados: r.body.enviados }));
ok(ia && !ia.user.includes('A Galeria Holding ajuda marcas') && /\(whatsapp\)\nFala Bia/.test(ia.user), 'a IA não vê texto do agente e vê o WhatsApp do Pedro');
ok(salvo.estilo_pedro_aprendido && salvo.estilo_pedro_aprendido.perfil.resumo === perfil.perfil.resumo && salvo.estilo_pedro_aprendido.whatsapp === 2, 'perfil salvo em crm_configuracoes');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
