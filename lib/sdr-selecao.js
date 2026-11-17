// lib/sdr-selecao.js — seleção do lote do SDR (seção 4.2). Puro e testável.
// Decide quem contatar e por qual agência, aplicando todas as exclusões
// obrigatórias e a prioridade. Não toca na rede nem no banco.

// Regras de atribuição de agência por setor/sinal, derivadas das especialidades
// do data/galeria-holding-knowledge.json. Primeiro match vence.
export const AG_REGRAS = [
  { slug: 'catalyst',   re: /\b(app|mobile|aplicativo|jogo|game|fintech|delivery|marketplace)\b/i,                         por: 'mobile growth' },
  { slug: 'vitrine',    re: /\b(varejo|loja|rede de lojas|ooh|outdoor|out of home|shopping|supermerc)\b/i,                  por: 'OOH e varejo' },
  { slug: '404',        re: /\b(tecnologia|tech|software|saas|intelig[êe]ncia artificial|\bia\b|inova[çc][ãa]o|startup|plataforma)\b/i, por: 'inovação e tech' },
  { slug: 'gaia',       re: /\b(franquia|franquias|distribuidor|dco|martech|produ[çc][ãa]o em escala)\b/i,                  por: 'martech e escala' },
  { slug: 'agente',     re: /\b(influen|creator|beleza|cosm[ée]tico|moda|lifestyle)\b/i,                                    por: 'influência' },
  { slug: 'gux',        re: /\b(ux|experi[êe]ncia do usu[áa]rio|produto digital|banco|seguro|plano de sa[úu]de|previd)\b/i,  por: 'UX de produto' },
  { slug: 'cccaramelo', re: /\b(m[úu]sica|cultura|entretenimento|festival|show|cinema)\b/i,                                 por: 'cultura e entretenimento' },
  { slug: 'mantiqueira', re: /\b(document[áa]rio|docuss[ée]rie|branded content|websérie|web s[ée]rie|conte[úu]do de longa)\b/i,          por: 'branded content de longa duração' },
  { slug: 'mila',       re: /\b(b2b|ind[úu]stria|agro|agroneg|insumo|sustentab|institucional|papel|celulose|miner|sider|qu[íi]mic|constru)\b/i, por: 'storytelling B2B' },
];
const SINAL_PARA_GALERIA = new Set(['lancamento', 'campanha_nova', 'rebranding', 'troca_cmo']);

export function escolherAgencia(empresa, sinalTipo, agencias) {
  const idPorSlug = {};
  for (const a of (Array.isArray(agencias) ? agencias : [])) idPorSlug[a.slug] = a.id;
  const texto = `${empresa && empresa.setor || ''} ${empresa && empresa.segmento_detalhe || ''} ${empresa && empresa.nome || ''}`;
  for (const r of AG_REGRAS) {
    if (r.re.test(texto) && idPorSlug[r.slug]) {
      return { slug: r.slug, id: idPorSlug[r.slug], motivo: `Setor casa com ${r.por}: ${r.slug}.` };
    }
  }
  if (sinalTipo && SINAL_PARA_GALERIA.has(sinalTipo) && idPorSlug['galeria']) {
    return { slug: 'galeria', id: idPorSlug['galeria'], motivo: `Sinal de ${sinalTipo} em marca de consumo: Galeria (campanhas integradas).` };
  }
  return { slug: 'holding', id: idPorSlug['holding'] || null, motivo: 'Sem match forte de setor: Holding (proponente padrão).' };
}

const STATUS_INATIVO = new Set(['inativo', 'removido', 'descadastrado']);

// Exclusões obrigatórias para um decisor. Retorna null (passa) ou o motivo.
// ctx: { blocklist, toquesEmpresa30d:{empresa_id:[{agencia_id,data}]},
//        semanaISO, agora }
function motivoExclusao(d, ctx) {
  const emp = d.empresa || d.crm_empresas || {};
  if (d.status && STATUS_INATIVO.has(d.status)) return 'inativo';
  if (d.etapa_cadencia === 'off') return 'cadencia_off';
  if (d.opt_out) return 'opt_out';
  if (d.respondeu) return 'ja_respondeu';
  if (d.pausa_ate_em && new Date(d.pausa_ate_em) > new Date()) return 'pausado';
  if (d.email_valido === false && !d.wa) return 'sem_canal_valido';   // bounce sem WhatsApp
  if (ctx.blocklist && ctx.blocklist.isBlocked({ name: emp.nome, domain: emp.dominio, email: d.email })) return 'blocklist';
  // Empresa tocada por qualquer agência do grupo nos últimos 30 dias: um contato
  // frio novo não deve pisar no trabalho recente de ninguém (4.2).
  const toques = (ctx.toquesEmpresa30d && ctx.toquesEmpresa30d[d.empresa_id]) || [];
  if (toques.length > 0) return 'empresa_tocada_30d';
  return null;
}

