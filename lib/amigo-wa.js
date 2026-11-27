// lib/amigo-wa.js — ferramentas do "amigo no WhatsApp" do Pedro (Copiloto no WhatsApp).
// Pedido de 26/11: conversar pelo WhatsApp e o agente buscar no CRM, ler o WhatsApp dele,
// preparar e-mails e WhatsApps e mandar e-mail. Regras:
//  - Ler, preparar, criar rascunho e marcar prazo: direto.
//  - Autonomia total no CRM (pedido do Pedro, 26/11): criar e editar oportunidade, mover
//    etapa, cadastrar pessoa, marcar prazo e marcar compromisso só na agenda dele: direto.
//  - Tudo que chega a terceiros é AÇÃO PENDENTE: enviar e-mail e convite/alteração/cancelamento
//    de reunião com convidados só executam quando o Pedro responde
//    "manda" (ou "sim", "pode"). Qualquer outra resposta descarta. Resposta a quem
//    respondeu nunca sai sozinha: é sempre o "manda" do Pedro.
//  - WhatsApp para terceiros nunca sai pelo sistema: o amigo devolve o link wa.me com o
//    texto pronto e o Pedro aperta enviar no app dele.
// ctx = { req(path, opts) → JSON (service key), supaUrl, serviceKey, envKey, gmail: {obter, criar, enviar} }
import { casarEmpresa } from './captura.js';
import { gerarFollowup } from './followup.js';
import { numeroWa } from './wa-pipeline.js';
import { listarEventos, montarEvento, criarEvento, alterarEvento, cancelarEvento, isoBrasilia, somarMinutos, SemEscopoAgenda, FUSO } from './agenda-google.js';

const ABERTA = (e) => !['Perdido', 'Cliente ativo', 'Pausado'].includes(e);
const fmt = (iso) => { const s = String(iso || '').slice(0, 10); return s ? s.split('-').reverse().join('/') : ''; };
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const enc = encodeURIComponent;

const ETAPAS = ['Wishlist', 'Primeira reunião', 'Contato direto', 'Negociando direto', 'Concorrências', 'Negociação', 'Cliente ativo', 'Perdido', 'Pausado'];
const OFERTAS = ['CR.IA', 'BrandSync', 'GEO', 'Hiper Presence', 'criação', 'planejamento', 'mídia', 'conteúdo', 'outro'];
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Dia útil daqui a n dias (sem feriado), AAAA-MM-DD.
export function diasUteis(base, n) {
  const d = new Date(base + 'T12:00:00Z');
  let f = 0; while (f < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) f++; }
  return d.toISOString().slice(0, 10);
}

