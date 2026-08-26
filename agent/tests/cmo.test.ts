import { test } from "node:test";
import assert from "node:assert/strict";
import {
  batchSizeForBudget,
  computeProgress,
  formatCmoReport,
  statusFromEnrich,
  todayInSaoPaulo,
  type CmoRunSummary,
} from "../src/jobs/daily-cmo.ts";
import type { EnrichResult } from "../src/enrich/enrich.ts";

const empresa = { name: "Fictícia S.A." };
const res = (over: Partial<EnrichResult>): EnrichResult =>
  ({ status: "enriched", company: empresa, creditsSpent: 0, ...over }) as EnrichResult;

test("progresso: bloqueadas não entram na meta de 100%", () => {
  const p = computeProgress({ ok: 50, revisar: 10, pendente: 40, bloqueada: 100 }, 20);
  assert.equal(p.concluidas, 60);
  assert.equal(p.totalElegiveis, 100); // 60 + 40, sem as 100 bloqueadas
  assert.equal(p.pct, 60);
  assert.equal(p.bloqueadas, 100);
});

test("progresso: ETA é o que falta dividido pela cota diária", () => {
  const p = computeProgress({ ok: 100, pendente: 85, erro: 5 }, 20);
  assert.equal(p.etaDias, 5); // 90 trabalháveis / 20 por dia, arredondado pra cima
});

test("progresso: sem_dominio conta como pendente mas NÃO entra no ETA", () => {
  // Empresa sem domínio não é destravável por crédito — é destravável por você.
  const p = computeProgress({ ok: 10, sem_dominio: 90 }, 10);
  assert.equal(p.semDominio, 90);
  assert.equal(p.pct, 10);
  assert.equal(p.etaDias, null);
});

test("progresso: base vazia não divide por zero", () => {
  const p = computeProgress({}, 20);
  assert.equal(p.pct, 0);
  assert.equal(p.etaDias, null);
});

test("progresso: 100% coberto", () => {
  const p = computeProgress({ ok: 200, bloqueada: 16 }, 20);
  assert.equal(p.pct, 100);
  assert.equal(p.etaDias, null);
});

test("orçamento: lote encolhe conforme os créditos que sobraram", () => {
  assert.equal(batchSizeForBudget(40, 100, false), 40); // sobra crédito
  assert.equal(batchSizeForBudget(40, 25, false), 25);  // 1 crédito por empresa
  assert.equal(batchSizeForBudget(40, 25, true), 4);    // 6 créditos com telefone
  assert.equal(batchSizeForBudget(40, 0, false), 0);
  assert.equal(batchSizeForBudget(40, -5, false), 0);
});

test("status do enriquecimento vira status da fila", () => {
  assert.equal(statusFromEnrich(res({ status: "enriched" })), "ok");
  assert.equal(statusFromEnrich(res({ status: "needs_review" })), "revisar");
  assert.equal(statusFromEnrich(res({ status: "blocked" })), "bloqueada");
  assert.equal(statusFromEnrich(res({ status: "duplicate" })), "duplicado");
  assert.equal(statusFromEnrich(res({ status: "no_decision_maker" })), "sem_decisor");
  assert.equal(statusFromEnrich(res({ status: "dry_run" })), "pendente");
});

test("no_company distingue falta de domínio de ausência de decisor", () => {
  assert.equal(statusFromEnrich(res({ status: "no_company", reason: "sem domínio" })), "sem_dominio");
  assert.equal(
    statusFromEnrich(res({ status: "no_company", reason: "empresa/decisores não encontrados" })),
    "sem_decisor",
  );
});

test("relatório mostra %, barra e ETA", () => {
  const s: CmoRunSummary = {
    processadas: 40,
    novosContatos: 31,
    creditosGastos: 40,
    porStatus: { ok: 31, sem_decisor: 9 },
    pulouPorOrcamento: false,
    progresso: computeProgress({ ok: 640, pendente: 360 }, 40),
  };
  const t = formatCmoReport(s, false);
  assert.match(t, /64%/);
  assert.match(t, /31 novos contatos/);
  assert.match(t, /9 dias/);
  assert.ok(!/dry run/i.test(t));
});

test("relatório avisa dry run e cota estourada", () => {
  const s: CmoRunSummary = {
    processadas: 5,
    novosContatos: 0,
    creditosGastos: 0,
    porStatus: {},
    pulouPorOrcamento: true,
    progresso: computeProgress({ ok: 1, pendente: 9, sem_dominio: 3 }, 40),
  };
  const t = formatCmoReport(s, true);
  assert.match(t, /dry run/i);
  assert.match(t, /Cota de créditos/);
  assert.match(t, /3 empresas travadas por falta de domínio/);
});

test("todayInSaoPaulo devolve o dia local, não o UTC", () => {
  // 03:00 UTC de 1º de janeiro ainda é 31/12 em São Paulo (UTC-3).
  assert.equal(todayInSaoPaulo(new Date("2026-01-01T02:00:00Z")), "2025-12-31");
  assert.match(todayInSaoPaulo(), /^\d{4}-\d{2}-\d{2}$/);
});
