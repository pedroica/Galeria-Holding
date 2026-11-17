// tests/sdr-redacao.test.mjs — Bloco C: redação (lib/sdr-redacao.js), parte pura.
// Rodar: node tests/sdr-redacao.test.mjs
import { contarPalavras, temTravessaoPontuacao, expressoesEncontradas, validarForma, escolherCase, construirPromptRedacao } from '../lib/sdr-redacao.js';

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

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
