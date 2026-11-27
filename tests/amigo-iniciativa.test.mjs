// Amigo propositivo: horários, gatilhos do vigia, instruções e o liga/desliga dos avisos.
import { relogioBR, podeAvisar, avisosLigados, gatilhosVigia, instrucaoIniciativa, semNovidade } from '../lib/amigo-iniciativa.js';
import { execAmigo } from '../lib/amigo-wa.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

const qui10 = new Date('2026-11-26T13:00:00Z'); // quinta 10h BRT
ok(relogioBR(qui10).dia === 4 && relogioBR(qui10).hora === 10, 'relógio em Brasília');
ok(podeAvisar(qui10) && !podeAvisar(new Date('2026-11-26T23:30:00Z')) && !podeAvisar(new Date('2026-11-28T13:00:00Z')) && !podeAvisar(qui10, ['2026-11-26']), 'avisa só em dia útil, 8h-20h, fora de feriado');
ok(avisosLigados(null, 'manha') && !avisosLigados({ vigia: false }, 'vigia') && avisosLigados({ vigia: false }, 'fim'), 'avisos ligados por padrão; desliga por tipo');

const agora = new Date('2026-11-26T13:00:00Z');
const em45 = new Date(agora.getTime() + 45 * 60000).toISOString();
const em10 = new Date(agora.getTime() + 10 * 60000).toISOString();
const g = gatilhosVigia({
  respostas: [{ id: 't1', pessoa: 'Bárbara', empresa: 'OLX', canal: 'email', resumo: 'Pode ser segunda?', resultado: 'respondeu' }, { id: 't2', resultado: 'bounce' }, { id: 't3', pessoa: 'Velho', resultado: 'resposta' }],
  eventos: [{ id: 'e1', titulo: 'Galeria x Santa Helena', inicio: em45, convidados: ['Sabrina <s@sh.com>'] }, { id: 'e2', titulo: 'Dentista', inicio: em45, convidados: [] }, { id: 'e3', titulo: 'Cedo demais', inicio: em10, convidados: ['x@y.com'] }],
  reunioesCrm: [{ id: 'r1', empresa: 'Santa Helena', reuniao_em: em45 }, { id: 'r2', empresa: 'Ypê', reuniao_em: em45 }],
  movs: [{ id: 'm1', pessoa: 'Ana', cargo: 'CMO', empresa: 'Natura', empresa_anterior: 'Avon' }],
  avisadas: ['resp:t3'], agora
});
const tipos = g.map(i => i.chave);
ok(tipos.includes('resp:t1') && !tipos.includes('resp:t2') && !tipos.includes('resp:t3'), 'resposta nova avisa; bounce e já avisada não');
ok(tipos.includes('ev:e1') && !tipos.includes('ev:e2') && !tipos.includes('ev:e3'), 'reunião com convidados em 25-80 min; compromisso sem gente e muito em cima não');
ok(!tipos.includes('reu:r1') && tipos.includes('reu:r2'), 'reunião do CRM que já está na agenda não duplica');
ok(tipos.includes('mov:m1') && g.find(i => i.chave === 'mov:m1').texto.includes('vinha da Avon'), 'mudança de cargo vira aviso');

const im = instrucaoIniciativa('manha');
ok(/INICIATIVA/.test(im) && /SEM_NOVIDADE/.test(im) && /minha_agenda/.test(im) && /ações propostas/.test(im), 'instrução da manhã: briefing + ações numeradas');
ok(/Bárbara/.test(instrucaoIniciativa('vigia', g)) && /preparar_mensagem/.test(instrucaoIniciativa('vigia', g)), 'instrução do vigia lista os gatilhos e manda preparar a resposta');
ok(semNovidade('SEM_NOVIDADE') && semNovidade('') && !semNovidade('Bom dia! 3 coisas…'), 'SEM_NOVIDADE não é enviado');

const T = []; let valor = null;
const ctx = { req: async (p, o = {}) => { if ((o.method || 'GET') === 'GET') return valor ? [{ valor }] : []; T.push(JSON.parse(o.body)); valor = JSON.parse(o.body).valor; return null; } };
let r = await execAmigo('avisos', {}, ctx);
ok(r.ok && !r.mudou.length && Object.values(r.avisos).every(Boolean) && !T.length, 'avisos: mostra sem mudar');
r = await execAmigo('avisos', { vigia: false }, ctx);
ok(r.mudou[0] === 'vigia' && T[0].chave === 'amigo_avisos' && T[0].valor.vigia === false && T[0].valor.manha === true, 'avisos: desliga o vigia e mantém o resto');

console.log(`\n${n - fail}/${n} ok`); if (fail) process.exit(1);
