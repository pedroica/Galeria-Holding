// lib/captura.js — cadastro rápido: texto livre, planilha, PDF ou foto viram
// pessoas e empresas, achando o que já existe na base. Parte pura e testável.
// Ex.: "fui num evento, o João Lopes é CMO do Lopes Supermercado".

export const SCHEMA_CAPTURA = {
  type: 'object',
  properties: {
    pessoas: { type: 'array', items: { type: 'object', properties: {
      nome: { type: 'string' }, cargo: { type: 'string' }, empresa: { type: 'string' },
      email: { type: 'string' }, celular: { type: 'string' }, linkedin: { type: 'string' }, observacao: { type: 'string' }
    }, required: ['nome', 'cargo', 'empresa', 'email', 'celular', 'linkedin', 'observacao'], additionalProperties: false } }
  },
  required: ['pessoas'], additionalProperties: false
};

export function promptCaptura() {
  return [
    'Você extrai contatos comerciais (pessoa + empresa) de anotações, listas de evento, planilhas, cartões de visita e PDFs, para o CRM de um grupo de agências de comunicação no Brasil.',
    'Para cada pessoa encontrada devolva: nome completo, cargo, empresa, e-mail, celular, LinkedIn e uma observação curta (onde conheceu, contexto). Campo que não aparece: "".',
    'Copie só o que está escrito. Não invente e-mail, telefone nem cargo. Não complete sobrenome.',
    'Se aparecer só a empresa (sem pessoa), devolva nome "" com a empresa preenchida.',
    'Ignore a própria Galeria Holding e suas agências (Galeria, Milà, 404, cccaramelo, GAIA, Catalyst, Mantiqueira, A.gente, Vitrine, GUX, Frame, Ateliê, Studio GA) e quem é dela.'
  ].join('\n');
}

const SUFIXOS = /\b(s\/?a|ltda|me|eireli|epp|cia|companhia|ind(ustria)?|com(ercio)?|e|de|do|da|dos|das|group|grupo|holding|brasil|brazil|the|inc|corp)\b/g;
export function normalizarEmpresa(n) {
  return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bs\s*[./]?\s*a\b\.?/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(SUFIXOS, ' ').replace(/\s+/g, ' ').trim();
}
const tokens = (n) => normalizarEmpresa(n).split(' ').filter(t => t.length > 1);

// Acha a empresa da base. Igual normalizado = certeza; senão todos os tokens do
// nome digitado contidos no da base (ou vice-versa) com pelo menos 1 token forte.
export function casarEmpresa(nome, empresas) {
  const alvo = normalizarEmpresa(nome); if (!alvo) return null;
  const ta = tokens(nome);
  let melhor = null;
  for (const e of (empresas || [])) {
    const ne = normalizarEmpresa(e.nome); if (!ne) continue;
    if (ne === alvo) return { empresa: e, confianca: 'alta' };
    const te = tokens(e.nome);
    const contem = (a, b) => a.length && a.every(t => b.includes(t));
    if ((contem(ta, te) || contem(te, ta)) && Math.min(ta.length, te.length) >= 1 && ta.concat(te).some(t => t.length >= 4)) {
      const score = Math.min(ta.length, te.length) / Math.max(ta.length, te.length);
      if (!melhor || score > melhor.score) melhor = { empresa: e, confianca: score >= .5 ? 'media' : 'baixa', score };
    }
  }
  return melhor ? { empresa: melhor.empresa, confianca: melhor.confianca } : null;
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Acha a pessoa: por e-mail; senão mesmo nome na mesma empresa.
export function casarPessoa(p, decisores, empresaId) {
  const em = String(p.email || '').toLowerCase().trim();
  if (em) { const d = (decisores || []).find(x => String(x.email || '').toLowerCase().trim() === em); if (d) return d; }
  const nm = semAcento(p.nome); if (!nm || !empresaId) return null;
  return (decisores || []).find(x => x.empresa_id === empresaId && semAcento(x.nome) === nm) || null;
}

// Celular brasileiro no formato do CRM (55 + DDD + número), ou '' se não parecer celular.
export function normalizarCelular(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return '';
  return d;
}
export function separarNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return { primeiro: partes[0] || '', ultimo: partes.length > 1 ? partes[partes.length - 1] : '' };
}
