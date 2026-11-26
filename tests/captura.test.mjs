// Testes do cadastro rápido (lib/captura.js) e do Lusha por pessoa (lib/lusha.js).
import { normalizarEmpresa, casarEmpresa, casarPessoa, normalizarCelular, separarNome, SCHEMA_CAPTURA } from '../lib/captura.js';
import { saldoDoDia, custoPrevisto, lerPessoaV2, pessoaLusha } from '../lib/lusha.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

ok(normalizarEmpresa('Lopes Supermercados Ltda.') === 'lopes supermercados', 'tira Ltda e pontuação');
ok(normalizarEmpresa('SOMOS EDUCAÇÃO S/A') === 'somos educacao', 'tira S/A e acento');
const EMP = [{ id: 'e1', nome: 'LOPES SUPERMERCADOS LTDA' }, { id: 'e2', nome: 'Somos Educação' }, { id: 'e3', nome: 'Banco do Brasil' }, { id: 'e4', nome: 'Natura' }];
ok(casarEmpresa('Lopes Supermercados', EMP).empresa.id === 'e1' && casarEmpresa('Lopes Supermercados', EMP).confianca === 'alta', 'acha empresa com sufixo diferente (certeza)');
ok(casarEmpresa('Supermercados Lopes', EMP) && casarEmpresa('Supermercados Lopes', EMP).empresa.id === 'e1', 'ordem das palavras diferente');
ok(casarEmpresa('Natura &Co', EMP) && casarEmpresa('Natura &Co', EMP).empresa.id === 'e4', 'nome base contido no digitado');
ok(casarEmpresa('Lopes Imóveis', EMP) === null, 'não confunde Lopes Imóveis com Lopes Supermercados');
ok(casarEmpresa('Itaú', EMP) === null, 'empresa nova: sem casamento');
const DEC = [{ id: 'd1', nome: 'João Lopes', email: 'joao@lopes.com.br', empresa_id: 'e1' }, { id: 'd2', nome: 'Ana', email: '', empresa_id: 'e2' }];
ok(casarPessoa({ email: 'JOAO@lopes.com.br' }, DEC, null).id === 'd1', 'pessoa por e-mail');
ok(casarPessoa({ nome: 'joao lopes' }, DEC, 'e1').id === 'd1' && casarPessoa({ nome: 'João Lopes' }, DEC, 'e2') === null, 'pessoa por nome só dentro da mesma empresa');
ok(normalizarCelular('(11) 99876-5432') === '5511998765432' && normalizarCelular('+55 11 99876 5432') === '5511998765432', 'celular no formato 55+DDD');
ok(normalizarCelular('123') === '' && normalizarCelular('') === '', 'número inválido vira vazio');
ok(separarNome('João Pedro Lopes').primeiro === 'João' && separarNome('João Pedro Lopes').ultimo === 'Lopes', 'primeiro e último nome');
ok(SCHEMA_CAPTURA.properties.pessoas.items.required.includes('empresa'), 'schema');

ok(saldoDoDia({ data: '2026-11-26', usados: 3 }, '2026-11-26', 8).restantes === 5, 'saldo do dia');
ok(saldoDoDia({ data: '2026-11-25', usados: 8 }, '2026-11-26', 8).restantes === 8, 'dia novo zera o uso');
ok(custoPrevisto({ celular: false }) === 1 && custoPrevisto({ celular: true }) === 6, 'custo previsto (e-mail 1, celular 5)');
const resp = { contact: { isCreditCharged: true, data: { emailAddresses: [{ address: 'joao@lopes.com.br', type: 'work' }], phoneNumbers: [{ number: '+55 11 99876-5432', phoneType: 'Mobile' }], jobTitle: { title: 'CMO' }, socialLinks: { linkedin: 'https://linkedin.com/in/joao' }, company: { name: 'Lopes', domains: { homepage: 'lopes.com.br' } } } } };
const lido = lerPessoaV2(resp);
ok(lido.achou && lido.email === 'joao@lopes.com.br' && lido.celular === '5511998765432' && lido.cargo === 'CMO' && lido.linkedin.includes('joao') && lido.site === 'lopes.com.br', 'lê a resposta do Lusha');
ok(lerPessoaV2({ contact: { error: { code: 3, message: 'Could not find requested data.' } } }).achou === false, 'não achou');
ok(lerPessoaV2({ contact: { error: { name: 'EMPTY_DATA', code: 3 }, isCreditCharged: false, data: {} } }).achou === false, 'EMPTY_DATA com data vazia = não achou (formato real do Lusha)');

