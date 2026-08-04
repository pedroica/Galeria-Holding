// Orquestrador de enriquecimento (Fase 1).
// Pipeline por empresa, com dependências injetadas (testável sem rede):
//   1. blocklist ANTES do Lusha (não gasta crédito em cliente)
//   2. busca decisores (Lusha) → ranqueia o de marketing
//   3. dry run → só mostra o candidato (0 crédito) OU revela (gasta)
//   4. valida (email genérico fora, celular +55) e deduplica (email E telefone)
//   5. respeita orçamento de créditos do dia
//
// A verdade fica aqui (testável); o worker do Railway injeta as chamadas reais
// do Lusha e a escrita no Supabase.

import type { Company, BlockResult } from "../types.ts";
import type { BlocklistMatcher } from "../lib/blocklist.ts";
import {
  rankMarketingDecisionMaker,
  type LushaDecisionMaker,
} from "../lib/lusha-rank.ts";
import { isGenericEmail, normalizePhoneBR, normalizeDomain } from "../lib/normalize.ts";

export type EnrichStatus =
  | "blocked"
  | "no_company"
  | "no_decision_maker"
  | "duplicate"
  | "needs_review"
  | "enriched"
  | "dry_run"
  | "limit_reached";

export interface RevealResult {
  email?: string | null;
  phone?: string | null;
}

export interface EnrichDeps {
  blocklist: BlocklistMatcher;
  // Retorna os decisores da empresa (Lusha decision-makers; NÃO gasta crédito).
  fetchDecisionMakers: (domain: string) => Promise<LushaDecisionMaker[]>;
  // Revela email/telefone do decisor (GASTA crédito). Só chamado fora do dry run.
  revealContact: (dmId: string, fields: ("emails" | "phones")[]) => Promise<RevealResult>;
  // Dedupe absoluto acumulado (email E telefone).
  seenEmails: Set<string>;
  seenPhones: Set<string>;
}

export interface EnrichOptions {
  dryRun?: boolean; // default true — nada é revelado/gasto
  revealPhone?: boolean; // gastar 5 créditos p/ telefone (default false)
  preferCountry?: string; // default "Brazil"
  creditsRemaining?: number; // orçamento restante de créditos hoje
}

export interface EnrichedContact {
  companyName: string;
  companyDomain?: string;
  fullName: string;
  title: string;
  email: string | null;
  phoneE164: string | null;
  linkedinUrl: string | null;
  segmento?: string;
  tier: string;
  dataQuality: "ok" | "incomplete";
  needsReview: boolean;
}

export interface EnrichResult {
  status: EnrichStatus;
  company: Company;
  reason?: string;
  block?: BlockResult;
  creditsSpent: number;
  contact?: EnrichedContact;
  // preview no dry run (sem revelar)
  candidate?: {
    name: string;
    title: string;
    tier: string;
    linkedin?: string;
    canRevealEmail: boolean;
    canRevealPhone: boolean;
  };
}

