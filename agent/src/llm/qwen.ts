// Provider Qwen — endpoint OpenAI-compatible (DashScope, OpenRouter, vLLM
// self-hosted... qualquer um serve, muda só QWEN_BASE_URL).
//
// Sem SDK: são duas rotas HTTP e o payload é estável há anos. Manter em fetch
// puro deixa o pacote `agent/` com dependência única (o SDK da Anthropic).

import type {
  AgentMessage,
  CompleteParams,
  LlmProvider,
  LlmTurn,
  StopReason,
} from "./types.ts";

export interface QwenOptions {
  apiKey: string;
  /** Ex.: https://dashscope-intl.aliyuncs.com/compatible-mode/v1 */
  baseUrl: string;
  model?: string;
  temperature?: number;
  fetchImpl?: typeof fetch; // injetável nos testes
}

interface OpenAiToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

/** Traduz o histórico neutro para o formato OpenAI chat.completions. */
export function toOpenAiMessages(system: string, messages: AgentMessage[]): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      const tc = (m.toolCalls || []).map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.input) },
      }));
      out.push({
        role: "assistant",
        content: m.text || null,
        ...(tc.length ? { tool_calls: tc } : {}),
      });
    } else {
      // OpenAI-compatible: uma mensagem role:"tool" POR resultado.
      for (const r of m.results) {
        out.push({ role: "tool", tool_call_id: r.toolUseId, content: r.content });
      }
    }
  }
  return out;
}

/** Argumentos vêm como string JSON; modelo pequeno às vezes manda lixo. */
export function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapStop(finish: string | undefined, hasCalls: boolean): StopReason {
  if (hasCalls || finish === "tool_calls") return "tool_use";
  if (finish === "length") return "max_tokens";
  if (finish === "stop") return "end_turn";
  return "other";
}

export function createQwenProvider(opts: QwenOptions): LlmProvider {
  const model = opts.model || "qwen-plus";
  const doFetch = opts.fetchImpl || fetch;
  const url = opts.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  return {
    kind: "qwen",
    model,
    async complete(params: CompleteParams): Promise<LlmTurn> {
      const body = {
        model,
        max_tokens: params.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0.3,
        messages: toOpenAiMessages(params.system, params.messages),
        tools: params.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
      };

      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + opts.apiKey,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Qwen ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as any;
      const choice = data?.choices?.[0];
      const msg = choice?.message || {};
      const rawCalls: OpenAiToolCall[] = msg.tool_calls || [];
      const toolCalls = rawCalls.map((c, i) => ({
        id: c.id || `${model}_call_${i}`,
        name: c.function?.name || "",
        input: parseToolArguments(c.function?.arguments),
      }));

      return {
        text: (msg.content || "").trim(),
        toolCalls,
        stopReason: mapStop(choice?.finish_reason, toolCalls.length > 0),
        usage: {
          inputTokens: data?.usage?.prompt_tokens ?? 0,
          outputTokens: data?.usage?.completion_tokens ?? 0,
        },
        model: data?.model || model,
      };
    },
  };
}
