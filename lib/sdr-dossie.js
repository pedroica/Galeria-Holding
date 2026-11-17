// lib/sdr-dossie.js — montagem do dossiê público do lead (SDR, seção 4.3).
// Puro e testável: recebe itens já coletados (crm_noticias, Google News, imprensa,
// crawl) e devolve sinais datados, com fonte, url e TRECHO comprobatório.
// Sem trecho que comprove o fato, o sinal não entra. Ganchos proibidos (crise,
// demissão em massa, tragédia) nunca viram sinal.

export const TIPOS_SINAL = [
  'troca_cmo', 'lancamento', 'expansao', 'resultado_trimestral', 'rebranding',
  'campanha_nova', 'concorrencia_agencia', 'ma_investimento', 'contratacao_marketing',
  'data_comercial'
];

// Padrões (pt-BR) por tipo de sinal. Ordem importa: o primeiro que casa vence.
const TAXONOMIA = [
  { tipo: 'troca_cmo',            re: /\b(novo|nova|assume|assumiu|chega|chegou|contrata|contratou|nomeia|nomeou|promove|promovid[oa])\b[\s\S]{0,40}\b(cmo|chief marketing|diretor[a]? de marketing|vp de marketing|head de marketing|diretor[a]? de comunica)/i },
  { tipo: 'concorrencia_agencia', re: /\b(concorr[êe]ncia|revis[ãa]o de ag[êe]ncia|nova ag[êe]ncia|troca de ag[êe]ncia|conta publicit[áa]ria|anuncia ag[êe]ncia|escolhe ag[êe]ncia|pitch de ag[êe]ncia)\b/i },
  { tipo: 'ma_investimento',      re: /\b(adquire|adquiriu|aquisi[çc][ãa]o|fus[ãa]o|compra[r]?|comprou|investimento|aporte|rodada|capta[r]?|captou|funding|s[ée]rie [a-e]\b|ipo|oferta p[úu]blica)\b/i },
  { tipo: 'lancamento',           re: /\b(lan[çc]a|lan[çc]ou|lan[çc]amento|estreia|estreou|nova linha|novo produto|nova marca|apresenta|apresentou)\b/i },
  { tipo: 'expansao',             re: /\b(expans[ãa]o|inaugura|inaugurou|abre|abriu|nova loja|novas lojas|nova f[áa]brica|nova unidade|chega a[o]?\b|entra n[oa]\b|expande)\b/i },
  { tipo: 'resultado_trimestral', re: /\b(resultado|balan[çc]o|lucro|receita|fatur|trimestre|1t2\d|2t2\d|3t2\d|4t2\d|cresc(e|eu|imento)|ebitda)\b/i },
  { tipo: 'rebranding',           re: /\b(rebranding|reposiciona|reposicionamento|nova identidade|nova marca visual|nova logo|repagina|renova a marca|muda a marca)\b/i },
  { tipo: 'campanha_nova',        re: /\b(campanha|novo filme|novo comercial|a[çc][ãa]o de marketing|ativa[çc][ãa]o|patroc[íi]nio|nova comunica[çc][ãa]o|no ar)\b/i },
  { tipo: 'contratacao_marketing',re: /\b(vaga[s]?|contrata[r]?|contratando|monta time|estrutura[r]? (a |o )?(time|equipe) de marketing|refor[çc]a o marketing)\b/i },
  { tipo: 'data_comercial',       re: /\b(black friday|natal|dia das m[ãa]es|dia dos pais|dia dos namorados|p[áa]scoa|volta [àa]s aulas|ver[ãa]o|carnaval|copa|olimp)/i },
];

// Ganchos proibidos (4.3): nunca usar crise reputacional, demissão em massa ou
// tragédia como motivo. Se o texto bate aqui, o item é descartado inteiro.
const GANCHOS_PROIBIDOS = /\b(crise|demiss[ãa]o|demite|demitiu|layoff|corte de \d|cortes de pessoal|esc[âa]ndalo|pol[êe]mica|processo|a[çc][ãa]o judicial|fal[êe]ncia|recupera[çc][ãa]o judicial|vazamento|hackeado|ataque|fraude|morte|morreu|faleceu|acidente|trag[ée]dia|luto|ass[ée]dio|racismo|boicote|multa|condena)/i;

