// lib/amigo-wa.js — ferramentas do "amigo no WhatsApp" do Pedro (Copiloto no WhatsApp).
// Pedido de 26/11: conversar pelo WhatsApp e o agente buscar no CRM, ler o WhatsApp dele,
// preparar e-mails e WhatsApps e mandar e-mail. Regras:
//  - Ler, preparar, criar rascunho e marcar prazo: direto.
//  - Enviar e-mail e mover etapa: viram AÇÃO PENDENTE; só executam quando o Pedro responde
//    "manda" (ou "sim", "pode"). Qualquer outra resposta descarta. Resposta a quem
//    respondeu nunca sai sozinha: é sempre o "manda" do Pedro.
//  - WhatsApp para terceiros nunca sai pelo sistema: o amigo devolve o link wa.me com o
//    texto pronto e o Pedro aperta enviar no app dele.
// ctx = { req(path, opts) → JSON (service key), supaUrl, serviceKey, envKey, gmail: {obter, criar, enviar} }
import { casarEmpresa } from './captura.js';
import { gerarFollowup } from './followup.js';
import { numeroWa } from './wa-pipeline.js';

const ABERTA = (e) => !['Perdido', 'Cliente ativo', 'Pausado'].includes(e);
const fmt = (iso) => { const s = String(iso || '').slice(0, 10); return s ? s.split('-').reverse().join('/') : ''; };
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const enc = encodeURIComponent;

export const AMIGO_TOOL_DEFS = [
  { name: 'minha_agenda', description: 'O que o Pedro tem para fazer: prazos de oportunidades (vencidos, hoje, próximos 7 dias), próximas reuniões, respostas recentes de clientes e sugestões de mudança no pipeline esperando decisão. Use para "o que tenho hoje?", "bom dia", "como estou?".', input_schema: { type: 'object', properties: {} } },
  { name: 'ler_whatsapp', description: 'Lê as conversas do WhatsApp pessoal do Pedro (copiadas do Mac dele). Por pessoa ou empresa (as últimas mensagens da conversa) ou por busca de texto em todas as conversas.', input_schema: { type: 'object', properties: { pessoa: { type: 'string', description: 'Nome do contato' }, empresa: { type: 'string' }, busca: { type: 'string', description: 'Palavra ou frase para procurar nas mensagens' }, limite: { type: 'number' } } } },
  { name: 'oportunidade', description: 'Ficha de uma empresa no pipeline: oportunidade(s), etapa, próximo passo e prazo, pessoas (com e-mail/WhatsApp) e últimos toques.', input_schema: { type: 'object', properties: { empresa: { type: 'string' } }, required: ['empresa'] } },
  { name: 'preparar_mensagem', description: 'Escreve um WhatsApp ou e-mail para alguém de uma empresa, no estilo do Pedro, pesquisando a empresa na internet e lendo o histórico (CRM e WhatsApp). WhatsApp: devolve o texto e um link que abre o WhatsApp do Pedro com a mensagem pronta. E-mail: devolve assunto e texto e deixa pronto para enviar quando o Pedro responder "manda".', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, pessoa: { type: 'string', description: 'Nome da pessoa (opcional)' }, canal: { type: 'string', enum: ['whatsapp', 'email'] }, pedido: { type: 'string', description: 'O que o Pedro quer com a mensagem' } }, required: ['empresa', 'canal'] } },
  { name: 'enviar_email', description: 'Prepara o envio de um e-mail que o Pedro ditou ou ajustou (para alguém do CRM). NÃO envia: deixa pendente e o Pedro confirma respondendo "manda".', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, pessoa: { type: 'string' }, assunto: { type: 'string' }, corpo: { type: 'string' } }, required: ['pessoa', 'assunto', 'corpo'] } },
  { name: 'rascunho_email', description: 'Cria um rascunho no Gmail do Pedro (não envia).', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, pessoa: { type: 'string' }, assunto: { type: 'string' }, corpo: { type: 'string' } }, required: ['pessoa', 'assunto', 'corpo'] } },
  { name: 'definir_prazo', description: 'Marca o próximo passo e a data de uma oportunidade (ex.: "cobrar a XP sexta").', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, passo: { type: 'string' }, data: { type: 'string', description: 'AAAA-MM-DD' } }, required: ['empresa', 'passo', 'data'] } },
  { name: 'mover_etapa', description: 'Prepara a mudança de etapa de uma oportunidade (Wishlist, Primeira reunião, Contato direto, Negociando direto, Concorrências, Negociação, Cliente ativo, Perdido, Pausado). NÃO aplica: o Pedro confirma respondendo "manda".', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, etapa: { type: 'string', enum: ['Wishlist', 'Primeira reunião', 'Contato direto', 'Negociando direto', 'Concorrências', 'Negociação', 'Cliente ativo', 'Perdido', 'Pausado'] }, motivo: { type: 'string' } }, required: ['empresa', 'etapa'] } }
];

