// Normalização de texto e telefone. Base do matching da blocklist e do dedupe.
// Determinístico e testável — a "verdade" do matching vive aqui, não no banco.

// Stopwords: conectores PT + sufixos societários. Removidos dos dois lados do
// matching (nome da empresa e alias) para casar "Banco Itaú S.A." ≈ "banco itau".
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "the",
  "s", "a", "ltda", "sa", "eireli", "me", "epp", "mei",
]);

/** Remove acentos (NFD + descarte de diacríticos combinantes). */
export function stripAccents(input: string): string {
  return (input || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliza um nome para comparação: minúsculas, sem acentos, "&"→" e ",
 * pontuação/apóstrofos viram espaço, dígitos preservados, espaços colapsados.
 * Ex: "McDonald's" → "mcdonald s"; "Itaú Unibanco" → "itau unibanco".
 */
export function normalizeName(input: string): string {
  return stripAccents((input || "").toLowerCase())
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens significativos de um nome (sem stopwords/sufixos). */
export function nameTokens(input: string): string[] {
  return normalizeName(input)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Forma compacta e canônica (tokens úteis reunidos). Usada em dedupe. */
export function canonicalName(input: string): string {
  return nameTokens(input).join(" ");
}

/**
 * Normaliza um domínio: tira protocolo, caminho, porta, "www." e email (parte
 * após @). Ex: "https://www.Itau.com.br/pra" → "itau.com.br";
 * "plima@3coracoes.com.br" → "3coracoes.com.br".
 */
export function normalizeDomain(input: string): string {
  let d = (input || "").trim().toLowerCase();
  if (!d) return "";
  if (d.includes("@")) d = d.split("@").pop() as string; // email → domínio
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  return d.trim();
}

/**
 * `domain` está coberto por `blocked`? Igual ou subdomínio.
 * Ex: mail.itau.com.br ⊂ itau.com.br → true.
 */
export function domainMatches(domain: string, blocked: string): boolean {
  const d = normalizeDomain(domain);
  const b = normalizeDomain(blocked);
  if (!d || !b) return false;
  return d === b || d.endsWith("." + b);
}

/**
 * Valida/normaliza celular BR para E.164 (+55DDNNNNNNNNN).
 * Retorna null se não for um celular BR plausível.
 * Aceita "(11) 99999-8888", "+55 11 99999 8888", "5511999998888", etc.
 */
export function normalizePhoneBR(input: string): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  // Remove DDI 55 duplicado / prefixo 0
  if (digits.startsWith("0055")) digits = digits.slice(2);
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  // Agora esperamos DDD(2) + número. Celular BR tem 9 dígitos e começa com 9.
  if (digits.length !== 11) return null;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return null;
  if (digits[2] !== "9") return null; // celular: nono dígito 9
  return "+55" + digits;
}

/** True se o email é genérico/role-based (contato@, marketing@, sac@...). */
const GENERIC_LOCALPARTS = new Set([
  "contato", "contact", "marketing", "sac", "vendas", "comercial", "info",
  "atendimento", "faleconosco", "suporte", "financeiro", "rh", "imprensa",
  "adm", "administrativo", "compras", "ouvidoria", "hello", "hi", "no-reply",
  "noreply", "geral", "recepcao", "diretoria",
]);
export function isGenericEmail(email: string): boolean {
  const e = (email || "").toLowerCase().trim();
  const local = e.split("@")[0];
  if (!local) return true;
  return GENERIC_LOCALPARTS.has(local);
}
