import { linhasEstilo } from './estilo.js';
// lib/sdr-redacao.js — redação do SDR (seção 4.4). Parte pura e testável:
// validadores de forma, escolha de case e construção dos prompts. As chamadas ao
// modelo ficam no cron; aqui mora a lógica que o teste cobre sem LLM.

// Lista padrão de expressões proibidas (espelha a chave sdr_expressoes_proibidas).
export const EXPRESSOES_PROIBIDAS_PADRAO = [
  'espero que esteja bem', 'espero que esta mensagem', 'venho por meio desta',
  'gostaria de apresentar', 'sinergia', 'alavancar', 'solução completa',
  'no cenário atual', 'não é apenas', 'mais do que nunca', 'parceria estratégica',
  'agregar valor', 'potencializar', 'jornada', 'transformar o jogo', 'game changer',
  'em um mundo cada vez mais', 'fico à disposição', 'qualquer dúvida', 'sem compromisso',
  'ideia de bolso'
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

// Escolhe o case mais aderente: só entram cases com aderência real de setor
// (alguma tag do case aparece no setor/segmento da empresa, ou palavra do setor
// aparece numa tag). Entre esses, mesma agência e destaque desempatam.
// Só ser da mesma agência não basta: Netflix para um SaaS fiscal soa desconexo.
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function escolherCase(knowledge, { setor, sinalTipo, agenciaSlug }) {
  const cases = (knowledge && knowledge.cases_destaque) || [];
  const termos = norm(`${setor || ''} ${String(sinalTipo || '').replace(/_/g, ' ')}`);
  const palavras = termos.split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  let melhor = null, melhorScore = -1;
  for (const c of cases) {
    const tags = (c.tags || []).map(norm);
    let ader = 0;
    for (const tag of tags) {
      if (termos.includes(tag)) ader += 2;
      else if (palavras.some(w => tag.split(/[^a-z0-9]+/).includes(w))) ader += 1;
    }
    if (ader === 0) continue;
    let score = ader * 2;
    if (agenciaSlug && c.agencia_slug === agenciaSlug) score += 3;
    else if (agenciaSlug && (c.agencias_secundarias_slugs || []).includes(agenciaSlug)) score += 2;
    if (c.destaque) score += 1;
    if (score > melhorScore) { melhorScore = score; melhor = c; }
  }
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
    `- Canal ${canal}: corpo entre ${faixa.corpoMin} e ${faixa.corpoMax} palavras; mire em ${Math.round(faixa.corpoMin + (faixa.corpoMax - faixa.corpoMin) * 0.35)} a ${Math.round(faixa.corpoMin + (faixa.corpoMax - faixa.corpoMin) * 0.7)} (passar do máximo reprova)${canal === 'email' ? `; assunto de ${faixa.assuntoMin} a ${faixa.assuntoMax} palavras (conte: mais de ${faixa.assuntoMax} reprova), específico do fato` : ''}.`,
    '- Trate a pessoa pelo primeiro nome como está no cadastro. Nunca use apelido ou diminutivo.',
    '- Nada de humor ou ironia com temas sensíveis: corpo, peso, dieta, saúde, doença, dinheiro pessoal, política, religião. Na dúvida, tom sério.',
    '- O gancho tem que importar para o cargo da pessoa (marketing, marca, comunicação). Se o fato é de outra área (RH, jurídico), escolha outro fato do dossiê.',
    '- O case só entra se tiver relação clara com o setor ou o problema da empresa; se não tiver, não cite case nem número.',
    ctx.semFato
      ? '- NÃO há notícia sobre esta empresa: a mensagem retoma um contexto real do CRM (conversa, oportunidade ou pedido de retomar depois). A PRIMEIRA frase ancora nesse contexto, com naturalidade e sem inventar detalhe. Nunca diga "vi que", "li que", "notícia", "anunciou", "lançou", nem afirme fato sobre a empresa.'
      : '- A PRIMEIRA frase é sobre eles, a partir de um fato do dossiê, como quem acompanha o mercado, sem bajular.',
    '- Uma ideia concreta e pequena ligada ao fato, dita com naturalidade, não um pitch. Não anuncie a ideia com rótulo ("ideia de bolso", "uma ideia rápida").',
    '- No máximo uma prova: um case com o número exatamente como está no material. Sem prova verificável, não cite número.',
    '- Um pedido de baixo atrito no fim, em forma de UMA pergunta: o convite para um café (presencial ou por vídeo) para conhecer o desafio da pessoa e ver como a Galeria Holding pode ajudar.',
    '- Português impecável, em prosa. NENHUM travessão ou hífen como pontuação. Nada com cara de texto de IA.',
    `- Nunca use: ${(ctx.expressoesProibidas || EXPRESSOES_PROIBIDAS_PADRAO).join('; ')}.`,
    `- Assinatura: "Pedro Ica"${agencia && agencia.nome && agencia.slug !== 'holding' ? `, citando a agência ${agencia.nome} quando fizer sentido` : ''}.`,
    ...linhasEstilo(),
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
    ctx.memoria || '',
    etapa && /etapa?2|D3|D7|D14/i.test(String(etapa)) ? 'Follow-up: traga um ângulo NOVO ou fato novo; nunca "só passando para lembrar".' : ''
  ];
  if (ctx.tese) user.push(...linhasTese(ctx.tese, canal, ctx.feedback));

  return { system, user: user.filter(Boolean).join('\n') };
}

