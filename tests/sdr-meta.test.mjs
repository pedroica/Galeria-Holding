// tests/sdr-meta.test.mjs — meta diária de 20 rascunhos, teto de gasto e trilha
// "sem fato" (lead com encaixe, sem notícia com fonte). Puro, sem rede.
// Rodar: node tests/sdr-meta.test.mjs
import { inicioDiaBRT, dataBRT, vagasDoDia, gastoDosLogs, orcamentoOk, alegaFato, contextoDoLead, conversaRecente } from '../lib/sdr-meta.js';
import { validarTese, construirPromptEstrategia } from '../lib/sdr-estrategista.js';
import { checagensCodigo } from '../lib/sdr-qualidade.js';
import { construirPromptRedacao, construirPromptAvaliacao } from '../lib/sdr-redacao.js';
import { ehRascunhoGmail } from '../lib/gmail-token.js';
import { selecionarLote } from '../lib/sdr-selecao.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

console.log('dia em Brasília');
ok(inicioDiaBRT(new Date('2026-11-25T02:00:00Z')) === '2026-11-24T03:00:00.000Z', '23h BRT ainda é o dia anterior');
ok(inicioDiaBRT(new Date('2026-11-25T10:00:00Z')) === '2026-11-25T03:00:00.000Z', '07h BRT começa às 03h UTC');
ok(dataBRT(new Date('2026-11-25T02:59:00Z')) === '2026-11-24', 'data BRT antes da meia-noite local');

console.log('meta diária');
ok(vagasDoDia({ meta: 20, produzidosHoje: 0, emAndamento: 0 }) === 28, 'dia vazio: meta + folga de 40% para o QC');
ok(vagasDoDia({ meta: 20, produzidosHoje: 20, emAndamento: 0 }) === 0, 'meta batida: zero vagas');
ok(vagasDoDia({ meta: 20, produzidosHoje: 25, emAndamento: 0 }) === 0, 'passou da meta: zero, nunca negativo');
ok(vagasDoDia({ meta: 20, produzidosHoje: 10, emAndamento: 14 }) === 0, 'em andamento conta para não estourar');
ok(vagasDoDia({ meta: 20, produzidosHoje: 18, emAndamento: 1 }) === 2, 'faltando 2: ceil(2*1.4)-1');
ok(vagasDoDia({ meta: 0, produzidosHoje: 0, emAndamento: 0 }) === 0, 'meta 0 desliga a produção');

console.log('orçamento do modelo');
ok(gastoDosLogs([{ contexto: { custo_usd: 0.5 } }, { contexto: { custo_usd: 1.25 } }, { contexto: null }, { contexto: { custo_usd: 'x' } }]) === 1.75, 'soma só custos válidos');
ok(orcamentoOk({ gastoHoje: 4.99, tetoUsd: 5 }) && !orcamentoOk({ gastoHoje: 5, tetoUsd: 5 }), 'para no teto');
ok(orcamentoOk({ gastoHoje: 100, tetoUsd: 0 }), 'teto 0 = sem teto');

