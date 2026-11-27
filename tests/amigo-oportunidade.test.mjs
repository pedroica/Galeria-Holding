// Amigo com autonomia (26/11): criar/editar oportunidade, cadastrar pessoa, pipeline e Google Agenda.
import { AMIGO_TOOL_DEFS, execAmigo, executarPendente, diasUteis } from '../lib/amigo-wa.js';
import { isoBrasilia, montarEvento } from '../lib/agenda-google.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

function montar({ empresas = [], ops = [], pessoas = [], semEscopo = false, eventos = [] } = {}) {
  const T = { post: [], patch: [], cal: [] };
  const rota = async (u0, mt, body) => {
    const tab = (u0.match(/\/rest\/v1\/([a-z_]+)/) || [])[1] || '';
    if (mt === 'POST') { T.post.push([tab, body]); return [Object.assign({ id: tab === 'crm_empresas' ? 'eNova' : 'opNova' }, body)]; }
    if (mt === 'PATCH') { T.patch.push([u0, body]); return null; }
    if (tab === 'crm_agencias') return [{ id: 'agMila', nome: 'Milà' }, { id: 'ag404', nome: '404' }, { id: 'agGH', nome: 'Galeria Holding' }];
    if (tab === 'crm_empresas') return empresas;
    if (tab === 'crm_oportunidades') return ops;
    if (tab === 'crm_decisores') return pessoas;
    return [];
  };
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url), mt = (o.method || 'GET').toUpperCase();
    T.cal.push(mt + ' ' + u);
    if (semEscopo) return json({ error: { message: 'Request had insufficient authentication scopes.' } }, 403);
    if (mt === 'GET') return json({ items: eventos });
    if (mt === 'DELETE') return new Response(null, { status: 204 });
    const b = o.body ? JSON.parse(o.body) : {};
    return json(Object.assign({ id: 'ev1', hangoutLink: b.conferenceData ? 'https://meet.google.com/abc' : undefined }, b, mt === 'PATCH' ? { start: b.start || { dateTime: '2026-12-03T15:00:00-03:00' } } : {}));
  };
  const ctx = { req: async (p, o = {}) => rota(decodeURIComponent(p), (o.method || 'GET').toUpperCase(), o.body ? JSON.parse(o.body) : null), pendente: null,
    gmail: { obter: async () => ({ token: 't', email: 'p@g.test' }) } };
  return { T, ctx };
}
const de = (T, tab) => T.post.filter(p => p[0] === tab).map(p => p[1]);

ok(['criar_oportunidade', 'atualizar_oportunidade', 'cadastrar_pessoa', 'pipeline', 'ver_agenda', 'marcar_reuniao', 'remarcar_reuniao', 'cancelar_reuniao'].every(x => AMIGO_TOOL_DEFS.some(t => t.name === x)), 'ferramentas novas declaradas');
ok(diasUteis('2026-11-27', 2) === '2026-12-01' && diasUteis('2026-11-23', 1) === '2026-11-24', 'dias úteis pulam fim de semana');

// Criar: empresa existente → direto.
let { T, ctx } = montar({ empresas: [{ id: 'eNat', nome: 'Natura' }], ops: [{ id: 'o1', titulo: 'Natura velha', estagio: 'Perdido' }] });
let r = await execAmigo('criar_oportunidade', { empresa: 'Natura', agencia: 'Mila', etapa: 'Primeira reunião', oferta: 'CR.IA', passo: 'Reunião com a CMO', data: '2026-12-03', valor: 80000, nota: 'indicação do João' }, ctx);
let op = de(T, 'crm_oportunidades')[0];
ok(r.ok && !ctx.pendente && op.empresa_id === 'eNat' && op.agencia_id === 'agMila' && op.estagio === 'Primeira reunião' && op.oferta === 'CR.IA' && op.valor_estimado === 80000 && op.proximo_passo_em === '2026-12-03' && op.titulo === 'Natura — Milà', 'cria direto com agência (sem acento), etapa, oferta, valor e prazo');
ok(/indicação do João/.test(de(T, 'crm_oportunidade_eventos')[0].texto) && !de(T, 'crm_empresas').length, 'evento "criada" com a nota; não duplica empresa');

