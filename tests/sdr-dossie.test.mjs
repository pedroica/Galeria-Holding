// tests/sdr-dossie.test.mjs — Bloco B: montagem do dossiê (lib/sdr-dossie.js).
// Rodar: node tests/sdr-dossie.test.mjs
import { classificarSinal, ganchoProibido, extrairSinais, montarDossie } from '../lib/sdr-dossie.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const hoje = new Date().toISOString().slice(0, 10);
const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

console.log('Dossiê — taxonomia e extração de sinais');

// classificação
ok(classificarSinal('Marca lança nova linha de produtos') === 'lancamento', 'lançamento classificado');
ok(classificarSinal('Empresa nomeia novo CMO para o Brasil') === 'troca_cmo', 'troca de CMO classificada');
ok(classificarSinal('Companhia anuncia aquisição de concorrente') === 'ma_investimento', 'M&A classificado');
ok(classificarSinal('Varejista inaugura nova loja em SP') === 'expansao', 'expansão classificada');
ok(classificarSinal('Notícia qualquer sem gancho de marketing') === null, 'texto sem sinal → null');

// ganchos proibidos
ok(ganchoProibido('Empresa anuncia demissão em massa'), 'demissão em massa é gancho proibido');
ok(ganchoProibido('Escândalo e processo judicial contra a marca'), 'escândalo/processo é proibido');
ok(!ganchoProibido('Marca lança campanha nova'), 'campanha normal não é proibida');

// extração: trecho obrigatório, dedup, janela, filtro de gancho
const itens = [
  { titulo: 'Acme lança nova linha premium', url: 'https://a.com/1', fonte: 'Exame', data: hoje, resumo: 'A Acme lança nova linha premium nesta semana, diz a empresa.' },
  { titulo: 'Acme lança nova linha premium', url: 'https://a.com/1', fonte: 'Exame', data: hoje, resumo: 'duplicata mesma url' },
  { titulo: 'Acme demite 200 funcionários', url: 'https://a.com/2', fonte: 'Valor', data: hoje, resumo: 'Corte de pessoal.' },
  { titulo: 'Acme nomeia novo CMO', url: 'https://a.com/3', fonte: 'M&M', data: diasAtras(400), resumo: 'A Acme nomeia novo CMO.' }, // fora da janela
  { titulo: 'Fofoca do dia', url: 'https://a.com/4', fonte: 'Blog', data: hoje, resumo: 'nada de marketing aqui' }, // sem tipo
];
const sinais = extrairSinais(itens, { janelaDias: 120 });
ok(sinais.length === 1, 'só 1 sinal válido (dedup + gancho proibido + fora de janela + sem tipo filtrados) — ' + sinais.length);
ok(sinais[0].tipo === 'lancamento' && sinais[0].url === 'https://a.com/1', 'o sinal válido é o lançamento com url correta');
ok(sinais[0].trecho && /lan[çc]a nova linha/i.test(sinais[0].trecho), 'guarda o trecho comprobatório');

// dossiê
const d = montarDossie({ id: 'e1', nome: 'Acme' }, itens);
ok(d.tem_sinal === true && d.sinais.length === 1, 'dossiê com 1 sinal e tem_sinal=true');
ok(/Acme/.test(d.resumo), 'resumo cita a empresa');

const vazio = montarDossie({ id: 'e2', nome: 'SemNews' }, []);
ok(vazio.tem_sinal === false && /Sem sinal/.test(vazio.resumo), 'empresa sem notícia → tem_sinal=false');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
