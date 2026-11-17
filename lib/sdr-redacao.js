// lib/sdr-redacao.js — redação do SDR (seção 4.4). Parte pura e testável:
// validadores de forma, escolha de case e construção dos prompts. As chamadas ao
// modelo ficam no cron; aqui mora a lógica que o teste cobre sem LLM.

// Lista padrão de expressões proibidas (espelha a chave sdr_expressoes_proibidas).
export const EXPRESSOES_PROIBIDAS_PADRAO = [
  'espero que esteja bem', 'espero que esta mensagem', 'venho por meio desta',
  'gostaria de apresentar', 'sinergia', 'alavancar', 'solução completa',
  'no cenário atual', 'não é apenas', 'mais do que nunca', 'parceria estratégica',
  'agregar valor', 'potencializar', 'jornada', 'transformar o jogo', 'game changer',
  'em um mundo cada vez mais', 'fico à disposição', 'qualquer dúvida', 'sem compromisso'
];

const FAIXA = {
  email:             { corpoMin: 60, corpoMax: 110, assuntoMin: 3, assuntoMax: 6 },
  whatsapp:          { corpoMin: 25, corpoMax: 55 },
  linkedin_convite:  { corpoMin: 10, corpoMax: 45 },
  linkedin_mensagem: { corpoMin: 10, corpoMax: 55 },
};

export function contarPalavras(t) {
  return String(t || '').trim().split(/\s+/).filter(Boolean).length;
}

// Travessão/hífen usado como pontuação: — (em dash), – (en dash) ou " - " (hífen
// cercado de espaços). Hífen de palavra composta (bem-vindo) não conta.
export function temTravessaoPontuacao(t) {
  return /[—–]/.test(String(t || '')) || /\s-\s/.test(String(t || ''));
}

export function expressoesEncontradas(t, lista) {
  const low = String(t || '').toLowerCase();
  const L = Array.isArray(lista) && lista.length ? lista : EXPRESSOES_PROIBIDAS_PADRAO;
  return L.filter(e => e && low.includes(String(e).toLowerCase()));
}

// Valida a FORMA de uma mensagem: { assunto, corpo } no canal dado.
export function validarForma(msg, canal, expressoesProibidas) {
  const problemas = [];
  const faixa = FAIXA[canal] || FAIXA.email;
  const corpo = (msg && msg.corpo) || '';
  const assunto = (msg && msg.assunto) || '';
  const nP = contarPalavras(corpo);
  if (nP < faixa.corpoMin || nP > faixa.corpoMax) problemas.push(`corpo com ${nP} palavras (faixa ${faixa.corpoMin}-${faixa.corpoMax})`);
  if (canal === 'email') {
    const nA = contarPalavras(assunto);
    if (!assunto) problemas.push('e-mail sem assunto');
    else if (nA < faixa.assuntoMin || nA > faixa.assuntoMax) problemas.push(`assunto com ${nA} palavras (faixa ${faixa.assuntoMin}-${faixa.assuntoMax})`);
  }
  if (temTravessaoPontuacao(corpo) || temTravessaoPontuacao(assunto)) problemas.push('usa travessão/hífen como pontuação');
  const proib = expressoesEncontradas(corpo + ' ' + assunto, expressoesProibidas);
  if (proib.length) problemas.push('expressão proibida: ' + proib.join(', '));
  // Exatamente uma pergunta (pedido de baixo atrito no fim).
  if ((corpo.match(/\?/g) || []).length !== 1) problemas.push('precisa de exatamente 1 pergunta');
  return { ok: problemas.length === 0, problemas };
}

// Escolhe o case mais aderente do JSON de conhecimento: mesma agência primeiro,
// depois maior sobreposição de tags com setor/sinal. Nunca case de concorrente.
export function escolherCase(knowledge, { setor, sinalTipo, agenciaSlug }) {
  const cases = (knowledge && knowledge.cases_destaque) || [];
  const termos = `${setor || ''} ${sinalTipo || ''}`.toLowerCase();
  let melhor = null, melhorScore = -1;
  for (const c of cases) {
    let score = 0;
    if (agenciaSlug && c.agencia_slug === agenciaSlug) score += 5;
    for (const tag of (c.tags || [])) if (termos.includes(String(tag).toLowerCase())) score += 2;
    if (c.destaque) score += 1;
    if (score > melhorScore) { melhorScore = score; melhor = c; }
  }
  // Sem nenhuma aderência (score 0 e sem agência), devolve o case destaque da agência, ou null.
  if (!melhor) return null;
  return { titulo: melhor.titulo, marca: melhor.marca, resultado: melhor.resultado, agencia_slug: melhor.agencia_slug, tags: melhor.tags || [] };
}

// Extrai os "números/estatísticas" de um texto (para o QC conferir contra o case).
export function numerosRelevantes(t) {
  const s = String(t || '');
  const out = new Set();
  for (const m of s.matchAll(/\d{1,3}(?:[.,]\d{1,3})*\s*(?:%|mil|milh[õo]es|x\b|pontos|bilh[õo]es)?/gi)) {
    const v = m[0].replace(/\s+/g, ' ').trim();
    if (/\d/.test(v) && v.length > 1) out.add(v.toLowerCase());
  }
  return [...out];
}

