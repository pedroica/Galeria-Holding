// lib/sdr-respostas.js — leitura de respostas do SDR (Bloco E). Puro/testável.
// Classifica cada e-mail recebido e decide a ação. Regra de ouro: NADA aqui
// responde a ninguém. Resposta a quem respondeu sempre passa pelo Pedro.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const RE_BOUNCE_REMETENTE = /(mailer-daemon|postmaster|microsoftexchange|mail delivery|delivery subsystem)/;
const RE_BOUNCE_ASSUNTO = /(undeliverable|nao foi possivel entregar|nao entregue|delivery status notification|mail delivery failed|returned mail|falha na entrega|delivery has failed|address not found|endereco nao encontrado)/;
const RE_AUTO = /(resposta automatica|automatic reply|auto(matic)?[- ]?reply|out of (the )?office|fora do escritorio|ausente|estarei fora|em ferias|de ferias|licenca maternidade|retorno (no|em) dia)/;
const RE_OPTOUT = /(remova|remover|me tire|me retire|tirar meu|descadastr|unsubscribe|nao (me )?envie mais|pare de (me )?enviar|parem de|nao quero receber|sair da lista|nao tenho interesse|sem interesse|nao temos interesse|nao me contate|nao entre em contato)/;
const RE_INDICACAO = /(fal(e|ar) com|procur(e|ar)|o responsavel (e|seria)|a responsavel (e|seria)|quem cuida (disso )?(e|seria)|encaminh(ei|ando|o)|copiando|em copia|cc:? )/;
const RE_NAO_AGORA = /(agora nao|nao (e|eh) o momento|no momento nao|proximo ano|ano que vem|mais para frente|daqui a (alguns|uns) meses|retome em|volte a falar|orcamento (ja )?(fechado|definido)|ja temos agencia|ja trabalhamos com)/;
const RE_INTERESSE = /(vamos conversar|podemos conversar|pode(mos)? marcar|marcar uma|agend(ar|a|e)|tenho interesse|temos interesse|me (manda|envie|mande)|manda (a|o)|faz sentido|topo|bora|quando (voce|vc) pode|que dia|qual horario|disponibilidade|me liga|pode ligar|sim[,!. ])/;

// Extrai e-mails de um texto (para achar o destinatário do bounce).
export function extrairEmails(t) {
  const out = new Set();
  for (const m of String(t || '').matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) out.add(m[0].toLowerCase());
  return [...out];
}

// msg: { remetente, assunto, preview }
// → { tipo: bounce|auto_resposta|opt_out|indicacao|nao_agora|interesse|indefinido, confianca, evidencia }
export function classificarResposta(msg) {
  const rem = norm(msg && msg.remetente);
  const ass = norm(msg && msg.assunto);
  const txt = norm((msg && msg.preview) || '');
  const tudo = ass + ' \n' + txt;

  if (RE_BOUNCE_REMETENTE.test(rem) || RE_BOUNCE_ASSUNTO.test(ass)) return { tipo: 'bounce', confianca: 'alta', evidencia: 'remetente/assunto de falha de entrega' };
  if (RE_AUTO.test(tudo)) return { tipo: 'auto_resposta', confianca: 'alta', evidencia: (tudo.match(RE_AUTO) || [''])[0] };
  // Opt-out vence qualquer outra coisa: na dúvida, respeitar o pedido de sair.
  if (RE_OPTOUT.test(tudo) || /^\s*(sair|parar|pare|stop|remover|remova)\s*[.!]*\s*$/.test(txt)) return { tipo: 'opt_out', confianca: 'alta', evidencia: (tudo.match(RE_OPTOUT) || [''])[0] };
  if (RE_INDICACAO.test(txt) && extrairEmails(txt).length) return { tipo: 'indicacao', confianca: 'media', evidencia: (txt.match(RE_INDICACAO) || [''])[0] };
  if (RE_NAO_AGORA.test(tudo)) return { tipo: 'nao_agora', confianca: 'media', evidencia: (tudo.match(RE_NAO_AGORA) || [''])[0] };
  if (RE_INTERESSE.test(tudo)) return { tipo: 'interesse', confianca: 'media', evidencia: (tudo.match(RE_INTERESSE) || [''])[0] };
  return { tipo: 'indefinido', confianca: 'baixa', evidencia: '' };
}

// Ação a tomar para cada tipo. Todas param a cadência, exceto auto-resposta.
// Nenhuma envia nada.
export function acaoPara(tipo) {
  switch (tipo) {
    case 'bounce':        return { parar_cadencia: true,  marcar_email_invalido: true,  blocklist: false, oportunidade: false, notificar: false, resultado_toque: 'bounce' };
    case 'auto_resposta': return { parar_cadencia: false, marcar_email_invalido: false, blocklist: false, oportunidade: false, notificar: false, resultado_toque: null };
    case 'opt_out':       return { parar_cadencia: true,  marcar_email_invalido: false, blocklist: false, opt_out: true, oportunidade: false, notificar: true, resultado_toque: 'respondeu' };
    case 'interesse':     return { parar_cadencia: true,  marcar_email_invalido: false, blocklist: false, oportunidade: true,  notificar: true, resultado_toque: 'respondeu' };
    case 'indicacao':     return { parar_cadencia: true,  marcar_email_invalido: false, blocklist: false, oportunidade: false, notificar: true, resultado_toque: 'respondeu' };
    case 'nao_agora':     return { parar_cadencia: true,  marcar_email_invalido: false, blocklist: false, oportunidade: false, notificar: true, resultado_toque: 'respondeu', pausar_dias: 90 };
    default:              return { parar_cadencia: true,  marcar_email_invalido: false, blocklist: false, oportunidade: false, notificar: true, resultado_toque: 'respondeu' };
  }
}

// Linha de opt-out que acompanha toda mensagem automática (regra de guarda).
export const LINHA_OPT_OUT = {
  email: 'Se preferir não receber mais mensagens minhas, é só responder "remover".',
  whatsapp: 'Se não quiser mais mensagens, responda SAIR.'
};
