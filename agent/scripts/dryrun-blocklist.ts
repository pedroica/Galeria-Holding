// DRY RUN — Módulo 0. Só loga o que seria bloqueado. Não toca em nada externo.
// Uso: npm run dryrun:blocklist

import { runBlocklistSim } from "../src/dryrun/blocklist-sim.ts";
import { BLOCKLIST_SEED } from "../src/data/blocklist.seed.ts";

const { rows, allPass } = runBlocklistSim();

console.log("\n🚫 DRY RUN — Checagem de Blocklist");
console.log(`Blocklist carregada: ${BLOCKLIST_SEED.length} empresas\n`);
console.log("EMPRESA".padEnd(28), "RESULTADO".padEnd(12), "MOTIVO".padEnd(16), "CASOU");
console.log("─".repeat(78));

for (const r of rows) {
  const status = r.result.blocked ? "🔴 BLOQUEADA" : "🟢 liberada";
  const flag = r.pass ? "" : "  ❌ FALHOU (esperado diferente!)";
  console.log(
    r.name.padEnd(28),
    status.padEnd(12),
    (r.result.reason ?? "-").padEnd(16),
    (r.result.entryName ? `${r.result.entryName} · ${r.result.matched}` : "-") + flag,
  );
}

console.log("─".repeat(78));
console.log(allPass ? "\n✅ Dry run limpo: todas as expectativas bateram.\n" : "\n❌ Dry run com divergências — revisar acima.\n");
process.exit(allPass ? 0 : 1);
