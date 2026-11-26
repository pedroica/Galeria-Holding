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
export function escolherAmostras(mensagens, textosAgente, { max = 40 } = {}) {
  const agente = (textosAgente || []).filter(Boolean);
  const out = []; const vistos = [];
  for (const m of (mensagens || [])) {
    if (/^\s*(fwd?|enc|encaminhad)/i.test(m.assunto || '')) continue;
    if (String(m.para || '').split(',').length > 6) continue;          // disparo em massa
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
    'Abaixo estão mensagens escritas pelo Pedro Ica (sócio e Head de Growth da Galeria Holding). Descreva o estilo DELE com base só nelas:',
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