let urlChamada = '';
const fakeFetch = async (u) => { urlChamada = u; return new Response(JSON.stringify({ contact: { isCreditCharged: true, data: { emailAddresses: [{ address: 'joao@lopes.com.br' }], phoneNumbers: [], jobTitle: { title: 'CMO' } } } }), { status: 200 }); };
const p = await pessoaLusha({ fetchFn: fakeFetch, chave: 'k', nome: 'João Lopes', empresa: 'Lopes Supermercados' });
ok(/firstName=Jo%C3%A3o/.test(urlChamada) && /lastName=Lopes/.test(urlChamada) && /companyName=Lopes/.test(urlChamada) && /revealPhones=false/.test(urlChamada), 'pede só e-mail quando celular não foi pedido');
ok(p.creditos === 1, 'gasto contado: 1 crédito (só e-mail)');
ok((await pessoaLusha({ fetchFn: fakeFetch, chave: 'k', nome: 'João', empresa: 'X' })).erro === 'precisa de nome e sobrenome', 'sem sobrenome não gasta consulta');
// Formato real (26/11): 1ª consulta parcial (só LinkedIn, sem cobrar), 2ª com e-mail.
const { _esperaRetentativa } = await import('../lib/lusha.js'); _esperaRetentativa(0);
let nCons = 0;
const parcialDepoisCompleto = async () => { nCons++; return new Response(JSON.stringify(nCons === 1
  ? { contact: { isCreditCharged: false, data: { emailAddresses: [], phoneNumbers: [], socialLinks: { linkedin: 'https://linkedin.com/in/bruna' } } } }
  : { contact: { isCreditCharged: true, data: { emailAddresses: [{ address: 'bruna@alura.com.br' }], phoneNumbers: [], jobTitle: { title: 'CMO' } } } }), { status: 200 }); };
const pp = await pessoaLusha({ fetchFn: parcialDepoisCompleto, chave: 'k', nome: 'Bruna Maggion', empresa: 'Alura' });
ok(nCons === 2 && pp.email === 'bruna@alura.com.br' && pp.linkedin.includes('bruna') && pp.creditos === 1, 'perfil parcial na 1ª consulta: consulta de novo e traz o e-mail (mantém o LinkedIn)');
const urls = []; const porLinkedinSemEmail = async (u) => { urls.push(u); return new Response(JSON.stringify(/linkedinUrl/.test(u)
  ? { contact: { isCreditCharged: true, data: { emailAddresses: [], phoneNumbers: [], socialLinks: { linkedin: 'x' } } } }
  : { contact: { isCreditCharged: true, data: { emailAddresses: [{ address: 'b@alura.com.br' }], phoneNumbers: [] } } }), { status: 200 }); };
const pl = await pessoaLusha({ fetchFn: porLinkedinSemEmail, chave: 'k', nome: 'Bruna Maggion', empresa: 'Alura', linkedin: 'https://linkedin.com/in/bruna' });
ok(/firstName=Bruna/.test(urls[0]) && urls.length === 1 && pl.email === 'b@alura.com.br', 'com nome, empresa e LinkedIn: busca primeiro por nome + empresa (é a que traz e-mail)');
const f403 = async () => new Response('{}', { status: 403 });
ok(/plano/.test((await pessoaLusha({ fetchFn: f403, chave: 'k', nome: 'A B', empresa: 'X' })).erro), '403 do plano vira mensagem clara');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
