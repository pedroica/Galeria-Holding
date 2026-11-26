// lib/estilo-aprendido.js — aprender o jeito de escrever do Pedro (pedido de 26/11).
// Fonte: e-mails que ELE escreveu (Enviados do Gmail; sai o que o agente escreveu) e as
// versões finais de WhatsApp/e-mail que ele editou no follow-up do Pipeline. A IA lê as
// amostras e devolve um perfil (como abre, como fecha, tamanho, expressões, o que evita,
// trechos reais). O perfil entra em toda mensagem que o agente escreve. Parte pura.

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palavras = (t) => (norm(t).match(/[a-z0-9]+/g) || []);
export function similaridade(a, b) {
  const A = new Set(palavras(a)), B = new Set(palavras(b));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}

// Só o que a pessoa escreveu: sem citação da resposta, sem assinatura, sem rodapé.
export function textoProprio(texto) {
  let t = String(texto || '').replace(/\r\n?/g, '\n');
  const corte = t.search(/\n\s*(Em .{5,160}escreveu:|On .{5,160}wrote:|De: .{3,}\n|From: .{3,}\n|-{3,} ?(Mensagem|Original|Forwarded)|_{5,}|>)/i);
  if (corte > 0) t = t.slice(0, corte);
  t = t.split(/\n--\s*\n/)[0];
  t = t.replace(/^\s*\[image:[^\]]*\]\s*$/gim, '').replace(/\n*(enviado do meu (iphone|android)|sent from my \w+)[\s\S]*$/i, '');
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// mensagens: [{assunto, texto, para, data}] do Enviados. textosAgente: corpos escritos pelo
// agente (crm_fila, follow-ups gerados) — e-mail parecido com eles não é do Pedro.
const chaveAssunto = (a) => norm(a).replace(/^\s*(re|res|enc|fwd?|tr)\s*:\s*/g, '').replace(/\d+/g, '#').split(/\s+/).slice(0, 3).join(' ');
export function escolherAmostras(mensagens, textosAgente, { max = 40, eu } = {}) {
  const agente = (textosAgente || []).filter(Boolean);
  const euEmail = String(eu || '').toLowerCase();
  // Assunto que se repete 5+ vezes é automação (relatório, alerta, lead), não conversa.
  const freq = {}; for (const m of (mensagens || [])) { const k = chaveAssunto(m.assunto); freq[k] = (freq[k] || 0) + 1; }
  const out = []; const vistos = [];
  for (const m of (mensagens || [])) {
    if (/^\s*(fwd?|enc|encaminhad)/i.test(m.assunto || '')) continue;
    if (String(m.para || '').split(',').length > 6) continue;          // disparo em massa
    if (euEmail && String(m.para || '').toLowerCase().split(',').every(x => !x.trim() || x.includes(euEmail))) continue;   // para ele mesmo
    if (freq[chaveAssunto(m.assunto)] >= 5) continue;
    const t = textoProprio(m.texto);
    const n = palavras(t).length;
    if (n < 25 || n > 450) continue;
    if (agente.some(a => similaridade(a, t) >= 0.55)) continue;          // escrito pelo agente
    if (vistos.some(v => similaridade(v, t) >= 0.8)) continue;           // repetido
    vistos.push(t);
    out.push({ canal: 'email', assunto: String(m.assunto || '').slice(0, 120), texto: t.slice(0, 2500), data: m.data || null });
    if (out.length >= max) break;
  }
  return out;
}

export const SCHEMA_ESTILO = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    regras: { type: 'array', items: { type: 'string' } },
    aberturas: { type: 'array', items: { type: 'string' } },
    fechamentos: { type: 'array', items: { type: 'string' } },
    expressoes: { type: 'array', items: { type: 'string' } },
    evitar: { type: 'array', items: { type: 'string' } },
    whatsapp: { type: 'string' },
    exemplos: { type: 'array', items: { type: 'string' } }
  },
  required: ['resumo', 'regras', 'aberturas', 'fechamentos', 'expressoes', 'evitar', 'whatsapp', 'exemplos'],
  additionalProperties: false
};