async function acharEmpresa(ctx, nome) {
  const n = String(nome || '').trim(); if (!n) return null;
  const palavra = n.split(/\s+/).sort((a, b) => b.length - a.length)[0];
  const rows = await ctx.req('/rest/v1/crm_empresas?apagado_em=is.null&nome=ilike.' + enc('*' + palavra + '*') + '&select=id,nome,setor,setor_canonico,website,dominio&limit=40').catch(() => []);
  const lista = Array.isArray(rows) ? rows : [];
  if (!lista.length) return null;
  const m = casarEmpresa(n, lista);
  return (m && m.empresa) || lista[0];
}
async function opDaEmpresa(ctx, emp) {
  const ops = await ctx.req('/rest/v1/crm_oportunidades?empresa_id=eq.' + emp.id + '&apagado_em=is.null&select=id,titulo,estagio,oferta,agencia_id,empresa_id,proximo_passo,proximo_passo_em,atualizado_em&order=atualizado_em.desc.nullslast&limit=5').catch(() => []);
  const l = Array.isArray(ops) ? ops : [];
  return l.find(o => ABERTA(o.estagio)) || l[0] || null;
}
async function pessoasDaEmpresa(ctx, emp) {
  const d = await ctx.req('/rest/v1/crm_decisores?empresa_id=eq.' + emp.id + '&apagado_em=is.null&select=id,nome,cargo,email,wa,linkedin_url,observacoes,status&order=ultimo_toque_em.desc.nullslast&limit=30').catch(() => []);
  return (Array.isArray(d) ? d : []).filter(x => x.status !== 'saiu_da_empresa');
}
function acharPessoaNome(pessoas, nome) {
  const n = String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!n) return null;
  return pessoas.find(p => String(p.nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n)) || null;
}
async function pessoaPorNome(ctx, nome, empresa) {
  if (empresa) { const e = await acharEmpresa(ctx, empresa); if (e) { const p = acharPessoaNome(await pessoasDaEmpresa(ctx, e), nome); if (p) return Object.assign(p, { empresa: e }); } }
  const palavra = String(nome || '').trim().split(/\s+/)[0];
  const r = await ctx.req('/rest/v1/crm_decisores?apagado_em=is.null&nome=ilike.' + enc('*' + palavra + '*') + '&select=id,nome,cargo,email,wa,empresa_id,crm_empresas!empresa_id(id,nome)&limit=20').catch(() => []);
  const l = Array.isArray(r) ? r : [];
  const p = acharPessoaNome(l, nome) || l[0];
  return p ? Object.assign(p, { empresa: p.crm_empresas || null }) : null;
}

