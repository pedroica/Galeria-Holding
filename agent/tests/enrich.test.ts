import { test } from "node:test";
import assert from "node:assert/strict";
import { BlocklistMatcher } from "../src/lib/blocklist.ts";
import { BLOCKLIST_SEED } from "../src/data/blocklist.seed.ts";
import { enrichCompany, runEnrichment, type EnrichDeps } from "../src/enrich/enrich.ts";
import type { LushaDecisionMaker } from "../src/lib/lusha-rank.ts";

const bl = new BlocklistMatcher(BLOCKLIST_SEED);

function mktDM(over: Partial<LushaDecisionMaker> = {}): LushaDecisionMaker {
  return {
    id: "v1.mkt",
    firstName: "Ana",
    lastName: "Silva",
    jobTitle: { title: "Diretora de Marketing", departments: ["Marketing"], seniority: "Director" },
    location: { country: "Brazil" },
    socialLinks: { linkedin: "https://linkedin.com/in/ana" },
    has: ["emails", "phones"],
    canReveal: [{ field: "emails", credits: 1 }, { field: "phones", credits: 5 }],
    ...over,
  };
}

function deps(over: Partial<EnrichDeps> = {}): EnrichDeps {
  return {
    blocklist: bl,
    fetchDecisionMakers: async () => [mktDM()],
    revealContact: async () => ({ email: "ana.silva@empresa.com.br", phone: "(11) 99999-8888" }),
    seenEmails: new Set<string>(),
    seenPhones: new Set<string>(),
    ...over,
  };
}

test("bloqueada NÃO chama o Lusha (economiza crédito)", async () => {
  let called = false;
  const d = deps({ fetchDecisionMakers: async () => { called = true; return [mktDM()]; } });
  const r = await enrichCompany({ name: "Itaú Unibanco", domain: "itau.com.br" }, d);
  assert.equal(r.status, "blocked");
  assert.equal(called, false, "não deveria ter chamado o Lusha");
  assert.equal(r.creditsSpent, 0);
});

test("dry run: mostra candidato e gasta 0 crédito", async () => {
  let revealed = false;
  const d = deps({ revealContact: async () => { revealed = true; return {}; } });
  const r = await enrichCompany({ name: "Gerdau", domain: "gerdau.com.br" }, d, { dryRun: true });
  assert.equal(r.status, "dry_run");
  assert.equal(r.creditsSpent, 0);
  assert.equal(revealed, false);
  assert.equal(r.candidate?.name, "Ana Silva");
  assert.equal(r.candidate?.canRevealEmail, true);
});

test("enriquecimento real: revela, valida e normaliza telefone", async () => {
  const d = deps();
  const r = await enrichCompany({ name: "Gerdau", domain: "gerdau.com.br", segmento: "Siderurgia" }, d,
    { dryRun: false, revealPhone: true });
  assert.equal(r.status, "enriched");
  assert.equal(r.creditsSpent, 6); // email 1 + telefone 5
  assert.equal(r.contact?.email, "ana.silva@empresa.com.br");
  assert.equal(r.contact?.phoneE164, "+5511999998888");
  assert.equal(r.contact?.needsReview, false);
});

test("email genérico é descartado → needs_review", async () => {
  const d = deps({ revealContact: async () => ({ email: "marketing@empresa.com.br", phone: null }) });
  const r = await enrichCompany({ name: "Gerdau", domain: "gerdau.com.br" }, d, { dryRun: false });
  assert.equal(r.status, "needs_review");
  assert.equal(r.contact?.email, null);
  assert.equal(r.contact?.needsReview, true);
});

test("dedupe: mesmo email não entra duas vezes", async () => {
  const d = deps();
  await enrichCompany({ name: "Empresa A", domain: "a.com.br" }, d, { dryRun: false });
  const r2 = await enrichCompany({ name: "Empresa B", domain: "b.com.br" }, d, { dryRun: false });
  assert.equal(r2.status, "duplicate");
});

test("sem decisor de marketing → no_decision_maker", async () => {
  const d = deps({
    fetchDecisionMakers: async () => [
      { id: "1", jobTitle: { title: "CFO", departments: ["Finance"], seniority: "C-Suite" } },
    ],
  });
  const r = await enrichCompany({ name: "XPTO", domain: "xpto.com.br" }, d, { dryRun: false });
  assert.equal(r.status, "no_decision_maker");
});

test("orçamento de créditos: para quando estoura", async () => {
  const companies = [
    { name: "A", domain: "a.com.br" },
    { name: "B", domain: "b.com.br" },
    { name: "C", domain: "c.com.br" },
  ];
  // cada uma custa 6 (email+telefone); com 8 créditos, só a 1ª passa, a 2ª estoura
  const d = deps();
  const { summary, results } = await runEnrichment(companies, d, {
    dryRun: false, revealPhone: true, creditsRemaining: 8,
  });
  assert.equal(summary.creditsSpent, 6);
  assert.equal(results[results.length - 1].status, "limit_reached");
  assert.ok((summary.byStatus["enriched"] || 0) >= 1);
});

test("dry run em lote conta candidatos sem gastar", async () => {
  const companies = [
    { name: "Itaú", domain: "itau.com.br" }, // bloqueada
    { name: "Gerdau", domain: "gerdau.com.br" }, // dry_run
  ];
  const { summary } = await runEnrichment(companies, deps(), { dryRun: true });
  assert.equal(summary.creditsSpent, 0);
  assert.equal(summary.byStatus["blocked"], 1);
  assert.equal(summary.byStatus["dry_run"], 1);
});
