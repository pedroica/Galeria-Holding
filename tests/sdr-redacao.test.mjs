// tests/sdr-redacao.test.mjs — Bloco C: redação (lib/sdr-redacao.js), parte pura.
// Rodar: node tests/sdr-redacao.test.mjs
import { mesclarCases, contarPalavras, temTravessaoPontuacao, expressoesEncontradas, validarForma, escolherCase, construirPromptRedacao } from '../lib/sdr-redacao.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

console.log('Redação — validadores de forma');
ok(contarPalavras('uma duas três') === 3, 'conta palavras');
ok(temTravessaoPontuacao('texto — com travessão'), 'detecta travessão em dash');
ok(temTravessaoPontuacao('texto - com hífen solto'), 'detecta hífen cercado de espaço');
ok(!temTravessaoPontuacao('bem-vindo ao time'), 'hífen de palavra composta não conta');
ok(expressoesEncontradas('Vamos alavancar a sinergia', null).length === 2, 'acha 2 expressões proibidas');

// e-mail bem formado: corpo 60-110 palavras, assunto 3-6, 1 pergunta, sem proibidas
const corpoBom = Array.from({ length: 70 }, (_, i) => 'palavra' + i).join(' ') + ' faz sentido conversarmos?';
let v = validarForma({ assunto: 'Avon e um teste', corpo: corpoBom }, 'email');
ok(v.ok, 'e-mail bem formado passa (' + JSON.stringify(v.problemas) + ')');

v = validarForma({ assunto: 'Assunto longo demais com muitas palavras aqui', corpo: corpoBom }, 'email');
ok(!v.ok && v.problemas.some(p => /assunto/.test(p)), 'assunto fora da faixa reprova');

v = validarForma({ assunto: 'tres palavras ok', corpo: 'Curto demais sem pergunta' }, 'email');
ok(!v.ok && v.problemas.some(p => /corpo/.test(p)), 'corpo curto reprova');

v = validarForma({ assunto: 'tres palavras ok', corpo: corpoBom.replace('?', '.') }, 'email');
ok(!v.ok && v.problemas.some(p => /pergunta/.test(p)), 'sem pergunta reprova');

v = validarForma({ assunto: 'tres palavras ok', corpo: 'Vamos ' + corpoBom + ' potencializar?' }, 'email');
ok(!v.ok && v.problemas.some(p => /proibida/.test(p)), 'expressão proibida reprova');

console.log('\nRedação — escolha de case');
const knowledge = { cases_destaque: [
  { titulo: 'Case Tech', marca: 'Google', agencia_slug: '404', tags: ['tecnologia', 'ia generativa'], resultado: 'brand lift recorde', destaque: true },
  { titulo: 'Case Varejo', marca: 'Mag', agencia_slug: 'galeria', tags: ['varejo', 'performance'], resultado: '13 mil carros', destaque: false },
] };
ok(escolherCase(knowledge, { setor: 'tecnologia', sinalTipo: 'lancamento', agenciaSlug: '404' }).marca === 'Google', 'case da agência + tag de setor vence');
ok(escolherCase(knowledge, { setor: 'varejo', agenciaSlug: 'galeria' }).marca === 'Mag', 'case de varejo para agência galeria');

console.log('\nRedação — prompt carrega o fato e o case');
const p = construirPromptRedacao({
  dossie: { sinais: [{ tipo: 'lancamento', fato: 'Acme lança linha X', fonte: 'Exame', data: '2026-11-01', trecho: 'Acme lança linha X', url: 'https://x/1' }] },
  nome: 'Ana', cargo: 'CMO', empresa: { nome: 'Acme', setor: 'tech' },
  agencia: { nome: '404', slug: '404', motivo: 'inovação' }, caso: knowledge.cases_destaque[0],
  etapa: 'D0', canal: 'email', angulo: 'fato', sinal: { tipo: 'lancamento', fato: 'Acme lança linha X', fonte: 'Exame', url: 'https://x/1' }
});
ok(/Acme lança linha X/.test(p.user) && /brand lift recorde/.test(p.user), 'prompt inclui o fato do dossiê e o resultado do case');
ok(/travessão/i.test(p.system) && /Pedro Ica/.test(p.system), 'system fixa regra de travessão e assinatura');

console.log('\nRedação — rodada 2 (motivos do QC real)');
ok(escolherCase(knowledge, { setor: 'software fiscal', agenciaSlug: '404' }) === null || escolherCase(knowledge, { setor: 'software fiscal', agenciaSlug: '404' }).tags.length > 0, 'case precisa de aderência de setor');
ok(escolherCase({ cases_destaque: [{ titulo: 'Netflix', agencia_slug: '404', tags: ['streaming', 'entretenimento'], destaque: true }] }, { setor: 'saas contabilidade', agenciaSlug: '404' }) === null, 'Netflix não vai para SaaS fiscal só por ser da mesma agência');
ok(escolherCase({ cases_destaque: [{ titulo: 'Gallo', agencia_slug: 'galeria', tags: ['alimentos', 'cpg'] }] }, { setor: 'Alimentos e bebidas', agenciaSlug: 'holding' }).titulo === 'Gallo', 'casa setor sem acento/maiúscula e de outra agência');
ok(expressoesEncontradas('Tenho uma ideia de bolso para vocês', null).includes('ideia de bolso'), '"ideia de bolso" virou expressão proibida');
const pr = construirPromptRedacao({ dossie: { sinais: [] }, nome: 'Alexandre', cargo: 'CEO', empresa: { nome: 'X' }, agencia: { nome: 'Galeria', slug: 'galeria' }, caso: null, etapa: 'D0', canal: 'email', angulo: 'fato' });
ok(/apelido/.test(pr.system) && !/"ideia de bolso"\)/.test(pr.system) && /mire em/.test(pr.system), 'prompt: sem apelido, sem rótulo de ideia, alvo de tamanho com margem');

console.log('\nRedação — banco de cases vivo');
const kv = mesclarCases(knowledge, [
  { titulo: 'Case Novo', marca: 'X', resultado: '+52% de novas contas', agencia_id: 'g', agencias_secundarias: ['v'], tags: ['banco'] },
  { titulo: 'Proj', marca: 'Y', resultado: 'Proposta, não resultado: R$ 4 por asset', agencia_id: 'g' },
  { titulo: 'Sem num', marca: 'Z', resultado: 'Sem métricas divulgadas.', agencia_id: 'g' },
  { titulo: 'Case Tech', marca: 'dup', resultado: 'x', agencia_id: 'g' }
], { g: 'galeria', v: 'vitrine' });
ok(kv.cases_destaque.length === 4, 'entra o novo e o sem métrica; sai a projeção e a duplicata');
ok(kv.cases_destaque.find(c => c.titulo === 'Sem num').resultado === '', 'case sem métrica entra sem número');
ok(escolherCase(kv, { setor: 'banco', agenciaSlug: 'vitrine' }).titulo === 'Case Novo', 'agência secundária do case conta na escolha');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