export const AMIGO_TOOL_DEFS = [
  { name: 'minha_agenda', description: 'O que o Pedro tem para fazer: prazos de oportunidades (vencidos, hoje, próximos 7 dias), próximas reuniões, respostas recentes de clientes e sugestões de mudança no pipeline esperando decisão. Use para "o que tenho hoje?", "bom dia", "como estou?".', input_schema: { type: 'object', properties: {} } },
  { name: 'ler_whatsapp', description: 'Lê as conversas do WhatsApp pessoal do Pedro (copiadas do Mac dele). Por pessoa ou empresa (as últimas mensagens da conversa) ou por busca de texto em todas as conversas.', input_schema: { type: 'object', properties: { pessoa: { type: 'string', description: 'Nome do contato' }, empresa: { type: 'string' }, busca: { type: 'string', description: 'Palavra ou frase para procurar nas mensagens' }, limite: { type: 'number' } } } },
  { name: 'oportunidade', description: 'Ficha de uma empresa no pipeline: oportunidade(s), etapa, próximo passo e prazo, pessoas (com e-mail/WhatsApp) e últimos toques.', input_schema: { type: 'object', properties: { empresa: { type: 'string' } }, required: ['empresa'] } },
  { name: 'preparar_mensagem', description: 'Escreve um WhatsApp ou e-mail para alguém de uma empresa, no estilo do Pedro, pesquisando a empresa na internet e lendo o histórico (CRM e WhatsApp). WhatsApp: devolve o texto e um link que abre o WhatsApp do Pedro com a mensagem pronta. E-mail: devolve assunto e texto e deixa pronto para enviar quando o Pedro responder "manda".', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, pessoa: { type: 'string', description: 'Nome da pessoa (opcional)' }, canal: { type: 'string', enum: ['whatsapp', 'email'] }, pedido: { type: 'string', description: 'O que o Pedro quer com a mensagem' } }, required: ['empresa', 'canal'] } },
  { name: 'enviar_email', description: 'Prepara o envio de um e-mail que o Pedro ditou ou ajustou (para alguém do CRM). NÃO envia: deixa pendente e o Pedro confirma respondendo "manda".', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, pessoa: { type: 'string' }, assunto: { type: 'string' }, corpo: { type: 'string' } }, required: ['pessoa', 'assunto', 'corpo'] } },
  { name: 'rascunho_email', description: 'Cria um rascunho no Gmail do Pedro (não envia).', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, pessoa: { type: 'string' }, assunto: { type: 'string' }, corpo: { type: 'string' } }, required: ['pessoa', 'assunto', 'corpo'] } },
  { name: 'definir_prazo', description: 'Marca o próximo passo e a data de uma oportunidade (ex.: "cobrar a XP sexta").', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, passo: { type: 'string' }, data: { type: 'string', description: 'AAAA-MM-DD' } }, required: ['empresa', 'passo', 'data'] } },
  { name: 'mover_etapa', description: 'Muda a etapa de uma oportunidade na hora (Wishlist, Primeira reunião, Contato direto, Negociando direto, Concorrências, Negociação, Cliente ativo, Perdido, Pausado). Se a empresa tiver mais de uma oportunidade, passe o título.', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, etapa: { type: 'string', enum: ['Wishlist', 'Primeira reunião', 'Contato direto', 'Negociando direto', 'Concorrências', 'Negociação', 'Cliente ativo', 'Perdido', 'Pausado'] }, motivo: { type: 'string' }, titulo: { type: 'string', description: 'Título da oportunidade, quando a empresa tem mais de uma' }, passo: { type: 'string', description: 'Próximo passo (obrigatório ao ir para etapa aberta se não houver)' }, data: { type: 'string', description: 'AAAA-MM-DD' } }, required: ['empresa', 'etapa'] } },
  { name: 'criar_oportunidade', description: 'Cria uma oportunidade nova no pipeline na hora (ex.: "abre oportunidade da Natura pela Milà, CR.IA, reunião dia 3"). Empresa que não existe é cadastrada junto. Se já houver oportunidade aberta da empresa, cria assim mesmo e avisa (confira antes com a ficha se o pedido for ambíguo). Toda oportunidade aberta tem próximo passo e data: se o Pedro não disser, vai "Primeiro contato" em 2 dias úteis.', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, agencia: { type: 'string', description: 'Agência do grupo que vai atender (Galeria, Milà, 404, cccaramelo, GAIA, Catalyst, Mantiqueira, A.gente, Vitrine, GUX, Frame, Ateliê, Studio GA, Galeria Holding)' }, etapa: { type: 'string', enum: ETAPAS }, oferta: { type: 'string', enum: OFERTAS }, origem: { type: 'string', enum: ['abordagem_direta', 'indicação', 'inbound', 'upsell'] }, valor: { type: 'number', description: 'Valor estimado em R$' }, titulo: { type: 'string' }, passo: { type: 'string', description: 'Próximo passo' }, data: { type: 'string', description: 'Data do próximo passo, AAAA-MM-DD' }, nota: { type: 'string', description: 'Contexto que o Pedro contou' } }, required: ['empresa'] } },
  { name: 'atualizar_oportunidade', description: 'Edita uma oportunidade na hora: agência, oferta, valor, título, origem, etapa, próximo passo/prazo, e/ou anota algo no histórico (nota). Passe só o que muda.', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, titulo: { type: 'string', description: 'Título atual, se a empresa tem mais de uma' }, agencia: { type: 'string' }, oferta: { type: 'string', enum: OFERTAS }, valor: { type: 'number' }, titulo_novo: { type: 'string' }, origem: { type: 'string', enum: ['abordagem_direta', 'indicação', 'inbound', 'upsell'] }, etapa: { type: 'string', enum: ETAPAS }, passo: { type: 'string' }, data: { type: 'string', description: 'AAAA-MM-DD' }, nota: { type: 'string', description: 'Texto para o histórico da oportunidade' } }, required: ['empresa'] } },
  { name: 'cadastrar_pessoa', description: 'Cadastra uma pessoa numa empresa (ou completa/corrige quem já existe com esse nome): cargo, e-mail, WhatsApp, LinkedIn, observação. Empresa nova é criada junto. A pessoa entra fora da cadência automática do SDR.', input_schema: { type: 'object', properties: { empresa: { type: 'string' }, nome: { type: 'string' }, cargo: { type: 'string' }, email: { type: 'string' }, whatsapp: { type: 'string' }, linkedin: { type: 'string' }, observacao: { type: 'string' } }, required: ['empresa', 'nome'] } },
  { name: 'pipeline', description: 'Visão do pipeline: oportunidades abertas (ou de uma etapa/agência), com etapa, agência, valor, próximo passo e prazo, e o total por etapa. Use para "como está meu pipeline?", "o que a Milà tem em negociação?", "o que está atrasado?".', input_schema: { type: 'object', properties: { etapa: { type: 'string', enum: ETAPAS }, agencia: { type: 'string' }, so_atrasadas: { type: 'boolean' }, limite: { type: 'number' } } } },
  { name: 'ver_agenda', description: 'Google Agenda do Pedro: compromissos entre duas datas (padrão: hoje e amanhã), ou busca por texto. Use também para achar horário livre.', input_schema: { type: 'object', properties: { de: { type: 'string', description: 'AAAA-MM-DD' }, ate: { type: 'string', description: 'AAAA-MM-DD (inclusive)' }, busca: { type: 'string' } } } },
  { name: 'marcar_reuniao', description: 'Marca na Google Agenda do Pedro. Sem convidados: entra na hora. Com convidados (e-mails): o convite vai para eles, então fica pendente do "manda". Com empresa: registra a reunião no CRM e, se a oportunidade estiver em Wishlist/Contato direto, passa para Primeira reunião.', input_schema: { type: 'object', properties: { titulo: { type: 'string' }, inicio: { type: 'string', description: 'AAAA-MM-DDTHH:MM, hora de Brasília' }, duracao: { type: 'number', description: 'Minutos (padrão 60)' }, convidados: { type: 'array', items: { type: 'string' }, description: 'E-mails dos convidados' }, empresa: { type: 'string' }, local: { type: 'string' }, meet: { type: 'boolean', description: 'Criar link do Google Meet' }, descricao: { type: 'string' } }, required: ['titulo', 'inicio'] } },
  { name: 'remarcar_reuniao', description: 'Muda horário/título/local de um compromisso da agenda (use o id que ver_agenda devolve). Se tiver convidados, fica pendente do "manda" (eles são avisados).', input_schema: { type: 'object', properties: { id: { type: 'string' }, inicio: { type: 'string', description: 'AAAA-MM-DDTHH:MM' }, duracao: { type: 'number' }, titulo: { type: 'string' }, local: { type: 'string' } }, required: ['id'] } },
  { name: 'cancelar_reuniao', description: 'Cancela um compromisso da agenda (id do ver_agenda). Com convidados, fica pendente do "manda" (eles recebem o cancelamento).', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }
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
  const amanha = diasUteis(hoje, 1);
  const [ops, reun, resp, sug, cal] = await Promise.all([
    ctx.req('/rest/v1/crm_oportunidades?apagado_em=is.null&proximo_passo_em=lte.' + em7 + '&select=titulo,estagio,proximo_passo,proximo_passo_em,crm_empresas!empresa_id(nome)&order=proximo_passo_em.asc&limit=40').catch(() => []),
    ctx.req('/rest/v1/crm_reunioes_v?reuniao_em=gte.' + new Date().toISOString() + '&select=empresa,reuniao_em,titulo&order=reuniao_em.asc&limit=10').catch(() => []),
    ctx.req('/rest/v1/crm_toques?direcao=eq.recebido&apagado_em=is.null&data=gte.' + new Date(Date.now() - 3 * 864e5).toISOString() + '&select=canal,resumo,data,crm_empresas!empresa_id(nome),crm_decisores!decisor_id(nome)&order=data.desc&limit=15').catch(() => []),
    ctx.req('/rest/v1/crm_gmail_sugestoes?status=eq.pendente&select=estagio_para,resumo,crm_empresas!empresa_id(nome)&order=criado_em.desc&limit=15').catch(() => []),
    comAgenda(ctx, (t) => listarEventos(t, { de: new Date().toISOString(), ate: diaFim(amanha), max: 20 })).catch(() => null)
  ]);
  const abertas = (Array.isArray(ops) ? ops : []).filter(o => ABERTA(o.estagio));
  const nome = (o) => (o.crm_empresas && o.crm_empresas.nome) || o.titulo;
  return {
    hoje: fmt(hoje),
    google_agenda: Array.isArray(cal) ? cal.map(e => ({ titulo: e.titulo, quando: e.quando, meet: e.meet, convidados: e.convidados.length })) : (cal && cal.erro) || 'indisponível',
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

const AUTOR = 'amigo-whatsapp';
const evento = (ctx, b) => ctx.req('/rest/v1/crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ autor_email: AUTOR }, b)) }).catch(() => {});
const auditar = (ctx, id, campo, de, para) => ctx.req('/rest/v1/crm_auditoria', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ tabela: 'crm_oportunidades', registro_id: id, campo, valor_de: de == null ? null : String(de), valor_para: para == null ? null : String(para), usuario_email: AUTOR }) }).catch(() => {});