// Fase 3: a redação segue a tese do estrategista. Formato curto, sem cara de
// spam: contexto da empresa e do profissional, a leitura estratégica, o que o
// grupo traz e o pedido de uma conversa curta.
function linhasTese(t, canal, feedback) {
  return [
    '',
    'TESE DO ESTRATEGISTA (siga esta tese, não invente outra):',
    `- Cenário: ${t.cenario || ''}`,
    `- O que isso significa para esta pessoa: ${t.dor_do_cargo || ''}`,
    `- Oportunidade (${t.alavanca || ''}): ${t.oportunidade || ''}`,
    `- O que o grupo oferece: ${t.oferta || ''}${(t.agencias || []).length ? ' (agências: ' + t.agencias.join(', ') + ')' : ''}`,
    t.prova ? `- Prova permitida: ${t.prova}` : '- Sem prova verificável: não cite case nem número.',
    canal === 'whatsapp'
      ? 'Formato WhatsApp (primeiro contato, a pessoa não te conhece): 3 a 4 linhas curtas, tom pessoal. Linha 1: nome dela + quem é você em poucas palavras ("aqui é o Pedro Ica, da Galeria Holding") + o fato. Linha 2: a leitura estratégica para a área dela. Linha 3: o que o grupo traz (a agência aparece como parte do grupo, ex.: "com a A.gente, do nosso grupo"). Fecho: a pergunta pedindo uma conversa de 20 minutos. Sem assunto.'
      : 'Formato e-mail: 3 a 5 linhas. 1) contexto da empresa e do profissional a partir do fato; 2) a leitura estratégica (a oportunidade); 3) o que o grupo traz, com a prova se houver (a agência aparece como parte do grupo Galeria Holding); 4) a pergunta pedindo uma conversa de 20 minutos. Sem anexo, sem link, sem saudação genérica.',
    t.sem_fato
      ? 'Contexto real com o grupo (use só isto, sem inventar detalhe):\n' + ((t.contexto || []).map(c => '  - [' + c.tipo + '] ' + c.texto).join('\n') || '  - (nenhum)') + '\nAbra retomando esse contexto (ex.: "retomo a conversa de março sobre…"), diga o que há de novo a oferecer e peça a conversa.'
      : 'O fato vem de notícia: diga "li que" ou "vi que a X anunciou", nunca algo que sugira que você esteve lá ou viu pessoalmente.',
    feedback ? `A versão anterior foi reprovada pelo revisor por: ${feedback}. Corrija exatamente isso.` : ''
  ];
}

