// lib/wa-pipeline.js — mensagem de WhatsApp para uma oportunidade do Pipeline, com
// pesquisa na internet (ferramenta web_search da IA). Pedido do Pedro (26/11): dentro do
// pipeline, gerar um papo de WhatsApp com internet. A IA lê o que o CRM sabe da
// oportunidade (etapa, próximo passo, histórico, toques) e pesquisa a empresa e a pessoa
// na web; escreve no estilo do Pedro (lib/estilo.js). Quem envia é o Pedro: a tela só
// abre o WhatsApp com o texto pronto. Parte pura e testável.

import { linhasEstilo } from './estilo.js';
import { primeiroNome } from './blitz.js';

const SITUACAO = {
  'Wishlist': 'primeiro contato: ainda não há conversa com a empresa',
  'Primeira reunião': 'há uma primeira reunião marcada ou feita: a mensagem confirma, prepara ou dá sequência a ela',
  'Contato direto': 'já existe conversa direta com a pessoa: a mensagem retoma o fio',
  'Negociando direto': 'negociação em andamento: a mensagem avança o próximo passo combinado',
  'Concorrências': 'a empresa está em concorrência: a mensagem reforça presença sem pressionar',
  'Negociação': 'negociação em andamento: a mensagem avança o próximo passo combinado',
  'Cliente ativo': 'é cliente: a mensagem cuida da relação e abre espaço para mais trabalho',
  'Pausado': 'a conversa esfriou: a mensagem reabre com um motivo novo e concreto',
  'Perdido': 'a oportunidade foi perdida: a mensagem reabre com cuidado e um motivo novo'
};

export function situacaoDaEtapa(estagio) { return SITUACAO[estagio] || 'oportunidade aberta'; }

// Número do WhatsApp no formato do wa.me (55 + DDD + número). null se inválido.
export function numeroWa(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return (d.length >= 12 && d.startsWith('55')) ? d : '55' + d;
}
export function linkWhatsapp(raw, texto) {
  const n = numeroWa(raw);
  return (n ? 'https://wa.me/' + n : 'https://wa.me/') + '?text=' + encodeURIComponent(String(texto || ''));
}

// Escolhe o contato: o pedido; senão quem tem WhatsApp; senão o primeiro.
export function escolherContato(decisores, decisorId, canal = 'whatsapp') {
  const ds = (decisores || []).filter(Boolean);
  const tem = canal === 'email' ? (d => /@/.test(d.email || '')) : (d => numeroWa(d.wa));
  return ds.find(d => d.id === decisorId) || ds.find(tem) || ds[0] || null;
}

const fmtData = (iso) => { const s = String(iso || '').slice(0, 10); return s ? s.split('-').reverse().join('/') : ''; };

