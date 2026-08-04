// Ranqueador do decisor de MARKETING (Fase 1).
// Prioridade do brief: CMO > VP Marketing > Diretor(a) de Marketing >
// Head de Marketing > Gerente Sênior de Marketing.
// Opera sobre a resposta do Lusha decision-makers (jobTitle.{title,departments,
// seniority}). Desempate: país preferido (BR), ter email, depto puro de Marketing.

export interface LushaJobTitle {
  title: string;
  departments?: string[];
  seniority?: string; // "C-Suite" | "Vice President" | "Director" | "Manager" | "Non-Manager"
}
export interface LushaDecisionMaker {
  id: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: LushaJobTitle;
  company?: { name?: string; domain?: string; industry?: string };
  location?: { country?: string; state?: string; city?: string };
  socialLinks?: { linkedin?: string };
  has?: string[];
  canReveal?: { field: string; credits: number }[];
}

export interface RankedDecisionMaker {
  dm: LushaDecisionMaker;
  score: number;
  tier: string; // CMO | VP | Diretor | Head | Gerente Sênior | Gerente | Marketing
}

const MKT_KEYWORDS = [
  "marketing", "brand", "branding", "comunica", "communication", "growth",
  "mídia", "midia", "media", "publicidade", "propaganda", "digital marketing",
];

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** O contato tem alguma cara de marketing? (depto Marketing ou título com keyword) */
export function isMarketing(dm: LushaDecisionMaker): boolean {
  const depts = (dm.jobTitle?.departments || []).map(norm);
  if (depts.includes("marketing")) return true;
  const title = norm(dm.jobTitle?.title || "");
  return MKT_KEYWORDS.some((k) => title.includes(norm(k)));
}

function tierAndBase(dm: LushaDecisionMaker): { tier: string; base: number } {
  const title = norm(dm.jobTitle?.title || "");
  const sen = norm(dm.jobTitle?.seniority || "");
  const isHead = /\bhead\b/.test(title);
  const isDirectorWord = /\bdirector\b|\bdiretor/.test(title);

  // CMO / Chief Marketing
  if (/chief marketing officer|\bcmo\b/.test(title)) return { tier: "CMO", base: 100 };
  if (sen === "c-suite") return { tier: "CMO", base: 95 };
  // VP Marketing
  if (sen === "vice president" || /\bvp\b|vice president|vice-presidente/.test(title))
    return { tier: "VP", base: 80 };
  // Diretor de Marketing (título "director/diretor" explícito)
  if (isDirectorWord && !isHead) return { tier: "Diretor", base: 62 };
  // Head de Marketing (Lusha costuma marcar Head como seniority Director)
  if (isHead) return { tier: "Head", base: 52 };
  if (sen === "director") return { tier: "Diretor", base: 60 };
  // Gerente Sênior / Gerente
  if (sen === "manager" || /\bmanager\b|gerente/.test(title)) {
    if (/senior|sênior|senior manager|gerente s/.test(title))
      return { tier: "Gerente Sênior", base: 32 };
    return { tier: "Gerente", base: 20 };
  }
  return { tier: "Marketing", base: 10 };
}

export interface RankOptions {
  preferCountry?: string; // ex: "Brazil"
}

/** Ranqueia e retorna o melhor decisor de marketing (ou null se não houver). */
export function rankMarketingDecisionMaker(
  decisionMakers: LushaDecisionMaker[],
  opts: RankOptions = {},
): RankedDecisionMaker | null {
  const preferCountry = norm(opts.preferCountry || "brazil");
  const ranked: RankedDecisionMaker[] = decisionMakers
    .filter(isMarketing)
    .map((dm) => {
      const { tier, base } = tierAndBase(dm);
      let score = base;
      // desempates
      if (norm(dm.location?.country || "") === preferCountry) score += 5;
      const depts = (dm.jobTitle?.departments || []).map(norm);
      if (depts.length === 1 && depts[0] === "marketing") score += 2; // marketing puro
      else if (depts.includes("sales")) score -= 5; // misto com vendas
      if ((dm.has || []).includes("emails")) score += 3; // email revelável direto
      return { dm, score, tier };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.length ? ranked[0] : null;
}
