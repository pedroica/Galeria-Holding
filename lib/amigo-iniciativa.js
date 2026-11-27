// lib/amigo-iniciativa.js — o amigo toma a iniciativa (pedido do Pedro, 26/11: "super bot
// propositivo"). Parte pura: horários, gatilhos do vigia e as instruções que viram a
// mensagem do amigo. Quem lê o banco e manda é api/cron.js (job amigo) → api/enrich.js
// (provider telegram, acao=iniciativa). Regra: a iniciativa PROPÕE; não altera o CRM nem
// envia nada sem o Pedro pedir (o "manda" continua valendo para o que vai a terceiros).

export const FUSO = 'America/Sao_Paulo';
export const PADRAO_AVISOS = { manha: true, fim: true, vigia: true };

// Hora e dia da semana em Brasília.
export function relogioBR(agora = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(agora);
  const g = (t) => (p.find(x => x.type === t) || {}).value;
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dia: dias[g('weekday')], hora: Number(g('hour')) % 24, minuto: Number(g('minute')) };
}
// Vigia só em dia útil, das 8h às 20h; feriado (lista sdr_feriados, AAAA-MM-DD) fica quieto.
export function podeAvisar(agora = new Date(), feriados = []) {
  const r = relogioBR(agora);
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: FUSO });
  if (r.dia === 0 || r.dia === 6 || (feriados || []).includes(hoje)) return false;
  return r.hora >= 8 && r.hora < 20;
}
export function avisosLigados(cfg, modo) {
  const c = Object.assign({}, PADRAO_AVISOS, cfg && typeof cfg === 'object' ? cfg : {});
  return c[modo] !== false;
}

const hm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });

// Gatilhos do vigia: respostas novas de cliente (e-mail), reunião chegando (30–80 min),
// executivo que mudou de cargo. avisadas = chaves já mandadas (não repete).
export function gatilhosVigia({ respostas = [], eventos = [], reunioesCrm = [], movs = [], avisadas = [], agora = new Date() }) {
  const ja = new Set(avisadas || []);
  const t0 = agora.getTime();
  const itens = [];
  for (const r of respostas) {
    const k = 'resp:' + r.id; if (ja.has(k)) continue;
    if (r.resultado === 'bounce') continue;
    itens.push({ tipo: 'resposta', chave: k, empresa: r.empresa || null, texto: `${r.pessoa || 'Alguém'}${r.empresa ? ' (' + r.empresa + ')' : ''} respondeu por ${r.canal || 'e-mail'}: ${String(r.resumo || r.assunto || '').slice(0, 300)}` });
  }
  const janela = (iso) => { const d = Date.parse(iso) - t0; return d >= 25 * 60000 && d <= 80 * 60000; };
  const horasGoogle = new Set();
  for (const e of eventos) {
    if (!e.inicio || !janela(e.inicio)) continue;
    horasGoogle.add(String(e.inicio).slice(0, 16));
    if (!(e.convidados && e.convidados.length)) continue; // compromisso pessoal/sem gente: não prepara
    const k = 'ev:' + e.id; if (ja.has(k)) continue;
    itens.push({ tipo: 'reuniao', chave: k, texto: `Às ${hm(e.inicio)}: "${e.titulo}" com ${e.convidados.slice(0, 5).join(', ')}${e.local ? ' — ' + e.local : ''}${e.meet ? ' — Meet ' + e.meet : ''}` });
  }
  for (const r of reunioesCrm) {
    if (!r.reuniao_em || !janela(r.reuniao_em)) continue;
    const k = 'reu:' + (r.id || r.empresa_id + r.reuniao_em); if (ja.has(k)) continue;
    if (itens.some(i => i.tipo === 'reuniao' && r.empresa && i.texto.toLowerCase().includes(String(r.empresa).toLowerCase()))) continue;
    itens.push({ tipo: 'reuniao', chave: k, empresa: r.empresa || null, texto: `Às ${hm(r.reuniao_em)}: reunião com ${r.empresa || 'cliente'}${r.titulo ? ' (' + r.titulo + ')' : ''}` });
  }
  for (const m of movs) {
    const k = 'mov:' + m.id; if (ja.has(k)) continue;
    itens.push({ tipo: 'movimentacao', chave: k, empresa: m.empresa || null, texto: `${m.pessoa} assumiu ${m.cargo || 'novo cargo'} na ${m.empresa}${m.empresa_anterior ? ' (vinha da ' + m.empresa_anterior + ')' : ''}${m.status === 'sem_email' ? ' — sem e-mail, só LinkedIn' : ''}` });
  }
  return itens;
}

const COMUM = 'Esta mensagem é SUA INICIATIVA (gatilho automático; o Pedro não escreveu nada). Seja um braço direito propositivo: traga o que importa e já proponha ações concretas e numeradas, prontas para ele responder "faz a 1", "manda" ou "sim". Não altere o CRM nem envie nada por conta própria agora: proponha. Se for útil, já deixe o texto pronto (preparar_mensagem). Curto, direto, no estilo de mensagem de celular. Se não houver nada que valha a pena, responda exatamente SEM_NOVIDADE.';

export function instrucaoIniciativa(modo, itens = []) {
  if (modo === 'manha') return COMUM + `

Briefing da manhã. Use minha_agenda e ver_agenda (hoje). Monte:
1) Reuniões de hoje com 1 linha de preparo cada (quem é, em que pé está, objetivo).
2) O que está vencido ou vence hoje, priorizado pelo que mais mexe no pipeline (etapa avançada e valor primeiro).
3) Até 5 ações propostas, numeradas, cada uma com o que você já pode adiantar (ex.: "1. Cobrar a Sky — já escrevo o zap pro Gustavo?").
Feche com uma pergunta: qual delas eu já faço?`;
  if (modo === 'fim') return COMUM + `

Fechamento do dia. Use minha_agenda, pipeline (so_atrasadas) e ver_agenda (amanhã). Conte em poucas linhas: o que andou hoje (respostas, reuniões, mudanças de etapa), o que ficou atrasado e o que tem amanhã. Proponha até 3 ações para deixar encaminhadas hoje à noite ou amanhã cedo (ex.: rascunhos de follow-up prontos para ele revisar).`;
  const lista = itens.map((i, n) => (n + 1) + '. [' + i.tipo + '] ' + i.texto).join('\n');
  return COMUM + `

Aconteceu agora:
${lista}

Como agir por tipo:
- resposta: leia o contexto (oportunidade, histórico) e diga em 1-2 linhas o que a pessoa quer; proponha a resposta e já escreva com preparar_mensagem (e-mail fica pronto para "manda"). Se houver várias, prepare só a mais importante e liste as outras.
- reuniao: briefing de preparo em até 6 linhas: quem são (cargo), última conversa (CRM/WhatsApp), em que etapa está a oportunidade, 2-3 objetivos/perguntas para a reunião. Use oportunidade e ler_whatsapp.
- movimentacao: proponha parabéns (o e-mail já fica como rascunho no Gmail) e uma versão curta para LinkedIn.`;
}

// Nada que valha mandar?
export function semNovidade(texto) { return !String(texto || '').trim() || /^\s*SEM_NOVIDADE\b/i.test(String(texto)); }
