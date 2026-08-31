// Buscador ferrenho de CMOs — "todo dia um pouquinho, até 100%".
//
// Regra do jogo: a cada rodada pega as próximas N empresas da fila (por rank),
// tenta achar o decisor de marketing, grava o contato e MARCA a empresa. Marcar
// é o que faz o trabalho ser cumulativo: no dia seguinte ele não repete o que já
// resolveu, e volta a insistir só no que dá para insistir (erro/sem decisor
// depois do período de carência).
//
// Orçamento: nunca passa da cota diária de créditos Lusha. Estourou, para e
// avisa — não fica gastando crédito no escuro.

import type { SupabaseClient } from "../tools/supabase.ts";
import { logEvent } from "../tools/supabase.ts";
import type { BlocklistMatcher } from "../lib/blocklist.ts";
import type { LushaClient } from "../lusha/client.ts";
import { enrichCompany, type EnrichResult } from "../enrich/enrich.ts";

export type CmoStatus =
  | "pendente"
  | "ok"
  | "revisar"
  | "sem_dominio"
  | "sem_decisor"
  | "bloqueada"
  | "duplicado"
  | "erro"
  | "ignorada";

/** Status que o buscador volta a tentar depois da carência. */
export const RETRIABLE: CmoStatus[] = ["pendente", "erro", "sem_decisor"];
/** Status que encerram a empresa (não gastam mais crédito). */
export const TERMINAL: CmoStatus[] = ["ok", "revisar", "bloqueada", "duplicado", "ignorada"];

export const RETRY_DAYS = 30;
const COST_EMAIL = 1;
const COST_PHONE = 5;

export interface CmoProgress {
  totalElegiveis: number;
  concluidas: number;
  pendentes: number;
  semDominio: number;
  semDecisor: number;
  bloqueadas: number;
  erros: number;
  pct: number;
  /** Dias para chegar a 100% no ritmo atual. */
  etaDias: number | null;
}

export function computeProgress(
  counts: Record<string, number>,
  cotaDiaria: number,
): CmoProgress {
  const get = (k: string) => counts[k] || 0;
  const concluidas = get("ok") + get("revisar");
  const bloqueadas = get("bloqueada") + get("ignorada") + get("duplicado");
  const pendentes = get("pendente") + get("erro") + get("sem_decisor") + get("sem_dominio");
  const totalElegiveis = concluidas + pendentes; // bloqueada não conta como meta
  const pct = totalElegiveis ? Math.round((concluidas / totalElegiveis) * 1000) / 10 : 0;
  const trabalhavel = get("pendente") + get("erro") + get("sem_decisor");
  return {
    totalElegiveis,
    concluidas,
    pendentes,
    semDominio: get("sem_dominio"),
    semDecisor: get("sem_decisor"),
    bloqueadas,
    erros: get("erro"),
    pct,
    etaDias: cotaDiaria > 0 && trabalhavel > 0 ? Math.ceil(trabalhavel / cotaDiaria) : null,
  };
}

/** Quantas empresas cabem no orçamento de créditos que sobrou hoje. */
export function batchSizeForBudget(
  cota: number,
  creditosRestantes: number,
  revelarTelefone: boolean,
): number {
  const custoPorEmpresa = COST_EMAIL + (revelarTelefone ? COST_PHONE : 0);
  return Math.max(0, Math.min(cota, Math.floor(creditosRestantes / custoPorEmpresa)));
}

export function statusFromEnrich(r: EnrichResult): CmoStatus {
  switch (r.status) {
    case "enriched": return "ok";
    case "needs_review": return "revisar";
    case "blocked": return "bloqueada";
    case "duplicate": return "duplicado";
    case "no_decision_maker": return "sem_decisor";
    case "no_company": return /domínio/i.test(r.reason || "") ? "sem_dominio" : "sem_decisor";
    default: return "pendente";
  }
}

export interface CmoDeps {
  db: SupabaseClient;
  lusha: LushaClient;
  blocklist: BlocklistMatcher;
  dryRun: boolean;
  revelarTelefone: boolean;
  cotaDiaria: number;
  limiteCreditos: number;
  hoje: string; // YYYY-MM-DD em America/Sao_Paulo
}

export interface CmoRunSummary {
  processadas: number;
  novosContatos: number;
  creditosGastos: number;
  porStatus: Record<string, number>;
  pulouPorOrcamento: boolean;
  progresso: CmoProgress;
}