export async function enrichCompany(
  company: Company,
  deps: EnrichDeps,
  opts: EnrichOptions = {},
): Promise<EnrichResult> {
  const dryRun = opts.dryRun ?? true;
  const domain = company.domain ? normalizeDomain(company.domain) : undefined;

  // 1. Blocklist ANTES do Lusha (economiza crédito)
  const block = deps.blocklist.check({ name: company.name, domain });
  if (block.blocked) {
    return {
      status: "blocked",
      company,
      block,
      reason: `${block.entryName} (${block.reason})`,
      creditsSpent: 0,
    };
  }

  // 2. Decisores
  if (!domain) return { status: "no_company", company, reason: "sem domínio", creditsSpent: 0 };
  const dms = await deps.fetchDecisionMakers(domain);
  if (!dms || dms.length === 0) {
    return { status: "no_company", company, reason: "empresa/decisores não encontrados", creditsSpent: 0 };
  }

  // 3. Ranqueia o decisor de marketing
  const best = rankMarketingDecisionMaker(dms, { preferCountry: opts.preferCountry });
  if (!best) {
    return { status: "no_decision_maker", company, reason: "nenhum decisor de marketing", creditsSpent: 0 };
  }

  const dm = best.dm;
  const fullName = [dm.firstName, dm.lastName].filter(Boolean).join(" ").trim();
  const linkedin = dm.socialLinks?.linkedin ?? null;
  const canEmail =
    (dm.canReveal || []).some((r) => r.field === "emails") || (dm.has || []).includes("emails");
  const canPhone =
    (dm.canReveal || []).some((r) => r.field === "phones") || (dm.has || []).includes("phones");

  // 4. DRY RUN — só mostra, não gasta
  if (dryRun) {
    return {
      status: "dry_run",
      company,
      creditsSpent: 0,
      candidate: {
        name: fullName,
        title: dm.jobTitle?.title || "",
        tier: best.tier,
        linkedin: linkedin || undefined,
        canRevealEmail: canEmail,
        canRevealPhone: canPhone,
      },
    };
  }

  // 5. Orçamento de créditos (email=1, telefone=5)
  const wantPhone = !!opts.revealPhone && canPhone;
  const cost = (canEmail ? 1 : 0) + (wantPhone ? 5 : 0);
  if (opts.creditsRemaining != null && cost > opts.creditsRemaining) {
    return {
      status: "limit_reached",
      company,
      reason: `custo ${cost} > créditos restantes ${opts.creditsRemaining}`,
      creditsSpent: 0,
    };
  }

  // 6. Revela (gasta crédito)
  const fields: ("emails" | "phones")[] = [];
  if (canEmail) fields.push("emails");
  if (wantPhone) fields.push("phones");
  const revealed = fields.length ? await deps.revealContact(dm.id, fields) : {};

  // 7. Valida
  let email = revealed.email ? revealed.email.toLowerCase().trim() : null;
  if (email && isGenericEmail(email)) email = null; // descarta contato@, marketing@...
  const phoneE164 = revealed.phone ? normalizePhoneBR(revealed.phone) : null;

  // 8. Dedupe absoluto por email E telefone
  if (email && deps.seenEmails.has(email)) {
    return { status: "duplicate", company, reason: `email já existe: ${email}`, creditsSpent: cost };
  }
  if (phoneE164 && deps.seenPhones.has(phoneE164)) {
    return { status: "duplicate", company, reason: "telefone já existe", creditsSpent: cost };
  }

  const needsReview = !email; // sem email corporativo válido → revisar antes de abordar
  const contact: EnrichedContact = {
    companyName: company.name,
    companyDomain: domain,
    fullName,
    title: dm.jobTitle?.title || "",
    email,
    phoneE164,
    linkedinUrl: linkedin,
    segmento: company.segmento,
    tier: best.tier,
    dataQuality: needsReview ? "incomplete" : "ok",
    needsReview,
  };
  if (email) deps.seenEmails.add(email);
  if (phoneE164) deps.seenPhones.add(phoneE164);

  return { status: needsReview ? "needs_review" : "enriched", company, contact, creditsSpent: cost };
}

export interface EnrichSummary {
  total: number;
  creditsSpent: number;
  byStatus: Record<string, number>;
}

/** Roda o enriquecimento em lote, respeitando o orçamento de créditos do dia. */
export async function runEnrichment(
  companies: Company[],
  deps: EnrichDeps,
  opts: EnrichOptions = {},
): Promise<{ results: EnrichResult[]; summary: EnrichSummary }> {
  let creditsRemaining = opts.creditsRemaining ?? Number.POSITIVE_INFINITY;
  const results: EnrichResult[] = [];
  const byStatus: Record<string, number> = {};
  let creditsSpent = 0;

  for (const c of companies) {
    const r = await enrichCompany(c, deps, { ...opts, creditsRemaining });
    creditsRemaining -= r.creditsSpent;
    creditsSpent += r.creditsSpent;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    results.push(r);
    if (r.status === "limit_reached") break; // estourou orçamento → para (e avisa)
  }

  return { results, summary: { total: companies.length, creditsSpent, byStatus } };
}
