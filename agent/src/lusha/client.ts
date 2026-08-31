// Cliente Lusha (Prospecting V3) para o buscador de CMOs.
//
// Fluxo em 2 etapas, que é o que o enrich.ts já assume:
//   1. SEARCH  — preview dos contatos de marketing do domínio. Traz nome, cargo,
//                LinkedIn e `canReveal[]`. NÃO revela email/telefone.
//   2. ENRICH  — revela os campos escolhidos. AQUI gasta crédito
//                (email = 1, telefone = 5 no seu plano).
//
// ⚠️ Os PATHS abaixo são o único ponto do sistema que depende do contrato exato
// da sua conta Lusha. Rode `npm run probe:lusha -- natura.com.br` para conferir
// a resposta real antes de ligar DRY_RUN=false; se divergir, ajuste por env
// (LUSHA_SEARCH_PATH / LUSHA_ENRICH_PATH) sem tocar em código.

import type { LushaDecisionMaker } from "../lib/lusha-rank.ts";
import type { RevealResult } from "../enrich/enrich.ts";

export interface LushaOptions {
  apiKey: string;
  baseUrl?: string;
  searchPath?: string;
  enrichPath?: string;
  /** Quantos contatos trazer por empresa no preview. */
  pageSize?: number;
  fetchImpl?: typeof fetch;
}

export interface LushaClient {
  fetchDecisionMakers(domain: string): Promise<LushaDecisionMaker[]>;
  revealContact(id: string, fields: ("emails" | "phones")[]): Promise<RevealResult>;
}

/** Corpo do search: domínio + departamento de marketing, senioridade decisora. */
export function buildSearchBody(domain: string, pageSize: number): Record<string, unknown> {
  return {
    pages: { page: 0, size: pageSize },
    filters: {
      companies: { include: { domains: [domain] } },
      contacts: {
        include: {
          departments: ["Marketing"],
          seniority: ["C-Suite", "Vice President", "Director", "Manager"],
        },
      },
    },
  };
}

/** Achata a resposta do search para o shape que o ranqueador consome. */
export function mapSearchResponse(data: any): LushaDecisionMaker[] {
  const rows: any[] = data?.data || data?.contacts || data?.results || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      id: String(r.id ?? r.contactId ?? ""),
      firstName: r.firstName ?? r.first_name,
      lastName: r.lastName ?? r.last_name,
      jobTitle: {
        title: r.jobTitle?.title ?? (typeof r.jobTitle === "string" ? r.jobTitle : "") ?? r.title ?? "",
        departments: r.jobTitle?.departments ?? r.departments ?? [],
        seniority: r.jobTitle?.seniority ?? r.seniority ?? "",
      },
      company: {
        name: r.company?.name ?? r.companyName,
        domain: r.company?.domain ?? r.companyDomain,
      },
      location: {
        country: r.location?.country ?? r.country,
        state: r.location?.state,
        city: r.location?.city,
      },
      socialLinks: { linkedin: r.socialLinks?.linkedin ?? r.linkedinUrl },
      has: r.has ?? [],
      canReveal: r.canReveal ?? [],
    }))
    .filter((d) => d.id);
}

/** Extrai o primeiro email/telefone utilizável da resposta de enrich. */
export function mapRevealResponse(data: any): RevealResult {
  const c = (Array.isArray(data?.data) ? data.data[0] : data?.data) || data?.contact || data || {};
  const emails: any[] = c.emails || [];
  const phones: any[] = c.phoneNumbers || c.phones || [];
  const email = emails.map((e) => e?.address || e?.emailAddress || e?.email).find(Boolean) || null;
  // Preferimos celular — é o que serve para WhatsApp.
  const mobile = phones.find((p) => /mobile|cell/i.test(p?.phoneType || p?.type || ""));
  const pick = mobile || phones[0];
  const phone = pick?.internationalNumber || pick?.number || null;
  return { email, phone };
}

export function createLushaClient(opts: LushaOptions): LushaClient {
  const base = (opts.baseUrl || "https://api.lusha.com").replace(/\/+$/, "");
  const searchPath = opts.searchPath || "/prospecting/contact/search";
  const enrichPath = opts.enrichPath || "/prospecting/contact/enrich";
  const pageSize = opts.pageSize ?? 25;
  const doFetch = opts.fetchImpl || fetch;
  const headers = { "Content-Type": "application/json", api_key: opts.apiKey };

  async function post(path: string, body: unknown) {
    const res = await doFetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Lusha ${res.status} em ${path}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Lusha devolveu resposta não-JSON em ${path}: ${text.slice(0, 200)}`);
    }
  }

  return {
    async fetchDecisionMakers(domain) {
      return mapSearchResponse(await post(searchPath, buildSearchBody(domain, pageSize)));
    },
    async revealContact(id, fields) {
      return mapRevealResponse(await post(enrichPath, { contactIds: [id], reveal: fields }));
    },
  };
}