// Empresa nova → cria empresa e oportunidade na hora; sem prazo → padrão.
({ T, ctx } = montar());
r = await execAmigo('criar_oportunidade', { empresa: 'Padaria Real', agencia: '404' }, ctx);
op = de(T, 'crm_oportunidades')[0];
ok(r.ok && r.empresa_nova && !ctx.pendente && de(T, 'crm_empresas')[0].fonte === 'amigo' && op.empresa_id === 'eNova' && op.estagio === 'Wishlist' && op.proximo_passo === 'Primeiro contato' && r.avisos.length === 2, 'empresa nova: cadastra e cria na hora, prazo padrão com aviso');

// Já tem aberta → cria e avisa.
({ T, ctx } = montar({ empresas: [{ id: 'eXP', nome: 'XP Inc' }], ops: [{ id: 'oXP', titulo: 'XP Inc — 404', estagio: 'Contato direto' }] }));
r = await execAmigo('criar_oportunidade', { empresa: 'XP Inc', agencia: 'Milà' }, ctx);
ok(r.ok && r.avisos.some(a => /já tinha oportunidade aberta/.test(a)) && de(T, 'crm_oportunidades').length === 1, 'já tinha aberta: cria e avisa');
r = await execAmigo('criar_oportunidade', { empresa: 'Natura', agencia: 'Agência X' }, montar().ctx);
ok(r.erro && /agência/.test(r.erro), 'agência desconhecida: erro');

// Atualizar.
({ T, ctx } = montar({ empresas: [{ id: 'eXP', nome: 'XP Inc' }], ops: [{ id: 'oXP', titulo: 'XP Inc — 404', estagio: 'Contato direto', oferta: 'outro', agencia_id: 'ag404', proximo_passo: 'x', proximo_passo_em: '2026-12-01' }] }));
r = await execAmigo('atualizar_oportunidade', { empresa: 'XP', valor: 120000, agencia: 'Milà', oferta: 'GEO', nota: 'pediram proposta' }, ctx);
const p = T.patch.find(([u]) => /oXP/.test(u))[1];
ok(r.ok && p.valor_estimado === 120000 && p.agencia_id === 'agMila' && p.oferta === 'GEO' && de(T, 'crm_auditoria').length === 3 && de(T, 'crm_oportunidade_eventos').some(e => e.texto === 'pediram proposta'), 'atualiza valor/agência/oferta com auditoria e nota');
({ T, ctx } = montar({ empresas: [{ id: 'eXP', nome: 'XP Inc' }], ops: [{ id: 'oXP', titulo: 'XP', estagio: 'Wishlist' }] }));
r = await execAmigo('mover_etapa', { empresa: 'XP', etapa: 'Negociação' }, ctx);
ok(r.ok && T.patch[0][1].estagio === 'Negociação' && T.patch[0][1].proximo_passo && r.avisos.length === 1, 'mover para etapa aberta sem prazo: põe prazo padrão');

// Cadastrar pessoa.
({ T, ctx } = montar({ empresas: [{ id: 'eNat', nome: 'Natura' }] }));
r = await execAmigo('cadastrar_pessoa', { empresa: 'Natura', nome: 'Ana Souza', cargo: 'CMO', email: 'Ana@natura.net', whatsapp: '(11) 98888-7777' }, ctx);
const d = de(T, 'crm_decisores')[0];
ok(r.ok && d.empresa_id === 'eNat' && d.email === 'ana@natura.net' && d.wa === '5511988887777' && d.etapa_cadencia === 'off' && d.fonte === 'amigo', 'cadastra pessoa nova (fora da cadência do SDR)');
({ T, ctx } = montar({ empresas: [{ id: 'eNat', nome: 'Natura' }], pessoas: [{ id: 'dAna', nome: 'Ana Souza', email: null }] }));
r = await execAmigo('cadastrar_pessoa', { empresa: 'Natura', nome: 'Ana', email: 'ana@natura.net' }, ctx);
ok(r.atualizada && T.patch[0][1].email === 'ana@natura.net' && !de(T, 'crm_decisores').length, 'pessoa existente: completa em vez de duplicar');