export function promptAprenderEstilo(amostras) {
  const system = [
    'Você é um editor que estuda o jeito de escrever de uma pessoa para que um assistente escreva EXATAMENTE como ela.',
    'Abaixo estão mensagens escritas pelo Pedro Ica (sócio e Head de Growth da Galeria Holding). As marcadas "whatsapp" são falas dele em conversas de WhatsApp; "rascunho reescrito" é texto do assistente que ele reescreveu (vale o jeito dele, não o do assistente). Ignore qualquer mensagem que pareça automática (relatório, alerta, lista de leads). Descreva o estilo DELE com base só nelas:',
    '- resumo: 2 ou 3 frases sobre o tom e a personalidade da escrita.',
    '- regras: 6 a 12 regras práticas e concretas (tamanho típico, parágrafos, pontuação, uso de nome, formalidade, como faz pedidos, como usa perguntas, emojis, maiúsculas, abreviações). Nada genérico: cada regra tem que ser visível nas amostras.',
    '- aberturas e fechamentos: como ele costuma começar e terminar (frases reais ou o padrão delas).',
    '- expressoes: palavras e expressões que são marca dele.',
    '- evitar: coisas que ele NÃO faz (para o assistente não fazer).',
    '- whatsapp: como ele escreve em mensagens curtas/WhatsApp (se houver amostras desse canal; senão, deduza do e-mail com cuidado e diga que é dedução).',
    '- exemplos: 3 trechos curtos (até 40 palavras cada) copiados das amostras que melhor mostram a voz dele, SEM nomes de terceiros, e-mails, telefones ou valores.',
    'Não invente: se não dá para afirmar, não escreva.'
  ].join('\n');
  const user = (amostras || []).map((a, i) => `[${i + 1}] (${a.canal}${a.assunto ? ' · assunto: ' + a.assunto : ''})\n${a.texto}`).join('\n\n---\n\n');
  return { system, user };
}

// Linhas para os prompts de redação. perfil = o JSON salvo em crm_configuracoes.
export function linhasEstiloAprendido(perfil, canal) {
  const p = perfil && perfil.perfil ? perfil.perfil : perfil;
  if (!p || !p.resumo) return [];
  const l = ['JEITO DE ESCREVER DO PEDRO (aprendido dos e-mails que ele mesmo escreveu; imite):', '- ' + p.resumo];
  for (const r of (p.regras || []).slice(0, 12)) l.push('- ' + r);
  if ((p.aberturas || []).length) l.push('- Como ele abre: ' + p.aberturas.slice(0, 4).join(' | '));
  if ((p.fechamentos || []).length) l.push('- Como ele fecha: ' + p.fechamentos.slice(0, 4).join(' | '));
  if ((p.expressoes || []).length) l.push('- Expressões dele: ' + p.expressoes.slice(0, 10).join(', '));
  if ((p.evitar || []).length) l.push('- Ele NÃO faz: ' + p.evitar.slice(0, 8).join('; '));
  if (canal === 'whatsapp' && p.whatsapp) l.push('- No WhatsApp: ' + p.whatsapp);
  if ((p.exemplos || []).length) l.push('- Trechos reais dele (para pegar a voz, não para copiar): ' + p.exemplos.slice(0, 3).map(x => '"' + x + '"').join(' / '));
  l.push('- Se o jeito dele conflitar com uma regra de formato acima, siga o jeito dele no tom e nas palavras, mas mantenha as regras de fatos, tamanho e o convite.');
  return l;
}

