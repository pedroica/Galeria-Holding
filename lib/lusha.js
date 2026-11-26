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
  const emails = d && Array.isArray(d.emailAddresses) ? d.emailAddresses : [];
  const fones = d && Array.isArray(d.phoneNumbers) ? d.phoneNumbers : [];
  // Não achou: sem data, ou erro (EMPTY_DATA) com data vazia. Teste real 26/11: o Lusha manda
  // {error:{name:'EMPTY_DATA'}, data:{}} e isso era contado como "achou".
  if (!d || (c.error && !emails.length && !fones.length && !(d.jobTitle && d.jobTitle.title))) {
    return { achou: false, erro: (c && c.error && (c.error.message || c.error.name || c.error.code)) || 'não encontrado', erroNome: c && c.error && (c.error.name || c.error.code) || null, cobrado: !!(c && c.isCreditCharged) };
  }
  // Formato real (26/11): emailAddresses[].{email, emailType}; a documentação dizia {address, type}. Aceita os dois.
  const endereco = (e) => e && (e.email || e.address || e.emailAddress) || '';
  const tipoEmail = (e) => e && (e.emailType || e.type) || '';
  const numero = (f) => f && (f.number || f.internationalNumber || f.phoneNumber || f.phone || f.localizedNumber) || '';
  const cel = fones.find(f => /mobile|cel/i.test(f.phoneType || f.type || '')) || fones[0];
  const dom = d.company && d.company.domains ? (d.company.domains.homepage || d.company.domains.email) : null;
  return {
    achou: true, cobrado: !!c.isCreditCharged, fonesBrutos: fones.length,
    email: endereco(emails.find(e => /work/i.test(tipoEmail(e)) && endereco(e)) || emails.find(endereco)),
    celular: cel ? normalizarCelular(numero(cel)) : '',
    cargo: (d.jobTitle && d.jobTitle.title) || '',
    linkedin: (d.socialLinks && d.socialLinks.linkedin) || '',
    site: dom || '', empresa: d.company && d.company.name || ''
  };
}

// Consulta uma pessoa. fetchFn injetável (testes). Pausa entre chamadas é do chamador.
export async function pessoaLusha({ fetchFn = fetch, chave, nome, empresa, dominio, linkedin, email, celular = false }) {
  if (!chave) return { achou: false, erro: 'sem chave do Lusha' };
  // Ordem (teste real 26/11): nome + empresa é a busca que traz e-mail; pelo LinkedIn
  // o Lusha devolveu perfil sem e-mail. LinkedIn e e-mail ficam como alternativa.
  const consultas = [];
  const { primeiro, ultimo } = separarNome(nome);
  if (primeiro && ultimo && (empresa || dominio)) {
    const q = new URLSearchParams({ firstName: primeiro, lastName: ultimo });
    if (dominio) q.set('companyDomain', dominio); else q.set('companyName', empresa);
    consultas.push(q);
  }
  if (linkedin) consultas.push(new URLSearchParams({ linkedinUrl: linkedin }));
  if (email) consultas.push(new URLSearchParams({ email }));
  if (!consultas.length) return { achou: false, erro: !primeiro || !ultimo ? 'precisa de nome e sobrenome' : 'precisa da empresa' };
  let melhor = null; const diag = [];
  for (const q of consultas) {
    q.set('revealEmails', 'true'); q.set('revealPhones', celular ? 'true' : 'false');
    let p = await consultar(fetchFn, chave, q);
    const modo = q.has('linkedinUrl') ? 'linkedin' : q.has('email') ? 'email' : q.has('companyDomain') ? 'nome+dominio' : 'nome+empresa';
    diag.push({ modo, status: p.status || 200, erro: p.erroNome || null, cobrado: !!p.cobrado, emails: p.email ? 1 : 0 });
    // A 1ª consulta de quem o Lusha ainda não processou volta PARCIAL (sem e-mail, sem
    // cobrar); a 2ª traz o e-mail. Veio assim → espera e consulta de novo, uma vez.
    if (p.achou && !p.email && !p.cobrado) {
      await new Promise(ok => setTimeout(ok, esperaRetentativaMs));
      const p2 = await consultar(fetchFn, chave, q);
      diag.push({ modo: 'repetida', status: p2.status || 200, erro: p2.erroNome || null, cobrado: !!p2.cobrado, emails: p2.email ? 1 : 0 });
      if (p2.achou) p = Object.assign(p2, { linkedin: p2.linkedin || p.linkedin, cargo: p2.cargo || p.cargo, retentou: true });
    }
    if ([402, 403, 429].includes(p.status)) return Object.assign(p, { diag });
    if (!melhor || (p.achou && (!melhor.achou || (p.email && !melhor.email)))) melhor = Object.assign({}, p, { creditos: (melhor && melhor.creditos || 0) + (p.creditos || 0) });
    else melhor.creditos = (melhor.creditos || 0) + (p.creditos || 0);
    if (p.email && (!celular || p.celular)) break;   // já tem o que foi pedido
  }
  return Object.assign(melhor, { diag });
}
export let esperaRetentativaMs = 2500;
export function _esperaRetentativa(ms) { esperaRetentativaMs = ms; }   // testes

async function consultar(fetchFn, chave, q) {
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
  // Conta o que o Lusha COBROU, não o que conseguimos ler (teste real 26/11: leitura falhou,
  // nada foi somado e o teto de 8/dia não segurou). Cobrou = pelo menos o e-mail (1); celular
  // pedido e devolvido = +5.
  p.creditos = p.cobrado ? CUSTO.email + (q.get('revealPhones') === 'true' && (p.fonesBrutos || 0) > 0 ? CUSTO.celular : 0) : 0;
  return p;
}
