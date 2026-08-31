// Teste de fumaça do worker: valida o .env e conecta de verdade, antes de o
// launchd transformar o processo num serviço que reinicia em loop.
//
//   node --experimental-strip-types scripts/worker-check.ts

import { resolve } from "node:path";
import { loadEnvFile } from "../src/worker/env-file.ts";

const caminho = process.env.AGENT_ENV_FILE || resolve(process.cwd(), ".env");
const carga = loadEnvFile(caminho);
if (carga.erro) {
  console.error(`✗ não consegui ler ${caminho}: ${carga.erro}`);
  process.exit(1);
}

const { loadEnv, missingSupabase } = await import("../src/config.ts");
const env = loadEnv();

const faltando = missingSupabase(env);
if (faltando.length) {
  console.error("✗ faltam variáveis no .env: " + faltando.join(", "));
  process.exit(1);
}

const { createRuntime } = await import("../src/agents/orchestrator.ts");
const { getProgress } = await import("../src/jobs/daily-cmo.ts");

try {
  const rt = await createRuntime();
  const p = await getProgress(rt.db, env.cmoDailyQuota);
  console.log(`  ✓ Supabase respondendo`);
  console.log(`  ✓ ${p.concluidas}/${p.totalElegiveis} empresas com decisor (${p.pct}%)`);
  if (p.semDominio) console.log(`  ⚠ ${p.semDominio} travadas por falta de domínio`);
  console.log(`  · DRY_RUN=${env.dryRun}  cota=${env.cmoDailyQuota}/dia`);
  if (!env.lushaApiKey) console.log("  ⚠ sem LUSHA_API_KEY — o buscador não vai enriquecer nada");
  if (!env.anthropicApiKey) console.log("  ⚠ sem ANTHROPIC_API_KEY");
} catch (e) {
  console.error("  ✗ " + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
}