// Conversa exportada do WhatsApp (.txt, "Exportar conversa"). Formatos:
//  Android: "26/11/2026 13:45 - Pedro Ica: texto"   iOS: "[26/11/2026, 13:45:12] Pedro Ica: texto"
// Devolve [{autor, texto}] juntando linhas de continuação.
const RE_WA = /^‎?\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?)\]?\s*(?:-\s*)?([^:]{1,60}):\s?([\s\S]*)$/i;
export function lerConversaWhatsapp(txt) {
  const out = [];
  for (const linha0 of String(txt || '').replace(/\r\n?/g, '\n').split('\n')) {
    const linha = linha0.replace(/[‎‏‪-‮]/g, '');
    const m = linha.match(RE_WA);
    if (m) out.push({ autor: m[3].trim(), texto: m[4] });
    else if (out.length && linha.trim()) out[out.length - 1].texto += '\n' + linha;
  }
  return out.filter(x => !/^(<m[ií]dia oculta>|<arquivo de m[ií]dia oculto>|mensagem apagada|essa mensagem foi apagada|voc[eê] apagou esta mensagem|null|imagem omitida|[aá]udio omitido|v[ií]deo omitido|figurinha omitida|documento omitido)\s*$/i.test(x.texto.trim()));
}
export function autoresDaConversa(txt) {
  const c = {}; for (const m of lerConversaWhatsapp(txt)) c[m.autor] = (c[m.autor] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([autor, mensagens]) => ({ autor, mensagens }));
}
// Falas de um autor, juntando mensagens seguidas (no WhatsApp a pessoa manda em pedaços).
export function falasDoAutor(txt, autor, { max = 120 } = {}) {
  const msgs = lerConversaWhatsapp(txt); const out = []; let atual = null;
  for (const m of msgs) {
    if (m.autor !== autor) { if (atual) { out.push(atual); atual = null; } continue; }
    if (/https?:\/\//.test(m.texto) && palavras(m.texto).length < 6) continue;
    atual = atual ? atual + '\n' + m.texto.trim() : m.texto.trim();
  }
  if (atual) out.push(atual);
  return out.filter(t => palavras(t).length >= 4).slice(-max).map(t => ({ canal: 'whatsapp', texto: t.slice(0, 1200) }));
}
// Texto colado (vários e-mails/mensagens separados por linha com --- ou duas linhas em branco).
export function amostrasColadas(txt, canal = 'email') {
  return String(txt || '').replace(/\r\n?/g, '\n').split(/\n\s*-{3,}\s*\n|\n\s*\n\s*\n/).map(t => textoProprio(t)).filter(t => palavras(t).length >= 4).slice(0, 100).map(t => ({ canal, texto: t.slice(0, 2500) }));
}

// Mensagens do Pedro no WhatsApp (depósito do Mac): junta as que ele mandou em sequência
// (até 3 min entre uma e outra, na mesma conversa) e fica com as que têm conteúdo.
export function falasDoDeposito(mensagens, { max = 40, porConversa = 4 } = {}) {
  const ord = (mensagens || []).filter(m => m.de_mim && m.texto).slice().sort((a, b) => a.jid === b.jid ? String(a.enviada_em).localeCompare(String(b.enviada_em)) : String(a.jid).localeCompare(String(b.jid)));
  const blocos = []; let atual = null;
  for (const m of ord) {
    const t = new Date(m.enviada_em).getTime();
    if (atual && atual.jid === m.jid && t - atual.fim <= 180000) { atual.texto += '\n' + m.texto.trim(); atual.fim = t; }
    else { if (atual) blocos.push(atual); atual = { jid: m.jid, texto: m.texto.trim(), fim: t }; }
  }
  if (atual) blocos.push(atual);
  const bons = blocos.filter(b => palavras(b.texto).length >= 8 && !/https?:\/\//.test(b.texto) && palavras(b.texto).length <= 250).sort((a, b) => b.fim - a.fim);
  const out = []; const cont = {};
  for (const b of bons) {
    if ((cont[b.jid] || 0) >= porConversa) continue;
    cont[b.jid] = (cont[b.jid] || 0) + 1;
    out.push({ canal: 'whatsapp', texto: b.texto.slice(0, 1200) });
    if (out.length >= max) break;
  }
  return out;
}
