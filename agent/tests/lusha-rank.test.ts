import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rankMarketingDecisionMaker, isMarketing } from "../src/lib/lusha-rank.ts";
import type { LushaDecisionMaker } from "../src/lib/lusha-rank.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const gerdau: LushaDecisionMaker[] = JSON.parse(
  readFileSync(join(__dir, "fixtures/gerdau.decisionmakers.json"), "utf8"),
);

test("Gerdau real: escolhe o Diretor de Marketing (Pedro Pinto), não Finanças/TI", () => {
  const best = rankMarketingDecisionMaker(gerdau, { preferCountry: "Brazil" });
  assert.ok(best, "deveria achar um decisor de marketing");
  assert.equal(best!.dm.firstName, "Pedro");
  assert.equal(best!.dm.lastName, "Pinto");
  assert.equal(best!.tier, "Diretor");
});

test("Diretor de Marketing puro ganha de 'Sales and Marketing' (misto)", () => {
  const best = rankMarketingDecisionMaker(gerdau, { preferCountry: "Brazil" });
  assert.notEqual(best!.dm.lastName, "Peres");
});

test("filtra não-marketing (CFO e Head of Technology não entram)", () => {
  const cfo = gerdau.find((d) => d.lastName === "Japur")!;
  const it = gerdau.find((d) => d.lastName === "Fernandes")!;
  assert.equal(isMarketing(cfo), false);
  assert.equal(isMarketing(it), false);
});

test("prioridade: CMO > VP > Diretor", () => {
  const dms: LushaDecisionMaker[] = [
    { id: "d", jobTitle: { title: "Diretor de Marketing", departments: ["Marketing"], seniority: "Director" }, location: { country: "Brazil" } },
    { id: "v", jobTitle: { title: "VP de Marketing", departments: ["Marketing"], seniority: "Vice President" }, location: { country: "Brazil" } },
    { id: "c", jobTitle: { title: "Chief Marketing Officer", departments: ["Marketing"], seniority: "C-Suite" }, location: { country: "Brazil" } },
  ];
  assert.equal(rankMarketingDecisionMaker(dms)!.tier, "CMO");
  // sem o CMO, ganha o VP
  assert.equal(rankMarketingDecisionMaker(dms.filter((d) => d.id !== "c"))!.tier, "VP");
});

test("retorna null quando não há ninguém de marketing", () => {
  const dms: LushaDecisionMaker[] = [
    { id: "1", jobTitle: { title: "Chief Financial Officer", departments: ["Finance"], seniority: "C-Suite" } },
    { id: "2", jobTitle: { title: "Head of Technology", departments: ["Information Technology"], seniority: "Director" } },
  ];
  assert.equal(rankMarketingDecisionMaker(dms), null);
});

test("desempate por país preferido (Brazil > exterior)", () => {
  const dms: LushaDecisionMaker[] = [
    { id: "us", jobTitle: { title: "Marketing Director", departments: ["Marketing"], seniority: "Director" }, location: { country: "United States" } },
    { id: "br", jobTitle: { title: "Marketing Director", departments: ["Marketing"], seniority: "Director" }, location: { country: "Brazil" } },
  ];
  assert.equal(rankMarketingDecisionMaker(dms, { preferCountry: "Brazil" })!.dm.id, "br");
});