// Monta o prompt de redação (uma versão, um ângulo). Devolve { system, user }.
export function construirPromptRedacao(ctx) {
  const { dossie, nome, cargo, empresa, agencia, caso, etapa, canal, angulo, historicoToques, aprendizados, sinal } = ctx;
  const faixa = FAIXA[canal] || FAIXA.email;
  const system = [
    'Você escreve mensagens de prospecção B2B como o Pedro Ica, sócio da Galeria Holding (o maior grupo de comunicação independente do Brasil), escreveria à mão para uma pessoa específica.',
    'Regras absolutas:',
    `- Canal ${canal}: corpo de ${faixa.corpoMin} a ${faixa.corpoMax} palavras${canal === 'email' ? `, assunto de ${faixa.assuntoMin} a ${faixa.assuntoMax} palavras, específico do fato` : ''}.`,
    '- A PRIMEIRA frase é sobre eles, a partir de um fato do dossiê, como quem acompanha o mercado, sem bajular.',
    '- Uma ideia concreta e pequena ligada ao fato (uma "ideia de bolso"), não um pitch.',
    '- No máximo uma prova: um case com o número exatamente como está no material. Sem prova verificável, não cite número.',
    '- Um pedido de baixo atrito no fim, em forma de UMA pergunta (ex.: 15 minutos, ou "faz sentido eu te mandar a ideia desenvolvida?").',
    '- Português impecável, em prosa. NENHUM travessão ou hífen como pontuação. Nada com cara de texto de IA.',
    `- Nunca use: ${(ctx.expressoesProibidas || EXPRESSOES_PROIBIDAS_PADRAO).join('; ')}.`,
    `- Assinatura: "Pedro Ica"${agencia && agencia.nome && agencia.slug !== 'holding' ? `, citando a agência ${agencia.nome} quando fizer sentido` : ''}.`,
    'Responda SOMENTE um JSON compacto numa linha: {"assunto":"...","corpo":"..."} (assunto vazio fora de e-mail). Use \\n para quebras.'
  ].join('\n');

  const fatos = (dossie && dossie.sinais || []).slice(0, 4)
    .map(s => `- [${s.tipo}] ${s.fato} (${s.fonte}, ${s.data || 's/data'}) — trecho: "${s.trecho}"`).join('\n') || '- (sem sinal público; vá direto à apresentação curta, sem inventar fato)';

  const user = [
    `Empresa-alvo: ${empresa && empresa.nome || ''}  |  Setor: ${empresa && empresa.setor || 'não informado'}`,
    `Decisor: ${nome || ''}, ${cargo || 'cargo desconhecido'}`,
    `Agência que assina: ${agencia && agencia.nome || 'Galeria Holding'} — ${agencia && agencia.motivo || ''}`,
    `Etapa da cadência: ${etapa || 'D0'}  |  Ângulo desta versão: ${angulo || 'fato'}`,
    sinal ? `Fato-gancho desta mensagem: [${sinal.tipo}] ${sinal.fato} (fonte ${sinal.fonte}, ${sinal.url})` : '',
    'Fatos do dossiê (use como base, cite só o que está aqui):',
    fatos,
    caso ? `Case permitido como prova (número exatamente assim): ${caso.titulo} (${caso.marca}) — ${caso.resultado}` : 'Sem case aderente: não cite número.',
    historicoToques && historicoToques.length ? `Histórico com esta pessoa: ${historicoToques.map(h => h.canal + '/' + (h.resultado || h.assunto || '')).join('; ')}` : 'Sem histórico anterior com esta pessoa.',
    aprendizados ? `Lições da semana (o que mais converte): ${aprendizados}` : '',
    etapa && /etapa?2|D3|D7|D14/i.test(String(etapa)) ? 'Follow-up: traga um ângulo NOVO ou fato novo; nunca "só passando para lembrar".' : ''
  ].filter(Boolean).join('\n');

  return { system, user };
}

// Prompt do avaliador (segundo passe, outro olhar). Devolve { system, user }.
export function construirPromptAvaliacao(ctx) {
  const { mensagem, dossie, empresa, cargo, nome } = ctx;
  const system = [
    'Você é um revisor crítico de prospecção B2B. Avalie a mensagem e devolva SOMENTE um JSON:',
    '{"aderencia":0-10,"especificidade":0-10,"naturalidade":0-10,"clareza":0-10,"risco":0-10,"motivo":"uma frase"}.',
    '- aderencia: a mensagem se apoia num fato real do dossiê?',
    '- especificidade: serviria para outra empresa? (quanto mais genérica, menor a nota).',
    '- naturalidade: soa humano, sem cara de IA, português impecável?',
    '- clareza: o pedido no fim é claro e de baixo atrito?',
    '- risco: tom, exagero, intimidade indevida (0 = sem risco, 10 = perigoso).'
  ].join('\n');
  const fatos = (dossie && dossie.sinais || []).slice(0, 4).map(s => `- ${s.fato} (${s.url})`).join('\n') || '- (sem sinal)';
  const user = [
    `Empresa: ${empresa && empresa.nome || ''}  |  Decisor: ${nome || ''}, ${cargo || ''}`,
    'Fatos disponíveis no dossiê:', fatos,
    'Mensagem a avaliar:',
    `Assunto: ${mensagem && mensagem.assunto || '(sem)'}`,
    `Corpo:\n${mensagem && mensagem.corpo || ''}`
  ].join('\n');
  return { system, user };
}
