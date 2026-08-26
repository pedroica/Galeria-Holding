// Comandos de barra e troca de agente. Função pura — dá para testar sem rede.
//
// A conversa é uma só (um número de WhatsApp), e o agente ativo fica grudado na
// sessão. Isso evita o "de novo, com quem eu estou falando?" a cada mensagem.

import { AGENTE_PADRAO, PERSONAS } from "./personas.ts";

export type Command =
  | { tipo: "mensagem"; agente: string; texto: string; trocou: boolean }
  | { tipo: "ajuda" }
  | { tipo: "novo"; agente: string }
  | { tipo: "status" }
  | { tipo: "vazio" };

const APELIDOS: Record<string, string> = {
  sec: "secretaria",
  secretaria: "secretaria",
  secretária: "secretaria",
  agenda: "secretaria",
  vendedor: "vendedor",
  vendas: "vendedor",
  venda: "vendedor",
  buscador: "buscador",
  busca: "buscador",
  cmo: "buscador",
  cmos: "buscador",
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function parseCommand(textoBruto: string, agenteAtual: string = AGENTE_PADRAO): Command {
  const texto = (textoBruto || "").trim();
  if (!texto) return { tipo: "vazio" };

  const m = texto.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (!m) return { tipo: "mensagem", agente: agenteAtual, texto, trocou: false };

  const cmd = normalizar(m[1]);
  const resto = m[2].trim();

  if (cmd === "ajuda" || cmd === "help" || cmd === "?") return { tipo: "ajuda" };
  if (cmd === "status") return { tipo: "status" };
  if (cmd === "novo" || cmd === "limpar" || cmd === "reset") {
    const alvo = APELIDOS[normalizar(resto)] || agenteAtual;
    return { tipo: "novo", agente: alvo };
  }

  const alvo = APELIDOS[cmd];
  if (alvo) {
    // "/vendedor" sozinho só troca; "/vendedor quem eu falo hoje" troca e já
    // manda a pergunta — evita a ida e volta.
    return {
      tipo: "mensagem",
      agente: alvo,
      texto: resto || `Assumiu a conversa. Se apresente em uma linha e diga o que você resolve.`,
      trocou: alvo !== agenteAtual,
    };
  }

  // Barra desconhecida: trata como texto normal em vez de reclamar.
  return { tipo: "mensagem", agente: agenteAtual, texto, trocou: false };
}

export function textoAjuda(): string {
  const linhas = Object.values(PERSONAS).map(
    (p) => `${p.emoji} */${p.id}* — ${p.descricao}`,
  );
  return [
    "*Seus agentes*",
    "",
    ...linhas,
    "",
    "*/novo* — começa a conversa do zero com o agente atual",
    "*/status* — quem está falando, qual modelo, robô ligado ou pausado",
    "",
    "_Sem barra nenhuma, você fala com quem falou por último._",
  ].join("\n");
}