// Oportunidade certa da empresa: pelo título quando vier, senão a aberta mais recente.
async function acharOportunidade(ctx, empresa, titulo) {
  const e = await acharEmpresa(ctx, empresa);
  if (!e) return { erro: 'Não achei a empresa ' + empresa + '.' };
  const ops = await ctx.req('/rest/v1/crm_oportunidades?empresa_id=eq.' + e.id + '&apagado_em=is.null&select=id,titulo,estagio,oferta,origem,valor_estimado,agencia_id,proximo_passo,proximo_passo_em,atualizado_em&order=atualizado_em.desc.nullslast&limit=10').catch(() => []);
  const l = Array.isArray(ops) ? ops : [];
  if (!l.length) return { erro: 'A ' + e.nome + ' não tem oportunidade no pipeline (posso criar com criar_oportunidade).', empresa: e };
  let op = null;
  if (titulo) { const t = semAcento(titulo); op = l.find(o => semAcento(o.titulo) === t) || l.find(o => semAcento(o.titulo).includes(t)); }
  op = op || l.find(o => ABERTA(o.estagio)) || l[0];
  const outras = l.filter(o => o.id !== op.id && ABERTA(o.estagio)).map(o => o.titulo + ' (' + o.estagio + ')');
  return { e, op, outras };
}

