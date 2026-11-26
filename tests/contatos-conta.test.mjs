// Pessoas da conta para o follow-up do Pipeline: parte pura (lib/contatos-conta.js).
import { limparDominio, dominioDaEmpresa, dominiosDaEmpresa, lerEnderecos, acharCelular, semCitacao, contatosDoGmail, buscaGmail, linkLinkedin, textoDoPayload } from '../lib/contatos-conta.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

ok(limparDominio('https://www.xpi.com.br/sobre') === 'xpi.com.br' && limparDominio('xp') === null, 'limpa domínio');
ok(dominioDaEmpresa({ website: 'https://www.xpi.com.br' }, []) === 'xpi.com.br', 'domínio do cadastro');
ok(dominioDaEmpresa({}, [{ email: 'a@gmail.com' }, { email: 'b@xpi.com.br' }, { email: 'c@xpi.com.br' }]) === 'xpi.com.br', 'sem cadastro: domínio corporativo mais comum das pessoas');
ok(dominioDaEmpresa({}, [{ email: 'a@gmail.com' }]) === null, 'gmail não vale como domínio da empresa');
const ends = lerEnderecos('"Silva, Ana" <ana.silva@xpi.com.br>, bruno@xpi.com.br, Pedro <p@galeria.com>');
ok(ends.length === 3 && ends[0].nome === 'Silva, Ana' && ends[1].email === 'bruno@xpi.com.br', 'lê endereços com e sem nome');
ok(acharCelular('Ana Silva\nDiretora\n+55 (11) 98765-4321') === '5511987654321' && acharCelular('Tel (11) 3003-1234') === null, 'acha celular na assinatura, ignora fixo');
ok(!/98888/.test(semCitacao('Oi Pedro\nAna\n\nEm qui., 26 de nov. Pedro escreveu:\n> me liga 11 98888-7777')), 'corta a parte citada');
const msgs = [
  { de: 'Ana Silva <ana.silva@xpi.com.br>', para: 'Pedro <pedro@galeria.test>', data: 'Wed, 25 Nov 2026 10:00:00 -0300', texto: 'Oi Pedro\nAna Silva | Marketing\n11 98765-4321\n\nEm ter Pedro escreveu:\n> 11 90000-0000' },
  { de: 'Pedro <pedro@galeria.test>', para: 'ana.silva@xpi.com.br, carlos.lima@xpi.com.br', cc: 'noreply@xpi.com.br', data: 'Tue, 24 Nov 2026 10:00:00 -0300' },
  { de: 'news@xpi.com.br', para: 'pedro@galeria.test', data: 'Mon, 23 Nov 2026 10:00:00 -0300' },
  { de: 'Fulano <f@outra.com>', para: 'pedro@galeria.test' }
];
const c = contatosDoGmail(msgs, 'xpi.com.br', 'pedro@galeria.test');
ok(c.length === 2 && c[0].email === 'ana.silva@xpi.com.br' && c[0].wa === '5511987654321' && c[0].trocas === 2 && c[0].escreveu, 'pessoas do domínio, com celular da assinatura e trocas');
ok(c[1].nome === 'Carlos Lima' && !c[1].wa && !c.some(x => /news|noreply/.test(x.email)), 'nome a partir do e-mail; ignora noreply e newsletter');
ok(buscaGmail('xpi.com.br').includes('from:xpi.com.br') && buscaGmail(null) === null, 'busca do Gmail por domínio');
ok(linkLinkedin('XP INC S.A.').includes('keywords=XP%20') && !linkLinkedin('XP INC S.A.').includes('INC') && linkLinkedin('XP').startsWith('https://www.linkedin.com/search/results/people/'), 'link de busca no LinkedIn');
const b64 = (t) => Buffer.from(t).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
ok(textoDoPayload({ mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: b64('<p>x</p>') } }, { mimeType: 'text/plain', body: { data: b64('Olá 11 98765-4321') } }] }) === 'Olá 11 98765-4321', 'lê o texto do e-mail');

ok(JSON.stringify(dominiosDaEmpresa({ website: 'xpinc.com' }, [{ email: 'a@xpi.com.br' }, { email: 'b@gmail.com' }])) === '["xpinc.com","xpi.com.br"]', 'todos os domínios: site e e-mails das pessoas');
ok(/from:xpinc\.com .*from:xpi\.com\.br/.test(buscaGmail(['xpinc.com', 'xpi.com.br'])), 'busca no Gmail por todos os domínios');
ok(contatosDoGmail([{ de: 'Ana <ana@xpi.com.br>', para: 'p@g.test' }], ['xpinc.com', 'xpi.com.br'], 'p@g.test').length === 1, 'acha pessoa em qualquer domínio da empresa');
console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
