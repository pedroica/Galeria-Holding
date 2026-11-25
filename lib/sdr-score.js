// lib/sdr-score.js — score de oportunidade 0-100, explicável, e solução mais
// aderente do portfólio. Puro e testável; usado pela seleção (a cada ciclo) e
// recalculado depois do dossiê, quando os gatilhos públicos ficam conhecidos.
//
// Cada fator devolve pontos + o motivo em português. Sem dado, o fator vale 0 e
// diz que não há dado: o score nunca finge saber o que a base não tem.

// Soluções do ecossistema (Galeria Holding + Gaia). Regras por setor/segmento/nome
// e por tipo de gatilho. A primeira que casar com mais força vence.
export const SOLUCOES = [
  { id: 'brandsync', nome: 'BrandSync (Gaia)', por: 'governança de marca em rede de franquias/distribuidores',
    re: /\b(franquia|franquias|franqueador|rede de lojas|distribuidor|distribuidora|revenda|concession[áa]ria|atacad|cooperativa)\b/i, gatilhos: ['expansao'],
    // Gatilho só conta se o PRÓPRIO fato falar de rede (expansão de banco não é franquia).
    fatoRe: /(franquia|franqueado|lojas|unidades|revend|distribuid|concession[áa]ri|pontos de venda)/i },
  { id: 'cria', nome: 'CR.IA (Gaia)', por: 'produção criativa em escala (muitos produtos, praças e peças)',
    re: /\b(varejo|e-?commerce|marketplace|supermerc|farm[áa]cia|drogaria|moda|cosm[ée]tic|beleza|alimentos|bebidas|consumo|eletro|m[óo]veis|cal[çc]ados|pet)\b/i, gatilhos: ['lancamento', 'data_comercial', 'campanha_nova'] },
  { id: 'catalyst', nome: 'Catalyst', por: 'crescimento mobile (app, aquisição e retenção)',
    re: /\b(app|aplicativo|mobile|fintech|banco digital|delivery|game|jogo|streaming|carteira digital|super ?app)\b/i, gatilhos: ['lancamento'] },
  { id: 'gaia_dados', nome: 'Gaia Data as a Service', por: 'dados, CRM e inteligência de crescimento',
    re: /\b(seguro|seguradora|banco|financeira|financeiro|cr[ée]dito|telecom|operadora|varejo|educa[çc][ãa]o|sa[úu]de|plano de sa[úu]de|energia|utilities|assinatura)\b/i, gatilhos: ['ma_investimento', 'resultado_trimestral'] },
  { id: 'galeria', nome: 'Galeria (comunicação, mídia, estratégia)', por: 'marca, campanha e mídia integradas',
    re: /./, gatilhos: ['campanha_nova', 'rebranding', 'troca_cmo', 'concorrencia_agencia', 'contratacao_marketing'] }
];

// Por que cada tipo de gatilho importa (registrado junto com a fonte).
export const RELEVANCIA_GATILHO = {
  troca_cmo: 'nova liderança de marketing costuma rever agências e planos nos primeiros meses',
  concorrencia_agencia: 'concorrência de agência aberta: janela formal de escolha',
  rebranding: 'reposicionamento exige marca, campanha e materiais novos',
  contratacao_marketing: 'contratação no marketing indica orçamento e prioridade na área',
  campanha_nova: 'campanha recente mostra investimento ativo em comunicação',
  lancamento: 'lançamento pede plano de comunicação, conteúdo e mídia',
  expansao: 'expansão (lojas, praças, franquias) multiplica peças e o desafio de manter a marca consistente',
  ma_investimento: 'fusão, aquisição ou aporte costuma reorganizar marca, dados e prioridades',
  data_comercial: 'data comercial próxima concentra verba e produção',
  resultado_trimestral: 'resultado público mostra o momento do negócio (sinal fraco sozinho)'
};
const PESO_GATILHO = { troca_cmo: 20, concorrencia_agencia: 20, rebranding: 18, contratacao_marketing: 16, campanha_nova: 15, lancamento: 15, expansao: 15, ma_investimento: 14, data_comercial: 9, resultado_trimestral: 5 };

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dias = (iso, agora) => iso ? (agora - new Date(iso).getTime()) / 86400000 : Infinity;