async function moverEtapa(ctx, { empresa, etapa, motivo, titulo, passo, data }) {
  if (!ETAPAS.includes(etapa)) return { erro: 'Etapa inválida.' };
  const a = await acharOportunidade(ctx, empresa, titulo);
  if (a.erro) return { erro: a.erro };
  const { e, op } = a;
  if (op.estagio === etapa) return { erro: 'Já está em ' + etapa + '.' };
  const patch = { estagio: etapa, atualizado_em: new Date().toISOString() };
  const avisos = [];
  if (ABERTA(etapa)) {
    if (data && !/^\d{4}-\d{2}-\d{2}$/.test(String(data))) return { erro: 'Data no formato AAAA-MM-DD.' };
    if (passo) patch.proximo_passo = String(passo).slice(0, 300);
    if (data) patch.proximo_passo_em = data;
    if (!(patch.proximo_passo || op.proximo_passo) || !(patch.proximo_passo_em || op.proximo_passo_em)) {
      patch.proximo_passo = patch.proximo_passo || op.proximo_passo || 'Próximo contato';
      patch.proximo_passo_em = patch.proximo_passo_em || op.proximo_passo_em || diasUteis(hojeBR(), 2);
      avisos.push('Sem prazo: pus "' + patch.proximo_passo + '" para ' + fmt(patch.proximo_passo_em) + '.');
    }
  }
  await ctx.req('/rest/v1/crm_oportunidades?id=eq.' + op.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  await auditar(ctx, op.id, 'estagio', op.estagio, etapa);
  await evento(ctx, { oportunidade_id: op.id, tipo: 'estagio', de: op.estagio, para: etapa, texto: ('Pelo amigo, a pedido do Pedro' + (motivo ? ': ' + motivo : '')).slice(0, 400) });
  return { ok: true, empresa: e.nome, oportunidade: op.titulo, de: op.estagio, para: etapa, proximo_passo: patch.proximo_passo || op.proximo_passo, prazo: fmt(patch.proximo_passo_em || op.proximo_passo_em), avisos };
}

async function atualizarOportunidade(ctx, inp) {
  const a = await acharOportunidade(ctx, inp.empresa, inp.titulo);
  if (a.erro) return { erro: a.erro };
  const { e, op } = a;
  const patch = {}; const mud = [];
  if (inp.agencia) { const ag = await acharAgencia(ctx, inp.agencia); if (!ag) return { erro: 'Não achei a agência ' + inp.agencia + '.' }; if (ag.id !== op.agencia_id) { patch.agencia_id = ag.id; mud.push('agência → ' + ag.nome); } }
  if (inp.oferta && OFERTAS.includes(inp.oferta) && inp.oferta !== op.oferta) { patch.oferta = inp.oferta; mud.push('oferta → ' + inp.oferta); }
  if (Number(inp.valor) > 0 && Number(inp.valor) !== Number(op.valor_estimado)) { patch.valor_estimado = Number(inp.valor); mud.push('valor → R$ ' + Number(inp.valor).toLocaleString('pt-BR')); }
  if (inp.titulo_novo) { patch.titulo = String(inp.titulo_novo).slice(0, 200); mud.push('título → ' + patch.titulo); }
  if (inp.origem && inp.origem !== op.origem) { patch.origem = inp.origem; mud.push('origem → ' + inp.origem); }
  if (inp.data && !/^\d{4}-\d{2}-\d{2}$/.test(String(inp.data))) return { erro: 'Data no formato AAAA-MM-DD.' };
  if (inp.passo) { patch.proximo_passo = String(inp.passo).slice(0, 300); mud.push('próximo passo → ' + patch.proximo_passo); }
  if (inp.data) { patch.proximo_passo_em = inp.data; mud.push('prazo → ' + fmt(inp.data)); }
  let etapa = null;
  if (inp.etapa && inp.etapa !== op.estagio) etapa = await moverEtapa(ctx, { empresa: inp.empresa, titulo: op.titulo, etapa: inp.etapa, passo: inp.passo, data: inp.data });
  if (etapa && etapa.erro) return etapa;
  if (etapa) { delete patch.proximo_passo; delete patch.proximo_passo_em; }
  if (Object.keys(patch).length) {
    patch.atualizado_em = new Date().toISOString();
    await ctx.req('/rest/v1/crm_oportunidades?id=eq.' + op.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    for (const k of Object.keys(patch)) if (k !== 'atualizado_em') await auditar(ctx, op.id, k, op[k], patch[k]);
  }
  if (inp.nota) await evento(ctx, { oportunidade_id: op.id, tipo: 'nota', texto: String(inp.nota).slice(0, 1000) });
  else if (mud.length) await evento(ctx, { oportunidade_id: op.id, tipo: 'nota', texto: ('Pelo amigo: ' + mud.join('; ')).slice(0, 500) });
  if (!mud.length && !etapa && !inp.nota) return { erro: 'Nada para mudar.' };
  return { ok: true, empresa: e.nome, oportunidade: op.titulo, mudou: mud, etapa: etapa ? etapa.de + ' → ' + etapa.para : null, nota: inp.nota ? 'anotada' : null };
}

async function acharAgencia(ctx, nome) {
  if (!nome) return null;
  const l0 = await ctx.req('/rest/v1/crm_agencias?select=id,nome').catch(() => []);
  const l = Array.isArray(l0) ? l0 : [];
  const n = semAcento(nome).replace(/^ag[eê]ncia\s+/, '');
  return l.find(a => semAcento(a.nome) === n) || l.find(a => semAcento(a.nome).startsWith(n) && n.length >= 3) || null;
}
// Empresa por casamento firme; se não houver, cadastra (fonte 'amigo').
async function empresaOuNova(ctx, nome) {
  const n = String(nome || '').trim();
  const palavra = n.split(/\s+/).sort((a, b) => b.length - a.length)[0];
  const rows = await ctx.req('/rest/v1/crm_empresas?apagado_em=is.null&nome=ilike.' + enc('*' + palavra + '*') + '&select=id,nome&limit=40').catch(() => []);
  const m = casarEmpresa(n, Array.isArray(rows) ? rows : []);
  if (m && m.empresa && m.confianca !== 'baixa') return { emp: m.empresa, nova: false };
  const e = await ctx.req('/rest/v1/crm_empresas', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ nome: n, fonte: 'amigo' }) });
  return { emp: Array.isArray(e) ? e[0] : e, nova: true };
}

