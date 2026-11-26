// lib/mac-sync.js — regras do depósito de WhatsApp e Contatos do Mac do Pedro (26/11).
// O programa no Mac (agente-mac/sync-mac.mjs) lê o WhatsApp do Mac e os Contatos e manda
// para api/enrich?provider=mac-sync. Tudo é guardado; só contato de TRABALHO vira pessoa
// no CRM (crm_decisores, status 'sugerido', fonte 'agenda'). Parte pura.

import { normalizarEmpresa, normalizarCelular, casarEmpresa } from './captura.js';

const GENERICOS = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|mac|uol|bol|terra|ig|msn|aol|proton|protonmail|globo|globomail|r7|yahoo\.com)\./i;
export const AGENCIAS_GRUPO = ['Galeria', 'Galeria Holding', 'Milà', 'Mila', '404', 'cccaramelo', 'GAIA', 'Catalyst', 'Mantiqueira', 'A.gente', 'Vitrine', 'GUX', 'Frame', 'Ateliê', 'Studio GA'];

// Chave de telefone que casa 9º dígito ou não, com ou sem +55: DDD + 8 últimos dígitos.
export function chaveTelefone(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return d.slice(0, 2) + d.slice(-8);
}
export function telefoneDoJid(jid) {
  const m = String(jid || '').match(/^(\d{10,15})@s\.whatsapp\.net$/);
  return m ? m[1] : null;
}
export function tipoConversa(jid, sessao) {
  const j = String(jid || '');
  if (/@g\.us$/.test(j)) return 'grupo';
  if (/@broadcast$/.test(j)) return 'lista';
  if (/status/.test(j)) return 'status';
  if (/@(s\.whatsapp\.net|lid)$/.test(j)) return 'pessoa';
  return 'outro';
}
const MIDIA = { 1: '[imagem]', 2: '[vídeo]', 3: '[áudio]', 4: '[contato]', 5: '[localização]', 8: '[documento]', 11: '[GIF]', 15: '[figurinha]', 14: '[mensagem apagada]', 46: '[enquete]' };
export function midiaDoTipo(tipo, texto) { return texto ? null : (MIDIA[tipo] || '[mídia]'); }

const dominio = (email) => String(email || '').toLowerCase().split('@')[1] || '';
export function emailCorporativo(email) { const d = dominio(email); return !!d && !GENERICOS.test(d); }
export function ehDoGrupo(org, emails) {
  const n = normalizarEmpresa(org);
  if (n && (/^galeria\b/.test(n) || AGENCIAS_GRUPO.some(a => normalizarEmpresa(a) === n))) return true;
  return (emails || []).some(e => /galeria/.test(dominio(e)));
}
// interno = gente das agências do grupo; trabalho = tem empresa ou e-mail corporativo; resto, pessoal.
export function categoriaContato(c) {
  if (ehDoGrupo(c.empresa, c.emails)) return 'interno';
  if (String(c.empresa || '').trim().length >= 2 || (c.emails || []).some(emailCorporativo)) return 'trabalho';
  return 'pessoal';
}

// Acha a empresa do contato na base: pelo nome da empresa ou pelo domínio do e-mail.
export function empresaDoContato(c, empresas) {
  if (c.empresa) { const m = casarEmpresa(c.empresa, empresas); if (m && m.confianca !== 'baixa') return m.empresa; }
  const doms = (c.emails || []).filter(emailCorporativo).map(dominio);
  if (doms.length) {
    const limpa = (v) => String(v || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const e = (empresas || []).find(x => doms.includes(limpa(x.dominio)) || doms.includes(limpa(x.website)) || doms.includes(limpa(x.site)));
    if (e) return e;
  }
  return null;
}

// Pessoa já existente no CRM: telefone (qualquer) ou e-mail.
export function indicePessoas(decisores) {
  const porTel = new Map(), porEmail = new Map();
  for (const d of (decisores || [])) {
    const k = chaveTelefone(d.wa); if (k && !porTel.has(k)) porTel.set(k, d);
    const e = String(d.email || '').toLowerCase().trim(); if (e && !porEmail.has(e)) porEmail.set(e, d);
  }
  return { porTel, porEmail };
}
export function acharPessoa(c, idx) {
  for (const t of (c.telefones || [])) { const k = chaveTelefone(t); if (k && idx.porTel.has(k)) return idx.porTel.get(k); }
  for (const e of (c.emails || [])) { const d = idx.porEmail.get(String(e).toLowerCase().trim()); if (d) return d; }
  return null;
}
// Celular para o campo wa: o primeiro telefone que parece celular (9 dígitos depois do DDD).
export function celularPrincipal(telefones) {
  for (const t of (telefones || [])) { const n = normalizarCelular(t); if (n && n.length === 13 && n[4] === '9') return n; }
  return null;
}
export function nomeCompleto(c) { return [c.nome, c.sobrenome].filter(Boolean).join(' ').trim() || c.apelido || null; }