export function nivelCargo(cargo) {
  const c = String(cargo || '');
  if (/\b(ceo|cmo|cco|cdo|cgo|coo|cfo|presiden|founder|fundador|s[óo]ci|chief|c-level)\b/i.test(c)) return { nivel: 'c-level', pontos: 10 };
  if (/\b(diretor|diretora|director|vp|vice[- ]presiden)/i.test(c)) return { nivel: 'diretoria', pontos: 8 };
  if (/\b(head|gerente|manager|lead)\b/i.test(c)) return { nivel: 'gestão', pontos: 6 };
  if (/\b(coordenador|coordenadora|supervisor|especialista)\b/i.test(c)) return { nivel: 'coordenação', pontos: 3 };
  return { nivel: c ? 'outros' : 'sem cargo', pontos: c ? 1 : 0 };
}
const AREA_DECISORA = /(market|marca|brand|comunica|growth|digital|crm|e-?commerce|produto|comercial|vendas|inova|dados|data|ceo|presiden|founder|fundador|s[óo]ci)/i;

export function solucaoAderente(empresa, sinais) {
  const texto = [empresa && empresa.setor, empresa && empresa.setor_sugerido, empresa && empresa.segmento_detalhe, empresa && empresa.nome].filter(Boolean).join(' ');
  const tipos = new Set((sinais || []).map(s => s && s.tipo).filter(Boolean));
  let melhor = null;
  for (const s of SOLUCOES) {
    const porSetor = s.id !== 'galeria' && s.re.test(texto);
    const porGatilho = s.gatilhos.some(g => tipos.has(g)) && (!s.fatoRe || (sinais || []).some(x => x && s.gatilhos.includes(x.tipo) && s.fatoRe.test(String(x.fato || '') + ' ' + String(x.trecho || ''))));
    const forca = (porSetor ? 2 : 0) + (porGatilho ? 1 : 0);
    if (forca > 0 && (!melhor || forca > melhor.forca)) melhor = { ...s, forca, porSetor, porGatilho };
  }
  if (!melhor) melhor = { ...SOLUCOES[SOLUCOES.length - 1], forca: 0, porSetor: false, porGatilho: false };
  return { id: melhor.id, nome: melhor.nome, por: melhor.por, forca: melhor.forca };
}

