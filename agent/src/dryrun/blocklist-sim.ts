// Simulação de checagem de blocklist em dry run (sem tocar em nada externo).
// Reutilizada pelo teste automatizado e pelo script de CLI.

import { BlocklistMatcher } from "../lib/blocklist.ts";
import { BLOCKLIST_SEED } from "../data/blocklist.seed.ts";
import type { BlockResult } from "../types.ts";

export interface SimCompany {
  name: string;
  domain?: string;
  email?: string;
  expectBlocked: boolean; // expectativa para validação do dry run
}

export interface SimRow extends SimCompany {
  result: BlockResult;
  pass: boolean; // resultado bateu com a expectativa?
}

// 5 empresas fictícias (devem PASSAR) + 2 da blocklist (devem ser BLOQUEADAS).
export const SIM_COMPANIES: SimCompany[] = [
  { name: "Gerdau", email: "debora.baum@gerdau.com.br", expectBlocked: false },
  { name: "Empresa Fictícia Alpha", email: "cmo@alpha-ficticia.com.br", expectBlocked: false },
  { name: "Startup XYZ Tecnologia", email: "ana@xyztech.com.br", expectBlocked: false },
  { name: "Loja 99 Variedades", email: "dono@loja99var.com.br", expectBlocked: false },
  { name: "Naturalle Alimentos", email: "diretor@naturalle.com.br", expectBlocked: false },
  // Blocklist — DEVEM ser bloqueadas:
  { name: "Itaú Unibanco", email: "cmo@itau.com.br", expectBlocked: true },
  { name: "Café 3 Corações", email: "plima@3coracoes.com.br", expectBlocked: true },
];

export function runBlocklistSim(companies: SimCompany[] = SIM_COMPANIES): {
  rows: SimRow[];
  allPass: boolean;
} {
  const matcher = new BlocklistMatcher(BLOCKLIST_SEED);
  const rows: SimRow[] = companies.map((c) => {
    const result = matcher.check({ name: c.name, domain: c.domain, email: c.email });
    return { ...c, result, pass: result.blocked === c.expectBlocked };
  });
  return { rows, allPass: rows.every((r) => r.pass) };
}
