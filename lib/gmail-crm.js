// lib/gmail-crm.js — o CRM se completa sozinho a partir do Gmail. Parte pura e
// testável: casar cada e-mail com contato/empresa do CRM, decidir o que muda no
// pipeline e montar o prompt de leitura da conversa. A rede fica no cron.
//
// Regras de segurança:
//  - Só é processado e-mail com contato ou domínio de empresa do CRM; o resto é
//    ignorado e não fica guardado (a caixa do Pedro tem correspondência pessoal).
//  - Pipeline só AVANÇA sozinho com sinal claro e confiança alta. Perdido,
//    Cliente ativo e Pausado nunca são automáticos: viram sugestão para o Pedro.
//  - Nada é enviado: só leitura do Gmail.

// Domínios de e-mail pessoal ou de serviço: não identificam empresa.
export const DOMINIOS_GENERICOS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br',
  'icloud.com', 'me.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com', 'globomail.com',
  'proton.me', 'protonmail.com', 'aol.com', 'zoho.com', 'gmx.com', 'r7.com',
  'google.com', 'calendar-notification.google.com', 'resource.calendar.google.com', 'zoom.us', 'teams.microsoft.com',
  'linkedin.com', 'docusign.net', 'notion.so', 'slack.com', 'hubspot.com', 'mailchimp.com', 'sendgrid.net'
]);
const RE_AUTOMATICO = /^(no-?reply|noreply|nao-?responda|naoresponda|mailer-daemon|postmaster|notifica|notification|alerts?|news(letter)?|marketing|bounce|calendar|calendario)/i;

