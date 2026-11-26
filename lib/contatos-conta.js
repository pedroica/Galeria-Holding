// lib/contatos-conta.js — achar as pessoas de uma conta (empresa) para o follow-up do
// Pipeline: CRM, caixa do Gmail do Pedro (cabeçalhos e assinaturas) e Lusha. Parte pura.

const GENERICOS = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|uol|bol|terra|ig|msn|aol|proton|protonmail)\./i;

export function limparDominio(v) {
  const d = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

// Domínio da empresa: cadastro (dominio/website/site) ou, se faltar, o mais comum nos
// e-mails corporativos das pessoas da empresa.
// Todos os domínios da empresa: o do cadastro e os corporativos das pessoas
// (ex.: site xpinc.com, e-mails @xpi.com.br).
export function dominiosDaEmpresa(empresa, decisores) {
  const e = empresa || {};
  const out = [limparDominio(e.dominio), limparDominio(e.website), limparDominio(e.site)].filter(Boolean);
  const cont = {};
  for (const d of (decisores || [])) {
    const dom = String(d.email || '').toLowerCase().split('@')[1];
    if (dom && !GENERICOS.test(dom)) cont[dom] = (cont[dom] || 0) + 1;
  }
  for (const [dom] of Object.entries(cont).sort((a, b) => b[1] - a[1])) out.push(dom);
  return [...new Set(out)].slice(0, 4);
}

export function dominioDaEmpresa(empresa, decisores) {
  const e = empresa || {};
  const cad = limparDominio(e.dominio) || limparDominio(e.website) || limparDominio(e.site);
  if (cad) return cad;
  const cont = {};
  for (const d of (decisores || [])) {
    const dom = String(d.email || '').toLowerCase().split('@')[1];
    if (dom && !GENERICOS.test(dom)) cont[dom] = (cont[dom] || 0) + 1;
  }
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// "Nome Sobrenome <a@b.com>, c@d.com" → [{nome, email}]
export function lerEnderecos(h) {
  const out = [];
  for (const parte of String(h || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const m = parte.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) || parte.match(/^\s*()([^\s<>]+@[^\s<>]+)\s*$/);
    if (m) out.push({ nome: m[1].trim().replace(/^'|'$/g, ''), email: m[2].trim().toLowerCase() });
  }
  return out;
}

// Celular brasileiro no texto (assinatura). Devolve 55+DDD+9xxxxxxxx ou null.
export function acharCelular(texto) {
  const re = /(?:\+?55[\s.-]?)?\(?([1-9]\d)\)?[\s.-]?(9\d{4})[\s.-]?(\d{4})(?!\d)/g;
  let m;
  while ((m = re.exec(String(texto || '')))) return '55' + m[1] + m[2] + m[3];
  return null;
}

// Só o texto escrito pela pessoa (corta a parte citada da resposta).
export function semCitacao(texto) {
  const t = String(texto || '');
  const corte = t.search(/\n\s*(Em .{5,120}escreveu:|On .{5,120}wrote:|De: .{3,}\n|From: .{3,}\n|-----Original Message-----|>)/);
  return corte > 0 ? t.slice(0, corte) : t;
}

const nomeDoEmail = (email) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
const NAO_PESSOA = /^(no-?reply|noreply|nao-?responda|naoresponda|news|newsletter|marketing|contato|contact|info|suporte|support|atendimento|comercial|vendas|sales|rh|financeiro|nfe|nf-e|faturamento|cobranca|mailer|notifica|alerts?|bounce)/i;

// mensagens: [{ de, para, cc, data, texto }] (cabeçalhos crus do Gmail).
// Devolve as pessoas do domínio, com quantas trocas, a mais recente e o celular da assinatura.
export function contatosDoGmail(mensagens, dominio, euEmail) {
  const doms = (Array.isArray(dominio) ? dominio : [dominio]).map(x => String(x || '').toLowerCase()).filter(Boolean);
  const eu = String(euEmail || '').toLowerCase();
  const pess = new Map();
  for (const m of (mensagens || [])) {
    const remet = lerEnderecos(m.de);
    const todos = remet.concat(lerEnderecos(m.para), lerEnderecos(m.cc));
    for (const a of todos) {
      const d = a.email.split('@')[1] || '';
      if (!doms.some(dom => d === dom || d.endsWith('.' + dom))) continue;
      if (a.email === eu || NAO_PESSOA.test(a.email.split('@')[0])) continue;
      const p = pess.get(a.email) || { email: a.email, nome: '', trocas: 0, ultima: null, wa: null, escreveu: false };
      if (a.nome && !/@/.test(a.nome) && a.nome.length > p.nome.length) p.nome = a.nome;
      p.trocas++;
      const dt = m.data ? new Date(m.data) : null;
      if (dt && !isNaN(dt) && (!p.ultima || dt > new Date(p.ultima))) p.ultima = dt.toISOString();
      if (remet.some(r => r.email === a.email)) { p.escreveu = true; if (!p.wa) p.wa = acharCelular(semCitacao(m.texto)); }
      pess.set(a.email, p);
    }
  }
  return [...pess.values()].map(p => Object.assign(p, { nome: p.nome || nomeDoEmail(p.email) }))
    .sort((a, b) => (b.escreveu - a.escreveu) || (b.trocas - a.trocas) || String(b.ultima).localeCompare(String(a.ultima)));
}

export function buscaGmail(dominio) {
  const doms = (Array.isArray(dominio) ? dominio : [dominio]).filter(Boolean);
  return doms.length ? '(' + doms.map(d => `from:${d} OR to:${d} OR cc:${d}`).join(' OR ') + ') newer_than:3y' : null;
}

export function linkLinkedin(empresaNome) {
  return 'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(String(empresaNome || '').replace(/\b(s\.?\s?a\.?|ltda\.?|inc\.?)\b/gi, '').trim() + ' marketing');
}

// Decodifica o corpo (base64url) de um payload do Gmail: primeiro text/plain.
export function textoDoPayload(payload) {
  const dec = (s) => { try { return Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch (_) { return ''; } };
  const fila = [payload]; let html = '';
  while (fila.length) {
    const p = fila.shift(); if (!p) continue;
    if (p.mimeType === 'text/plain' && p.body && p.body.data) return dec(p.body.data);
    if (p.mimeType === 'text/html' && p.body && p.body.data && !html) html = dec(p.body.data).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
    for (const c of (p.parts || [])) fila.push(c);
  }
  return html;
}
