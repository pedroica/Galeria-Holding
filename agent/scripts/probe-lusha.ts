// Sonda a API da Lusha com UMA empresa e imprime a resposta crua.
// Serve para conferir o contrato da sua conta antes de ligar DRY_RUN=false.
//
//   LUSHA_API_KEY=... npm run probe:lusha -- natura.com.br
//
// O search é preview: traz nome/cargo/canReveal SEM revelar email nem telefone.
// Este script nunca chama o enrich — ou seja, não gasta crédito de reveal.

import { buildSearchBody, mapSearchResponse } from "../src/lusha/client.ts";

const domain = process.argv[2];
const apiKey = process.env.LUSHA_API_KEY || process.env.LUSHA_KEY;

if (!domain) {
  console.error("Uso: npm run probe:lusha -- <dominio>   (ex: natura.com.br)");
  process.exit(1);
}
if (!apiKey) {
  console.error("Defina LUSHA_API_KEY (ou LUSHA_KEY) no ambiente.");
  process.exit(1);
}

const base = process.env.LUSHA_BASE_URL || "https://api.lusha.com";
const path = process.env.LUSHA_SEARCH_PATH || "/prospecting/contact/search";
const body = buildSearchBody(domain, 10);

console.log("POST", base + path);
console.log(JSON.stringify(body, null, 2), "\n");

const res = await fetch(base + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", api_key: apiKey },
  body: JSON.stringify(body),
});

const texto = await res.text();
console.log("HTTP", res.status, "\n");
console.log(texto.slice(0, 4000), "\n");

if (res.ok) {
  try {
    const mapeado = mapSearchResponse(JSON.parse(texto));
    console.log(`── Depois do mapeamento: ${mapeado.length} decisores ──`);
    for (const d of mapeado.slice(0, 5)) {
      console.log(` • ${d.firstName} ${d.lastName} — ${d.jobTitle?.title} [${d.jobTitle?.seniority}]`);
    }
    if (!mapeado.length) {
      console.log("⚠️  A resposta veio, mas o mapeamento devolveu 0. Ajuste");
      console.log("    mapSearchResponse() em src/lusha/client.ts para o shape acima.");
    }
  } catch (e) {
    console.error("Não consegui parsear como JSON:", e);
  }
}