// ctx: { decisor:{cargo,email,email_valido,wa}, empresa:{nome,setor,setor_sugerido,segmento_detalhe,rank,cliente_ativo},
//        estrelas (0-5), sinais:[{tipo,data,fonte,url,fato}], contexto:[{tipo,texto}], setoresComCase:Set<string>,
//        clienteAtivoMesmoSetor:boolean, agora }
export function scoreOportunidade(ctx) {
  const agora = ctx.agora || Date.now();
  const d = ctx.decisor || {}, e = ctx.empresa || {};
  const sinais = (ctx.sinais || []).filter(s => s && s.url);
  const fatores = [];
  const add = (fator, pontos, max, motivo) => fatores.push({ fator, pontos: Math.max(0, Math.min(max, Math.round(pontos))), max, motivo });

  // 1. Aderência ao portfólio (estrelas empresa x agência, 0-5) → 0-15
  const est = Number(ctx.estrelas) || 0;
  add('aderencia_portfolio', est * 3, 15, est ? `encaixe ${est}/5 com as agências do grupo` : 'sem avaliação de encaixe na base');

  // 2. Porte/relevância (posição no ranking da base; proxy, não há porte/receita) → 0-10
  const rk = Number(e.rank) || 0;
  const pPorte = !rk ? 0 : rk <= 100 ? 10 : rk <= 500 ? 8 : rk <= 1500 ? 6 : rk <= 4000 ? 4 : 2;
  add('porte_relevancia', pPorte, 10, rk ? `posição ${rk} no ranking da base (aproximação de porte: a base não tem receita nem funcionários)` : 'sem dado de porte na base');

  // 3. Compatibilidade com clientes e cases do grupo → 0-10
  const setor = norm(e.setor || e.setor_sugerido);
  const temCase = !!(setor && ctx.setoresComCase && [...ctx.setoresComCase].some(s => s && (setor.includes(norm(s)) || norm(s).includes(setor))));
  add('cases_clientes', (temCase ? 6 : 0) + (ctx.clienteAtivoMesmoSetor ? 4 : 0), 10,
    [temCase ? 'há case do grupo no mesmo setor' : 'sem case do grupo no setor', ctx.clienteAtivoMesmoSetor ? 'há cliente ativo parecido' : null].filter(Boolean).join('; '));

  // 4. Momento comercial: gatilho público com fonte, ponderado por tipo e recência → 0-20
  let melhorG = null;
  for (const s of sinais) {
    const idade = dias(s.data, agora);
    const rec = idade <= 30 ? 1 : idade <= 90 ? 0.7 : idade <= 180 ? 0.4 : 0.2;
    const p = (PESO_GATILHO[s.tipo] || 5) * rec;
    if (!melhorG || p > melhorG.p) melhorG = { p, s };
  }
  add('momento_gatilho', melhorG ? melhorG.p : 0, 20, melhorG
    ? `${melhorG.s.tipo.replace(/_/g, ' ')} (${melhorG.s.fonte || 'fonte'}, ${String(melhorG.s.data || 's/data').slice(0, 10)}): ${RELEVANCIA_GATILHO[melhorG.s.tipo] || 'sinal público'}`
    : 'nenhum gatilho público com fonte');

  // 5. Oportunidade identificável (solução do portfólio que casa com setor/gatilho) → 0-10
  const sol = solucaoAderente(e, sinais);
  add('oportunidade', sol.forca >= 3 ? 10 : sol.forca === 2 ? 7 : sol.forca === 1 ? 5 : 2, 10,
    `${sol.nome}: ${sol.por}${sol.forca === 0 ? ' (sem sinal específico; oferta genérica)' : ''}`);

  // 6. Senioridade e área do contato → 0-10
  const nv = nivelCargo(d.cargo);
  const area = AREA_DECISORA.test(String(d.cargo || ''));
  add('senioridade', nv.pontos * (area || nv.nivel === 'c-level' ? 1 : 0.6), 10, `${nv.nivel}${d.cargo ? ' (' + d.cargo + ')' : ''}${!area && nv.nivel !== 'c-level' && d.cargo ? ', fora da área que decide comunicação' : ''}`);

  // 7. Acesso ao decisor → 0-10
  const emailOk = !!d.email && d.email_valido !== false;
  add('acesso', (emailOk ? 7 : 0) + (d.wa ? 3 : 0), 10, [emailOk ? 'e-mail válido' : 'sem e-mail válido', d.wa ? 'WhatsApp' : null].filter(Boolean).join(' + '));

  // 8. Relacionamento prévio (contexto real do CRM) → 0-15
  const cx = ctx.contexto || [];
  const pRel = cx.some(c => c.tipo === 'conversa') ? 15 : cx.some(c => c.tipo === 'oportunidade') ? 12 : cx.some(c => c.tipo === 'momento') ? 10 : 0;
  add('relacionamento', pRel, 15, cx.length ? cx[0].texto : 'sem histórico com o grupo');

  const score = Math.max(0, Math.min(100, fatores.reduce((a, f) => a + f.pontos, 0)));
  const ordenados = [...fatores].sort((a, b) => b.pontos / b.max - a.pontos / a.max);
  const gatilho = melhorG ? { tipo: melhorG.s.tipo, fato: melhorG.s.fato || '', fonte: melhorG.s.fonte || '', url: melhorG.s.url, data: melhorG.s.data || null, relevancia: RELEVANCIA_GATILHO[melhorG.s.tipo] || '' } : null;
  const proximaAcao = !emailOk && !d.wa ? 'revelar contato (Lusha) antes de abordar'
    : pRel ? 'retomar a conversa com o contexto do CRM'
    : melhorG ? 'abordar agora a partir do gatilho público'
    : 'aguardar gatilho ou contexto: sem motivo concreto, não abordar';
  return {
    score, solucao: sol.id, solucao_nome: sol.nome, gatilho,
    motivo: ordenados.slice(0, 2).filter(f => f.pontos > 0).map(f => f.motivo).join(' · ') || 'sem fatores fortes',
    proxima_acao: proximaAcao, fatores
  };
}

// Diversidade: no lote, no máximo `maxPorSetor` (fração) do mesmo setor.
export function limitarPorSetor(itens, { loteMax, maxFracao = 0.3, setorDe }) {
  const teto = Math.max(1, Math.ceil(loteMax * maxFracao));
  const cont = {}; const dentro = []; const fora = [];
  for (const it of itens) {
    const s = norm(setorDe(it) || 'sem setor');
    if ((cont[s] || 0) >= teto && s !== 'sem setor') { fora.push(it); continue; }
    cont[s] = (cont[s] || 0) + 1; dentro.push(it);
  }
  return { dentro, fora };
}