// Prompt do avaliador (segundo passe, outro olhar). Devolve { system, user }.
export function construirPromptAvaliacao(ctx) {
  const { mensagem, dossie, empresa, cargo, nome } = ctx;
  const system = [
    'Você é um revisor crítico de prospecção B2B. Avalie a mensagem e devolva SOMENTE um JSON:',
    '{"aderencia":0-10,"especificidade":0-10,"naturalidade":0-10,"clareza":0-10,"risco":0-10,"motivo":"uma frase"}.',
    ctx.semFato
      ? '- aderencia: trilha de contexto (sem notícia). A mensagem deve se apoiar no contexto do CRM listado; afirmar fato sobre a empresa ou detalhe da conversa que não está no contexto = nota 0 e risco 10.'
      : '- aderencia: a mensagem se apoia num fato real do dossiê?',
    ctx.semFato
      ? '- especificidade: só faz sentido para esta pessoa, por causa do histórico citado? Se serviria para qualquer contato frio, nota baixa.'
      : '- especificidade: serviria para outra empresa? (quanto mais genérica, menor a nota).',
    '- naturalidade: soa humano, sem cara de IA nem de automação, sem exagero, tom executivo (de sócio para executivo), português sem nenhum erro?',
    '- clareza: o assunto é curto, específico e honesto (nada de isca)? a proposta é coerente com o contexto? o pedido no fim é claro e de baixo atrito?',
    '- risco: tom, exagero, intimidade indevida (0 = sem risco, 10 = perigoso).'
  ].join('\n');
  const fatos = (dossie && dossie.sinais || []).slice(0, 4).map(s => `- ${s.fato} (${s.url})`).join('\n') ||
    (ctx.semFato ? ((ctx.contexto || []).map(c => `- [contexto do CRM: ${c.tipo}] ${c.texto}`).join('\n') || '- (sem contexto)') : '- (sem sinal)');
  const user = [
    `Empresa: ${empresa && empresa.nome || ''}  |  Decisor: ${nome || ''}, ${cargo || ''}`,
    `Canal: ${mensagem && mensagem.canal || 'email'}${mensagem && mensagem.canal === 'whatsapp' ? ' (WhatsApp não tem assunto; não penalize a falta de assunto)' : ''}. É um primeiro contato pedindo uma conversa curta (15 a 20 minutos ou um café é um pedido normal).`,
    'Fatos disponíveis no dossiê:', fatos,
    'Mensagem a avaliar:',
    `Assunto: ${mensagem && mensagem.assunto || '(sem)'}`,
    `Corpo:\n${mensagem && mensagem.corpo || ''}`
  ].join('\n');
  return { system, user };
}

// Banco de cases vivo (Bloco G/cobertura): junta o JSON com crm_cases liberados
// para prospecção. Descarta projeção/proposta e caso sem confirmação; caso "sem
// métricas" entra sem número (o QC barra número que não estiver no resultado).
const RE_NAO_USAR = /(proposta, n[ãa]o resultado|proje[çc][ãa]o|confirmar escopo|sem dados p[úu]blicos)/i;
const RE_SEM_METRICA = /sem m[ée]tricas divulgadas/i;
export function mesclarCases(knowledge, rows, slugPorId) {
  const base = (knowledge && knowledge.cases_destaque) || [];
  const vistos = new Set(base.map(c => String(c.titulo || '').toLowerCase()));
  const extra = [];
  for (const r of (rows || [])) {
    const t = String(r.titulo || '');
    if (!t || vistos.has(t.toLowerCase()) || RE_NAO_USAR.test(r.resultado || '')) continue;
    vistos.add(t.toLowerCase());
    extra.push({
      titulo: t, marca: r.marca || '', agencia_slug: (r.crm_agencias && r.crm_agencias.slug) || slugPorId[r.agencia_id] || null,
      agencias_secundarias_slugs: (r.agencias_secundarias || []).map(id => slugPorId[id]).filter(Boolean),
      tags: [...(r.tags || []), r.categoria_da_marca].filter(Boolean).map(x => String(x).toLowerCase()),
      resultado: RE_SEM_METRICA.test(r.resultado || '') ? '' : String(r.resultado || ''),
      destaque: !!r.destaque, origem: 'crm_cases'
    });
  }
  return Object.assign({}, knowledge, { cases_destaque: base.concat(extra) });
}
