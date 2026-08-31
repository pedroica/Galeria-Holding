// Loop agêntico provider-agnóstico: modelo pede tool → executamos → devolvemos
// → repete até ele responder em texto. É este loop que faz um agente do
// WhatsApp se comportar como o Claude que você usa no chat.
//
// Guardrails embutidos:
//   - teto de iterações (nunca roda para sempre em cima do seu crédito)
//   - tool desconhecida/negada vira tool_result de erro, não exceção (o modelo
//     se corrige sozinho na iteração seguinte)
//   - toda chamada é registrada em `trace` para virar linha na tabela events

import type {
  AgentMessage,
  LlmProvider,
  LlmTurn,
  ToolCall,
  ToolResult,
  ToolSpec,
} from "./types.ts";

export interface ToolExecutor {
  (call: ToolCall): Promise<{ content: string; isError?: boolean }>;
}

export interface LoopOptions {
  maxIterations?: number;
  maxTokens?: number;
  /** Tempo total (ms) — na Vercel a função morre, melhor cortar antes. */
  deadlineMs?: number;
  now?: () => number;
}

export interface TraceEntry {
  iteration: number;
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  ms: number;
  preview: string;
}

export interface LoopResult {
  text: string;
  messages: AgentMessage[];
  trace: TraceEntry[];
  iterations: number;
  usage: { inputTokens: number; outputTokens: number };
  stoppedBy: "end_turn" | "max_iterations" | "deadline" | "refusal" | "max_tokens";
  model: string;
}

const FALLBACK_TEXT =
  "Travei no meio da tarefa (limite de passos). Me manda de novo com menos coisa de uma vez.";

export async function runAgentLoop(
  provider: LlmProvider,
  system: string,
  tools: ToolSpec[],
  history: AgentMessage[],
  execute: ToolExecutor,
  opts: LoopOptions = {},
): Promise<LoopResult> {
  const maxIterations = opts.maxIterations ?? 8;
  const now = opts.now ?? Date.now;
  const started = now();
  const deadline = opts.deadlineMs ? started + opts.deadlineMs : Infinity;

  const messages: AgentMessage[] = [...history];
  const trace: TraceEntry[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let lastText = "";
  let iterations = 0;
  let model = provider.model;

  while (iterations < maxIterations) {
    if (now() >= deadline) {
      return finish("deadline");
    }
    iterations++;

    const turn: LlmTurn = await provider.complete({
      system,
      // Cópia: `messages` segue sendo mutado depois desta chamada, e um
      // provider que só serializar mais tarde veria um histórico do futuro.
      messages: [...messages],
      tools,
      maxTokens: opts.maxTokens,
    });
    usage.inputTokens += turn.usage.inputTokens;
    usage.outputTokens += turn.usage.outputTokens;
    model = turn.model;
    if (turn.text) lastText = turn.text;

    if (turn.stopReason === "refusal") return finish("refusal");

    if (!turn.toolCalls.length) {
      if (turn.stopReason === "max_tokens") return finish("max_tokens");
      messages.push({ role: "assistant", text: turn.text });
      return finish("end_turn");
    }

    messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });

    // Tools da mesma rodada rodam em paralelo e voltam numa única mensagem.
    const results: ToolResult[] = await Promise.all(
      turn.toolCalls.map(async (call): Promise<ToolResult> => {
        const t0 = now();
        try {
          const r = await execute(call);
          trace.push({
            iteration: iterations,
            tool: call.name,
            input: call.input,
            ok: !r.isError,
            ms: now() - t0,
            preview: r.content.slice(0, 200),
          });
          return { toolUseId: call.id, content: r.content, isError: r.isError };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          trace.push({
            iteration: iterations,
            tool: call.name,
            input: call.input,
            ok: false,
            ms: now() - t0,
            preview: msg.slice(0, 200),
          });
          return { toolUseId: call.id, content: `ERRO: ${msg}`, isError: true };
        }
      }),
    );
    messages.push({ role: "tool", results });
  }

  return finish("max_iterations");

  function finish(stoppedBy: LoopResult["stoppedBy"]): LoopResult {
    return {
      text: lastText || (stoppedBy === "end_turn" ? "" : FALLBACK_TEXT),
      messages,
      trace,
      iterations,
      usage,
      stoppedBy,
      model,
    };
  }
}
