// Testes da parte pura da blitz (lib/blitz.js).
import { primeiroNome, casesDoSetor, construirPromptBlitz, checarMensagem, SCHEMA_BLITZ } from '../lib/blitz.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

ok(primeiroNome('JOÃO lopes') === 'João' && primeiroNome('') === '' && primeiroNome('x@y.com') === '', 'primeiro nome');
const cases = [{ titulo: 'Matrícula 2026', marca: 'Colégio X', tags: ['educação'], resultado: '+20% matrículas' }, { titulo: 'Lançamento', marca: 'Banco Y', tags: ['financeiro'], resultado: 'x' }];
ok(casesDoSetor(cases, 'Educação').length === 1 && casesDoSetor(cases, 'Educação')[0].marca === 'Colégio X', 'cases do setor (sem acento confere)');
ok(casesDoSetor(cases, '').length === 0, 'sem setor, sem case');
const { system, user } = construirPromptBlitz({ tema: 'Matrículas 2027', agencia: { nome: 'GAIA', descricao: 'IA criativa' }, cases: casesDoSetor(cases, 'Educação'),
  contato: { nome: 'Ana Souza', cargo: 'Diretora de Marketing' }, empresa: { nome: 'Colégio Z', setor: 'Educação' } });
ok(/assinando pela GAIA/.test(system) && /Não invente/.test(system), 'prompt: agência e regra de não inventar');
ok(/TEMA DA BLITZ: Matrículas 2027/.test(user) && /primeiro nome: Ana/.test(user) && /Matrícula 2026 \(Colégio X\): \+20% matrículas/.test(user), 'prompt: tema, pessoa e case');
ok(/não cite case/.test(construirPromptBlitz({ tema: 't', contato: {}, empresa: { nome: 'E' } }).user), 'sem case do setor: proíbe citar case');
ok(SCHEMA_BLITZ.required.join() === 'assunto,email,whatsapp,gancho', 'schema');
const boa = { assunto: 'Matrículas 2027 no Colégio Z', email: 'Ana, tudo bem?\n\n' + 'palavra '.repeat(40) + '\n\n' + 'palavra '.repeat(30), whatsapp: 'Oi Ana, aqui é o Pedro Ica, da GAIA. Topa 20 minutos?', gancho: 'setor' };
ok(checarMensagem(boa).length === 0, 'mensagem boa passa');
ok(checarMensagem(Object.assign({}, boa, { email: 'Ana, vi que vocês anunciaram uma nova unidade.' })).some(x => /fato/.test(x)), 'barra fato inventado');
ok(checarMensagem(Object.assign({}, boa, { whatsapp: 'Oi {primeiro nome}, tudo bem?' })).some(x => /marcador/.test(x)), 'barra marcador sem preencher');
ok(checarMensagem(Object.assign({}, boa, { email: 'palavra '.repeat(80) + '\n\n' + 'palavra '.repeat(80) })).some(x => /longo/.test(x)), 'barra e-mail longo');
ok(checarMensagem({ assunto: 'x' })[0] === 'resposta incompleta', 'resposta incompleta');
ok(checarMensagem(Object.assign({}, boa, { email: 'Ana, ' + 'palavra '.repeat(80) })).some(x => /parágrafo/.test(x)), 'e-mail longo num parágrafo só pede para separar');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
