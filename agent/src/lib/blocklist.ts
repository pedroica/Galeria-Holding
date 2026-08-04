// Motor de matching da blocklist (Módulo 0).
//
// Uma empresa/contato é bloqueado se casar por:
//   1. domínio        — email/site sob um domínio da entrada (ou subdomínio)
//   2. nome           — alias casa como sequência contígua de tokens no nome
//   3. grupo econômico — mesma lógica de domínio/nome via campo economicGroup
//
// Guardas contra falso-positivo:
//   · alias de 1 token puramente numérico ou <=2 chars (ex: "99") só casa
//     quando é o NOME INTEIRO — evita bloquear "Loja 99 Variedades".
//   · matching por token inteiro, nunca substring — evita "natura" casar
//     "Naturalle".

import type {
  BlocklistEntry,
  BlockCheckInput,
  BlockResult,
  BlockReason,
} from "../types.ts";
import { nameTokens, domainMatches, normalizeName } from "./normalize.ts";

function isShortOrNumeric(token: string): boolean {
  return token.length <= 2 || /^\d+$/.test(token);
}

/** aliasTokens aparece como sub-sequência contígua em nameTokens? */
function tokensContain(nameToks: string[], aliasToks: string[]): boolean {
  if (aliasToks.length === 0) return false;

  // Guarda: alias de 1 token curto/numérico → exige que seja o nome inteiro.
  if (aliasToks.length === 1 && isShortOrNumeric(aliasToks[0])) {
    return nameToks.length === 1 && nameToks[0] === aliasToks[0];
  }

  for (let i = 0; i + aliasToks.length <= nameToks.length; i++) {
    let hit = true;
    for (let j = 0; j < aliasToks.length; j++) {
      if (nameToks[i + j] !== aliasToks[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

export class BlocklistMatcher {
  private entries: BlocklistEntry[];
  // cache de tokens dos aliases por entrada
  private aliasTokenCache = new Map<string, string[][]>();

  constructor(entries: BlocklistEntry[]) {
    this.entries = entries.filter((e) => e.active !== false);
    for (const e of this.entries) {
      const names = [e.canonicalName, ...(e.aliases || [])];
      if (e.economicGroup) names.push(e.economicGroup);
      const toks = names
        .map((n) => nameTokens(n))
        .filter((t) => t.length > 0);
      this.aliasTokenCache.set(e.id, toks);
    }
  }

  /** Checa uma entrada de empresa/contato. Retorna o primeiro bloqueio. */
  check(input: BlockCheckInput): BlockResult {
    const domainCandidates: string[] = [];
    if (input.domain) domainCandidates.push(input.domain);
    if (input.email) domainCandidates.push(input.email); // normalizeDomain extrai o domínio

    const nameToks = input.name ? nameTokens(input.name) : [];

    for (const e of this.entries) {
      // 1/3. domínio (inclui domínios do grupo econômico, guardados em e.domains)
      for (const cand of domainCandidates) {
        for (const bd of e.domains || []) {
          if (domainMatches(cand, bd)) {
            return this.hit(e, "domain", bd);
          }
        }
      }
      // 2/3. nome / grupo econômico
      if (nameToks.length > 0) {
        const aliasTokLists = this.aliasTokenCache.get(e.id) || [];
        for (const aliasToks of aliasTokLists) {
          if (tokensContain(nameToks, aliasToks)) {
            const reason: BlockReason =
              e.economicGroup &&
              normalizeName(aliasToks.join(" ")) ===
                normalizeName(e.economicGroup)
                ? "economic_group"
                : "name";
            return this.hit(e, reason, aliasToks.join(" "));
          }
        }
      }
    }
    return { blocked: false };
  }

  /** Conveniência: true/false. */
  isBlocked(input: BlockCheckInput): boolean {
    return this.check(input).blocked;
  }

  private hit(e: BlocklistEntry, reason: BlockReason, matched: string): BlockResult {
    return {
      blocked: true,
      entryId: e.id,
      entryName: e.canonicalName,
      reason,
      matched,
    };
  }
}
