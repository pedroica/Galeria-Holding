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

// Ordem da trilha: lead com fato primeiro; sem fato só entra se a empresa tem
// encaixe com o grupo (estrelas) e o cargo é de quem decide comunicação.
const RE_CARGO_DECISOR = /(market|marketing|marca|brand|comunica|cmo|ceo|presiden|diretor|diretora|director|head|vp|vice|s[óo]ci|founder|fundador|growth|digital|trade|produto|comercial|vendas|cco)/i;
export function cargoDecideComunicacao(cargo) {
  return RE_CARGO_DECISOR.test(String(cargo || ''));
}

export function elegivelSemFato({ cargo, estrelas, minEstrelas = 3 }) {
  return cargoDecideComunicacao(cargo) && (Number(estrelas) || 0) >= minEstrelas;
}