async function minhaAgenda(ctx) {
  const hoje = hojeBR();
  const em7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [ops, reun, resp, sug] = await Promise.all([
    ctx.req('/rest/v1/crm_oportunidades?apagado_em=is.null&proximo_passo_em=lte.' + em7 + '&select=titulo,estagio,proximo_passo,proximo_passo_em,crm_empresas!empresa_id(nome)&order=proximo_passo_em.asc&limit=40').catch(() => []),
    ctx.req('/rest/v1/crm_reunioes_v?reuniao_em=gte.' + new Date().toISOString() + '&select=empresa,reuniao_em,titulo&order=reuniao_em.asc&limit=10').catch(() => []),
    ctx.req('/rest/v1/crm_toques?direcao=eq.recebido&apagado_em=is.null&data=gte.' + new Date(Date.now() - 3 * 864e5).toISOString() + '&select=canal,resumo,data,crm_empresas!empresa_id(nome),crm_decisores!decisor_id(nome)&order=data.desc&limit=15').catch(() => []),
    ctx.req('/rest/v1/crm_gmail_sugestoes?status=eq.pendente&select=estagio_para,resumo,crm_empresas!empresa_id(nome)&order=criado_em.desc&limit=15').catch(() => [])
  ]);
  const abertas = (Array.isArray(ops) ? ops : []).filter(o => ABERTA(o.estagio));
  const nome = (o) => (o.crm_empresas && o.crm_empresas.nome) || o.titulo;
  return {
    hoje: fmt(hoje),
    vencidos: abertas.filter(o => o.proximo_passo_em < hoje).map(o => ({ empresa: nome(o), passo: o.proximo_passo, prazo: fmt(o.proximo_passo_em) })),
    para_hoje: abertas.filter(o => o.proximo_passo_em === hoje).map(o => ({ empresa: nome(o), passo: o.proximo_passo })),
    esta_semana: abertas.filter(o => o.proximo_passo_em > hoje).map(o => ({ empresa: nome(o), passo: o.proximo_passo, prazo: fmt(o.proximo_passo_em) })),
    reunioes: (Array.isArray(reun) ? reun : []).map(r => ({ empresa: r.empresa, quando: new Date(r.reuniao_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), titulo: r.titulo })),
    respostas_recentes: (Array.isArray(resp) ? resp : []).map(t => ({ empresa: t.crm_empresas && t.crm_empresas.nome, pessoa: t.crm_decisores && t.crm_decisores.nome, canal: t.canal, resumo: String(t.resumo || '').slice(0, 140), quando: fmt(t.data) })),
    sugestoes_pendentes: (Array.isArray(sug) ? sug : []).map(s => ({ empresa: s.crm_empresas && s.crm_empresas.nome, para: s.estagio_para, resumo: String(s.resumo || '').slice(0, 140) }))
  };
}

async function lerWhatsapp(ctx, { pessoa, empresa, busca, limite }) {
  const lim = Math.min(Number(limite) || 25, 60);
  if (busca && !pessoa && !empresa) {
    const r = await ctx.req('/rest/v1/crm_wa_mensagens?texto=ilike.' + enc('*' + busca + '*') + '&select=jid,de_mim,texto,enviada_em,autor_nome&order=enviada_em.desc&limit=' + lim).catch(() => []);
    const l = Array.isArray(r) ? r : [];
    const jids = [...new Set(l.map(m => m.jid))];
    const cv = jids.length ? await ctx.req('/rest/v1/crm_wa_conversas?jid=in.(' + jids.map(j => '"' + j + '"').join(',') + ')&select=jid,nome').catch(() => []) : [];
    const nomes = {}; (Array.isArray(cv) ? cv : []).forEach(c => { nomes[c.jid] = c.nome; });
    return { busca, achadas: l.map(m => ({ conversa: nomes[m.jid] || m.jid, quem: m.de_mim ? 'Pedro' : (m.autor_nome || nomes[m.jid] || 'contato'), quando: fmt(m.enviada_em), texto: String(m.texto || '').slice(0, 300) })) };
  }
  let conversas = [];
  if (empresa) { const e = await acharEmpresa(ctx, empresa); if (e) { const c = await ctx.req('/rest/v1/crm_wa_conversas?empresa_id=eq.' + e.id + '&select=jid,nome,ultima_em&order=ultima_em.desc.nullslast&limit=5').catch(() => []); conversas = Array.isArray(c) ? c : []; } }
  if (!conversas.length && pessoa) {
    const palavra = String(pessoa).trim().split(/\s+/)[0];
    const c = await ctx.req('/rest/v1/crm_wa_conversas?nome=ilike.' + enc('*' + palavra + '*') + '&select=jid,nome,ultima_em&order=ultima_em.desc.nullslast&limit=8').catch(() => []);
    const l = Array.isArray(c) ? c : [];
    const alvo = String(pessoa).toLowerCase();
    conversas = l.filter(x => String(x.nome || '').toLowerCase().includes(alvo)).concat(l).slice(0, 3);
  }
  if (!conversas.length) return { erro: 'Não achei conversa no WhatsApp com ' + (pessoa || empresa || 'esse contato') + '.' };
  const jids = conversas.map(c => c.jid);
  let filtro = '';
  if (busca) filtro = '&texto=ilike.' + enc('*' + busca + '*');
  const ms = await ctx.req('/rest/v1/crm_wa_mensagens?jid=in.(' + jids.map(j => '"' + j + '"').join(',') + ')' + filtro + '&select=jid,de_mim,texto,midia,enviada_em,autor_nome&order=enviada_em.desc&limit=' + lim).catch(() => []);
  const nomes = {}; conversas.forEach(c => { nomes[c.jid] = c.nome; });
  return { conversas: conversas.map(c => c.nome), mensagens: (Array.isArray(ms) ? ms : []).reverse().map(m => ({ quem: m.de_mim ? 'Pedro' : (m.autor_nome || nomes[m.jid] || 'contato'), quando: new Date(m.enviada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), texto: String(m.texto || m.midia || '').slice(0, 400) })) };
}

