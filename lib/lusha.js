// lib/lusha.js — enriquecer UMA pessoa no Lusha pelo nome + empresa (API v2
// /person) e controlar o teto diário de créditos. Usado pelo cadastro rápido e pelo
// enriquecimento diário. Preço (conta, 26/11): e-mail = 1 crédito, celular = 5.
// Por padrão só o e-mail é revelado; celular só quando pedido (custa 5x).

import { separarNome, normalizarCelular } from './captura.js';

export const CUSTO = { email: 1, celular: 5 };

// Teto do dia: { data: 'AAAA-MM-DD', usados: n } em crm_configuracoes.lusha_creditos_dia.
export function saldoDoDia(registro, hojeStr, teto) {
  const usados = registro && registro.data === hojeStr ? Number(registro.usados) || 0 : 0;
  return { usados, restantes: Math.max(0, (Number(teto) || 0) - usados) };
}
export function custoPrevisto({ celular }) { return CUSTO.email + (celular ? CUSTO.celular : 0); }

// Lê a resposta da v2 /person (formato documentado: contact.data.{emailAddresses,phoneNumbers,jobTitle,socialLinks,company}).
export function lerPessoaV2(j) {
  const c = j && (j.contact || j);
  const d = c && c.data;
  if (!d) return { achou: false, erro: (c && c.error && (c.error.message || c.error.code)) || 'não encontrado', cobrado: !!(c && c.isCreditCharged) };
  const emails = Array.isArray(d.emailAddresses) ? d.emailAddresses : [];
  const fones = Array.isArray(d.phoneNumbers) ? d.phoneNumbers : [];
  const cel = fones.find(f => /mobile|cel/i.test(f.phoneType || '')) || fones[0];
  const dom = d.company && d.company.domains ? (d.company.domains.homepage || d.company.domains.email) : null;
  return {
    achou: true, cobrado: !!c.isCreditCharged,
    email: (emails.find(e => /work/i.test(e.type || '')) || emails[0] || {}).address || '',
    celular: cel ? normalizarCelular(cel.number) : '',
    cargo: (d.jobTitle && d.jobTitle.title) || '',
    linkedin: (d.socialLinks && d.socialLinks.linkedin) || '',
    site: dom || '', empresa: d.company && d.company.name || ''
  };
}

// Consulta uma pessoa. fetchFn injetável (testes). Pausa entre chamadas é do chamador.
export async function pessoaLusha({ fetchFn = fetch, chave, nome, empresa, dominio, linkedin, email, celular = false }) {
  if (!chave) return { achou: false, erro: 'sem chave do Lusha' };
  const q = new URLSearchParams();
  if (linkedin) q.set('linkedinUrl', linkedin);
  else if (email) q.set('email', email);
  else {
    const { primeiro, ultimo } = separarNome(nome);
    if (!primeiro || !ultimo) return { achou: false, erro: 'precisa de nome e sobrenome' };
    if (!empresa && !dominio) return { achou: false, erro: 'precisa da empresa' };
    q.set('firstName', primeiro); q.set('lastName', ultimo);
    if (dominio) q.set('companyDomain', dominio); else q.set('companyName', empresa);
  }
  q.set('revealEmails', 'true'); q.set('revealPhones', celular ? 'true' : 'false');
  let r;
  try { r = await fetchFn('https://api.lusha.com/v2/person?' + q.toString(), { headers: { api_key: chave } }); }
  catch (e) { return { achou: false, erro: 'rede: ' + e.message }; }
  if (r.status === 403) return { achou: false, erro: 'o plano do Lusha não aceita revelar só e-mail ou só celular', status: 403 };
  if (r.status === 429) return { achou: false, erro: 'limite de velocidade do Lusha: tente em 1 minuto', status: 429 };
  if (r.status === 402) return { achou: false, erro: 'sem créditos no Lusha', status: 402 };
  const j = await r.json().catch(() => null);
  if (!r.ok && r.status !== 404) return { achou: false, erro: 'Lusha ' + r.status, status: r.status };
  const p = lerPessoaV2(j);
  // Créditos gastos: e-mail (1) e celular (5) só quando vieram e houve cobrança.
  p.creditos = p.cobrado ? (p.email ? CUSTO.email : 0) + (p.celular ? CUSTO.celular : 0) : 0;
  return p;
}
