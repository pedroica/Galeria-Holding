// tests/sdr-meta.test.mjs — meta diária de 20 rascunhos, teto de gasto e trilha
// "sem fato" (lead com encaixe, sem notícia com fonte). Puro, sem rede.
// Rodar: node tests/sdr-meta.test.mjs
import { inicioDiaBRT, dataBRT, vagasDoDia, gastoDosLogs, orcamentoOk, alegaFato, elegivelSemFato, cargoDecideComunicacao } from '../lib/sdr-meta.js';
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

console.log('trilha sem fato: quem entra');
ok(cargoDecideComunicacao('Diretora de Marketing') && cargoDecideComunicacao('CEO') && cargoDecideComunicacao('Head de Brand'), 'cargos de decisão entram');
ok(!cargoDecideComunicacao('Analista Fiscal') && !cargoDecideComunicacao('Coordenador de RH'), 'cargos fora da decisão ficam de fora');
ok(elegivelSemFato({ cargo: 'CMO', estrelas: 4 }) && !elegivelSemFato({ cargo: 'CMO', estrelas: 2 }), 'exige encaixe (estrelas >= 3)');

console.log('trilha sem fato: nada de fato inventado');
ok(alegaFato('Vi que a Acme anunciou 40 lojas') && alegaFato('Li que vocês lançaram') && alegaFato('segundo o Valor, a empresa'), 'pega fato alegado');
ok(!alegaFato('Marketing de varejo de moda vive a pressão de margem no fim de ano. Faz sentido conversarmos 20 minutos?'), 'texto de setor/cargo passa');

const tese = { cenario: 'Varejo de moda com margem apertada.', fato_url: 'https://inventado', dor_do_cargo: 'x', alavanca: 'crm', oportunidade: 'y', agencias: ['holding'], oferta: 'Blitz', prova: '', nota_encaixe: 6, seguir: true, motivo: 'setor e cargo certos' };
let v = validarTese(tese, { sinais: [], knowledge: { cases_destaque: [] }, clientes: [], notaMin: 6, semFato: true });
ok(v.seguir && v.tese.sem_fato === true && v.tese.fato_url === '', 'sem fato: segue com nota 6 e limpa a URL inventada');
v = validarTese(tese, { sinais: [], knowledge: { cases_destaque: [] }, clientes: [], notaMin: 8 });
ok(!v.seguir, 'com fato exigido (padrão) e sem sinal: não segue');
v = validarTese(Object.assign({}, tese, { nota_encaixe: 5 }), { sinais: [], knowledge: { cases_destaque: [] }, clientes: [], notaMin: 6, semFato: true });
ok(!v.seguir, 'sem fato com nota 5 não segue');

const pe = construirPromptEstrategia({ ecossistema: 'eco', empresa: { nome: 'Acme', setor: 'varejo' }, decisor: { nome: 'Ana', cargo: 'CMO' }, sinais: [], notaMin: 6, semFato: true });
ok(/TRILHA SEM FATO/.test(pe.user) && /fato_url fica vazio/.test(pe.user), 'prompt do estrategista avisa a trilha sem fato');
const pr = construirPromptRedacao({ dossie: { sinais: [] }, nome: 'Ana', cargo: 'CMO', empresa: { nome: 'Acme' }, canal: 'email', semFato: true, tese: Object.assign({}, tese, { sem_fato: true }) });
ok(/NÃO há fato público/.test(pr.system) && /Nunca diga "vi que"/.test(pr.system), 'redação proíbe "vi que" na trilha sem fato');
ok(!/a partir de um fato do dossiê, como quem acompanha/.test(pr.system), 'redação sem fato não pede fato na primeira frase');
const pa = construirPromptAvaliacao({ mensagem: { canal: 'email', assunto: 'a', corpo: 'b' }, dossie: { sinais: [] }, empresa: { nome: 'Acme' }, semFato: true });
ok(/trilha sem fato/.test(pa.system), 'avaliador sabe que é trilha sem fato');

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

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
