// lib/movimentacoes.js — quem assumiu como CMO / diretor(a) de marketing no Brasil.
// Fontes: imprensa (Google News RSS: Meio & Mensagem, Propmark, Exame...) todo dia e
// sinais de troca de cargo do Lusha uma vez por semana. Cada movimentação vira um
// e-mail de parabéns no estilo do Pedro (lib/estilo.js): reconhecimento, trajetória
// e feitos (só o que a fonte diz) e convite para um café. Parte pura e testável.

import { linhasEstilo } from './estilo.js';
import { primeiroNome } from './blitz.js';

// Buscas na imprensa (últimos 7 dias). Google News aceita "when:7d" na consulta.
export const CONSULTAS_IMPRENSA = [
  '"novo CMO"', '"nova CMO"', '"assume como CMO"', '"é o novo CMO"', '"é a nova CMO"',
  '"novo diretor de marketing"', '"nova diretora de marketing"', '"assume a diretoria de marketing"',
  '"novo head de marketing"', '"nova head de marketing"', '"nova vice-presidente de marketing"', '"novo vice-presidente de marketing"',
  'site:meioemensagem.com.br marketing assume', 'site:propmark.com.br "diretor de marketing"', 'site:propmark.com.br CMO'
];
export function urlImprensa(consulta) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(consulta + ' when:7d') + '&hl=pt-BR&gl=BR&ceid=BR:pt-419';
}

const tirarTags = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
export function lerRss(xml) {
  return [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const get = (tag) => { const x = m[1].match(new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + tag + '>|<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return x ? (x[1] || x[2] || '').trim() : ''; };
    return { titulo: tirarTags(get('title')), url: get('link'), fonte: tirarTags(get('source')), data: get('pubDate'), resumo: tirarTags(get('description')).slice(0, 400) };
  }).filter(i => i.titulo);
}
// Junta itens de várias buscas sem repetir a mesma manchete.
export function juntarItens(listas) {
  const vistos = new Set(); const out = [];
  for (const l of (listas || [])) for (const i of (l || [])) {
    const k = i.titulo.toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/[^a-z0-9à-ú ]/g, '').slice(0, 90);
    if (vistos.has(k)) continue; vistos.add(k); out.push(i);
  }
  return out;
}

// Cargos que interessam: liderança de marketing, marca, comunicação, growth.
export function ehCargoAlvo(cargo) {
  const c = String(cargo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!c) return false;
  const lideranca = /\b(cmo|chief marketing|chief brand|chief growth|chief communication|vp|vice[- ]?presidente?|diretor|diretora|director|head|lider|gerente geral)\b/.test(c);
  const area = /(marketing|mkt|marca|brand|comunica|growth|cmo|consumidor|digital)/.test(c);
  return lideranca && area;
}
const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function chaveMovimento(pessoa, empresa) { return sem(pessoa) + '|' + sem(empresa).replace(/\b(s a|sa|ltda|brasil|group|grupo)\b/g, '').trim(); }

// Pessoas indo para agência de publicidade/comunicação não são prospects.
const RE_AGENCIA = /\b(ag[eê]ncia|publicidade|propaganda|holding de comunica|wpp|omnicom|publicis|dentsu|havas|interpublic|ipg|vml|ogilvy|africa creative|almap|dm9|wieden|fcb|leo burnett|mccann|grey|talent)\b/i;
export function ehAgencia(empresa) { return RE_AGENCIA.test(String(empresa || '')); }

export const SCHEMA_EXTRACAO = {
  type: 'object',
  properties: { movimentos: { type: 'array', items: { type: 'object', properties: {
    pessoa: { type: 'string' }, cargo: { type: 'string' }, empresa: { type: 'string' },
    cargo_anterior: { type: 'string' }, empresa_anterior: { type: 'string' },
    trajetoria: { type: 'string' }, feitos: { type: 'string' }, item: { type: 'integer' }
  }, required: ['pessoa', 'cargo', 'empresa', 'cargo_anterior', 'empresa_anterior', 'trajetoria', 'feitos', 'item'], additionalProperties: false } } },
  required: ['movimentos'], additionalProperties: false
};
export function promptExtracao(itens) {
  const system = [
    'Você lê manchetes e resumos da imprensa brasileira de marketing e negócios e extrai MOVIMENTAÇÕES DE EXECUTIVOS: alguém que acabou de assumir um cargo de liderança de marketing, marca, comunicação ou growth (CMO, VP, diretor(a), head) em uma EMPRESA ANUNCIANTE no Brasil.',
    'Regras:',
    '- Só o que o texto diz. Não complete nome, cargo, empresa nem trajetória com conhecimento próprio.',
    '- Ignore: quem foi para agência de publicidade/comunicação/consultoria de marketing, quem SAIU sem dizer para onde, cargos fora de marketing/comunicação, notícias fora do Brasil, listas genéricas.',
    '- trajetoria: de onde a pessoa vem e por onde passou, exatamente como o texto diz ("" se não diz). feitos: campanhas, resultados ou prêmios citados no texto ("" se não há).',
    '- item: o número do item de onde veio. Uma linha por pessoa.'
  ].join('\n');
  const user = (itens || []).map((it, i) => `[${i}] ${it.titulo}${it.fonte ? ' (' + it.fonte + ')' : ''}${it.resumo ? '\n    ' + it.resumo : ''}`).join('\n');
  return { system, user };
}