/** Data de hoje em São Paulo, no formato YYYY-MM-DD. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function contarPorStatus(db: SupabaseClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const all: CmoStatus[] = [
    "pendente", "ok", "revisar", "sem_dominio", "sem_decisor",
    "bloqueada", "duplicado", "erro", "ignorada",
  ];
  // PostgREST não agrega sem RPC; um count exato por status é barato (HEAD-like).
  for (const s of all) {
    counts[s] = await db.count("companies", `select=id&cmo_status=eq.${s}`);
  }
  return counts;
}

export async function getProgress(db: SupabaseClient, cotaDiaria: number): Promise<CmoProgress> {
  return computeProgress(await contarPorStatus(db), cotaDiaria);
}

export interface OrcamentoDia {
  usados: number;
  limite: number;
  restantes: number;
}

/** Orçamento de créditos Lusha de hoje. O limite do banco vence o do env. */
export async function orcamentoDoDia(
  db: SupabaseClient,
  dia: string,
  limiteEnv: number,
): Promise<OrcamentoDia> {
  const rows = await db.select<{ credits_used: number; daily_limit: number }>(
    "lusha_credits",
    `select=credits_used,daily_limit&day=eq.${dia}`,
  );
  if (!rows.length) return { usados: 0, limite: limiteEnv, restantes: limiteEnv };
  const limite = rows[0].daily_limit ?? limiteEnv;
  const usados = rows[0].credits_used ?? 0;
  return { usados, limite, restantes: Math.max(0, limite - usados) };
}

/** Próximas empresas da fila: por rank, respeitando a carência de retentativa. */
export interface EmpresaNaFila {
  id: string;
  crm_key: string | null;
  rank: number | null;
  name: string;
  segmento: string | null;
  domain: string | null;
  cmo_status: CmoStatus;
  cmo_attempts: number | null;
}