async function criarOportunidade(ctx, inp) {
  const nomeEmp = String(inp.empresa || '').trim();
  if (!nomeEmp) return { erro: 'Qual empresa?' };
  const etapa = ETAPAS.includes(inp.etapa) ? inp.etapa : 'Wishlist';
  if (inp.data && !/^\d{4}-\d{2}-\d{2}$/.test(String(inp.data))) return { erro: 'Data no formato AAAA-MM-DD.' };
  const ag = await acharAgencia(ctx, inp.agencia);
  if (inp.agencia && !ag) return { erro: 'Não achei a agência ' + inp.agencia + '. As do grupo: Galeria, Milà, 404, cccaramelo, GAIA, Catalyst, Mantiqueira, A.gente, Vitrine, GUX, Frame, Ateliê, Studio GA, Galeria Holding.' };
  const { emp, nova } = await empresaOuNova(ctx, nomeEmp);
  const aberta = nova ? null : await opDaEmpresa(ctx, emp);
  const avisos = [];
  if (nova) avisos.push('Empresa nova cadastrada: ' + emp.nome + '.');
  if (aberta && ABERTA(aberta.estagio)) avisos.push('A ' + emp.nome + ' já tinha oportunidade aberta: ' + aberta.titulo + ' (' + aberta.estagio + ').');
  const abrir = ABERTA(etapa);
  let passo = inp.passo ? String(inp.passo).slice(0, 300) : null, data = inp.data || null;
  if (abrir && (!passo || !data)) {
    if (!passo) passo = 'Primeiro contato';
    if (!data) data = diasUteis(hojeBR(), 2);
    avisos.push('Sem prazo dito: pus "' + passo + '" para ' + fmt(data) + '.');
  }
  const agora = new Date().toISOString();
  const body = {
    titulo: String(inp.titulo || (emp.nome + (ag ? ' — ' + ag.nome : ''))).slice(0, 200), empresa_id: emp.id,
    estagio: etapa, oferta: OFERTAS.includes(inp.oferta) ? inp.oferta : 'outro',
    origem: ['abordagem_direta', 'indicação', 'inbound', 'upsell'].includes(inp.origem) ? inp.origem : 'abordagem_direta',
    agencia_id: ag ? ag.id : null, valor_estimado: Number(inp.valor) > 0 ? Number(inp.valor) : null,
    proximo_passo: abrir ? passo : null, proximo_passo_em: abrir ? data : null,
    aberta_em: agora, criado_em: agora, atualizado_em: agora
  };
  const r = await ctx.req('/rest/v1/crm_oportunidades', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const criada = Array.isArray(r) ? r[0] : r;
  await evento(ctx, { oportunidade_id: criada.id, tipo: 'criada', para: criada.estagio, texto: ('Criada pelo amigo a pedido do Pedro' + (inp.nota ? ': ' + inp.nota : '')).slice(0, 500) });
  return { ok: true, criada: true, titulo: body.titulo, empresa: emp.nome, empresa_nova: nova, agencia: ag ? ag.nome : '(sem agência)', etapa, oferta: body.oferta, valor: body.valor_estimado, proximo_passo: body.proximo_passo, prazo: body.proximo_passo_em ? fmt(body.proximo_passo_em) : null, avisos };
}

async function cadastrarPessoa(ctx, inp) {
  const nome = String(inp.nome || '').trim();
  if (!nome || !inp.empresa) return { erro: 'Preciso do nome e da empresa.' };
  if (inp.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(inp.email).trim())) return { erro: 'E-mail inválido.' };
  const { emp, nova } = await empresaOuNova(ctx, inp.empresa);
  const existente = acharPessoaNome(await pessoasDaEmpresa(ctx, emp), nome);
  const wa = inp.whatsapp ? numeroWa(inp.whatsapp) : null;
  const campos = {};
  if (inp.cargo) campos.cargo = String(inp.cargo).slice(0, 200);
  if (inp.email) campos.email = String(inp.email).trim().toLowerCase();
  if (wa) campos.wa = wa;
  if (inp.linkedin) campos.linkedin_url = String(inp.linkedin).trim();
  if (inp.observacao) campos.observacoes = ((existente && existente.observacoes ? existente.observacoes + '\n' : '') + String(inp.observacao)).slice(0, 2000);
  const agora = new Date().toISOString();
  if (existente) {
    if (!Object.keys(campos).length) return { ok: true, ja_existia: true, pessoa: existente.nome, empresa: emp.nome, email: existente.email, whatsapp: existente.wa };
    await ctx.req('/rest/v1/crm_decisores?id=eq.' + existente.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ atualizado_em: agora }, campos)) });
    return { ok: true, atualizada: true, pessoa: existente.nome, empresa: emp.nome, campos: Object.keys(campos) };
  }
  await ctx.req('/rest/v1/crm_decisores', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ nome, empresa_id: emp.id, fonte: 'amigo', status: 'ativo', etapa_cadencia: 'off' }, campos)) });
  return { ok: true, criada: true, pessoa: nome, empresa: emp.nome, empresa_nova: nova, campos: Object.keys(campos) };
}