// Pipeline.
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
({ ctx } = montar({ ops: [{ titulo: 'A', estagio: 'Negociação', valor_estimado: 100, proximo_passo_em: '2020-01-01', agencia_id: 'agMila', crm_empresas: { nome: 'A' } }, { titulo: 'B', estagio: 'Wishlist', proximo_passo_em: hoje }, { titulo: 'C', estagio: 'Perdido' }] }));
r = await execAmigo('pipeline', {}, ctx);
ok(r.quantidade === 2 && r.atrasadas === 1 && r.por_etapa['Negociação'] === 1 && r.oportunidades[0].agencia === 'Milà', 'pipeline: só abertas, contagem por etapa e atrasadas');

// Agenda.
ok(isoBrasilia('2026-12-03T15:00') === '2026-12-03T15:00:00-03:00' && montarEvento({ titulo: 'x', inicio: '2026-12-03T15:00', duracao: 30 }).end.dateTime === '2026-12-03T18:30:00.000Z', 'horário de Brasília e duração');
({ T, ctx } = montar({ empresas: [{ id: 'eNat', nome: 'Natura' }], ops: [{ id: 'oN', titulo: 'Natura', estagio: 'Wishlist' }], eventos: [{ id: 'e0', summary: 'Dentista', start: { dateTime: '2026-12-03T15:00:00-03:00' }, end: { dateTime: '2026-12-03T16:00:00-03:00' } }] }));
r = await execAmigo('ver_agenda', {}, ctx);
ok(r.compromissos[0].titulo === 'Dentista' && T.cal.some(c => /calendar\/v3/.test(c)), 'ver_agenda lê o Google Agenda');
r = await execAmigo('marcar_reuniao', { titulo: 'Bloco foco', inicio: '2099-12-03T15:00' }, ctx);
ok(r.ok && r.marcado && T.cal.some(c => /^POST .*sendUpdates=none/.test(c)) && r.choque.length === 1, 'sem convidados: marca direto, sem convite, avisa choque');
({ T, ctx } = montar({ empresas: [{ id: 'eNat', nome: 'Natura' }], ops: [{ id: 'oN', titulo: 'Natura', estagio: 'Wishlist' }] }));
r = await execAmigo('marcar_reuniao', { titulo: 'Galeria x Natura', inicio: '2099-12-03T10:00', convidados: ['ana@natura.net'], empresa: 'Natura', meet: true }, ctx);
ok(r.pronto && ctx.pendente.tipo === 'reuniao' && !T.cal.some(c => c.startsWith('POST')), 'com convidados: fica pendente do "manda", nada enviado');
const txt = await executarPendente(ctx.pendente, ctx);
ok(T.cal.some(c => /^POST .*sendUpdates=all/.test(c)) && /Convite enviado/.test(txt) && /meet\.google/.test(txt) && de(T, 'crm_toques')[0].resultado === 'reuniao_marcada' && T.patch.some(([u, b]) => /oN/.test(u) && b.estagio === 'Primeira reunião'), 'no "manda": convite sai, toque de reunião e oportunidade vai para Primeira reunião');
({ T, ctx } = montar({ eventos: [{ id: 'e5', summary: 'Café', start: { dateTime: '2099-12-03T15:00:00-03:00' }, end: { dateTime: '2099-12-03T16:00:00-03:00' }, attendees: [{ email: 'x@y.com' }] }] }));
r = await execAmigo('cancelar_reuniao', { id: 'e5' }, ctx);
ok(r.pronto && ctx.pendente.tipo === 'cancelar_reuniao' && !T.cal.some(c => c.startsWith('DELETE')), 'cancelar com convidados: pendente');
({ ctx } = montar({ semEscopo: true }));
r = await execAmigo('ver_agenda', {}, ctx);
ok(r.reconectar && /Reconectar Google/.test(r.erro), 'sem permissão da agenda: explica como liberar');

console.log(`\n${n - fail}/${n} ok`); if (fail) process.exit(1);
