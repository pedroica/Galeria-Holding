// lib/sdr-topo.js — topo de funil do SDR (Bloco G). Puro/testável.
// Três fontes, em ordem de prioridade:
//   1. cross-sell interno: cliente ativo de uma agência = lead quente para as outras;
//   2. sinais de compra nas notícias (troca de CMO, rodada/aquisição, lançamento,
//      vaga de marketing, concorrência de agência, expansão);
//   3. lookalike dos melhores clientes (filtrado por porte).
import { AG_REGRAS } from './sdr-selecao.js';
import { classificarSinal, ganchoProibido } from './sdr-dossie.js';

// Peso de cada sinal de compra (quanto mais perto de "vai contratar agência", maior).
export const PESO_SINAL = {
  concorrencia_agencia: 10, troca_cmo: 9, contratacao_marketing: 7, ma_investimento: 7,
  rebranding: 6, lancamento: 5, expansao: 5, campanha_nova: 3
};
const SLUG_EXCLUIDOS = new Set(['holding']);

// clientes: [{ empresa_id, nome, setor, segmento_detalhe, agencias_ativas:[slug] }]
// agencias: [{ slug, nome }]  knowledge: JSON com cases_destaque (para dar peso a quem tem case no setor)
// → [{ chave, fonte:'cross_sell', empresa_id, nome, agencia_slug, motivo, score }]
export function crossSell(clientes, agencias, knowledge, porCliente = 2) {
  const nomes = {}; for (const a of (agencias || [])) nomes[a.slug] = a.nome;
  const cases = (knowledge && knowledge.cases_destaque) || [];
  const out = [];
  for (const c of (clientes || [])) {
    const ativas = new Set(c.agencias_ativas || []);
    const texto = `${c.setor || ''} ${c.segmento_detalhe || ''} ${c.nome || ''}`;
    const cands = [];
    for (const r of AG_REGRAS) {
      if (ativas.has(r.slug) || SLUG_EXCLUIDOS.has(r.slug) || !nomes[r.slug]) continue;
      let score = 0;
      if (r.re.test(texto)) score += 5;
      const temCase = cases.some(k => k.agencia_slug === r.slug && (k.tags || []).some(t => texto.toLowerCase().includes(String(t).toLowerCase())));
      if (temCase) score += 3;
      if (score === 0) continue;
      cands.push({ slug: r.slug, score, por: r.por, temCase });
    }
    // Galeria (campanha integrada) entra para qualquer cliente de outra agência sem match melhor.
    if (!cands.length && !ativas.has('galeria') && nomes.galeria) cands.push({ slug: 'galeria', score: 2, por: 'campanha integrada', temCase: false });
    cands.sort((a, b) => b.score - a.score);
    for (const k of cands.slice(0, porCliente)) {
      out.push({
        chave: `cross_sell|${c.empresa_id}|${k.slug}`, fonte: 'cross_sell', empresa_id: c.empresa_id, nome: c.nome, agencia_slug: k.slug,
        motivo: `Cliente ativo de ${[...ativas].map(s => nomes[s] || s).join(', ')}; ${nomes[k.slug]} encaixa por ${k.por}${k.temCase ? ' e tem case no setor' : ''}. Apresentação pela agência que já atende.`,
        score: 10 + k.score   // cross-sell sempre acima das outras fontes
      });
    }
  }
  return out;
}

// noticias: [{ empresa_id, titulo, resumo, url, data }]  empresas: {id:{nome}}
// Uma linha por empresa (o sinal mais forte), só com fonte (URL) e sem gancho proibido.
export function sinaisDeCompra(noticias, empresas, { janelaDias = 45, agora = new Date() } = {}) {
  const corte = new Date(agora.getTime() - janelaDias * 86400000).toISOString().slice(0, 10);
  const melhor = {};
  for (const n of (noticias || [])) {
    if (!n.url || !n.empresa_id || (n.data && n.data < corte)) continue;
    const texto = `${n.titulo || ''} ${n.resumo || ''}`;
    if (ganchoProibido(texto)) continue;
    const tipo = classificarSinal(texto);
    const peso = PESO_SINAL[tipo] || 0;
    if (!peso) continue;
    const atual = melhor[n.empresa_id];
    if (!atual || peso > atual.peso) melhor[n.empresa_id] = { tipo, peso, n };
  }
  return Object.entries(melhor).map(([id, m]) => ({
    chave: `sinal_compra|${id}|${m.tipo}`, fonte: 'sinal_compra', empresa_id: id,
    nome: (empresas && empresas[id] && empresas[id].nome) || null,
    motivo: `Sinal de compra (${m.tipo}): ${String(m.n.titulo || '').slice(0, 160)}`,
    score: m.peso, dados: { tipo: m.tipo, url: m.n.url, data: m.n.data || null }
  }));
}

// lookalikes: [{ name, domain, employeeCount:{exact}, location }] → candidatos com porte mínimo,
// sem órgão público e sem quem já está na base (dominiosBase: Set).
export function filtrarLookalikes(lookalikes, dominiosBase, { minFuncionarios = 100 } = {}) {
  const limpa = (d) => String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const out = [];
  for (const l of (lookalikes || [])) {
    const dom = limpa(l.domain);
    const func = (l.employeeCount && (l.employeeCount.exact || l.employeeCount.min)) || 0;
    if (!dom || func < minFuncionarios) continue;
    if (/\.gov\.br$|^saae|^daae|prefeitura/.test(dom)) continue;
    if (dominiosBase && dominiosBase.has(dom)) continue;
    out.push({ chave: `lookalike|${dom}|`, fonte: 'lookalike', nome: l.name, dominio: dom,
      motivo: `Parecida com os melhores clientes do grupo (${func} funcionários${l.location && l.location.state ? ', ' + l.location.state : ''}).`,
      score: Math.min(6, 2 + Math.log10(func)), dados: { funcionarios: func, linkedin: l.socialLinks && l.socialLinks.linkedin || null } });
  }
  return out;
}
