import { test } from "node:test";
import assert from "node:assert/strict";
import { runBlocklistSim, SIM_COMPANIES } from "../src/dryrun/blocklist-sim.ts";

test("dry run: 5 fictícias passam, 2 da blocklist são bloqueadas", () => {
  const { rows, allPass } = runBlocklistSim();

  // As 2 da blocklist DEVEM ser bloqueadas — se passarem, é bug crítico.
  const blocked = rows.filter((r) => r.result.blocked);
  assert.equal(blocked.length, 2, "esperado exatamente 2 bloqueios");
  assert.ok(blocked.some((r) => r.result.entryName === "Itaú"), "Itaú deveria estar entre os bloqueios");
  assert.ok(blocked.some((r) => r.result.entryName === "3 Corações"), "3 Corações deveria estar entre os bloqueios");

  // Nenhuma fictícia pode ser bloqueada.
  const ficticias = rows.filter((r) => !r.expectBlocked);
  assert.ok(ficticias.every((r) => !r.result.blocked), "fictícia bloqueada indevidamente");

  assert.equal(allPass, true);
  assert.equal(rows.length, SIM_COMPANIES.length);
});
