// lib/blocklist.js — matcher da blocklist de prospecção (server-side).
// Usado por api/fila.js para nunca gerar item para empresa/e-mail bloqueado.
// Lógica espelha block_blocklist.js (frontend) e agent/src/lib/blocklist.ts (testado).
//
// Regras:
//   1. domínio  — e-mail/site sob um domínio da entrada (ou subdomínio)
//   2. nome     — alias casa como sequência contígua de tokens no nome
//   3. grupo econômico — idem, via campo grupo_economico
// Guardas: alias de 1 token curto/numérico (ex "99") só casa o NOME inteiro;
// match por token inteiro, nunca substring (ex "natura" não casa "Naturalle").

const STOP = new Set(['de','da','do','das','dos','e','the','s','a','ltda','sa','eireli','me','epp','mei']);

function stripAcc(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function normName(s) {
  return stripAcc((s || '').toLowerCase()).replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function toks(s) { return normName(s).split(' ').filter(t => t && !STOP.has(t)); }
function normDom(s) {
  let d = (s || '').trim().toLowerCase();
  if (!d) return '';
  if (d.includes('@')) d = d.split('@').pop();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return d.split('/')[0].split('?')[0].split('#')[0].split(':')[0].trim();
}
function domMatch(dom, blk) {
  const d = normDom(dom), b = normDom(blk);
  if (!d || !b) return false;
  return d === b || d.endsWith('.' + b);
}
function shortNum(t) { return t.length <= 2 || /^\d+$/.test(t); }
function tokContain(nameT, aliasT) {
  if (!aliasT.length) return false;
  if (aliasT.length === 1 && shortNum(aliasT[0])) return nameT.length === 1 && nameT[0] === aliasT[0];
  for (let i = 0; i + aliasT.length <= nameT.length; i++) {
    let ok = true;
    for (let j = 0; j < aliasT.length; j++) { if (nameT[i + j] !== aliasT[j]) { ok = false; break; } }
    if (ok) return true;
  }
  return false;
}

// Normaliza uma linha de crm_blocklist (nome_canonico/aliases/dominios/grupo_economico)
function prepEntry(e) {
  const names = [e.nome_canonico].concat(e.aliases || []);
  if (e.grupo_economico) names.push(e.grupo_economico);
  return {
    nome: e.nome_canonico,
    tokLists: names.map(toks).filter(t => t.length > 0),
    dominios: e.dominios || [],
  };
}

/**
 * Cria um matcher a partir das linhas de crm_blocklist (apenas ativas).
 * check({name, domain, email}) → { blocked, entryName, reason, matched } | {blocked:false}
 */
export function makeBlocklist(rows) {
  const entries = (rows || []).filter(e => e && e.ativo !== false && !e.apagado_em).map(prepEntry);
  function check(input) {
    const cands = [];
    if (input.domain) cands.push(input.domain);
    if (input.email) cands.push(input.email);
    const nameT = input.name ? toks(input.name) : [];
    for (const e of entries) {
      for (const c of cands) {
        for (const bd of e.dominios) {
          if (domMatch(c, bd)) return { blocked: true, entryName: e.nome, reason: 'domain', matched: bd };
        }
      }
      if (nameT.length) {
        for (const at of e.tokLists) {
          if (tokContain(nameT, at)) return { blocked: true, entryName: e.nome, reason: 'name', matched: at.join(' ') };
        }
      }
    }
    return { blocked: false };
  }
  return { check, isBlocked: (i) => check(i).blocked, size: entries.length };
}

// exports auxiliares (teste)
export { normName, normDom, domMatch };
