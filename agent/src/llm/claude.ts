// Provider Claude — SDK oficial da Anthropic (@anthropic-ai/sdk).
// É este o caminho que dá aos agentes o mesmo comportamento que você tem no
// chat: pensamento adaptativo + tool use nativo.

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentMessage,
  CompleteParams,
  LlmProvider,
  LlmTurn,
  StopReason,
} from "./types.ts";

export interface ClaudeOptions {
  apiKey?: string;
  model?: string;
  /** "low" | "medium" | "high" | "xhigh" | "max" — profundidade de raciocínio. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

/** Traduz o histórico neutro para o formato de messages da Anthropic. */
export function toAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
      continue;
    }
    if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const c of m.toolCalls || []) {
        blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      }
      // Um turno de assistant sem nenhum bloco é rejeitado pela API.
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }
    // Todos os tool_result de uma rodada vão em UMA única mensagem user —
    // quebrar em várias ensina o modelo a parar de chamar tools em paralelo.
    out.push({
      role: "user",
      content: m.results.map((r): Anthropic.ToolResultBlockParam => ({
        type: "tool_result",
        tool_use_id: r.toolUseId,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    });
  }
  return out;
}

function mapStop(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "end_turn": return "end_turn";
    case "tool_use": return "tool_use";
    case "max_tokens": return "max_tokens";
    case "refusal": return "refusal";
    default: return "other";
  }
}

export function createClaudeProvider(opts: ClaudeOptions = {}): LlmProvider {
  const model = opts.model || "claude-opus-5";
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});

  return {
    kind: "claude",
    model,
    async complete(params: CompleteParams): Promise<LlmTurn> {
      const res = await client.messages.create({
        model,
        max_tokens: params.maxTokens ?? 8000,
        // O prompt do agente é estável entre turnos → cacheável (economiza ~90%
        // do custo de input em conversas longas no WhatsApp).
        system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort ?? "medium" },
        tools: params.tools.map((t): Anthropic.Tool => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: toAnthropicMessages(params.messages),
      });

      let text = "";
      const toolCalls = [];
      for (const block of res.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: (block.input || {}) as Record<string, unknown>,
          });
        }
      }

      return {
        text: text.trim(),
        toolCalls,
        stopReason: mapStop(res.stop_reason),
        usage: {
          inputTokens: res.usage?.input_tokens ?? 0,
          outputTokens: res.usage?.output_tokens ?? 0,
        },
        model: res.model || model,
      };
    },
  };
}