export function normaliza(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// Classifica um texto em um tipo de sinal, ou null se nenhum padrão casar.
export function classificarSinal(texto) {
  const t = normaliza(texto);
  if (!t) return null;
  for (const { tipo, re } of TAXONOMIA) if (re.test(t)) return tipo;
  return null;
}

export function ganchoProibido(texto) {
  return GANCHOS_PROIBIDOS.test(normaliza(texto));
}

// Data em ISO curta (YYYY-MM-DD) a partir de formatos variados; null se não der.
function dataISO(bruto) {
  if (!bruto) return null;
  const d = new Date(bruto);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = String(bruto).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

// Extrai sinais de uma lista de itens coletados. Cada item:
//   { titulo, url, fonte, data|publicado_em, resumo, origem }
// Retorna [{ tipo, fato, data, fonte, url, trecho, origem }], sem duplicatas de URL,
// só com trecho comprobatório, dentro da janela de dias (padrão 120).
export function extrairSinais(itens, opts = {}) {
  const janelaDias = opts.janelaDias || 120;
  const corte = Date.now() - janelaDias * 86400000;
  const vistos = new Set();
  const sinais = [];
  for (const it of (Array.isArray(itens) ? itens : [])) {
    const titulo = normaliza(it.titulo);
    const resumo = normaliza(it.resumo);
    const url = normaliza(it.url);
    if (!titulo || !url) continue;
    if (vistos.has(url)) continue;

    const textoCompleto = titulo + ' ' + resumo;
    if (ganchoProibido(textoCompleto)) continue;          // gancho proibido → fora

    const tipo = classificarSinal(textoCompleto);
    if (!tipo) continue;                                   // sem tipo da taxonomia → não é sinal

    const data = dataISO(it.data || it.publicado_em);
    if (data && new Date(data).getTime() < corte) continue; // fora da janela

    // Trecho comprobatório: a frase que contém o fato. Preferência: a sentença do
    // resumo que casa o padrão; senão, o título. Sem nada que comprove, descarta.
    const trecho = trechoComprobatorio(tipo, resumo) || titulo;
    if (!trecho) continue;

    vistos.add(url);
    sinais.push({
      tipo,
      fato: titulo,
      data: data || null,
      fonte: normaliza(it.fonte) || 'desconhecida',
      url,
      trecho: trecho.slice(0, 240),
      origem: it.origem || 'noticia'
    });
  }
  // Mais recentes primeiro.
  sinais.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return sinais;
}

// Devolve a primeira sentença do resumo que casa o padrão do tipo (o trecho que
// comprova), ou null se o resumo não comprovar.
function trechoComprobatorio(tipo, resumo) {
  if (!resumo) return null;
  const regra = TAXONOMIA.find(x => x.tipo === tipo);
  if (!regra) return null;
  const sentencas = resumo.split(/(?<=[.!?])\s+/);
  for (const s of sentencas) if (regra.re.test(s)) return normaliza(s);
  return null;
}

// Monta o dossiê completo de uma empresa.
export function montarDossie(empresa, itens, opts = {}) {
  const sinais = extrairSinais(itens, opts);
  const fontes = [...new Set(sinais.map(s => s.fonte))];
  const nome = (empresa && empresa.nome) || '';
  const resumo = sinais.length
    ? `${sinais.length} sinal(is) público(s) recente(s) para ${nome}: ` +
      sinais.slice(0, 3).map(s => `${s.tipo} (${s.data || 's/data'})`).join('; ')
    : `Sem sinal público recente para ${nome}.`;
  return { empresa_id: empresa && empresa.id, sinais, fontes, resumo, tem_sinal: sinais.length > 0 };
}
