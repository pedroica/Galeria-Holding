// Testes da classificação de setores (lib/setores.js).
import { SETORES, setorDoAntigo, setorValido, SCHEMA_SETORES, promptSetores } from '../lib/setores.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

ok(setorDoAntigo('Educacao') === 'Educação' && setorDoAntigo('educação') === 'Educação', 'Educacao/educação viram Educação');
ok(setorDoAntigo('FMCG') === 'Bens de consumo' && setorDoAntigo('Food') === 'Alimentos e bebidas', 'nomes antigos em inglês mapeados');
ok(setorDoAntigo('Varejo Moda') === 'Moda' && setorDoAntigo('B2B Tech') === 'Tecnologia', 'compostos mapeados');
ok(setorDoAntigo('Outros') === null && setorDoAntigo(null) === null && setorDoAntigo('') === null, '"Outros" e vazio vão para a IA');
ok(setorValido('educacao') === 'Educação' && setorValido('SAÚDE') === 'Saúde', 'aceita resposta sem acento ou em caixa alta');
ok(setorValido('Criptomoedas') === null, 'setor fora da lista é recusado');
ok(SCHEMA_SETORES.properties.itens.items.properties.setor.enum.length === SETORES.length, 'schema só permite setores da lista');
const { system, user } = promptSetores([{ id: 'a', nome: 'Colégio Bandeirantes', setor: 'Outros', site: 'colband.com.br' }, { id: 'b', nome: 'Ambev', setor: 'FMCG' }]);
ok(/Educação/.test(system) && /Outros/.test(system), 'prompt traz a lista de setores');
ok(user.includes('a · Colégio Bandeirantes · site: colband.com.br') && !user.includes('setor antigo: Outros'), 'prompt não repassa "Outros" como dica');
ok(user.includes('setor antigo: FMCG'), 'prompt repassa setor antigo útil como dica');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