async function fichaOportunidade(ctx, { empresa }) {
  const e = await acharEmpresa(ctx, empresa);
  if (!e) return { erro: 'Não achei a empresa ' + empresa + ' no CRM.' };
  const [ops, pessoas, toques] = await Promise.all([
    ctx.req('/rest/v1/crm_oportunidades?empresa_id=eq.' + e.id + '&apagado_em=is.null&select=titulo,estagio,oferta,proximo_passo,proximo_passo_em,atualizado_em&order=atualizado_em.desc&limit=5').catch(() => []),
    pessoasDaEmpresa(ctx, e),
    ctx.req('/rest/v1/crm_toques?empresa_id=eq.' + e.id + '&apagado_em=is.null&select=canal,direcao,resumo,data&order=data.desc&limit=8').catch(() => [])
  ]);
  return { empresa: e.nome, oportunidades: (Array.isArray(ops) ? ops : []).map(o => ({ titulo: o.titulo, etapa: o.estagio, proximo_passo: o.proximo_passo, prazo: fmt(o.proximo_passo_em) })),
    pessoas: pessoas.slice(0, 10).map(p => ({ nome: p.nome, cargo: p.cargo, email: p.email || null, tem_whatsapp: !!numeroWa(p.wa) })),
    ultimos_toques: (Array.isArray(toques) ? toques : []).map(t => ({ canal: t.canal, direcao: t.direcao, resumo: String(t.resumo || '').slice(0, 140), quando: fmt(t.data) })) };
}

