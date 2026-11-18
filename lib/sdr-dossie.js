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

// A notícia fala mesmo da empresa? Marca com nome de palavra comum ou curta
// (Reserva, Vivo, Azul, Tigre, Sede…) pega homônimo fácil ("motorista reserva").
// Para essas, exige a forma com inicial maiúscula e rejeita uso como substantivo
// ("Reserva de emergência"). Para as demais, basta o nome aparecer.
const PALAVRAS_COMUNS = new Set(['reserva', 'positivo', 'vivo', 'ser', 'sede', 'search', 'enter', 'tigre', 'ball', 'oi', 'claro', 'sky', 'gol', 'azul', 'track', 'field', 'natura', 'renner', 'zara', 'stone', 'nubank', 'inter', 'pague', 'menos', 'extra', 'dia', 'magalu', 'raia', 'drogasil', 'marisa', 'havan', 'riachuelo', 'casas', 'bahia', 'americanas', 'leve', 'boa', 'vista', 'globo', 'record', 'band', 'rede', 'nova', 'mundo', 'grupo', 'banco', 'loja', 'lojas']);
const RUIDO_NOME = /\b(s\.?\s?a\.?|ltda|eireli|me|epp|brasil|do brasil|grupo|cia|companhia|industria|ind[uú]stria|comercio|com[eé]rcio|holding|participacoes|participa[cç][oõ]es)\b/gi;
const GENERICOS = new Set(['lojas', 'loja', 'banco', 'rede', 'supermercados', 'supermercado', 'farmacias', 'drogarias', 'o', 'a', 'os', 'as']);
function tokensMarca(nome) {
  const limpo = String(nome || '').replace(RUIDO_NOME, ' ').replace(/[^\p{L}\p{N}&' ]/gu, ' ').replace(/\s+/g, ' ').trim();
  return limpo.split(' ').filter(w => w && !GENERICOS.has(w.toLowerCase()));
}
export function marcaPrincipal(nome) { return tokensMarca(nome)[0] || ''; }
export function mencionaEmpresa(empresa, texto) {
  const t = String(texto || '');
  const nome = String(empresa && empresa.nome || '').trim();
  if (!nome) return true;
  const dom = String(empresa && empresa.dominio || '').toLowerCase();
  if (dom && t.toLowerCase().includes(dom.replace(/^www\./, ''))) return true;
  const toks = tokensMarca(nome);
  const marca = toks[0] || '';
  if (!marca) return true;
  const low = marca.toLowerCase();
  const arriscada = PALAVRAS_COMUNS.has(low) || marca.length <= 5;
  const semAcento = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!arriscada) return semAcento(t).includes(semAcento(low));
  // Nome de 2+ palavras com a primeira arriscada ("Porto Seguro", "Cacau Show"):
  // só vale o nome completo, senão "Porto Alegre" passaria.
  if (toks.length >= 2) return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(toks.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const cap = marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase();
  const re = new RegExp('(^|[^\\p{L}])(' + cap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|' + marca.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=[^\\p{L}]|$)([^\\p{L}]+(\\p{L}+))?', 'gu');
  for (const m of t.matchAll(re)) {
    const seguinte = (m[4] || '').toLowerCase();
    if (['de', 'do', 'da', 'dos', 'das'].includes(seguinte)) continue;   // "Reserva de emergência"
    return true;
  }
  return false;
}

// Monta o dossiê completo de uma empresa.
export function montarDossie(empresa, itens, opts = {}) {
  const sobreEla = (Array.isArray(itens) ? itens : []).filter(it => mencionaEmpresa(empresa, `${it.titulo || ''} ${it.resumo || ''}`));
  const sinais = extrairSinais(sobreEla, opts);
  const fontes = [...new Set(sinais.map(s => s.fonte))];
  const nome = (empresa && empresa.nome) || '';
  const resumo = sinais.length
    ? `${sinais.length} sinal(is) público(s) recente(s) para ${nome}: ` +
      sinais.slice(0, 3).map(s => `${s.tipo} (${s.data || 's/data'})`).join('; ')
    : `Sem sinal público recente para ${nome}.`;
  return { empresa_id: empresa && empresa.id, sinais, fontes, resumo, tem_sinal: sinais.length > 0 };
}
