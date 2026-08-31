// Registro de ferramentas. Uma tool é: schema (o que o modelo vê) + handler (o
// que roda de verdade) + flags de risco.
//
// A allowlist por agente é o que impede a secretária de gastar crédito de Lusha
// e o buscador de mandar mensagem em nome do vendedor.

import type { ToolCall, ToolSpec } from "../llm/types.ts";

export interface ToolContext {
  agentId: string;
  /** Telefone de quem está falando (E.164 só dígitos). */
  from: string;
  dryRun: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Gasta crédito Lusha / dispara coisa externa → bloqueada em DRY_RUN. */
  external?: boolean;
  handler(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

export function specOf(tool: AgentTool): ToolSpec {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}

/** Schema de objeto — açúcar para não repetir boilerplate em cada tool. */
export function obj(
  props: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties: props, required, additionalProperties: false };
}

export const str = (description: string) => ({ type: "string", description });
export const num = (description: string) => ({ type: "number", description });
export const bool = (description: string) => ({ type: "boolean", description });
export const enumOf = (description: string, values: string[]) => ({
  type: "string",
  description,
  enum: values,
});

export interface Toolbox {
  specs(allow: string[]): ToolSpec[];
  execute(call: ToolCall, allow: string[], ctx: ToolContext): Promise<{ content: string; isError?: boolean }>;
}

export function createToolbox(tools: AgentTool[]): Toolbox {
  const byName = new Map(tools.map((t) => [t.name, t]));

  return {
    specs(allow) {
      return allow
        .map((n) => byName.get(n))
        .filter((t): t is AgentTool => !!t)
        .map(specOf);
    },

    async execute(call, allow, ctx) {
      const tool = byName.get(call.name);
      // Erros voltam como tool_result (não como exceção) para o modelo se
      // corrigir sozinho na próxima iteração.
      if (!tool) {
        return { content: `ERRO: ferramenta "${call.name}" não existe.`, isError: true };
      }
      if (!allow.includes(call.name)) {
        return {
          content: `ERRO: o agente "${ctx.agentId}" não tem permissão para usar "${call.name}".`,
          isError: true,
        };
      }
      if (tool.external && ctx.dryRun) {
        return {
          content:
            `BLOQUEADO POR DRY_RUN: "${call.name}" gastaria crédito/faria ação externa. ` +
            `Explique ao usuário o que faria e diga que DRY_RUN=true está ligado.`,
          isError: true,
        };
      }
      const out = await tool.handler(call.input || {}, ctx);
      return { content: typeof out === "string" ? out : JSON.stringify(out) };
    },
  };
}