async function prepararMensagem(ctx, { empresa, pessoa, canal, pedido }) {
  const e = await acharEmpresa(ctx, empresa);
  if (!e) return { erro: 'Não achei a empresa ' + empresa + ' no CRM.' };
  const op = (await opDaEmpresa(ctx, e)) || { id: null, titulo: e.nome, estagio: 'Wishlist', empresa_id: e.id };
  const contatos = await pessoasDaEmpresa(ctx, e);
  const alvo = pessoa ? acharPessoaNome(contatos, pessoa) : null;
  const f = await gerarFollowup({ req: ctx.req, op, empresa: Object.assign({}, e, { setor: e.setor_canonico || e.setor }), contatos, decisorId: alvo && alvo.id, canal: canal === 'email' ? 'email' : 'whatsapp',
    instrucao: pedido, hojeStr: hojeBR(), supaUrl: ctx.supaUrl, serviceKey: ctx.serviceKey, envKey: ctx.envKey });
  if (f.erro) return { erro: f.erro };
  const c = f.contato;
  if (canal === 'email') {
    if (c && c.email) ctx.pendente = { tipo: 'email', decisor_id: c.id, para: c.email, nome: c.nome, empresa_id: e.id, oportunidade_id: op.id, assunto: f.assunto, corpo: f.mensagem, mensagem_id: f.id };
    return { para: c ? c.nome + (c.email ? ' <' + c.email + '>' : ' (sem e-mail no CRM)') : 'sem contato', assunto: f.assunto, texto: f.mensagem, fato_da_internet: f.fato_usado || null,
      proximo: c && c.email ? 'Mostre o e-mail inteiro e diga que é só responder "manda" para enviar (ou pedir ajuste).' : 'Sem e-mail: sugira buscar o contato ou mandar por WhatsApp.' };
  }
  return { para: c ? c.nome + (numeroWa(c.wa) ? '' : ' (sem WhatsApp no CRM: o link abre para ele escolher o contato)') : 'sem contato', texto: f.mensagem, fato_da_internet: f.fato_usado || null,
    link: f.link, proximo: 'Mostre o texto e o link. Tocando no link abre o WhatsApp do Pedro com a mensagem pronta; ele confere e aperta enviar.' };
}

async function prepararEnvio(ctx, { empresa, pessoa, assunto, corpo }) {
  const p = await pessoaPorNome(ctx, pessoa, empresa);
  if (!p) return { erro: 'Não achei ' + pessoa + ' no CRM.' };
  if (!p.email) return { erro: p.nome + ' não tem e-mail no CRM.' };
  ctx.pendente = { tipo: 'email', decisor_id: p.id, para: p.email, nome: p.nome, empresa_id: p.empresa && p.empresa.id || p.empresa_id || null, assunto: String(assunto).slice(0, 200), corpo: String(corpo).slice(0, 6000) };
  return { pronto_para_enviar: true, para: p.nome + ' <' + p.email + '>', assunto, texto: corpo, proximo: 'Mostre o e-mail e peça para ele responder "manda" para enviar.' };
}

async function rascunhoEmail(ctx, { empresa, pessoa, assunto, corpo }) {
  const p = await pessoaPorNome(ctx, pessoa, empresa);
  if (!p || !p.email) return { erro: (p ? p.nome + ' não tem e-mail no CRM.' : 'Não achei ' + pessoa + ' no CRM.') };
  const gm = await ctx.gmail.obter();
  if (!gm) return { erro: 'Gmail não conectado no CRM.' };
  const d = await ctx.gmail.criar(gm.token, { conta: gm.email, para: p.email, assunto: String(assunto).slice(0, 200), corpo: String(corpo).slice(0, 6000) });
  return { rascunho_criado: true, para: p.nome + ' <' + p.email + '>', link: d.link };
}

async function definirPrazo(ctx, { empresa, passo, data }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return { erro: 'Data no formato AAAA-MM-DD.' };
  const e = await acharEmpresa(ctx, empresa);
  if (!e) return { erro: 'Não achei a empresa ' + empresa + '.' };
  const op = await opDaEmpresa(ctx, e);
  if (!op || !ABERTA(op.estagio)) return { erro: 'A ' + e.nome + ' não tem oportunidade aberta.' };
  await ctx.req('/rest/v1/crm_oportunidades?id=eq.' + op.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ proximo_passo: String(passo).slice(0, 300), proximo_passo_em: data, atualizado_em: new Date().toISOString() }) });
  await ctx.req('/rest/v1/crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: op.id, tipo: 'nota', texto: ('Prazo pelo WhatsApp do Pedro: ' + passo + ' até ' + fmt(data)).slice(0, 500), autor_email: 'amigo-whatsapp' }) });
  return { ok: true, empresa: e.nome, passo, prazo: fmt(data) };
}

