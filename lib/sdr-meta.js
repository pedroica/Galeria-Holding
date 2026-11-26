// lib/sdr-meta.js — meta diária de rascunhos, orçamento do modelo e trilha
// "sem fato" do SDR. Parte pura e testável; as consultas ficam no cron.
//
// Por que existe (auditoria de 25/11/2026): o funil selecionava ~80 leads por
// noite e entregava 0 a 1 rascunho por dia. ~65% dos leads não têm notícia com
// fonte e eram descartados antes do modelo; o estrategista vetava quase todo o
// resto. A meta é 20 rascunhos de e-mail por dia no Gmail, sem inventar fato.

// Início do dia em Brasília (UTC-3, sem horário de verão desde 2019), em ISO UTC.
export function inicioDiaBRT(agora = new Date()) {
  const brt = new Date(agora.getTime() - 3 * 3600000);
  const d = brt.toISOString().slice(0, 10);
  return new Date(d + 'T03:00:00.000Z').toISOString();
}

export function dataBRT(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

// Quantos leads de e-mail ainda podem entrar no funil hoje. emAndamento são os
// que já estão entre o estrategista e o QC: contam para não passar da meta.
// folga: o QC retém ~30%, então deixamos entrar um pouco mais que a meta.
export function vagasDoDia({ meta, produzidosHoje, emAndamento, folga = 1.4 }) {
  const m = Math.max(0, Number(meta) || 0);
  const faltam = m - (Number(produzidosHoje) || 0);
  if (faltam <= 0) return 0;
  return Math.max(0, Math.ceil(faltam * folga) - (Number(emAndamento) || 0));
}

// Gasto do dia com o modelo (US$) somado dos logs de fim dos jobs do SDR.
export function gastoDosLogs(rows) {
  let t = 0;
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const c = Number(r && r.contexto && r.contexto.custo_usd);
    if (Number.isFinite(c) && c > 0) t += c;
  }
  return Math.round(t * 10000) / 10000;
}

export function orcamentoOk({ gastoHoje, tetoUsd }) {
  const teto = Number(tetoUsd);
  if (!Number.isFinite(teto) || teto <= 0) return true;   // sem teto configurado
  return (Number(gastoHoje) || 0) < teto;
}

// Mensagem sem fato público não pode afirmar nada sobre a empresa como se
// tivesse lido em algum lugar. Pega as formas mais comuns de "fato alegado".
const RE_FATO_ALEGADO = /\b(vi|li|acompanhei|soube)\s+(que|a\s+not[íi]cia)|\banunci(ou|aram|ando)\b|\blan[çc](ou|aram)\b|\binaugur(ou|aram)\b|\bsegundo\s+(o|a)\s+\w+|\bde acordo com\b|\bmat[ée]ria\b|\bnot[íi]cia\b/i;
export function alegaFato(texto) {
  return RE_FATO_ALEGADO.test(String(texto || ''));
}

// Trilha de contexto (substitui a trilha "por setor e cargo", que gerava
// mensagem artificial): sem notícia, o lead só segue se houver contexto
// VERIFICÁVEL no CRM. Conta como contexto:
//  - conversa: a pessoa já respondeu, conversou ou teve reunião (crm_toques);
//  - oportunidade: oportunidade da empresa parada em Wishlist/Pausado há 30+ dias;
//  - momento: a pessoa pediu "não agora" e a pausa venceu.
// Contato anterior SEM resposta não é contexto (seria insistência, não relação).
const RESULTADO_CONVERSA = new Set(['respondeu', 'resposta', 'reuniao', 'reuniao_marcada', 'atendeu']);
const ESTAGIO_PARADO = new Set(['Wishlist', 'Pausado']);
const fmt = (iso) => { const d = String(iso || '').slice(0, 10); return d ? d.split('-').reverse().join('/') : 's/data'; };
const curto = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

export function contextoDoLead({ toques, oportunidades, pausaAteEm, observacoes, sinalRecenteEm, listas, estrelas, agora = Date.now() } = {}) {
  const itens = [];
  // 26/11: o que o Pedro registrou ou escolheu também é contexto real (não é notícia):
  const obs = String(observacoes || '').replace(/\s+/g, ' ').trim();
  if (obs.length >= 20 && !/^Descoberto no Gmail/i.test(obs) && !/lusha|enriquec|hunter|validar|captura|importad/i.test(obs)) itens.push({ tipo: 'relacao', data: null, texto: 'nota do CRM: ' + curto(obs, 240) });
  if (sinalRecenteEm && agora - new Date(sinalRecenteEm).getTime() <= 90 * 86400000) itens.push({ tipo: 'novo_cargo', data: sinalRecenteEm, texto: 'assumiu o cargo atual recentemente (registro de ' + fmt(sinalRecenteEm) + ')' });
  for (const nm of (Array.isArray(listas) ? listas : []).slice(0, 2)) itens.push({ tipo: 'prioridade', data: null, texto: 'está na lista "' + curto(nm, 60) + '" que o Pedro montou' });
  if (Number(estrelas) >= 4) itens.push({ tipo: 'prioridade', data: null, texto: 'empresa prioritária para o grupo (' + Math.round(Number(estrelas)) + ' estrelas)' });
  for (const t of (Array.isArray(toques) ? toques : [])) {
    if (!t) continue;
    const conversa = t.direcao === 'recebido' || RESULTADO_CONVERSA.has(t.resultado);
    if (!conversa) continue;
    const sobre = curto(t.assunto || t.resumo, 120);
    itens.push({ tipo: 'conversa', data: t.data || null,
      texto: (t.direcao === 'recebido' ? 'mensagem dela' : 'conversa') + ' por ' + (t.canal || 'contato') + ' em ' + fmt(t.data) +
        (t.resultado && t.resultado !== 'enviado' ? ' (' + t.resultado + ')' : '') + (sobre ? ': ' + sobre : '') });
  }
  for (const o of (Array.isArray(oportunidades) ? oportunidades : [])) {
    if (!o || !ESTAGIO_PARADO.has(o.estagio)) continue;
    const ult = o.atualizado_em || o.criado_em;
    if (ult && agora - new Date(ult).getTime() < 30 * 86400000) continue;   // mexida recente: é do dono
    itens.push({ tipo: 'oportunidade', data: ult || null,
      texto: 'oportunidade "' + curto(o.titulo || o.oferta || 'sem título', 80) + '" parada em ' + o.estagio + ' desde ' + fmt(ult) + (o.oferta ? ' (oferta: ' + curto(o.oferta, 80) + ')' : '') });
  }
  if (pausaAteEm && new Date(pausaAteEm).getTime() <= agora) {
    itens.push({ tipo: 'momento', data: pausaAteEm, texto: 'pediu para retomar depois; a pausa venceu em ' + fmt(pausaAteEm) });
  }
  itens.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return itens.slice(0, 4);
}

// Quem respondeu há pouco está em conversa (é do Pedro). Só volta ao agente se a
// última conversa tiver mais de 90 dias.
export function conversaRecente(ultimaConversaISO, agora = Date.now(), dias = 90) {
  if (!ultimaConversaISO) return false;
  return agora - new Date(ultimaConversaISO).getTime() < dias * 86400000;
}