console.log('trilha de contexto: só com histórico real');
const AG = Date.parse('2026-11-25T12:00:00Z');
let cx = contextoDoLead({ toques: [{ canal: 'email', direcao: 'enviado', resultado: 'sem_resposta', assunto: 'Ideia', data: '2026-06-01' }], oportunidades: [], agora: AG });
ok(cx.length === 0, 'contato anterior sem resposta NÃO é contexto');
cx = contextoDoLead({ toques: [{ canal: 'email', direcao: 'recebido', assunto: 'RE: blitz de planejamento', data: '2026-04-10' }], agora: AG });
ok(cx.length === 1 && cx[0].tipo === 'conversa' && /10\/04\/2026/.test(cx[0].texto) && /blitz/.test(cx[0].texto), 'resposta dela vira contexto com data e assunto');
cx = contextoDoLead({ toques: [{ canal: 'reuniao', direcao: 'enviado', resultado: 'reuniao', resumo: 'Apresentação da 404', data: '2026-03-02' }], agora: AG });
ok(cx.length === 1 && /reuniao/.test(cx[0].texto), 'reunião anterior é contexto');
cx = contextoDoLead({ oportunidades: [{ titulo: 'Campanha verão', estagio: 'Pausado', atualizado_em: '2026-08-01' }, { titulo: 'Novo site', estagio: 'Negociação', atualizado_em: '2026-08-01' }, { titulo: 'Recente', estagio: 'Wishlist', atualizado_em: '2026-11-20' }], agora: AG });
ok(cx.length === 1 && /Campanha verão/.test(cx[0].texto), 'só oportunidade parada (Wishlist/Pausado há 30+ dias); em negociação ou mexida agora é do dono');
cx = contextoDoLead({ pausaAteEm: '2026-11-01', agora: AG });
ok(cx.length === 1 && cx[0].tipo === 'momento', '"não agora" com pausa vencida é momento de retomar');
ok(contextoDoLead({ pausaAteEm: '2026-12-30', agora: AG }).length === 0, 'pausa ainda valendo não é contexto');
ok(conversaRecente('2026-10-01', AG) && !conversaRecente('2026-06-01', AG), 'conversa < 90 dias é do Pedro; > 90 dias pode ser retomada');

console.log('trilha de contexto: nada de fato inventado');
ok(alegaFato('Vi que a Acme anunciou 40 lojas') && alegaFato('Li que vocês lançaram') && alegaFato('segundo o Valor, a empresa'), 'pega fato alegado');
ok(!alegaFato('Marketing de varejo de moda vive a pressão de margem no fim de ano. Faz sentido conversarmos 20 minutos?'), 'texto de setor/cargo passa');

const tese = { cenario: 'Varejo de moda com margem apertada.', fato_url: 'https://inventado', dor_do_cargo: 'x', alavanca: 'crm', oportunidade: 'y', agencias: ['holding'], oferta: 'Blitz', prova: '', nota_encaixe: 6, seguir: true, motivo: 'setor e cargo certos' };
let v = validarTese(tese, { sinais: [], knowledge: { cases_destaque: [] }, clientes: [], notaMin: 6, semFato: true });
ok(v.seguir && v.tese.sem_fato === true && v.tese.fato_url === '', 'sem fato: segue com nota 6 e limpa a URL inventada');
v = validarTese(tese, { sinais: [], knowledge: { cases_destaque: [] }, clientes: [], notaMin: 8 });
ok(!v.seguir, 'com fato exigido (padrão) e sem sinal: não segue');
v = validarTese(Object.assign({}, tese, { nota_encaixe: 5 }), { sinais: [], knowledge: { cases_destaque: [] }, clientes: [], notaMin: 6, semFato: true });
ok(!v.seguir, 'sem fato com nota 5 não segue');

const CX = [{ tipo: 'conversa', texto: 'mensagem dela por email em 10/04/2026: RE: blitz de planejamento' }];
const pe = construirPromptEstrategia({ ecossistema: 'eco', empresa: { nome: 'Acme', setor: 'varejo' }, decisor: { nome: 'Ana', cargo: 'CMO' }, sinais: [], notaMin: 7, semFato: true, contexto: CX });
ok(/TRILHA DE CONTEXTO/.test(pe.user) && /blitz de planejamento/.test(pe.user) && /fato_url fica vazio/.test(pe.user), 'estrategista recebe o contexto real do CRM');
const pr = construirPromptRedacao({ dossie: { sinais: [] }, nome: 'Ana', cargo: 'CMO', empresa: { nome: 'Acme' }, canal: 'email', semFato: true, contexto: CX, tese: Object.assign({}, tese, { sem_fato: true, contexto: CX }) });
ok(/NÃO há notícia/.test(pr.system) && /Nunca diga "vi que"/.test(pr.system), 'redação proíbe "vi que" e ancora no contexto');
ok(/blitz de planejamento/.test(pr.user) && !/a partir de um fato do dossiê, como quem acompanha/.test(pr.system), 'redação recebe o contexto e não pede notícia');
const pa = construirPromptAvaliacao({ mensagem: { canal: 'email', assunto: 'a', corpo: 'b' }, dossie: { sinais: [] }, empresa: { nome: 'Acme' }, semFato: true, contexto: CX });
ok(/trilha de contexto/.test(pa.system) && /contexto do CRM: conversa/.test(pa.user), 'avaliador confere a mensagem contra o contexto');