async function prepararEtapa(ctx, { empresa, etapa, motivo }) {
  const e = await acharEmpresa(ctx, empresa);
  if (!e) return { erro: 'Não achei a empresa ' + empresa + '.' };
  const op = await opDaEmpresa(ctx, e);
  if (!op) return { erro: 'A ' + e.nome + ' não tem oportunidade no pipeline.' };
  if (op.estagio === etapa) return { erro: 'Já está em ' + etapa + '.' };
  ctx.pendente = { tipo: 'etapa', oportunidade_id: op.id, empresa: e.nome, de: op.estagio, para: etapa, motivo: motivo || '' };
  return { pronto: true, empresa: e.nome, de: op.estagio, para: etapa, proximo: 'Peça para ele responder "manda" para mover.' };
}

export async function execAmigo(name, input, ctx) {
  switch (name) {
    case 'minha_agenda': return minhaAgenda(ctx);
    case 'ler_whatsapp': return lerWhatsapp(ctx, input || {});
    case 'oportunidade': return fichaOportunidade(ctx, input || {});
    case 'preparar_mensagem': return prepararMensagem(ctx, input || {});
    case 'enviar_email': return prepararEnvio(ctx, input || {});
    case 'rascunho_email': return rascunhoEmail(ctx, input || {});
    case 'definir_prazo': return definirPrazo(ctx, input || {});
    case 'mover_etapa': return prepararEtapa(ctx, input || {});
    default: return null;
  }
}

// Respostas do Pedro a uma ação pendente.
export const CONFIRMA = /^\s*(manda|pode mandar|envia|enviar|sim|pode|ok,? manda|confirmo|confirma|vai|bora|fechado)\b[\s.!]*$/i;
export const CANCELA = /^\s*(n[aã]o|cancela|cancelar|esquece|deixa|para)\b/i;

// Executa a ação que o Pedro confirmou com "manda". Devolve o texto de resposta.
export async function executarPendente(p, ctx) {
  const agora = new Date().toISOString();
  if (p.tipo === 'email') {
    const gm = await ctx.gmail.obter();
    if (!gm) return 'Não consegui: o Gmail não está conectado no CRM.';
    const d = await ctx.gmail.criar(gm.token, { conta: gm.email, para: p.para, assunto: p.assunto, corpo: p.corpo });
    try { await ctx.gmail.enviar(gm.token, d.id); }
    catch (e) { return 'O Gmail não enviou (ficou como rascunho): ' + String(e && e.message || e).slice(0, 120); }
    await ctx.req('/rest/v1/crm_toques', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ empresa_id: p.empresa_id || null, decisor_id: p.decisor_id, canal: 'email', direcao: 'enviado', assunto: p.assunto, resumo: 'E-mail enviado pelo amigo no WhatsApp (confirmado pelo Pedro)', texto_enviado: String(p.corpo).slice(0, 4000), data: agora, fonte: 'manual', resultado: 'enviado' }) }).catch(() => {});
    await ctx.req('/rest/v1/crm_decisores?id=eq.' + p.decisor_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ultimo_toque_em: agora }) }).catch(() => {});
    if (p.oportunidade_id) await ctx.req('/rest/v1/crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: p.oportunidade_id, tipo: 'nota', texto: ('E-mail enviado para ' + p.nome + ': [' + p.assunto + '] ' + p.corpo).slice(0, 400), autor_email: 'amigo-whatsapp' }) }).catch(() => {});
    if (p.mensagem_id) await ctx.req('/rest/v1/crm_oportunidade_mensagens?id=eq.' + p.mensagem_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ enviado_em: agora }) }).catch(() => {});
    return '✅ Enviado para *' + p.nome + '* (' + p.para + '). Registrei no histórico.';
  }
  if (p.tipo === 'etapa') {
    await ctx.req('/rest/v1/crm_oportunidades?id=eq.' + p.oportunidade_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estagio: p.para, atualizado_em: agora }) });
    await ctx.req('/rest/v1/crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: p.oportunidade_id, tipo: 'estagio', de: p.de, para: p.para, texto: ('Pelo WhatsApp do Pedro' + (p.motivo ? ': ' + p.motivo : '')).slice(0, 400), autor_email: 'amigo-whatsapp' }) });
    return '✅ *' + p.empresa + '*: ' + p.de + ' → ' + p.para + '.';
  }
  return 'Não reconheci a ação pendente.';
}