export function parseEnderecos(header) {
  const out = [];
  for (const parte of String(header || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const m = parte.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) || parte.match(/^\s*()([^\s<>]+@[^\s<>]+)\s*$/);
    if (!m) continue;
    const email = String(m[2] || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    out.push({ nome: String(m[1] || '').trim(), email });
  }
  return out;
}
// "daniel.galhardo" → "Daniel Galhardo" (quando o e-mail chega sem nome de exibição).
export const nomeDoEmail = (local) => String(local || '').split(/[._-]+/).filter(p => p && !/^\d+$/.test(p))
  .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ') || String(local || '');
export const dominioDe = (email) => String(email || '').toLowerCase().split('@')[1] || '';
const limpaDominio = (d) => String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();

// Índice: e-mail → contato; domínio → empresa (do cadastro e dos e-mails dos
// contatos, só quando o domínio aponta para UMA empresa).
export function montarIndice({ decisores, empresas }) {
  const porEmail = new Map(); const domEmp = new Map(); const ambiguos = new Set();
  const marca = (dom, empId) => {
    if (!dom || DOMINIOS_GENERICOS.has(dom) || !empId) return;
    if (domEmp.has(dom) && domEmp.get(dom) !== empId) ambiguos.add(dom); else domEmp.set(dom, empId);
  };
  for (const e of (empresas || [])) { marca(limpaDominio(e.dominio), e.id); marca(limpaDominio(e.website || e.site), e.id); }
  for (const d of (decisores || [])) {
    const em = String(d.email || '').toLowerCase().trim();
    if (!em) continue;
    porEmail.set(em, d);
    marca(dominioDe(em), d.empresa_id);
  }
  for (const a of ambiguos) domEmp.delete(a);
  return { porEmail, porDominio: domEmp };
}

// meta: { labelIds, de, para, cc }  proprios: Set de e-mails do Pedro.
// Devolve null se o e-mail não é com ninguém do CRM.
export function casarMensagem(meta, indice, proprios) {
  const enviado = (meta.labelIds || []).includes('SENT');
  const contrapartes = enviado
    ? [...parseEnderecos(meta.para), ...parseEnderecos(meta.cc)]
    : parseEnderecos(meta.de);
  const decisores = []; const empresas = new Set(); const novos = [];
  for (const c of contrapartes) {
    if (proprios && proprios.has(c.email)) continue;
    const local = c.email.split('@')[0];
    if (RE_AUTOMATICO.test(local)) continue;
    const d = indice.porEmail.get(c.email);
    if (d) { decisores.push(d); if (d.empresa_id) empresas.add(d.empresa_id); continue; }
    const emp = indice.porDominio.get(dominioDe(c.email));
    if (emp) { empresas.add(emp); novos.push({ nome: c.nome || nomeDoEmail(local), email: c.email, empresa_id: emp }); }
  }
  if (!decisores.length && !novos.length) return null;
  return { direcao: enviado ? 'enviado' : 'recebido', decisores, empresaIds: [...empresas], novos };
}

// A empresa respondeu de verdade? Mensagem recebida que não é aviso automático
// (e-mail rejeitado, "não entregue", resposta automática de férias) nem do próprio Pedro.
// Teste real 25/11: "Sua mensagem foi bloqueada" contava como resposta e abria oportunidade.
const RE_REMETENTE_AUTO = /^(mailer-daemon|postmaster|microsoftexchange|no-?reply|noreply|nao-?responda|naoresponda|bounce)/i;
const RE_ASSUNTO_AUTO = /^(delivery status notification|undeliver|undelivered|mail delivery|returned mail|n[ãa]o (foi poss[íi]vel )?entreg|mensagem n[ãa]o entregue|falha na entrega|automatic reply|auto-?reply|resposta autom[áa]tica|out of office|aus[êe]ncia|fora do escrit[óo]rio)/i;
export function respostaReal(mensagens, proprios) {
  return (mensagens || []).some(m => {
    if (m.direcao !== 'recebido') return false;
    const de = parseEnderecos(m.de)[0];
    if (!de) return false;
    if (proprios && proprios.has(de.email)) return false;
    if (RE_REMETENTE_AUTO.test(de.email.split('@')[0])) return false;
    return !RE_ASSUNTO_AUTO.test(String(m.assunto || '').replace(/^(re|res|fw|fwd|enc|aw):\s*/i, '').trim());
  });
}

// Ordem do funil: só se anda para frente sozinho.
export const RANK_ESTAGIO = { 'Wishlist': 0, 'Contato direto': 1, 'Primeira reunião': 2, 'Negociando direto': 3, 'Concorrências': 3, 'Negociação': 4, 'Cliente ativo': 5 };
export const SINAIS = ['sem_sinal', 'conversa_inicial', 'interesse', 'reuniao_marcada', 'reuniao_realizada', 'concorrencia', 'proposta_enviada', 'negociacao', 'fechado_ganho', 'perdido', 'nao_agora'];
const ALVO = { conversa_inicial: 'Contato direto', interesse: 'Contato direto', reuniao_marcada: 'Primeira reunião', reuniao_realizada: 'Primeira reunião', concorrencia: 'Concorrências',
  proposta_enviada: 'Negociação', negociacao: 'Negociação', fechado_ganho: 'Cliente ativo', perdido: 'Perdido', nao_agora: 'Pausado' };
const SO_SUGESTAO = new Set(['Cliente ativo', 'Perdido', 'Pausado']);

// Decide o que fazer com o pipeline. estagioAtual = null quando não há oportunidade aberta.
// → { acao: 'nada'|'aplicar'|'criar'|'sugerir', para, motivo }
// clienteRespondeu = a conversa tem ao menos uma mensagem recebida da empresa.
// Prospecção que só o Pedro escreveu não é oportunidade: o funil não muda
// (teste real 25/11: e-mail frio sem resposta abriu oportunidade).
export function decidirPipeline({ sinal, confianca, estagioAtual, clienteRespondeu = true }) {
  const para = ALVO[sinal];
  if (!para) return { acao: 'nada', motivo: 'sem sinal de mudança' };
  if (!clienteRespondeu) return { acao: 'nada', motivo: 'a empresa ainda não respondeu: prospecção não muda o funil' };
  // Oportunidade encerrada (Perdido / Cliente ativo): conversa nova é negócio novo.
  // Não se mexe na antiga (o histórico do que foi ganho/perdido fica); sugere abrir
  // outra. Teste real 26/11: cliente ativo (Apsen) recebia "voltar para Negociação".
  if (estagioAtual === 'Perdido' || estagioAtual === 'Cliente ativo') {
    if (para === estagioAtual) return { acao: 'nada', motivo: 'já está em ' + para };
    if (estagioAtual === 'Cliente ativo' && para === 'Perdido') return { acao: 'sugerir', para, motivo: 'cliente ativo com sinal de saída: decisão do Pedro' };
    if (SO_SUGESTAO.has(para)) return { acao: 'nada', motivo: 'oportunidade já encerrada em ' + estagioAtual };
    return { acao: 'sugerir', para, nova: true, motivo: estagioAtual === 'Cliente ativo'
      ? 'cliente ativo: conversa nova vira nova oportunidade (expansão)'
      : 'a oportunidade anterior foi perdida: conversa nova vira nova oportunidade' };
  }
  if (estagioAtual === 'Pausado') {
    return para === estagioAtual ? { acao: 'nada', motivo: 'já está em ' + para } : { acao: 'sugerir', para, motivo: 'oportunidade estava pausada: retomar é decisão do Pedro' };
  }
  if (SO_SUGESTAO.has(para)) return { acao: 'sugerir', para, motivo: para + ' nunca é aplicado sozinho' };
  if (!estagioAtual) {
    if (confianca === 'alta') return { acao: 'criar', para, motivo: 'conversa ativa sem oportunidade aberta' };
    return { acao: 'sugerir', para, motivo: 'abrir oportunidade (confiança ' + confianca + ')' };
  }
  const ra = RANK_ESTAGIO[estagioAtual] ?? 0, rp = RANK_ESTAGIO[para] ?? 0;
  if (rp <= ra) return { acao: 'nada', motivo: 'não recua o funil (' + estagioAtual + ' ≥ ' + para + ')' };
  if (confianca !== 'alta') return { acao: 'sugerir', para, motivo: 'avanço com confiança ' + confianca };
  return { acao: 'aplicar', para, motivo: 'avanço claro na conversa' };
}

// Uma sugestão pendente por empresa. Uma empresa tem várias conversas (Coca-Cola:
// RFI, NDA, convite...) e cada leitura gerava uma sugestão (teste real: 9 para a
// mesma empresa). A nova só substitui a pendente se for de etapa igual ou mais
// avançada (empate: a mais recente vence).
const RANK_SUG = Object.assign({}, RANK_ESTAGIO, { 'Pausado': 0, 'Perdido': 6 });
export function substituiSugestao(pendente, nova) {
  if (!pendente) return true;
  return (RANK_SUG[nova.estagio_para] ?? 0) >= (RANK_SUG[pendente.estagio_para] ?? 0);
}

// Data combinada no e-mail vira o prazo da oportunidade aberta? Só se a empresa
// respondeu de verdade, a data é de hoje em diante e o e-mail não é mais velho que
// a última edição feita no CRM (não briga com o prazo que o Pedro definiu à mão).
export function aplicarPrazoDoEmail({ dataPP, hojeStr, op, respondeu, ultimaMsgEm }) {
  if (!respondeu || !dataPP || !/^\d{4}-\d{2}-\d{2}$/.test(dataPP) || dataPP < hojeStr) return false;
  if (!op || ['Perdido', 'Cliente ativo', 'Pausado'].includes(op.estagio)) return false;
  const atual = op.proximo_passo_em ? String(op.proximo_passo_em).slice(0, 10) : null;
  if (atual === dataPP) return false;
  if (!atual || atual < hojeStr) return true;
  return !!(ultimaMsgEm && op.atualizado_em && new Date(ultimaMsgEm) > new Date(op.atualizado_em));
}

export const SCHEMA_STATUS = {
  type: 'object',
  properties: {
    sinal: { type: 'string', enum: SINAIS },
    confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    resumo: { type: 'string' },
    proximo_passo: { type: 'string' },
    data_proximo_passo: { type: 'string' },
    evidencia: { type: 'string' }
  },
  required: ['sinal', 'confianca', 'resumo', 'proximo_passo', 'data_proximo_passo', 'evidencia'],
  additionalProperties: false
};

// mensagens: [{direcao, data, de, assunto, texto}] em ordem cronológica.
export function construirPromptStatus({ empresa, estagioAtual, mensagens, hoje }) {
  const system = [
    'Você lê conversas de e-mail comerciais do Pedro Ica (Galeria Holding, grupo de agências de comunicação) com uma empresa e diz em que pé está a negociação.',
    'Regras:',
    '- Use SÓ o que está escrito nas mensagens. Não deduza o que não foi dito. Em dúvida, confiança baixa.',
    '- sinal: o estado mais avançado que a conversa COMPROVA:',
    '  conversa_inicial (primeiro contato/troca sem interesse claro), interesse (o cliente quer conversar/saber mais),',
    '  reuniao_marcada (data/hora combinada ou convite aceito), reuniao_realizada (fala de reunião que já aconteceu),',
    '  concorrencia (processo formal de seleção de agências: RFI, pitch, briefing de concorrência, apresentação de credenciais),',
    '  proposta_enviada (proposta/orçamento enviado), negociacao (discutindo preço, escopo, contrato),',
    '  fechado_ganho (aprovação explícita, pedido, contrato assinado), perdido (recusa explícita ou escolheu outro),',
    '  nao_agora (pediu para retomar depois), sem_sinal (e-mail operacional, newsletter, assunto que não é negócio).',
    '- confianca alta só quando a frase que comprova o sinal está clara na mensagem; copie essa frase (curta) em evidencia.',
    '- resumo: 1 frase objetiva do estado da conversa. proximo_passo: a próxima ação do Pedro (curta) ou "".',
    '- data_proximo_passo: AAAA-MM-DD se uma data foi combinada (dia da reunião, prazo de proposta, RFI ou retorno); senão "". Data só sugerida por um lado sem aceite não conta.',
    '- Ignore assinaturas, avisos legais e texto citado de mensagens anteriores.'
  ].join('\n');
  const msgs = (mensagens || []).slice(-6).map((m, i) =>
    `[${i + 1}] ${m.direcao === 'enviado' ? 'PEDRO →' : '→ PEDRO, de ' + (m.de || '?')} · ${String(m.data || '').slice(0, 16).replace('T', ' ')} · assunto: ${String(m.assunto || '').slice(0, 120)}\n${String(m.texto || '').slice(0, 700)}`).join('\n\n');
  const user = [
    `Empresa: ${empresa || '?'} · estágio atual no CRM: ${estagioAtual || 'sem oportunidade aberta'} · hoje: ${hoje || new Date().toISOString().slice(0, 10)}`,
    'Mensagens (mais antigas primeiro):', msgs || '(nenhuma)'
  ].join('\n');
  return { system, user };
}

// Tira texto citado ("Em ... escreveu:", linhas com ">") e assinatura.
export function semCitacao(t) {
  const s = String(t || '').replace(/\r\n?/g, '\n');
  const corte = s.search(/\n(Em .{5,120}escreveu:|On .{5,120}wrote:|De: .+\nEnviad|From: .+\nSent:|-----Original Message-----|_{10,})/i);
  return (corte > 0 ? s.slice(0, corte) : s).split('\n').filter(l => !/^\s*>/.test(l)).join('\n').split(/\n--\s*\n/)[0].replace(/\n{3,}/g, '\n\n').trim();
}
