// lib/sdr-envio.js — guarda de envio, aquecimento e cadência do SDR (Bloco D).
// Puro/testável. Quem chama relê a configuração do banco a CADA envio: a guarda
// é conferida no agendamento e de novo no instante do envio (guarda dupla).

import { LINHA_OPT_OUT } from './sdr-respostas.js';

const OFFSET_BRT_MIN = -180; // Brasil sem horário de verão desde 2019.

export function horaBRT(agora) {
  const d = new Date(agora.getTime() + OFFSET_BRT_MIN * 60000);
  return { data: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), diaSemana: d.getUTCDay() };
}
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
export function parseJanela(j) {
  const [a, b] = String(j || '07:30-11:00').split('-');
  return { ini: hm(a), fim: hm(b) };
}

export function ehDiaUtil(dataISO, feriados) {
  const dow = new Date(dataISO + 'T12:00:00Z').getUTCDay();
  return dow !== 0 && dow !== 6 && !(feriados || []).includes(dataISO);
}

// Teto de e-mails do dia no aquecimento: começa em `inicio`, sobe `passo_semanal`
// por semana completa desde `desde`, nunca acima do teto global.
export function tetoEmailHoje({ aquecimento, desde, tetoGlobal, agora }) {
  const a = aquecimento || { inicio: 15, passo_semanal: 5 };
  const semanas = desde ? Math.max(0, Math.floor((agora - new Date(desde)) / (7 * 86400000))) : 0;
  const curva = (Number(a.inicio) || 15) + (Number(a.passo_semanal) || 5) * semanas;
  return Math.min(curva, Number(tetoGlobal) || curva);
}

// Decide se UM envio pode sair agora. Todas as condições da regra 3 do CLAUDE.md.
export function podeEnviar({ cfg, agora, canal, enviadosHoje, bouncePct7d, msg, decisor }) {
  const motivos = [];
  if (cfg.piloto !== true) motivos.push('piloto automático desligado');
  if (!msg || msg.aprovado_autonomo !== true) motivos.push('mensagem não passou no controle de qualidade');
  const { data, minutos } = horaBRT(agora);
  if (!ehDiaUtil(data, cfg.feriados)) motivos.push('fora de dia útil (fim de semana ou feriado)');
  const j = parseJanela(cfg.janela);
  if (minutos < j.ini || minutos >= j.fim) motivos.push('fora da janela de envio ' + cfg.janela);
  const teto = canal === 'whatsapp' ? (Number(cfg.waDailyMax) || 10)
    : tetoEmailHoje({ aquecimento: cfg.aquecimento, desde: cfg.aquecimentoDesde, tetoGlobal: cfg.emailDailyMax, agora });
  if ((enviadosHoje || 0) >= teto) motivos.push(`teto diário de ${canal} atingido (${enviadosHoje}/${teto})`);
  const maxBounce = Number(cfg.aquecimento && cfg.aquecimento.bounce_max_pct) || 2;
  if (canal === 'email' && (bouncePct7d || 0) > maxBounce) motivos.push(`bounce de ${bouncePct7d}% em 7 dias acima de ${maxBounce}%`);
  if (decisor) {
    if (decisor.opt_out) motivos.push('pessoa pediu para sair');
    if (decisor.respondeu) motivos.push('pessoa já respondeu (resposta só com o Pedro)');
    if (canal === 'email' && (!decisor.email || decisor.email_valido === false)) motivos.push('sem e-mail válido');
    if (canal === 'whatsapp' && !decisor.wa) motivos.push('sem WhatsApp');
  }
  if (canal === 'whatsapp' && !cfg.waTemplate) motivos.push('modelo de WhatsApp ainda não aprovado pela Meta');
  return { ok: motivos.length === 0, motivos, teto };
}

// Horários do dia para N envios, espaçados por intervalo aleatório (min-max minutos)
// dentro da janela. `rnd` injetável para teste. Devolve Date[] (UTC).
export function slotsDoDia({ n, dataISO, janela, intervalo, rnd }) {
  const r = rnd || Math.random;
  const j = parseJanela(janela);
  const iv = intervalo || { min: 3, max: 9 };
  const out = [];
  let t = j.ini + Math.floor(r() * 10);
  for (let i = 0; i < n && t < j.fim; i++) {
    const base = new Date(dataISO + 'T00:00:00Z').getTime() - OFFSET_BRT_MIN * 60000;
    out.push(new Date(base + t * 60000));
    t += iv.min + Math.floor(r() * (iv.max - iv.min + 1));
  }
  return out;
}

// Próximo passo da cadência a partir do dia atual. A data cai no próximo dia útil.
export function proximoPasso({ cadencia, diaAtual, dataEnvioISO, feriados }) {
  const dias = (cadencia || []).map(c => Number(c.dia)).sort((a, b) => a - b);
  const prox = dias.find(d => d > Number(diaAtual || 0));
  if (prox === undefined) return null;
  const d = new Date(dataEnvioISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (prox - Number(diaAtual || 0)));
  let iso = d.toISOString().slice(0, 10);
  for (let k = 0; k < 10 && !ehDiaUtil(iso, feriados); k++) { d.setUTCDate(d.getUTCDate() + 1); iso = d.toISOString().slice(0, 10); }
  return { dia: prox, data: iso };
}

// Corpo final: o texto aprovado + a linha de saída (sempre presente no envio automático).
export function corpoFinal(corpo, canal) {
  const linha = LINHA_OPT_OUT[canal === 'whatsapp' ? 'whatsapp' : 'email'];
  const t = String(corpo || '').trim();
  return t.includes(linha) ? t : t + '\n\n' + linha;
}

export function htmlDeTexto(t) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(t || '').split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
}
