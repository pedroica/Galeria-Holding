// Leitor de .env sem dependência. O launchd não carrega o shell do usuário,
// então o processo sobe com um ambiente quase vazio — o worker precisa ler o
// arquivo por conta própria.
//
// Suporta o suficiente para um .env real: comentários, aspas, `export`, e
// valores com "=" no meio (tokens da Meta têm).

import { readFileSync } from "node:fs";

export function parseEnvFile(conteudo: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith("#")) continue;

    const semExport = linha.startsWith("export ") ? linha.slice(7).trim() : linha;
    const igual = semExport.indexOf("=");
    if (igual < 1) continue;

    const chave = semExport.slice(0, igual).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave)) continue;

    let valor = semExport.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"') && valor.length > 1) ||
      (valor.startsWith("'") && valor.endsWith("'") && valor.length > 1)
    ) {
      valor = valor.slice(1, -1);
    } else {
      // Comentário no fim da linha só conta fora de aspas.
      const hash = valor.indexOf(" #");
      if (hash !== -1) valor = valor.slice(0, hash).trim();
    }
    out[chave] = valor;
  }
  return out;
}

/** Carrega o .env no process.env sem sobrescrever o que já veio do sistema. */
export function loadEnvFile(caminho: string): { carregadas: number; erro?: string } {
  let conteudo: string;
  try {
    conteudo = readFileSync(caminho, "utf8");
  } catch (e) {
    return { carregadas: 0, erro: e instanceof Error ? e.message : String(e) };
  }
  const vars = parseEnvFile(conteudo);
  let n = 0;
  for (const [k, v] of Object.entries(vars)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
      n++;
    }
  }
  return { carregadas: n };
}
