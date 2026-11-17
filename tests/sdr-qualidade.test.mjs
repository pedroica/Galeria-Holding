// tests/sdr-qualidade.test.mjs — Bloco C: controle de qualidade (lib/sdr-qualidade.js).
// Rodar: node tests/sdr-qualidade.test.mjs
import { checagensCodigo, decisao } from '../lib/sdr-qualidade.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

const dossie = { sinais: [{ tipo: 'lancamento', fato: 'Acme lança linha X', url: 'https://x/1' }] };
const empresa = { nome: 'Acme' };
const decisor = { nome: 'Ana Souza' };
const corpoOk = 'Ana, vi que a Acme ' + Array.from({ length: 60 }, (_, i) => 'termo' + i).join(' ') + ' faz sentido conversarmos?';

console.log('Qualidade — checagens por código');
let c = checagensCodigo({ mensagem: { assunto: 'Acme e uma ideia', corpo: corpoOk, sinal_url: 'https://x/1' }, dossie, caso: null, decisor, empresa, canal: 'email' });
ok(c.ok, 'mensagem com lastro e forma ok passa (' + JSON.stringify(c.falhas) + ')');

c = checagensCodigo({ mensagem: { assunto: 'Acme e uma ideia', corpo: corpoOk }, dossie, caso: null, decisor, empresa, canal: 'email' });
ok(!c.ok && c.falhas.some(f => /lastro/.test(f)), 'sem sinal_url reprova por falta de lastro');

c = checagensCodigo({ mensagem: { assunto: 'Acme e uma ideia', corpo: corpoOk + ' crescemos 300% no ano?', sinal_url: 'https://x/1' }, dossie, caso: { resultado: 'subiu 13 mil carros' }, decisor, empresa, canal: 'email' });
ok(!c.ok && c.falhas.some(f => /numeros/.test(f)), 'número que não bate com o case reprova');

c = checagensCodigo({ mensagem: { assunto: 'uma ideia qualquer', corpo: 'Oi ' + Array.from({ length: 62 }, (_, i) => 'x' + i).join(' ') + ' topa?', sinal_url: 'https://x/1' }, dossie, caso: null, decisor, empresa, canal: 'email' });
ok(!c.ok && c.falhas.some(f => /personalizacao/.test(f)), 'sem nome do decisor nem empresa reprova');

console.log('\nQualidade — decisão (nota mínima 8 + risco baixo)');
const checOk = { ok: true, falhas: [] };
let d = decisao({ aderencia: 9, especificidade: 8, naturalidade: 9, clareza: 8, risco: 2 }, checOk, 8);
ok(d.aprovado_autonomo === true && d.nota_media === 8.5, 'tudo >=8 e risco baixo → aprovado autônomo (média 8.5)');

d = decisao({ aderencia: 9, especificidade: 7, naturalidade: 9, clareza: 8, risco: 2 }, checOk, 8);
ok(d.aprovado_autonomo === false && /especificidade/.test(d.motivo), 'uma nota < 8 → reprova com motivo');

d = decisao({ aderencia: 9, especificidade: 9, naturalidade: 9, clareza: 9, risco: 6 }, checOk, 8);
ok(d.aprovado_autonomo === false && /risco/.test(d.motivo), 'risco alto → reprova mesmo com notas altas');

d = decisao({ aderencia: 9, especificidade: 9, naturalidade: 9, clareza: 9, risco: 1 }, { ok: false, falhas: ['forma: corpo curto'] }, 8);
ok(d.aprovado_autonomo === false && /forma/.test(d.motivo), 'checagem de código reprovada → não aprova autônomo');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