async function verPipeline(ctx, { etapa, agencia, so_atrasadas, limite }) {
  let q = '/rest/v1/crm_oportunidades?apagado_em=is.null&select=titulo,estagio,oferta,valor_estimado,proximo_passo,proximo_passo_em,agencia_id,crm_empresas!empresa_id(nome)&order=proximo_passo_em.asc.nullslast&limit=300';
  if (etapa) q += '&estagio=eq.' + enc(etapa);
  let ag = null;
  if (agencia) { ag = await acharAgencia(ctx, agencia); if (!ag) return { erro: 'Não achei a agência ' + agencia + '.' }; q += '&agencia_id=eq.' + ag.id; }
  const [rows, ags] = await Promise.all([ctx.req(q).catch(() => []), ctx.req('/rest/v1/crm_agencias?select=id,nome').catch(() => [])]);
  const nomeAg = {}; (Array.isArray(ags) ? ags : []).forEach(a => { nomeAg[a.id] = a.nome; });
  const hoje = hojeBR();
  let l = (Array.isArray(rows) ? rows : []).filter(o => etapa ? true : ABERTA(o.estagio));
  if (so_atrasadas) l = l.filter(o => o.proximo_passo_em && o.proximo_passo_em < hoje);
  const porEtapa = {}; let total = 0;
  l.forEach(o => { porEtapa[o.estagio] = (porEtapa[o.estagio] || 0) + 1; total += Number(o.valor_estimado) || 0; });
  return {
    filtro: [etapa, ag && ag.nome, so_atrasadas && 'atrasadas'].filter(Boolean).join(', ') || 'abertas',
    quantidade: l.length, por_etapa: porEtapa, valor_total: total || null,
    atrasadas: l.filter(o => o.proximo_passo_em && o.proximo_passo_em < hoje).length,
    oportunidades: l.slice(0, Math.min(Number(limite) || 40, 80)).map(o => ({ empresa: (o.crm_empresas && o.crm_empresas.nome) || o.titulo, titulo: o.titulo, etapa: o.estagio, agencia: nomeAg[o.agencia_id] || null, oferta: o.oferta, valor: o.valor_estimado, proximo_passo: o.proximo_passo, prazo: fmt(o.proximo_passo_em), atrasada: !!(o.proximo_passo_em && o.proximo_passo_em < hoje) }))
  };
}

