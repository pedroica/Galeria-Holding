// lib/sdr-estrategista.js — camada estrategista do SDR (Fase 3). Parte pura e
// testável: resumo do ecossistema, prompt e validação da tese. A chamada ao
// modelo fica no cron.
//
// O estrategista olha o cenário do negócio, do setor, da empresa e do
// profissional e decide o que o ecossistema Galeria Holding oferece. A oferta
// padrão é a "blitz de planejamento estratégico": planejar comunicação não é só
// comprar mídia, é achar oportunidades, melhorar a fala do time comercial e o
// material de venda, achar margem em produtos complementares e aproveitar
// melhor o CRM. Só lead com encaixe alto segue para a redação: é isso que
// sustenta uma taxa de reunião alta por contato.

export const ALAVANCAS = [
  'novas_oportunidades',      // mercados, públicos ou ocasiões de compra que a empresa não explora
  'fala_comercial',           // discurso e argumentos do time de vendas
  'material_de_venda',        // apresentações, catálogos, provas para o comprador
  'produtos_complementares',  // margem em produto/serviço adjacente, mix, cross-sell
  'crm',                      // aproveitamento da base e do relacionamento com clientes
  'midia',                    // mídia e campanha (só quando o fato pede)
  'marca'                     // posicionamento, lançamento, reputação
];

export const OFERTA_BLITZ_PADRAO =
  'Blitz de planejamento estratégico: 30 minutos para olhar o negócio de fora e sair com 2 ou 3 oportunidades concretas. ' +
  'Planejar comunicação não é só comprar mídia: é achar novas oportunidades, melhorar a fala do time comercial e o material de venda, ' +
  'achar margem em produtos complementares e aproveitar melhor o CRM.';

export const SCHEMA_ESTRATEGIA = {
  type: 'object',
  properties: {
    cenario: { type: 'string' },
    fato_url: { type: 'string' },
    dor_do_cargo: { type: 'string' },
    alavanca: { type: 'string', enum: ALAVANCAS },
    oportunidade: { type: 'string' },
    agencias: { type: 'array', items: { type: 'string' } },
    oferta: { type: 'string' },
    prova: { type: 'string' },
    nota_encaixe: { type: 'integer' },
    seguir: { type: 'boolean' },
    motivo: { type: 'string' }
  },
  required: ['cenario', 'fato_url', 'dor_do_cargo', 'alavanca', 'oportunidade', 'agencias', 'oferta', 'prova', 'nota_encaixe', 'seguir', 'motivo'],
  additionalProperties: false
};

