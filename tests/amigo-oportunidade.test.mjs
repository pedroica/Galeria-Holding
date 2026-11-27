// Amigo: criar oportunidade (lib/amigo-wa.js, criar_oportunidade).
import { AMIGO_TOOL_DEFS, execAmigo, executarPendente, diasUteis } from '../lib/amigo-wa.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

function montar({ empresas, ops }) {
  const T = { post: [] };
  const rota = async (u0, mt, body) => {
    const tab = (u0.match(/\/rest\/v1\/([a-z_]+)/) || [])[1] || '';
    if (mt === 'POST') { T.post.push([tab, body]); return [Object.assign({ id: tab === 'crm_empresas' ? 'eNova' : 'opNova' }, body)]; }
    if (tab === 'crm_agencias') return [{ id: 'agMila', nome: 'Milà' }, { id: 'ag404', nome: '404' }, { id: 'agGH', nome: 'Galeria Holding' }];
    if (tab === 'crm_empresas') return empresas;
    if (tab === 'crm_oportunidades') return ops;
    return [];
  };
  const ctx = { req: async (p, o = {}) => rota(decodeURIComponent(p), (o.method || 'GET').toUpperCase(), o.body ? JSON.parse(o.body) : null), pendente: null };
  return { T, ctx };
}

ok(AMIGO_TOOL_DEFS.some(t => t.name === 'criar_oportunidade'), 'ferramenta declarada');
ok(diasUteis('2026-11-27', 2) === '2026-12-01' && diasUteis('2026-11-23', 1) === '2026-11-24', 'dias úteis pulam fim de semana');

// 1) Empresa existe, sem oportunidade aberta → cria direto.
let { T, ctx } = montar({ empresas: [{ id: 'eNat', nome: 'Natura' }], ops: [{ id: 'o1', titulo: 'Natura velha', estagio: 'Perdido' }] });
let r = await execAmigo('criar_oportunidade', { empresa: 'Natura', agencia: 'Mila', etapa: 'Primeira reunião', oferta: 'CR.IA', passo: 'Reunião com a CMO', data: '2026-12-03', valor: 80000, nota: 'indicação do João' }, ctx);
const op = T.post.find(p => p[0] === 'crm_oportunidades');
const ev = T.post.find(p => p[0] === 'crm_oportunidade_eventos');
ok(r.ok && r.criada && !ctx.pendente, 'empresa existente sem aberta: cria direto');
ok(op && op[1].empresa_id === 'eNat' && op[1].agencia_id === 'agMila' && op[1].estagio === 'Primeira reunião' && op[1].oferta === 'CR.IA' && op[1].valor_estimado === 80000 && op[1].proximo_passo === 'Reunião com a CMO' && op[1].proximo_passo_em === '2026-12-03' && op[1].titulo === 'Natura — Milà', 'grava empresa, agência (sem acento), etapa, oferta, valor, passo e prazo');
ok(ev && ev[1].tipo === 'criada' && /indicação do João/.test(ev[1].texto), 'evento "criada" com a nota');
ok(!T.post.some(p => p[0] === 'crm_empresas'), 'não cria empresa repetida');

// 2) Sem passo/data em etapa aberta → padrão 2 dias úteis, com aviso.
({ T, ctx } = montar({ empresas: [{ id: 'eNat', nome: 'Natura' }], ops: [] }));
r = await execAmigo('criar_oportunidade', { empresa: 'Natura' }, ctx);
const op2 = T.post.find(p => p[0] === 'crm_oportunidades')[1];
ok(op2.estagio === 'Wishlist' && op2.proximo_passo === 'Primeiro contato' && /^\d{4}-\d{2}-\d{2}$/.test(op2.proximo_passo_em) && r.avisos.length === 1 && op2.oferta === 'outro' && op2.origem === 'abordagem_direta', 'sem prazo: Primeiro contato em 2 dias úteis, avisando');

// 3) Empresa nova → pendente; só cria no "manda", com a empresa.
({ T, ctx } = montar({ empresas: [], ops: [] }));
r = await execAmigo('criar_oportunidade', { empresa: 'Padaria Real', agencia: '404' }, ctx);
ok(r.pronto && r.empresa_nova && ctx.pendente && ctx.pendente.tipo === 'oportunidade' && T.post.length === 0, 'empresa nova: fica pendente, nada gravado');
const txt = await executarPendente(ctx.pendente, ctx);
const emp = T.post.find(p => p[0] === 'crm_empresas');
const op3 = T.post.find(p => p[0] === 'crm_oportunidades');
ok(emp && emp[1].nome === 'Padaria Real' && emp[1].fonte === 'amigo' && op3 && op3[1].empresa_id === 'eNova' && op3[1].agencia_id === 'ag404' && /Oportunidade criada/.test(txt) && /Empresa nova/.test(txt), 'no "manda": cria empresa e oportunidade');

// 4) Já tem oportunidade aberta → pendente.
({ T, ctx } = montar({ empresas: [{ id: 'eXP', nome: 'XP Inc' }], ops: [{ id: 'oXP', titulo: 'XP Inc — 404', estagio: 'Contato direto' }] }));
r = await execAmigo('criar_oportunidade', { empresa: 'XP Inc', agencia: 'Milà' }, ctx);
ok(r.pronto && /já tem oportunidade aberta/.test(r.porque) && T.post.length === 0, 'já tem aberta: pede confirmação antes de duplicar');

// 5) Erros.
({ T, ctx } = montar({ empresas: [], ops: [] }));
r = await execAmigo('criar_oportunidade', { empresa: 'Natura', agencia: 'Agência X' }, ctx);
ok(r.erro && /agência/.test(r.erro) && T.post.length === 0, 'agência desconhecida: erro, nada gravado');
r = await execAmigo('criar_oportunidade', { empresa: 'Natura', data: '03/12' }, ctx);
ok(r.erro && T.post.length === 0, 'data em formato errado: erro');
r = await execAmigo('criar_oportunidade', { empresa: 'Natura', etapa: 'Perdido' }, montar({ empresas: [{ id: 'e', nome: 'Natura' }], ops: [] }).ctx);
ok(r.ok && r.proximo_passo === null, 'etapa encerrada não leva prazo');

console.log(`\n${n - fail}/${n} ok`); if (fail) process.exit(1);