// ── Google Agenda ─────────────────────────────────────────────────────────────
const RECONECTAR = 'A agenda ainda não está liberada: abra o CRM, Fila › Agente, clique em "Reconectar Google" (embaixo dos botões) e aceite o acesso à Agenda. Depois é só pedir de novo.';
async function tokenAgenda(ctx) {
  const g = ctx.gmail && await ctx.gmail.obter();
  return g ? g.token : null;
}
async function comAgenda(ctx, fn) {
  const t = await tokenAgenda(ctx);
  if (!t) return { erro: 'O Google (Gmail/Agenda) não está conectado no CRM.' };
  try { return await fn(t); }
  catch (e) { if (e instanceof SemEscopoAgenda) return { erro: RECONECTAR, reconectar: true }; return { erro: String(e && e.message || e).slice(0, 200) }; }
}
function diaInicio(d) { return d + 'T00:00:00-03:00'; }
function diaFim(d) { return d + 'T23:59:59-03:00'; }

async function verAgenda(ctx, { de, ate, busca }) {
  const hoje = hojeBR();
  const d1 = /^\d{4}-\d{2}-\d{2}$/.test(de || '') ? de : hoje;
  const d2 = /^\d{4}-\d{2}-\d{2}$/.test(ate || '') ? ate : (busca && !de ? diasUteis(hoje, 30) : diasUteis(d1, 1));
  return comAgenda(ctx, async (t) => ({ de: fmt(d1), ate: fmt(d2), compromissos: await listarEventos(t, { de: diaInicio(d1), ate: diaFim(d2), busca }) }));
}

async function registrarReuniaoCrm(ctx, empresaNome, ev) {
  if (!empresaNome) return null;
  const e = await acharEmpresa(ctx, empresaNome);
  if (!e) return 'empresa não achada no CRM';
  await ctx.req('/rest/v1/crm_toques', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ empresa_id: e.id, canal: 'reuniao', direcao: 'enviado', assunto: ev.titulo, resumo: 'Reunião marcada pelo amigo: ' + ev.titulo, resultado: 'reuniao_marcada', reuniao_em: ev.inicio, data: new Date().toISOString(), fonte: 'manual', origem: 'amigo' }) }).catch(() => {});
  const op = await opDaEmpresa(ctx, e);
  if (op && ['Wishlist', 'Contato direto'].includes(op.estagio)) {
    const dia = String(ev.inicio).slice(0, 10);
    await ctx.req('/rest/v1/crm_oportunidades?id=eq.' + op.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estagio: 'Primeira reunião', proximo_passo: 'Reunião: ' + ev.titulo, proximo_passo_em: dia, atualizado_em: new Date().toISOString() }) });
    await auditar(ctx, op.id, 'estagio', op.estagio, 'Primeira reunião');
    await evento(ctx, { oportunidade_id: op.id, tipo: 'estagio', de: op.estagio, para: 'Primeira reunião', texto: 'Reunião marcada pelo amigo para ' + ev.quando });
    return e.nome + ': ' + op.estagio + ' → Primeira reunião';
  }
  if (op) await evento(ctx, { oportunidade_id: op.id, tipo: 'nota', texto: 'Reunião marcada pelo amigo para ' + ev.quando });
  return e.nome + ': reunião registrada';
}

