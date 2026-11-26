// lib/blitz.js — blitz: o Pedro escolhe uma lista e um tema, a IA escreve para cada
// contato um e-mail e um WhatsApp curtos. Parte pura e testável; a rede fica no cron.
// Nada é enviado aqui: as mensagens entram na fila como rascunho para o Pedro revisar,
// aprovar e enviar (regra 3 do CLAUDE.md).

import { alegaFato } from './sdr-meta.js';

export const SCHEMA_BLITZ = {
  type: 'object',
  properties: {
    assunto: { type: 'string' },
    email: { type: 'string' },
    whatsapp: { type: 'string' },
    gancho: { type: 'string' }
  },
  required: ['assunto', 'email', 'whatsapp', 'gancho'],
  additionalProperties: false
};

export function primeiroNome(nome) {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  if (!p || /@/.test(p)) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Cases do grupo que combinam com o setor da empresa (por tag/título), no máximo 3.
export function casesDoSetor(cases, setor) {
  const s = sem(setor).split(/\s+e\s+|\s+/).filter(x => x.length > 3);
  if (!s.length) return [];
  return (cases || []).filter(c => {
    const alvo = sem([c.titulo, c.marca, c.categoria_da_marca, ...(c.tags || [])].join(' '));
    return s.some(t => alvo.includes(t));
  }).slice(0, 3);
}

export function construirPromptBlitz({ tema, agencia, holding, cases, memoria, contato, empresa, remetente = 'Pedro Ica' }) {
  const nomeAg = (agencia && agencia.nome) || 'Galeria Holding';
  const system = [
    `Você escreve mensagens comerciais de ${remetente}, sócio e Head de Growth da Galeria Holding (grupo de agências de comunicação), assinando pela ${nomeAg}.`,
    'É uma BLITZ: a mesma conversa com várias empresas de um setor. Cada mensagem precisa soar escrita para aquela pessoa, sem parecer disparo em massa.',
    'Regras:',
    '- Português do Brasil, tom de conversa entre executivos, direto e educado. Sem jargão de agência, sem exclamações em excesso, sem emojis.',
    '- Use SÓ os fatos dados aqui (tema, agência, cases, dados da empresa). Não invente notícia, número, cliente, prêmio ou resultado. Não diga "vi que", "li que", "soube que".',
    '- Pode citar um case do grupo só se ele estiver na lista dada, com o resultado como está escrito.',
    '- E-mail: assunto curto (até 7 palavras, sem caixa alta, sem "Re:"). Corpo de 60 a 110 palavras em 2 ou 3 parágrafos curtos separados por linha em branco: abre pelo primeiro nome, contexto ligando o tema à empresa, o valor, e o pedido de 20 minutos de conversa no último parágrafo. Sem assinatura (o Gmail põe a assinatura).',
    `- WhatsApp: até 55 palavras, começa com "Oi ${'{'}primeiro nome{'}'}, aqui é o Pedro Ica, da ${nomeAg}." e termina com uma pergunta simples para marcar 20 minutos.`,
    '- gancho: em poucas palavras, o que você usou para personalizar (ex.: "setor educação + case X").',
    memoria ? 'Memória comercial do Pedro (siga):\n' + memoria : ''
  ].filter(Boolean).join('\n');
  const user = [
    `TEMA DA BLITZ: ${String(tema || '').trim()}`,
    `AGÊNCIA QUE ASSINA: ${nomeAg}${agencia && agencia.descricao ? ' — ' + agencia.descricao : ''}${agencia && agencia.especialidade ? ' (especialidade: ' + agencia.especialidade + ')' : ''}`,
    holding && holding.descricao ? `GRUPO: ${holding.descricao}` : '',
    (cases && cases.length) ? 'CASES DO GRUPO QUE COMBINAM:\n' + cases.map(c => `- ${c.titulo}${c.marca ? ' (' + c.marca + ')' : ''}: ${c.resultado || ''}`).join('\n') : 'CASES: nenhum do mesmo setor (não cite case).',
    `EMPRESA: ${empresa.nome}${empresa.setor ? ' · setor: ' + empresa.setor : ''}${empresa.site ? ' · site: ' + empresa.site : ''}`,
    `PESSOA: ${contato.nome || '?'}${contato.cargo ? ' · ' + contato.cargo : ''} · primeiro nome: ${primeiroNome(contato.nome) || '(sem nome: use "Olá")'}`
  ].filter(Boolean).join('\n');
  return { system, user };
}

const palavras = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
// Checagem antes de pôr na fila. Devolve lista de problemas (vazia = ok).
export function checarMensagem(m) {
  const p = [];
  if (!m || !m.assunto || !m.email || !m.whatsapp) return ['resposta incompleta'];
  if (palavras(m.assunto) > 9) p.push('assunto longo');
  if (palavras(m.email) > 140) p.push('e-mail longo');
  if (palavras(m.email) > 70 && !/\n\s*\n/.test(m.email)) p.push('e-mail num parágrafo só: separe em 2 ou 3 parágrafos');
  if (palavras(m.whatsapp) > 75) p.push('WhatsApp longo');
  if (alegaFato(m.email) || alegaFato(m.whatsapp)) p.push('afirma fato externo (notícia/anúncio) que não foi dado');
  if (/\{|\}|\[nome|\[empresa|xxx/i.test(m.email + ' ' + m.whatsapp + ' ' + m.assunto)) p.push('sobrou marcador sem preencher');
  return p;
}