const corpoBom = 'Ana, marketing de varejo de moda vive a pressão de margem no fim de ano e o CRM costuma ficar subaproveitado justamente nessa hora. ' +
  'Na Acme, imagino que reativar a base de clientes antigos pesa tanto quanto mídia nova. ' +
  'A Galeria Holding tem feito uma blitz de planejamento de 30 minutos para achar duas ou três oportunidades assim, olhando o negócio de fora. ' +
  'Faz sentido conversarmos 20 minutos na semana que vem?\n\nPedro Ica';
let c = checagensCodigo({ mensagem: { assunto: 'Base de clientes da Acme', corpo: corpoBom, sinal_url: null, canal: 'email' }, dossie: { sinais: [] }, caso: null, decisor: { nome: 'Ana Souza' }, empresa: { nome: 'Acme' }, canal: 'email', semFato: true });
ok(!c.falhas.some(f => /lastro/.test(f)), 'QC sem fato não exige URL (' + c.falhas.join('; ') + ')');
c = checagensCodigo({ mensagem: { assunto: 'Acme', corpo: 'Ana, vi que a Acme anunciou 40 lojas. ' + corpoBom, sinal_url: null, canal: 'email' }, dossie: { sinais: [] }, caso: null, decisor: { nome: 'Ana' }, empresa: { nome: 'Acme' }, canal: 'email', semFato: true });
ok(c.falhas.some(f => /alega fato/.test(f)), 'QC sem fato reprova fato alegado');
c = checagensCodigo({ mensagem: { assunto: 'Acme', corpo: corpoBom, sinal_url: null, canal: 'email' }, dossie: { sinais: [] }, caso: null, decisor: { nome: 'Ana' }, empresa: { nome: 'Acme' }, canal: 'email' });
ok(c.falhas.some(f => /lastro: dossiê sem sinal/.test(f)), 'trilha com fato continua exigindo lastro');

console.log('Gmail e seleção');
ok(ehRascunhoGmail('r-1234567890123') && ehRascunhoGmail('r987') && !ehRascunhoGmail('AAMkAGI2TG93AAA='), 'distingue id de rascunho do Gmail do Graph');
const r0 = selecionarLote({ candidatos: [{ id: 'd1', empresa_id: 'e1', email: 'a@b.com', empresa: { id: 'e1', nome: 'X' } }], config: { lote_max: 0 }, agora: Date.now() });
ok(r0.lote.length === 0, 'lote_max 0 (noite anterior ainda pendente) não seleciona ninguém');
const cand = [
  { id: 'frio', empresa_id: 'e1', email: 'a@x.com', empresa: { id: 'e1', nome: 'Fria' } },
  { id: 'velho', empresa_id: 'e2', email: 'b@x.com', respondeu: true, empresa: { id: 'e2', nome: 'Velha' } },
  { id: 'quente', empresa_id: 'e3', email: 'c@x.com', respondeu: true, empresa: { id: 'e3', nome: 'Quente' } },
  { id: 'orfao', empresa_id: null, email: 'd@x.com', empresa: {} }
];
const rs = selecionarLote({ candidatos: cand, config: { lote_max: 10, intercalar_agencias: false }, agora: AG,
  contexto: { ultimaConversa: { velho: '2026-05-01', quente: '2026-11-10' }, empresasOppParada: new Set() } });
ok(rs.lote[0] && rs.lote[0].decisor_id === 'velho' && rs.lote[0].prioridade === 'contexto', 'quem tem contexto (conversa de 6 meses atrás) vem primeiro');
ok(rs.excluidos.some(e => e.decisor_id === 'quente' && e.motivo === 'ja_respondeu'), 'quem respondeu há 15 dias continua com o Pedro');
ok(rs.excluidos.some(e => e.decisor_id === 'orfao' && e.motivo === 'sem_empresa'), 'lead sem empresa não entra (travava o relógio)');

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