async function marcarReuniao(ctx, inp) {
  const ev = montarEvento(inp);
  if (!ev) return { erro: 'Horário no formato AAAA-MM-DDTHH:MM (hora de Brasília).' };
  if (Date.parse(ev.start.dateTime) < Date.now() - 36e5) return { erro: 'Esse horário já passou.' };
  const resumo = { titulo: ev.summary, quando: new Date(ev.start.dateTime).toLocaleString('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), duracao_min: Math.round((Date.parse(ev.end.dateTime) - Date.parse(ev.start.dateTime)) / 60000), convidados: (ev.attendees || []).map(a => a.email), meet: !!inp.meet, empresa: inp.empresa || null };
  // Conflitos na agenda (só aviso).
  const conflitos = await comAgenda(ctx, (t) => listarEventos(t, { de: ev.start.dateTime, ate: ev.end.dateTime, max: 5 }));
  if (conflitos && conflitos.reconectar) return conflitos;
  const choque = Array.isArray(conflitos) ? conflitos.map(c => c.titulo + ' (' + c.quando + ')') : [];
  if (ev.attendees && ev.attendees.length) {
    ctx.pendente = { tipo: 'reuniao', evento: ev, empresa: inp.empresa || null, resumo };
    return Object.assign({ pronto: true, choque, proximo: 'O convite vai para os convidados: mostre o resumo e peça "manda".' }, resumo);
  }
  const r = await comAgenda(ctx, (t) => criarEvento(t, ev));
  if (r.erro) return r;
  const crm = await registrarReuniaoCrm(ctx, inp.empresa, r);
  return Object.assign({ ok: true, marcado: true, id: r.id, link_meet: r.meet, crm, choque }, resumo);
}

async function eventoPorId(ctx, id) { return comAgenda(ctx, async (t) => { const l = await listarEventos(t, { de: new Date(Date.now() - 30 * 864e5).toISOString(), ate: new Date(Date.now() + 180 * 864e5).toISOString(), max: 100 }); return l.find(e => e.id === id) || { erro: 'Não achei esse compromisso (use o id do ver_agenda).' }; }); }

async function remarcarReuniao(ctx, { id, inicio, duracao, titulo, local }) {
  const atual = await eventoPorId(ctx, id);
  if (atual.erro) return atual;
  const patch = {};
  if (titulo) patch.summary = String(titulo).slice(0, 200);
  if (local) patch.location = String(local).slice(0, 300);
  if (inicio) {
    const ini = isoBrasilia(inicio); if (!ini) return { erro: 'Horário no formato AAAA-MM-DDTHH:MM.' };
    const durAtual = atual.fim && atual.inicio ? Math.round((Date.parse(atual.fim) - Date.parse(atual.inicio)) / 60000) : 60;
    patch.start = { dateTime: ini, timeZone: FUSO }; patch.end = { dateTime: somarMinutos(ini, Number(duracao) > 0 ? Number(duracao) : durAtual), timeZone: FUSO };
  } else if (Number(duracao) > 0 && atual.inicio) patch.end = { dateTime: somarMinutos(atual.inicio, Number(duracao)), timeZone: FUSO };
  if (!Object.keys(patch).length) return { erro: 'Nada para mudar.' };
  if (atual.convidados.length) { ctx.pendente = { tipo: 'remarcar', id, patch, titulo: atual.titulo }; return { pronto: true, compromisso: atual.titulo, de: atual.quando, convidados: atual.convidados, proximo: 'Os convidados serão avisados: peça "manda".' }; }
  const r = await comAgenda(ctx, (t) => alterarEvento(t, id, patch, false));
  return r.erro ? r : { ok: true, compromisso: r.titulo, quando: r.quando };
}

async function cancelarReuniao(ctx, { id }) {
  const atual = await eventoPorId(ctx, id);
  if (atual.erro) return atual;
  if (atual.convidados.length) { ctx.pendente = { tipo: 'cancelar_reuniao', id, titulo: atual.titulo, quando: atual.quando }; return { pronto: true, compromisso: atual.titulo, quando: atual.quando, convidados: atual.convidados, proximo: 'Os convidados recebem o cancelamento: peça "manda".' }; }
  const r = await comAgenda(ctx, async (t) => { await cancelarEvento(t, id, false); return { ok: true }; });
  return r.erro ? r : { ok: true, cancelado: atual.titulo, quando: atual.quando };
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
    case 'mover_etapa': return moverEtapa(ctx, input || {});
    case 'criar_oportunidade': return criarOportunidade(ctx, input || {});
    case 'atualizar_oportunidade': return atualizarOportunidade(ctx, input || {});
    case 'cadastrar_pessoa': return cadastrarPessoa(ctx, input || {});
    case 'pipeline': return verPipeline(ctx, input || {});
    case 'ver_agenda': return verAgenda(ctx, input || {});
    case 'marcar_reuniao': return marcarReuniao(ctx, input || {});
    case 'remarcar_reuniao': return remarcarReuniao(ctx, input || {});
    case 'cancelar_reuniao': return cancelarReuniao(ctx, input || {});
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
  if (p.tipo === 'reuniao') {
    const r = await comAgenda(ctx, (t) => criarEvento(t, p.evento));
    if (r.erro) return 'Não consegui marcar: ' + r.erro;
    const crm = await registrarReuniaoCrm(ctx, p.empresa, r);
    return '✅ Convite enviado: *' + r.titulo + '* (' + r.quando + ')' + (r.meet ? '\nMeet: ' + r.meet : '') + (crm ? '\n' + crm : '');
  }
  if (p.tipo === 'remarcar') {
    const r = await comAgenda(ctx, (t) => alterarEvento(t, p.id, p.patch, true));
    return r.erro ? 'Não consegui remarcar: ' + r.erro : '✅ Remarcado: *' + r.titulo + '* (' + r.quando + '). Convidados avisados.';
  }
  if (p.tipo === 'cancelar_reuniao') {
    const r = await comAgenda(ctx, async (t) => { await cancelarEvento(t, p.id, true); return { ok: true }; });
    return r.erro ? 'Não consegui cancelar: ' + r.erro : '✅ Cancelado: *' + p.titulo + '* (' + p.quando + '). Convidados avisados.';
  }
  return 'Não reconheci a ação pendente.';
}
