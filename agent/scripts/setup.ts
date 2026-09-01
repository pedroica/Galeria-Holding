// Assistente de configuração. Pergunta uma coisa de cada vez, diz onde achar
// cada valor, testa o que dá para testar e escreve o .env no fim.
//
//   cd agent && npm run setup
//
// Nada é enviado para lugar nenhum além dos serviços que você mesmo escolheu
// (Supabase para testar a conexão, Meta para registrar o webhook). O .env fica
// só na sua máquina, com permissão 600.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { parseEnvFile } from "../src/worker/env-file.ts";
import { limparUrlSupabase } from "../src/lib/normalize.ts";

const CAMINHO = resolve(process.cwd(), ".env");
const rl = createInterface({ input: stdin, output: stdout });

const T = {
  titulo: (s: string) => `\n\x1b[1m${s}\x1b[0m`,
  dica: (s: string) => `\x1b[2m${s}\x1b[0m`,
  ok: (s: string) => `\x1b[32m${s}\x1b[0m`,
  erro: (s: string) => `\x1b[31m${s}\x1b[0m`,
  aviso: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

interface Campo {
  chave: string;
  pergunta: string;
  onde?: string;
  obrigatorio?: boolean;
  padrao?: string;
  gerar?: () => string;
  /** Corrige o valor antes de validar (colagem com sobra, por exemplo). */
  normalizar?: (v: string) => string;
  validar?: (v: string) => string | null; // devolve mensagem de erro, ou null
}

const soDigitos = (v: string) => v.replace(/\D/g, "");

const CAMPOS: Campo[] = [
  {
    chave: "SUPABASE_URL",
    pergunta: "URL do projeto Supabase",
    onde: "Supabase → Settings → API → Project URL (começa com https:// e termina em .supabase.co)",
    obrigatorio: true,
    // A tela do Supabase mostra a URL já com /rest/v1/ no fim, e é natural
    // colar assim. Aceitamos e limpamos, em vez de reclamar.
    normalizar: limparUrlSupabase,
    validar: (v) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(limparUrlSupabase(v))
        ? null
        : "esperava algo como https://abcdxyz.supabase.co",
  },
  {
    chave: "SUPABASE_SERVICE_ROLE_KEY",
    pergunta: "Chave service_role do Supabase",
    onde: "Mesma tela, seção Project API keys → service_role (a SECRETA, não a anon). Clique em Reveal.",
    obrigatorio: true,
    validar: (v) => (v.length > 40 ? null : "essa chave é bem mais longa; conferiu se copiou inteira?"),
  },
  {
    chave: "ANTHROPIC_API_KEY",
    pergunta: "Chave da API da Anthropic (o cérebro da secretária e do vendedor)",
    onde: "console.anthropic.com → Settings → API keys. Começa com sk-ant-",
    obrigatorio: true,
    validar: (v) => (v.startsWith("sk-ant-") ? null : "as chaves da Anthropic começam com sk-ant-"),
  },
  {
    chave: "WHATSAPP_APP_ID",
    pergunta: "App ID da Meta",
    onde: "developers.facebook.com → seu app → Configurações → Básico → ID do aplicativo (só números)",
    obrigatorio: true,
    validar: (v) => (/^\d{6,}$/.test(v) ? null : "o App ID é só números"),
  },
  {
    chave: "WHATSAPP_APP_SECRET",
    pergunta: "Chave secreta do app (App Secret)",
    onde: "Mesma tela, campo 'Chave secreta do aplicativo' → Mostrar",
    obrigatorio: true,
  },
  {
    chave: "WHATSAPP_PHONE_NUMBER_ID",
    pergunta: "Phone Number ID",
    onde: "Meta → WhatsApp → Configuração da API → 'Identificação do número de telefone'",
    obrigatorio: true,
    validar: (v) => (/^\d{6,}$/.test(v) ? null : "é só números, e não é o telefone em si"),
  },
  {
    chave: "WHATSAPP_BUSINESS_ACCOUNT_ID",
    pergunta: "WhatsApp Business Account ID (opcional, mas evita um clique no painel)",
    onde: "Mesma tela, logo abaixo: 'Identificação da conta do WhatsApp Business'",
  },
  {
    chave: "WHATSAPP_CLOUD_TOKEN",
    pergunta: "Token de acesso do WhatsApp",
    onde: "O permanente: Configurações do Negócio → Usuários do sistema → Gerar token. " +
      "O da tela de Configuração da API serve para testar, mas expira em 24h.",
    obrigatorio: true,
  },
  {
    chave: "WHATSAPP_VERIFY_TOKEN",
    pergunta: "Token de verificação do webhook (invento um para você)",
    onde: "É um segredo qualquer, só para a Meta e nós conferirmos que somos nós. Enter aceita o gerado.",
    gerar: () => "galeria-" + randomBytes(8).toString("hex"),
  },
  {
    chave: "WHATSAPP_ALLOWED_NUMBERS",
    pergunta: "Seu número de WhatsApp, com DDI e DDD (só quem estiver aqui comanda os agentes)",
    onde: "Ex: 5511999998888. Pode pôr mais de um separando por vírgula.",
    obrigatorio: true,
    validar: (v) => {
      const nums = v.split(",").map(soDigitos).filter(Boolean);
      if (!nums.length) return "preciso de pelo menos um número";
      if (nums.some((n) => n.length < 12)) return "faltou o DDI 55 ou o DDD?";
      return null;
    },
  },
  {
    chave: "LUSHA_API_KEY",
    pergunta: "Chave da Lusha (opcional agora — sem ela o buscador não enriquece)",
    onde: "dashboard.lusha.com → API. Pode deixar em branco e preencher depois.",
  },
  {
    chave: "QWEN_API_KEY",
    pergunta: "Chave do Qwen (opcional — sem ela o buscador usa Claude)",
    onde: "Deixe em branco se ainda não tem. Nada quebra.",
  },
];

async function perguntar(c: Campo, atual?: string): Promise<string> {
  console.log(T.titulo(c.pergunta));
  if (c.onde) console.log(T.dica("  " + c.onde));

  const sugerido = atual || (c.gerar ? c.gerar() : c.padrao);
  const rotulo = atual
    ? `  [Enter mantém o valor atual] > `
    : sugerido
      ? `  [Enter usa: ${sugerido}] > `
      : "  > ";

  for (;;) {
    const resposta = (await rl.question(rotulo)).trim();
    const bruto = resposta || sugerido || "";
    const valor = c.normalizar ? c.normalizar(bruto) : bruto;

    if (!valor) {
      if (!c.obrigatorio) return "";
      console.log(T.erro("  esse é obrigatório."));
      continue;
    }
    const erro = c.validar?.(valor);
    if (erro) {
      console.log(T.erro("  " + erro));
      continue;
    }
    return valor;
  }
}

async function main() {
  console.log(T.titulo("Configuração dos agentes da Galeria"));
  console.log(T.dica("Vou perguntar uma coisa de cada vez. Enter aceita o sugerido."));
  console.log(T.dica("O .env fica só nesta máquina — nada é enviado para o chat.\n"));

  const existentes = existsSync(CAMINHO) ? parseEnvFile(readFileSync(CAMINHO, "utf8")) : {};
  if (Object.keys(existentes).length) {
    console.log(T.aviso(`Já existe um .env com ${Object.keys(existentes).length} variáveis. Enter mantém cada valor.`));
  }

  const valores: Record<string, string> = { ...existentes };
  for (const campo of CAMPOS) {
    const v = await perguntar(campo, existentes[campo.chave]);
    if (v) valores[campo.chave] = v;
  }

  // Normaliza o que dá para normalizar sozinho.
  valores.SUPABASE_URL = limparUrlSupabase(valores.SUPABASE_URL || "");
  valores.WHATSAPP_ALLOWED_NUMBERS = (valores.WHATSAPP_ALLOWED_NUMBERS || "")
    .split(",").map(soDigitos).filter(Boolean).join(",");
  valores.WHATSAPP_OWNER_NUMBER = valores.WHATSAPP_ALLOWED_NUMBERS.split(",")[0] || "";

  // Padrões seguros: começa em dry run, sempre.
  valores.DRY_RUN = valores.DRY_RUN || "true";
  valores.TIMEZONE = valores.TIMEZONE || "America/Sao_Paulo";
  valores.CMO_DAILY_QUOTA = valores.CMO_DAILY_QUOTA || "40";
  valores.CLAUDE_MODEL = valores.CLAUDE_MODEL || "claude-opus-5";
  valores.WORKER_MODE = valores.WORKER_MODE || "all";
  valores.PORT = valores.PORT || "8787";

  const linhas = [
    "# Gerado por `npm run setup`. Guarda segredos — não commite este arquivo.",
    `# ${new Date().toISOString()}`,
    "",
    ...Object.entries(valores)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => `${k}=${v}`),
    "",
  ];
  writeFileSync(CAMINHO, linhas.join("\n"), { mode: 0o600 });
  chmodSync(CAMINHO, 0o600);
  console.log(T.ok(`\n✓ .env escrito em ${CAMINHO} (só você consegue ler)`));

  // ── Teste de conexão ─────────────────────────────────────────────────────
  console.log(T.titulo("Testando o Supabase…"));
  for (const [k, v] of Object.entries(valores)) if (!process.env[k]) process.env[k] = v;

  try {
    const { createRuntime } = await import("../src/agents/orchestrator.ts");
    const { getProgress } = await import("../src/jobs/daily-cmo.ts");
    const rt = await createRuntime();
    const p = await getProgress(rt.db, Number(valores.CMO_DAILY_QUOTA));
    console.log(T.ok(`  ✓ conectado — ${p.concluidas}/${p.totalElegiveis} empresas com decisor (${p.pct}%)`));
    if (p.semDominio) console.log(T.aviso(`  ⚠ ${p.semDominio} travadas por falta de domínio`));
  } catch (e) {
    console.log(T.erro("  ✗ " + (e instanceof Error ? e.message : String(e))));
    console.log(T.dica("  Confira a URL e a service_role, e rode `npm run setup` de novo."));
    rl.close();
    process.exit(1);
  }

  console.log(T.titulo("Pronto. O que acontece agora:"));
  console.log(`  1. ${T.ok("./scripts/mac-install.sh")} — instala o serviço que fica ligado`);
  console.log("  2. Ele sobe o servidor, abre o túnel e registra o webhook na Meta sozinho");
  console.log("  3. Manda /ajuda no WhatsApp para o seu número comercial");
  console.log(T.dica("\n  DRY_RUN começa ligado: nada gasta crédito até você trocar para false."));
  rl.close();
}

main().catch((e) => {
  console.error(T.erro("\nfalhou: " + (e instanceof Error ? e.message : String(e))));
  rl.close();
  process.exit(1);
});