export const SCHEMA_PARABENS = {
  type: 'object',
  properties: { assunto: { type: 'string' }, email: { type: 'string' }, linkedin: { type: 'string' } },
  required: ['assunto', 'email', 'linkedin'], additionalProperties: false
};
// mov: {pessoa, cargo, empresa, cargo_anterior, empresa_anterior, trajetoria, feitos, fonte, titulo}
export function promptParabens({ mov, holding, cases, memoria }) {
  const nome = primeiroNome(mov.pessoa) || 'Olá';
  const system = [
    'Você escreve, como o Pedro Ica (sócio e Head de Growth da Galeria Holding, grupo de agências de comunicação), uma mensagem de PARABÉNS para um executivo que acabou de assumir a liderança de marketing de uma empresa.',
    ...linhasEstilo(),
    'Regras deste tipo de mensagem:',
    '- Abra dando parabéns pelo novo cargo na empresa, pelo primeiro nome. Pode dizer que viu a notícia (cite o veículo se ele estiver nas fontes).',
    '- Trajetória e feitos: SÓ o que está em FONTES. Sem fonte, fale do desafio do cargo novo sem inventar passado. Nunca invente número, prêmio, campanha ou empresa.',
    '- Um parágrafo curto sobre o momento: os primeiros meses no cargo e o que o grupo pode somar (estratégia, criação, mídia, conteúdo, dados e IA), sem lista e sem pitch.',
    '- Feche convidando para um café (presencial ou por vídeo) para conhecer o desafio e ver como a Galeria Holding pode ajudar. Uma pergunta só.',
    '- E-mail: assunto curto e pessoal (até 7 palavras, sem caixa alta, ex.: "parabéns pela Natura"). Corpo de 80 a 140 palavras em 3 parágrafos curtos separados por linha em branco. Sem assinatura (o Gmail põe).',
    '- linkedin: versão curta para mensagem no LinkedIn (até 60 palavras), mesmo tom, terminando no convite para o café.',
    '- Português impecável. Sem travessão como pontuação. Nada com cara de texto de IA.',
    memoria ? 'Memória comercial do Pedro (siga):\n' + memoria : ''
  ].filter(Boolean).join('\n');
  const fontes = [
    `Notícia: ${mov.titulo || ''}${mov.fonte ? ' (' + mov.fonte + ')' : ''}`,
    mov.trajetoria ? `Trajetória (da fonte): ${mov.trajetoria}` : '',
    mov.feitos ? `Feitos (da fonte): ${mov.feitos}` : '',
    mov.cargo_anterior || mov.empresa_anterior ? `Antes: ${[mov.cargo_anterior, mov.empresa_anterior].filter(Boolean).join(' na ')}` : ''
  ].filter(Boolean).join('\n');
  const user = [
    `PESSOA: ${mov.pessoa} · primeiro nome: ${nome}`,
    `NOVO CARGO: ${mov.cargo} na ${mov.empresa}`,
    'FONTES (use só isto sobre a pessoa):', fontes,
    holding && holding.descricao ? `GALERIA HOLDING: ${holding.descricao}` : '',
    (cases && cases.length) ? 'Cases do grupo no setor (pode citar UM se fizer sentido, resultado exatamente assim):\n' + cases.map(c => `- ${c.titulo}${c.marca ? ' (' + c.marca + ')' : ''}: ${c.resultado || ''}`).join('\n') : ''
  ].filter(Boolean).join('\n');
  return { system, user, fontes };
}

const palavras = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
// Checa antes de criar o rascunho. fontesTexto: tudo que a IA podia usar sobre a pessoa.
export function checarParabens(m, fontesTexto) {
  const p = [];
  if (!m || !m.assunto || !m.email) return ['resposta incompleta'];
  if (!/parab[eé]ns/i.test(m.email)) p.push('não dá parabéns');
  if (!/caf[eé]/i.test(m.email)) p.push('não convida para o café');
  if (palavras(m.email) > 170) p.push('e-mail longo');
  if (!/\n\s*\n/.test(m.email)) p.push('e-mail num parágrafo só');
  if (palavras(m.assunto) > 9) p.push('assunto longo');
  if (/\{|\}|\[nome|xxx/i.test(m.email + m.assunto)) p.push('sobrou marcador');
  // Número que não está na fonte = inventado (ex.: "+30% de vendas").
  const fonte = String(fontesTexto || '');
  const nums = (String(m.email).match(/\d+[.,]?\d*\s*%?/g) || []).map(x => x.trim()).filter(x => x.length >= 2 || /%/.test(x));
  if (nums.some(n => !fonte.includes(n.replace(/\s/g, '')) && !fonte.includes(n))) p.push('cita número que não está na fonte');
  return p;
}