// op: crm_oportunidades · empresa: {nome, setor, website} · contato: crm_decisores
// toques: crm_toques da empresa (mais novos primeiro) · eventos: crm_oportunidade_eventos
export function promptWhatsappPipeline({ op, empresa, contato, toques, eventos, instrucao, agencia, hoje, canal = 'whatsapp', estiloAprendido, conversaWa }) {
  const email = canal === 'email';
  const nome = contato ? (primeiroNome(contato.nome) || contato.nome) : '';
  const system = [
    'Você escreve, como o Pedro Ica (sócio e Head de Growth da Galeria Holding, grupo de agências de comunicação), UMA mensagem de ' + (email ? 'E-MAIL' : 'WhatsApp') + ' para alguém de uma empresa que está no pipeline comercial do grupo.',
    'Antes de escrever, PESQUISE NA INTERNET (ferramenta web_search, no máximo 3 buscas): notícias recentes da empresa (últimos 6 meses: lançamentos, resultados, campanhas, mudanças de liderança, expansão) e, se houver contato, a pessoa (cargo atual, movimentação recente). Use o que achar para dar à mensagem um motivo concreto e atual.',
    ...linhasEstilo(),
    ...(estiloAprendido || []),
    'Regras desta mensagem:',
    email
      ? '- É E-MAIL: assunto curto e pessoal (até 7 palavras, sem caixa alta). Corpo de 60 a 140 palavras em 2 ou 3 parágrafos curtos separados por linha em branco, sem lista, sem link, sem emoji e sem assinatura (o Gmail põe).'
      : '- É WhatsApp: curta (30 a 80 palavras), conversa de pessoa para pessoa, sem assunto, sem assinatura, sem lista, sem link, no máximo um emoji (ou nenhum).',
    '- Abra pelo primeiro nome. Respeite a SITUAÇÃO da oportunidade: não se apresente de novo a quem já conversa com o Pedro, não finja intimidade com quem nunca falou com ele.',
    '- Use no máximo UM fato da pesquisa, o mais recente e relevante, dito com naturalidade ("vi que vocês..."). Fato tem que estar numa fonte que você leu; se não achou nada confiável, escreva sem fato externo.',
    '- Nunca invente número, prêmio, campanha, cargo ou conversa. Nunca fale de preço.',
    '- Termine com uma pergunta só, leve: o próximo passo da oportunidade ou o café (presencial ou 20 minutos por vídeo).',
    '- Português impecável, sem travessão como pontuação, nada com cara de texto de IA.',
    'Responda no fim com um bloco ```json``` assim: {' + (email ? '"assunto": "...", ' : '') + '"mensagem": "...", "fato_usado": "o fato da pesquisa em uma frase, ou vazio", "fontes": ["url", ...]}. Nada depois do bloco.'
  ].join('\n');

  const hist = [];
  for (const e of (eventos || []).slice(0, 8)) {
    const t = [e.tipo, e.de && e.para ? e.de + ' → ' + e.para : '', e.texto || ''].filter(Boolean).join(': ');
    if (t) hist.push(`- ${fmtData(e.criado_em)} ${t.slice(0, 200)}`);
  }
  const tq = [];
  for (const t of (toques || []).slice(0, 8)) {
    const txt = [t.canal, t.direcao, t.resultado, t.assunto, t.resumo].filter(Boolean).join(' · ');
    if (txt) tq.push(`- ${fmtData(t.data || t.criado_em)} ${txt.slice(0, 220)}`);
  }
  const user = [
    `HOJE: ${hoje || new Date().toISOString().slice(0, 10)}`,
    `EMPRESA: ${(empresa && empresa.nome) || op.titulo || '?'}${empresa && empresa.setor ? ' · setor ' + empresa.setor : ''}${empresa && (empresa.website || empresa.dominio) ? ' · site ' + (empresa.website || empresa.dominio) : ''}`,
    contato ? `CONTATO: ${contato.nome} (primeiro nome: ${nome})${contato.cargo ? ' · ' + contato.cargo : ''}${contato.linkedin_url ? ' · ' + contato.linkedin_url : ''}` : 'CONTATO: não informado (escreva sem nome, com cumprimento neutro)',
    contato && contato.observacoes ? `NOTAS DO PEDRO SOBRE A PESSOA: ${String(contato.observacoes).slice(0, 400)}` : '',
    `OPORTUNIDADE: ${op.titulo || ''} · etapa ${op.estagio}${op.oferta ? ' · oferta ' + op.oferta : ''}${agencia ? ' · agência ' + agencia : ''}`,
    `SITUAÇÃO: ${situacaoDaEtapa(op.estagio)}`,
    op.proximo_passo ? `PRÓXIMO PASSO COMBINADO: ${op.proximo_passo}${op.proximo_passo_em ? ' (até ' + fmtData(op.proximo_passo_em) + ')' : ''}` : '',
    hist.length ? 'HISTÓRICO DA OPORTUNIDADE:\n' + hist.join('\n') : '',
    tq.length ? 'TOQUES COM A EMPRESA (mais novos primeiro):\n' + tq.join('\n') : 'TOQUES: nenhum registrado',
    (conversaWa || []).length ? 'CONVERSA RECENTE NO WHATSAPP COM ESSA PESSOA (mais antigas primeiro; continue o fio, não repita o que já foi dito):\n' + conversaWa.slice(-20).map(m => `- ${fmtData(m.enviada_em)} ${m.de_mim ? 'Pedro' : (contato ? primeiroNome(contato.nome) || 'contato' : 'contato')}: ${String(m.texto || m.midia || '').replace(/\s+/g, ' ').slice(0, 280)}`).join('\n') : '',
    instrucao ? `PEDIDO DO PEDRO PARA ESTA MENSAGEM (siga): ${String(instrucao).slice(0, 500)}` : ''
  ].filter(Boolean).join('\n');
  return { system, user };
}

// Lê a resposta final da IA (texto com bloco json). Aceita JSON solto também.
export function lerResposta(texto) {
  const t = String(texto || '');
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*"mensagem"[\s\S]*\})/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    if (!o || typeof o.mensagem !== 'string' || !o.mensagem.trim()) return null;
    return { assunto: String(o.assunto || '').trim(), mensagem: o.mensagem.trim(), fato_usado: String(o.fato_usado || ''), fontes: Array.isArray(o.fontes) ? o.fontes.filter(u => /^https?:\/\//.test(u)).slice(0, 5) : [] };
  } catch (_) { return null; }
}

const palavras = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
export function checarWhatsapp(msg, canal = 'whatsapp', assunto = '') {
  const p = [];
  const t = String(msg || '');
  if (!t.trim()) return ['mensagem vazia'];
  if (canal === 'email') {
    if (palavras(t) > 170) p.push('e-mail longo');
    if (!String(assunto).trim()) p.push('sem assunto');
    else if (palavras(assunto) > 9) p.push('assunto longo');
  } else if (palavras(t) > 110) p.push('longa para WhatsApp');
  if (/\s[—–]\s/.test(t)) p.push('travessão');
  if (/\{|\}|\[nome|xxx/i.test(t)) p.push('sobrou marcador');
  if (/https?:\/\//.test(t)) p.push('tem link');
  if (/r\$\s?\d|pre[çc]o|or[çc]amento de/i.test(t)) p.push('fala de preço');
  if ((t.match(/\?/g) || []).length > 2) p.push('perguntas demais');
  return p;
}