export async function proximasEmpresas(
  db: SupabaseClient,
  limite: number,
  hoje: string,
): Promise<EmpresaNaFila[]> {
  if (limite <= 0) return [];
  const corte = new Date(new Date(hoje + "T00:00:00Z").getTime() - RETRY_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const statusIn = RETRIABLE.join(",");
  const q =
    `select=id,crm_key,rank,name,segmento,domain,cmo_status,cmo_attempts` +
    `&blocked=is.false` +
    `&cmo_status=in.(${statusIn})` +
    `&domain=not.is.null` +
    `&or=(cmo_last_attempt_at.is.null,cmo_last_attempt_at.lt.${corte})` +
    `&order=rank.asc.nullslast&limit=${limite}`;
  return db.select(`companies`, q);
}

/** Uma rodada do buscador. Idempotente por dia: o que marcou, não repete. */
export async function runCmoBatch(deps: CmoDeps, limiteSolicitado?: number): Promise<CmoRunSummary> {
  const { db, dryRun } = deps;
  const orcamento = await orcamentoDoDia(db, deps.hoje, deps.limiteCreditos);
  const restantes = orcamento.restantes;
  const cota = Math.min(limiteSolicitado ?? deps.cotaDiaria, deps.cotaDiaria);
  const lote = dryRun
    ? cota
    : batchSizeForBudget(cota, restantes, deps.revelarTelefone);
  const pulouPorOrcamento = !dryRun && lote < cota;

  const empresas = await proximasEmpresas(db, lote, deps.hoje);
  const porStatus: Record<string, number> = {};
  let creditosGastos = 0;
  let novosContatos = 0;

  // Dedupe absoluto: email e telefone já existentes no banco.
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  if (!dryRun && empresas.length) {
    const ce = await db.select<{ email: string | null; phone_e164: string | null }>(
      "contacts",
      "select=email,phone_e164&limit=20000",
    );
    for (const c of ce) {
      if (c.email) seenEmails.add(c.email.toLowerCase());
      if (c.phone_e164) seenPhones.add(c.phone_e164);
    }
  }

  for (const empresa of empresas) {
    let status: CmoStatus = "erro";
    let erro: string | null = null;
    let resultado: EnrichResult | null = null;

    try {
      resultado = await enrichCompany(
        {
          crmKey: empresa.crm_key ?? undefined,
          rank: empresa.rank ?? undefined,
          name: empresa.name,
          segmento: empresa.segmento ?? undefined,
          domain: empresa.domain ?? undefined,
        },
        {
          blocklist: deps.blocklist,
          fetchDecisionMakers: (d) => deps.lusha.fetchDecisionMakers(d),
          revealContact: (id, f) => deps.lusha.revealContact(id, f),
          seenEmails,
          seenPhones,
        },
        {
          dryRun,
          revealPhone: deps.revelarTelefone,
          preferCountry: "Brazil",
          creditsRemaining: restantes - creditosGastos,
        },
      );
      creditosGastos += resultado.creditsSpent;
      if (resultado.status === "limit_reached") {
        porStatus["limite_atingido"] = (porStatus["limite_atingido"] || 0) + 1;
        break;
      }
      status = statusFromEnrich(resultado);

      if (resultado.contact && !dryRun) {
        const c = resultado.contact;
        // INSERT, não upsert: os índices únicos de contacts são parciais
        // (lower(email) / phone_e164 where not null) e o PostgREST não resolve
        // on_conflict contra índice parcial. O dedupe já aconteceu no enrich;
        // aqui a violação só acontece em corrida, e vira 'duplicado'.
        try {
          await db.insert(
            "contacts",
            [{
              company_id: empresa.id,
              full_name: c.fullName,
              title: c.title,
              email: c.email,
              phone_e164: c.phoneE164,
              linkedin_url: c.linkedinUrl,
              segmento: c.segmento || null,
              source: "lusha",
              data_quality: c.dataQuality,
              needs_review: c.needsReview,
            }],
            { returning: false },
          );
          novosContatos++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/23505|duplicate key/i.test(msg)) throw e;
          status = "duplicado";
        }
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      status = "erro";
    }

    porStatus[status] = (porStatus[status] || 0) + 1;

    // Em dry run nada é marcado — senão a fila "andava" sem ter feito nada.
    if (!dryRun) {
      await db.update("companies", `id=eq.${empresa.id}`, {
        cmo_status: status,
        cmo_attempts: (empresa.cmo_attempts ?? 0) + 1,
        cmo_last_attempt_at: new Date().toISOString(),
        cmo_last_error: erro,
        updated_at: new Date().toISOString(),
      });
    }

    await logEvent(db, {
      kind: "cmo_hunt",
      channel: "lusha",
      company_id: empresa.id,
      level: status === "erro" ? "error" : "info",
      message: `${empresa.name}: ${status}${erro ? " — " + erro : ""}`,
      payload: { status, candidate: resultado?.candidate ?? null, creditos: resultado?.creditsSpent ?? 0 },
      dry_run: dryRun,
    });
  }

  if (!dryRun && creditosGastos > 0) {
    await db.upsert(
      "lusha_credits",
      [{
        day: deps.hoje,
        credits_used: orcamento.usados + creditosGastos,
        daily_limit: orcamento.limite,
        updated_at: new Date().toISOString(),
      }],
      "day",
    );
  }

  return {
    processadas: empresas.length,
    novosContatos,
    creditosGastos,
    porStatus,
    pulouPorOrcamento,
    progresso: await getProgress(db, deps.cotaDiaria),
  };
}

/** Relatório curto o suficiente para caber num WhatsApp. */
export function formatCmoReport(s: CmoRunSummary, dryRun: boolean): string {
  const p = s.progresso;
  const barra = "▓".repeat(Math.round(p.pct / 10)) + "░".repeat(10 - Math.round(p.pct / 10));
  const linhas = [
    `🔎 *Buscador de CMOs* ${dryRun ? "_(dry run — nada gravado)_" : ""}`.trim(),
    ``,
    `${barra}  *${p.pct}%*`,
    `${p.concluidas} de ${p.totalElegiveis} empresas com decisor cadastrado`,
    ``,
    `*Hoje:* ${s.processadas} processadas · ${s.novosContatos} novos contatos · ${s.creditosGastos} créditos`,
  ];
  const detalhe = Object.entries(s.porStatus)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}: ${n}`)
    .join(" · ");
  if (detalhe) linhas.push(`_${detalhe}_`);
  if (p.semDominio > 0) {
    linhas.push(``, `⚠️ ${p.semDominio} empresas travadas por falta de domínio — me manda "resolver domínios" que eu listo.`);
  }
  if (s.pulouPorOrcamento) {
    linhas.push(``, `🪙 Cota de créditos Lusha do dia acabou antes da meta.`);
  }
  if (p.etaDias != null) {
    linhas.push(``, `⏳ Nesse ritmo: *${p.etaDias} dias* para 100%.`);
  } else if (p.pct >= 100) {
    linhas.push(``, `✅ Lista 100% coberta.`);
  }
  return linhas.join("\n");
}