const corta = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Resumo compacto do ecossistema para o system prompt (estável entre leads, então
// fica em cache). clientesPorAgencia: { slug: [{nome, setor}] } dos clientes ativos.
export function resumoEcossistema(knowledge, clientesPorAgencia) {
  const k = knowledge || {};
  const linhas = [];
  if (k.holding) linhas.push(`Grupo: ${k.holding.nome || 'Galeria Holding'}, ${corta(k.holding.descricao, 160)}.`);
  linhas.push('Agências do grupo (slug: especialidade):');
  for (const a of (k.agencias || [])) {
    if (!a || !a.slug) continue;
    const cli = ((clientesPorAgencia || {})[a.slug] || []).slice(0, 12).map(c => c.nome + (c.setor ? ` (${corta(c.setor, 30)})` : '')).join(', ');
    linhas.push(`- ${a.slug}: ${corta(a.especialidade || a.descricao, 220)}${cli ? `. Clientes ativos: ${cli}` : ''}`);
  }
  if ((k.produtos_proprietarios || []).length) {
    linhas.push('Produtos proprietários:');
    for (const p of k.produtos_proprietarios) linhas.push(`- ${p.nome} (${p.agencia}): ${corta(p.descricao, 160)}`);
  }
  linhas.push('Cases que podem ser citados (título | marca | agência | resultado exato | tags):');
  for (const c of (k.cases_destaque || [])) {
    linhas.push(`- ${corta(c.titulo, 80)} | ${c.marca || ''} | ${c.agencia_slug || ''} | ${corta(c.resultado, 160) || 'sem número'} | ${(c.tags || []).slice(0, 6).join(', ')}`);
  }
  if ((k.regras_prospeccao || []).length) linhas.push('Regras: ' + k.regras_prospeccao.map(r => corta(r, 120)).join(' · '));
  return linhas.join('\n');
}

// Prompt do estrategista. Devolve { system, user }. O system leva o ecossistema
// (igual para todos os leads de um lote) e pode ser cacheado.
export function construirPromptEstrategia(ctx) {
  const { ecossistema, oferta, empresa, decisor, sinais, historico, agenciaSugerida, notaMin } = ctx;
  const system = [
    'Você é o estrategista de novos negócios da Galeria Holding, o maior grupo de comunicação independente do Brasil.',
    'Seu trabalho: antes de qualquer mensagem, decidir SE vale abordar esta pessoa agora e COM QUAL tese, olhando o cenário do negócio, do setor, da empresa e do profissional.',
    'Como pensar:',
    '- Comece pelo fato público do dossiê: o que ele revela sobre o momento do negócio (crescimento, pressão de margem, lançamento, expansão, troca de liderança, concorrência).',
    '- Traduza para a dor do CARGO desta pessoa: o que isso muda na rotina e nas metas dela.',
    '- Escolha UMA alavanca onde o grupo ajuda de verdade. Planejar comunicação não é só comprar mídia: novas oportunidades, fala do time comercial, material de venda, margem em produtos complementares, aproveitamento do CRM, marca, mídia.',
    '- Escolha a(s) agência(s) do grupo que entregam isso (pelos slugs abaixo) e a oferta. Oferta padrão: ' + (oferta || OFERTA_BLITZ_PADRAO),
    '- Prova: um case da lista com aderência real ao setor ou ao problema, ou um cliente ativo do mesmo setor. Se não houver, deixe "prova" vazio. NUNCA invente case, cliente ou número.',
    '- nota_encaixe (0 a 10), por esta régua:',
    '  0-3: não abordar (fato fraco ou negativo, timing ruim, conflito com cliente concorrente, nada crível a oferecer).',
    '  4-5: há fato, mas a ligação com a área da pessoa ou com o que o grupo faz é forçada.',
    '  6-7: fato relevante e cargo certo, mas a oportunidade ainda é genérica (serviria para outra empresa do setor).',
    '  8: fato relevante + cargo certo + uma oportunidade ESPECÍFICA desta empresa que o grupo entrega com credibilidade.',
    '  9-10: tudo do 8 + prova aderente (case do setor ou cliente ativo parecido) ou relação já existente com o grupo.',
    `  Só segue para mensagem quem tiver ${notaMin || 8} ou mais. Não infle a nota: é melhor não abordar do que parecer spam.`,
    '- seguir=false quando o fato é fraco, negativo para a pessoa (demissão, crise, processo), de outra área que não a dela, ou quando não há o que oferecer com credibilidade.',
    '- cenario e oportunidade: 1 ou 2 frases cada, concretas, sem jargão. fato_url: a URL do fato do dossiê que sustenta a tese.',
    '',
    'ECOSSISTEMA GALERIA HOLDING',
    ecossistema || '(sem resumo)'
  ].join('\n');

  const fatos = (sinais || []).slice(0, 5)
    .map(s => `- [${s.tipo}] ${s.fato} (${s.fonte || ''}, ${s.data || 's/data'}) url: ${s.url} trecho: "${corta(s.trecho, 220)}"`).join('\n') || '- (sem fato público)';
  const emp = empresa || {};
  const dec = decisor || {};
  let user = [
    `Empresa: ${emp.nome || ''}  |  Setor: ${emp.setor || emp.setor_sugerido || 'não informado'}${emp.segmento_detalhe ? ' / ' + emp.segmento_detalhe : ''}`,
    `Profissional: ${dec.nome || ''}, ${dec.cargo || 'cargo desconhecido'}`,
    agenciaSugerida ? `Agência sugerida pela seleção: ${agenciaSugerida.slug} (${agenciaSugerida.motivo || ''}). Pode trocar se outra servir melhor.` : '',
    historico ? `Relação com o grupo: ${historico}` : 'Relação com o grupo: nenhuma registrada.',
    'Fatos do dossiê (só estes são verificáveis):',
    fatos
  ].filter(Boolean).join('\n');
  if (ctx.solucaoSugerida && ctx.solucaoSugerida.nome) {
    user += '\nSolução que o score de oportunidade aponta como mais aderente: ' + ctx.solucaoSugerida.nome +
      (ctx.solucaoSugerida.motivo ? ' (' + ctx.solucaoSugerida.motivo + ')' : '') + '. Use se fizer sentido; troque se outra servir melhor.';
  }
  if (ctx.memoria) user += '\n\n' + ctx.memoria;
  if (ctx.semFato) {
    const linhas = (ctx.contexto || []).map(c => '- [' + c.tipo + '] ' + c.texto).join('\n') || '- (nenhum)';
    const retomada = (ctx.contexto || []).some(c => ['conversa', 'oportunidade', 'momento'].includes(c.tipo));
    const apresentacao = !retomada && (ctx.contexto || []).some(c => ['prioridade', 'novo_cargo', 'relacao'].includes(c.tipo));
    if (apresentacao) {
      // 26/11 (pedido do Pedro): quem ele escolheu (lista, empresa prioritária, cargo novo,
      // indicação) recebe uma PRIMEIRA APRESENTAÇÃO no estilo dele. O motivo para agora é
      // essa escolha; a mensagem vira rascunho e o Pedro revisa antes de enviar.
      user += '\n\n' + [
        'TRILHA DE APRESENTAÇÃO: não há notícia com fonte nem conversa anterior, mas o PEDRO ESCOLHEU esta pessoa/empresa:',
        linhas,
        '- Isto NÃO é retomada: é uma primeira apresentação no estilo do Pedro (começa pela pessoa e pelo cargo dela, liga ao desafio típico do cargo neste setor, convida para um café). A escolha do Pedro já é o motivo para abordar agora: não recuse por falta de notícia ou de histórico.',
        '- A tese parte do cargo da pessoa e do setor da empresa: qual desafio de comunicação/negócio alguém nesse cargo costuma ter agora e qual alavanca do grupo ajuda. Não invente fato sobre a empresa nem sobre a pessoa. fato_url fica vazio ("").',
        '- Régua desta trilha: 7 = cargo ligado a marketing, comunicação, marca, negócio ou direção geral + alavanca plausível para o setor; 8+ = isso + prova aderente (case do setor ou cliente ativo parecido) ou indicação/relação real.',
        '- seguir=false SÓ se: o cargo é claramente de outra área (financeiro, jurídico, TI, operações sem relação com marca), há sinal de contato errado (cargo incoerente com a empresa), há fato negativo grave (crise, demissão, processo), ou há conflito direto com cliente ativo concorrente.'
      ].join('\n');
    } else user += '\n\n' + [
      'TRILHA DE CONTEXTO: não há notícia com fonte, mas há histórico real desta pessoa/empresa com o grupo (do CRM):',
      linhas,
      '- A tese parte DESSE contexto: por que retomar agora, com esta pessoa, e o que mudou ou o que o grupo pode trazer de novo.',
      '- Não invente detalhe da conversa ou da oportunidade além do que está escrito acima, nem fato sobre a empresa. fato_url fica vazio ("").',
      '- Régua da trilha: 0-5 = o contexto é fraco ou antigo demais para justificar o contato; 6 = contexto real mas o motivo para retomar agora é genérico; 7 = contexto real + motivo concreto para retomar agora; 8+ = isso + prova aderente ou oportunidade específica.',
      '- seguir=false se retomar pareceria insistência, se a conversa terminou mal, ou se não há nada novo a oferecer.'
    ].join('\n');
  }
  return { system, user };
}

// Confere a tese do modelo contra o que é verificável. Devolve
// { seguir, motivo, tese } com a tese normalizada (prova inventada é apagada).
export function validarTese(tese, { sinais, knowledge, clientes, notaMin, semFato }) {
  const min = Number(notaMin) || 8;
  if (!tese || typeof tese !== 'object') return { seguir: false, motivo: 'estrategista sem resposta', tese: null };
  const t = Object.assign({}, tese);
  const urls = new Set((sinais || []).map(s => s && s.url).filter(Boolean));
  if (semFato) {
    // Trilha sem fato: não há URL para apontar; a tese fica marcada para a
    // redação e o QC tratarem como "não afirmar fato".
    t.fato_url = '';
    t.sem_fato = true;
  } else if (!t.fato_url || !urls.has(t.fato_url)) {
    // Sem fato do dossiê por trás, a tese não tem lastro.
    const primeira = (sinais || []).find(s => s && s.url);
    if (!primeira) return { seguir: false, motivo: 'tese sem fato do dossiê', tese: t };
    t.fato_url = primeira.url;
  }
  // Prova: precisa ser um case da base ou um cliente ativo. Senão, some.
  if (t.prova) {
    const p = norm(t.prova);
    const cases = (knowledge && knowledge.cases_destaque) || [];
    const okCase = cases.some(c => (c.titulo && p.includes(norm(c.titulo))) || (c.marca && norm(c.marca).length >= 3 && p.includes(norm(c.marca))));
    const okCli = (clientes || []).some(c => c && c.nome && norm(c.nome).length >= 3 && p.includes(norm(c.nome)));
    if (!okCase && !okCli) { t.prova_descartada = t.prova; t.prova = ''; }
  }
  const nota = Number(t.nota_encaixe) || 0;
  if (!t.seguir) return { seguir: false, motivo: 'estrategista: não abordar (' + corta(t.motivo, 200) + ')', tese: t };
  if (nota < min) return { seguir: false, motivo: `encaixe ${nota} < ${min}: ${corta(t.motivo, 200)}`, tese: t };
  if (!ALAVANCAS.includes(t.alavanca)) t.alavanca = 'novas_oportunidades';
  return { seguir: true, motivo: `tese ok (encaixe ${nota}, ${t.alavanca}${semFato ? ', sem fato público' : ''})`, tese: t };
}

function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
