// Testes da parte pura das movimentações (lib/movimentacoes.js) e do estilo (lib/estilo.js).
import { lerRss, juntarItens, ehCargoAlvo, chaveMovimento, ehAgencia, promptExtracao, promptParabens, checarParabens, urlImprensa, CONSULTAS_IMPRENSA } from '../lib/movimentacoes.js';
import { ESTILO_PEDRO } from '../lib/estilo.js';
import { construirPromptRedacao } from '../lib/sdr-redacao.js';
import { construirPromptBlitz } from '../lib/blitz.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

const xml = `<rss><channel>
<item><title><![CDATA[Natura anuncia Ana Souza como nova CMO - Meio & Mensagem]]></title><link>https://news.google.com/a</link><source url="x">Meio &amp; Mensagem</source><pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<a>Ex-Unilever, executiva liderou a campanha Dove</a>]]></description></item>
<item><title>Natura anuncia Ana Souza como nova CMO - Exame</title><link>https://news.google.com/b</link><source>Exame</source></item>
</channel></rss>`;
const it = lerRss(xml);
ok(it.length === 2 && it[0].fonte === 'Meio & Mensagem' && /Ex-Unilever/.test(it[0].resumo), 'lê RSS (título, fonte, resumo sem HTML)');
ok(juntarItens([it, it]).length === 1, 'mesma manchete em veículos/buscas diferentes conta uma vez');
ok(urlImprensa('"nova CMO"').includes('when%3A7d') && CONSULTAS_IMPRENSA.length >= 10, 'busca dos últimos 7 dias');
ok(ehCargoAlvo('CMO') && ehCargoAlvo('Diretora de Marketing') && ehCargoAlvo('VP de Marca') && ehCargoAlvo('Head de Growth'), 'cargos-alvo');
ok(!ehCargoAlvo('Diretor Financeiro') && !ehCargoAlvo('Analista de Marketing') && !ehCargoAlvo(''), 'fora do alvo');
ok(chaveMovimento('Ana Souza', 'Natura S.A.') === chaveMovimento('ana souza', 'NATURA'), 'chave igual para a mesma pessoa e empresa');
ok(ehAgencia('Ogilvy Brasil') && ehAgencia('Agência Africa Creative') && !ehAgencia('Natura'), 'quem vai para agência não é prospect');
ok(/MOVIMENTAÇÕES DE EXECUTIVOS/.test(promptExtracao(it).system) && /\[0\] Natura anuncia/.test(promptExtracao(it).user), 'prompt de extração');

const mov = { pessoa: 'Ana Souza', cargo: 'CMO', empresa: 'Natura', trajetoria: 'Ex-Unilever', feitos: 'liderou a campanha Dove', titulo: 'Natura anuncia Ana Souza como nova CMO', fonte: 'Meio & Mensagem' };
const pp = promptParabens({ mov, holding: { descricao: 'grupo de agências' } });
ok(/PARABÉNS/.test(pp.system) && /café/.test(pp.system) && /primeiro nome: Ana/.test(pp.user) && /Ex-Unilever/.test(pp.user), 'prompt de parabéns com estilo, trajetória da fonte e café');
const boa = { assunto: 'parabéns pela Natura', email: 'Ana, parabéns pelo novo desafio como CMO da Natura.\n\nVi no Meio & Mensagem que você vem da Unilever.\n\nTopa um café para conversarmos?', linkedin: 'x' };
ok(checarParabens(boa, pp.fontes).length === 0, 'mensagem boa passa');
ok(checarParabens(Object.assign({}, boa, { email: boa.email + ' Você aumentou as vendas em 30%.' }), pp.fontes).some(x => /número/.test(x)), 'barra número que não está na fonte');
ok(checarParabens(Object.assign({}, boa, { email: boa.email.replace('café', 'reunião') }), pp.fontes).some(x => /café/.test(x)), 'exige o convite para o café');
ok(checarParabens(Object.assign({}, boa, { email: 'Ana, tudo bem? Topa um café?' }), pp.fontes).some(x => /parabéns/.test(x)), 'exige os parabéns');

// O mesmo estilo vale para tudo o que o agente escreve
const sdr = construirPromptRedacao({ nome: 'Ana', cargo: 'CMO', empresa: { nome: 'Natura' }, canal: 'email' }).system;
ok(sdr.includes(ESTILO_PEDRO[1]) && /café/.test(sdr), 'agente SDR escreve no estilo do Pedro (pessoa, trajetória, café)');
const bz = construirPromptBlitz({ tema: 't', contato: { nome: 'Ana' }, empresa: { nome: 'E' } }).system;
ok(bz.includes(ESTILO_PEDRO[1]) && /café/.test(bz), 'blitz escreve no estilo do Pedro');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