// Monta o lote do dia. Entrada toda em memória (o cron faz as leituras).
// ctx: {
//   candidatos:[decisor...], estrelas:{empresa_id:n}, blocklist,
//   toquesEmpresa30d:{}, dossies:{empresa_id:{sinais,tem_sinal}}, agencias:[],
//   followups:[{decisor_id,empresa_id,dia_cadencia,agencia_id}],   // já vencidos (prioridade máxima)
//   topoAceitos:{empresa_id:{fonte,agencia_slug,motivo}},          // Bloco G, aceitos pelo Pedro
//   config:{lote_max}, agora, semanaISO
// }
export function selecionarLote(ctx) {
  const loteMax = (ctx.config && ctx.config.lote_max) || 30;
  const estrelas = ctx.estrelas || {};
  const dossies = ctx.dossies || {};
  const agora = ctx.agora || Date.now();

  const upsell = [];       // clientes ativos → fila de upsell (só o Pedro aprova)
  const excluidos = [];
  const elegiveis = [];

  for (const d of (Array.isArray(ctx.candidatos) ? ctx.candidatos : [])) {
    const emp = d.empresa || d.crm_empresas || {};
    if (emp.cliente_ativo) { upsell.push({ decisor_id: d.id, empresa_id: d.empresa_id, motivo: 'cliente_ativo' }); continue; }
    const mot = motivoExclusao(d, ctx);
    if (mot) { excluidos.push({ decisor_id: d.id, decisor: d.nome, motivo: mot }); continue; }

    const dossie = dossies[d.empresa_id] || { sinais: [], tem_sinal: false };
    const sinalRecente = (dossie.sinais || []).find(s => s.data && (agora - new Date(s.data).getTime()) <= 30 * 86400000);
    // Topo de funil aceito pelo Pedro (Bloco G) passa à frente de tudo, com a agência sugerida.
    const topo = ctx.topoAceitos && ctx.topoAceitos[d.empresa_id];
    let ag = escolherAgencia(emp, sinalRecente && sinalRecente.tipo, ctx.agencias);
    if (topo && topo.agencia_slug) {
      const a = (ctx.agencias || []).find(x => x.slug === topo.agencia_slug);
      if (a) ag = { slug: a.slug, id: a.id, motivo: 'Topo de funil aceito: ' + (topo.motivo || topo.fonte) };
    }

    // Prioridade: (b) sinal novo <30d, (c) estrelas, (d) mais tempo sem toque.
    const semToqueMs = d.ultimo_toque_em ? (agora - new Date(d.ultimo_toque_em).getTime()) : Infinity;
    const score =
      (topo ? 2_000_000 : 0) +
      (sinalRecente ? 1_000_000 : 0) +
      (estrelas[d.empresa_id] || 0) * 10_000 +
      Math.min(999, Math.floor(semToqueMs / 86400000));

    elegiveis.push({
      decisor_id: d.id, decisor: d.nome, empresa_id: d.empresa_id, empresa: emp.nome,
      agencia_id: ag.id, agencia_slug: ag.slug, agencia_motivo: ag.motivo,
      dia_cadencia: 0, sinal_tipo: sinalRecente ? sinalRecente.tipo : null,
      prioridade: topo ? 'topo_' + topo.fonte : sinalRecente ? 'sinal' : (estrelas[d.empresa_id] ? 'estrelas' : 'sem_toque'),
      score
    });
  }

  elegiveis.sort((a, b) => b.score - a.score);

  // Fila própria por empresa do grupo: intercala as agências (round-robin pela
  // ordem de score) para o lote não ficar todo com a Holding/Galeria, que é o
  // padrão quando o setor não casa com nenhuma especialidade.
  const intercalar = !(ctx.config && ctx.config.intercalar_agencias === false);
  if (intercalar) {
    const grupos = new Map();
    for (const e of elegiveis) { const k = e.agencia_slug || '?'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
    // Agências com o melhor primeiro candidato começam a rodada.
    const filas = [...grupos.values()].sort((a, b) => b[0].score - a[0].score);
    const ordenados = [];
    for (let i = 0; ordenados.length < elegiveis.length; i++) for (const f of filas) if (f[i]) ordenados.push(f[i]);
    elegiveis.splice(0, elegiveis.length, ...ordenados);
  }

  // Caps por empresa: 1 primeiro contato por semana, no máx. 2 decisores por semana.
  const primeiroContatoEmpresa = new Set(ctx.primeirosContatoSemana || []);
  const decisoresPorEmpresa = {};
  const lote = [];

  // (a) follow-ups vencidos entram primeiro, sem consumir o cap de primeiro contato.
  for (const f of (Array.isArray(ctx.followups) ? ctx.followups : [])) {
    if (lote.length >= loteMax) break;
    lote.push({ ...f, prioridade: 'followup' });
  }

  for (const e of elegiveis) {
    if (lote.length >= loteMax) break;
    if (primeiroContatoEmpresa.has(e.empresa_id)) { excluidos.push({ decisor_id: e.decisor_id, decisor: e.decisor, motivo: 'empresa_ja_teve_primeiro_contato_semana' }); continue; }
    if ((decisoresPorEmpresa[e.empresa_id] || 0) >= 2) { excluidos.push({ decisor_id: e.decisor_id, decisor: e.decisor, motivo: 'max_2_decisores_empresa_semana' }); continue; }
    primeiroContatoEmpresa.add(e.empresa_id);
    decisoresPorEmpresa[e.empresa_id] = (decisoresPorEmpresa[e.empresa_id] || 0) + 1;
    lote.push(e);
  }

  return { lote, upsell, excluidos, total_elegiveis: elegiveis.length };
}
