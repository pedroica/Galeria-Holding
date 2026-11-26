// Testes das regras de prazos e reuniões (prazos.js).
import '../prazos.js';
const P = globalThis.Prazos;
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

// Datas
ok(P.somaDiasUteis('2026-11-27', 1) === '2026-11-30', 'sexta + 1 dia útil = segunda');
ok(P.somaDiasUteis('2026-11-26', 5) === '2026-12-03', 'quinta + 5 dias úteis = quinta seguinte');
ok(P.segundaDaSemana('2026-11-26') === '2026-11-23' && P.segundaDaSemana('2026-11-29') === '2026-11-23', 'segunda da semana (domingo pertence à semana que acaba)');
ok(P.domingoDaSemana('2026-11-26') === '2026-11-29', 'fim da semana = domingo');
ok(P.hojeBRT(Date.parse('2026-11-27T02:30:00Z')) === '2026-11-26', 'hoje em São Paulo (23h30 de quinta ainda é quinta)');
ok(P.diasDeAtraso('2026-11-20', '2026-11-26') === 6, 'dias de atraso');

// Prazos
const ops = [
  { id: 'a', estagio: 'Negociação', proximo_passo: 'mandar proposta', proximo_passo_em: '2026-11-20' },
  { id: 'b', estagio: 'Contato direto', proximo_passo: 'ligar', proximo_passo_em: '2026-11-26' },
  { id: 'c', estagio: 'Concorrências', proximo_passo: 'RFI', proximo_passo_em: '2026-11-28' },
  { id: 'd', estagio: 'Wishlist', proximo_passo: 'x', proximo_passo_em: '2026-12-15' },
  { id: 'e', estagio: 'Wishlist', proximo_passo: null, proximo_passo_em: null, atualizado_em: '2026-10-01' },
  { id: 'f', estagio: 'Negociação', proximo_passo: null, proximo_passo_em: null, atualizado_em: '2026-11-01' },
  { id: 'g', estagio: 'Cliente ativo', proximo_passo_em: null },
  { id: 'h', estagio: 'Perdido', proximo_passo_em: '2026-11-01' },
  { id: 'i', estagio: 'Negociação', proximo_passo_em: '2026-11-01', apagado_em: '2026-11-02' }
];
const g = P.agruparPrazos(ops, '2026-11-26');
ok(g.vencidos.map(o => o.id).join() === 'a', 'vencido: data antes de hoje');
ok(g.hoje.map(o => o.id).join() === 'b', 'hoje');
ok(g.semana.map(o => o.id).join() === 'c', 'esta semana: até domingo');
ok(g.depois.map(o => o.id).join() === 'd', 'depois desta semana');
ok(g.semPrazo.map(o => o.id).join() === 'f,e', 'sem prazo: mais perto de fechar primeiro');
ok(!JSON.stringify(g).includes('"g"') && !JSON.stringify(g).includes('"h"') && !JSON.stringify(g).includes('"i"'), 'cliente ativo, perdido e apagado não entram');

// Validação ao salvar
ok(P.validarProximoPasso({ estagio: 'Negociação', proximo_passo: '', proximo_passo_em: '2026-12-01' }) !== null, 'oportunidade aberta sem próximo passo: bloqueia');
ok(P.validarProximoPasso({ estagio: 'Negociação', proximo_passo: 'mandar contrato', proximo_passo_em: null }) !== null, 'oportunidade aberta sem data: bloqueia');
ok(P.validarProximoPasso({ estagio: 'Negociação', proximo_passo: 'mandar contrato', proximo_passo_em: '2026-12-01' }) === null, 'com passo e data: salva');
ok(P.validarProximoPasso({ estagio: 'Perdido', proximo_passo: '', proximo_passo_em: null }) === null, 'perdida não exige prazo');

// Reuniões
const linhas = [
  { id: 'r1', empresa_id: 'ypê', marcada_em: '2026-11-25T22:30:00Z', reuniao_em: '2027-01-18T14:00:00Z' },
  { id: 'r2', empresa_id: 'ypê', marcada_em: '2026-11-25T22:31:00Z', reuniao_em: '2027-01-18T14:00:00Z' },
  { id: 'r3', empresa_id: 'google', marcada_em: '2026-11-26T01:00:00Z', reuniao_em: null },
  { id: 'r4', empresa_id: 'velha', marcada_em: '2026-11-20T15:00:00Z', reuniao_em: '2026-11-21T15:00:00Z' },
  { id: 'r5', empresa_id: 'domingo', marcada_em: '2026-11-23T02:00:00Z', reuniao_em: null }
];
const sem = P.reunioesDaSemana(linhas, '2026-11-26');
ok(sem.length === 2 && sem.map(r => r.empresa_id).sort().join() === 'google,ypê', 'semana: uma por empresa, a partir de segunda (domingo 23h BRT fica fora)');
const prox = P.proximasReunioes(linhas, '2026-11-26T12:00:00Z');
ok(prox.length === 1 && prox[0].empresa_id === 'ypê', 'próximas: só as com data futura, sem repetir empresa no mesmo dia');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
