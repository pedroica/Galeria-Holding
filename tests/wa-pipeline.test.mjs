// WhatsApp do Pipeline com pesquisa na internet: parte pura (lib/wa-pipeline.js) e a rota
// api/enrich?provider=wa-pipeline com banco e IA simulados.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.ANTHROPIC_API_KEY = 'sk-fake';
import { promptWhatsappPipeline, lerResposta, checarWhatsapp, escolherContato, numeroWa, linkWhatsapp } from '../lib/wa-pipeline.js';
import { ESTILO_PEDRO } from '../lib/estilo.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

ok(numeroWa('(11) 98765-4321') === '5511987654321' && numeroWa('+55 11 98765-4321') === '5511987654321' && numeroWa('123') === null, 'número no formato do wa.me');
ok(linkWhatsapp('11987654321', 'Oi, Ana?') === 'https://wa.me/5511987654321?text=Oi%2C%20Ana%3F', 'link do WhatsApp com o texto');
const ds = [{ id: 'a', nome: 'Ana', wa: null }, { id: 'b', nome: 'Bia', wa: '11987654321' }];
ok(escolherContato(ds).id === 'b' && escolherContato(ds, 'a').id === 'a' && escolherContato([], null) === null, 'escolhe o contato pedido ou quem tem WhatsApp');

const op = { id: 'op1', titulo: 'XP Inc — 404', estagio: 'Wishlist', oferta: 'criação', proximo_passo: 'Cobrar resposta do Marcelo', proximo_passo_em: '2026-12-03' };
const p = promptWhatsappPipeline({ op, empresa: { nome: 'XP INC', setor: 'Financeiro' }, contato: { nome: 'Marcelo Bronze', cargo: 'Diretor de Marketing' }, toques: [{ canal: 'linkedin', direcao: 'enviado', resumo: 'mensagem no LinkedIn', data: '2026-11-26' }], eventos: [{ tipo: 'criada', criado_em: '2026-11-26' }], instrucao: 'reforçar o café', hoje: '2026-11-26' });
ok(/web_search/.test(p.system) && /WhatsApp/.test(p.system) && p.system.includes(ESTILO_PEDRO[1]), 'prompt manda pesquisar na internet e segue o estilo do Pedro');
ok(/primeiro nome: Marcelo/.test(p.user) && /primeiro contato/.test(p.user) && /Cobrar resposta do Marcelo/.test(p.user) && /reforçar o café/.test(p.user) && /linkedin/.test(p.user), 'prompt leva etapa, próximo passo, toques e o pedido do Pedro');
ok(/já existe conversa/.test(promptWhatsappPipeline({ op: Object.assign({}, op, { estagio: 'Contato direto' }) }).user), 'situação muda com a etapa');

const resp = 'Pesquisei.\n```json\n{"mensagem":"Marcelo, vi que a XP lançou o novo app. Topa um café semana que vem?","fato_usado":"XP lançou app","fontes":["https://exame.com/x","nada"]}\n```';
const r = lerResposta(resp);
ok(r && /Marcelo/.test(r.mensagem) && r.fontes.length === 1, 'lê a resposta com bloco json e descarta fonte que não é URL');
ok(lerResposta('sem json') === null, 'resposta sem json → null');
ok(checarWhatsapp(r.mensagem).length === 0, 'mensagem boa passa');
ok(checarWhatsapp('Oi — tudo bem? Veja https://x.com e o preço').some(x => /travessão/.test(x)) && checarWhatsapp('veja https://x.com').includes('tem link') && checarWhatsapp('palavra '.repeat(120)).includes('longa para WhatsApp'), 'barra travessão, link e texto longo');

// Rota
let chamadaIA = null; const logs = [];
globalThis.__SDR_LLM_MOCK = (a) => { chamadaIA = a; return { texto: resp, urls: ['https://exame.com/x', 'https://valor.com/y'], buscas: 2 }; };
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return (opts.headers && /jwt-do-pedro/.test(opts.headers.Authorization)) ? json({ email: 'pedro@galeria.test' }) : json({}, 401);
  if (u.includes('crm_usuarios')) return json([{ email: 'pedro@galeria.test', ativo: true }]);
  if (u.includes('crm_oportunidades')) return json(u.includes('id=eq.op1') ? [Object.assign({ empresa_id: 'eXP', agencia_id: 'a404' }, op)] : []);
  if (u.includes('crm_empresas')) return json([{ nome: 'XP INC', setor: 'banco', setor_canonico: 'Financeiro' }]);
  if (u.includes('crm_decisores')) return json([{ id: 'dRenan', nome: 'Renan', cargo: 'Compras', wa: null }, { id: 'dMarcelo', nome: 'Marcelo Bronze', cargo: 'Diretor de Marketing', wa: '11 98888-7777' }, { id: 'dVelho', nome: 'Saiu', status: 'saiu_da_empresa', wa: '11977776666' }]);
  if (u.includes('crm_toques') || u.includes('crm_oportunidade_eventos')) return json([]);
  if (u.includes('crm_agencias')) return json([{ nome: '404' }]);
  if (u.includes('crm_logs')) { logs.push(mt); return new Response(null, { status: 201 }); }
  return json([]);
};
const { default: enrich } = await import(new URL('../api/enrich.js', import.meta.url).href);
const chamar = (body, auth = 'Bearer jwt-do-pedro') => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); }, redirect() {} };
  enrich({ method: 'POST', query: { provider: 'wa-pipeline' }, headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }, res);
});
const semLogin = await chamar({ oportunidade_id: 'op1' }, null);
ok(semLogin.status === 401 && chamadaIA === null, 'sem login: 401 e nenhuma chamada à IA');
const x = await chamar({ oportunidade_id: 'op1' });
ok(x.status === 200 && /Marcelo/.test(x.body.mensagem) && x.body.contato.id === 'dMarcelo' && x.body.link.startsWith('https://wa.me/5511988887777?text='), 'gera a mensagem para quem tem WhatsApp e devolve o link — ' + x.status);
ok(chamadaIA && chamadaIA.busca === true && /XP INC/.test(chamadaIA.user) && /agência 404/.test(chamadaIA.user), 'chama a IA com pesquisa na internet e o contexto da oportunidade');
ok(x.body.fontes.includes('https://valor.com/y') && x.body.contatos.length === 2 && !x.body.contatos.some(c => c.id === 'dVelho'), 'junta as fontes lidas e deixa fora quem saiu da empresa');
const y = await chamar({ oportunidade_id: 'op1', decisor_id: 'dRenan', instrucao: 'cobrar o Renan' });
ok(y.body.contato.id === 'dRenan' && y.body.link.startsWith('https://wa.me/?text=') && /cobrar o Renan/.test(chamadaIA.user), 'contato escolhido sem número: link abre o WhatsApp para escolher');
ok((await chamar({ oportunidade_id: 'nao-existe' })).status === 404, 'oportunidade inexistente: 404');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
