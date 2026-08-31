import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop, type ToolExecutor } from "../src/llm/loop.ts";
import type { CompleteParams, LlmProvider, LlmTurn } from "../src/llm/types.ts";

/** Provider falso que devolve turnos programados em sequência. */
function fakeProvider(turnos: Partial<LlmTurn>[]): LlmProvider & { chamadas: CompleteParams[] } {
  let i = 0;
  const chamadas: CompleteParams[] = [];
  return {
    kind: "fake",
    model: "fake-1",
    chamadas,
    async complete(params) {
      chamadas.push(params);
      const t = turnos[Math.min(i++, turnos.length - 1)];
      return {
        text: "",
        toolCalls: [],
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5 },
        model: "fake-1",
        ...t,
      } as LlmTurn;
    },
  };
}

const semTools: ToolExecutor = async () => ({ content: "{}" });

test("responde direto quando não há tool call", async () => {
  const p = fakeProvider([{ text: "faltam 812 CMOs", stopReason: "end_turn" }]);
  const r = await runAgentLoop(p, "sys", [], [{ role: "user", text: "e aí?" }], semTools);
  assert.equal(r.text, "faltam 812 CMOs");
  assert.equal(r.iterations, 1);
  assert.equal(r.stoppedBy, "end_turn");
  assert.equal(r.usage.outputTokens, 5);
});

test("executa a tool e devolve o resultado ao modelo antes de responder", async () => {
  const p = fakeProvider([
    { toolCalls: [{ id: "t1", name: "progresso_cmos", input: {} }], stopReason: "tool_use" },
    { text: "estamos em 64%", stopReason: "end_turn" },
  ]);
  const executadas: string[] = [];
  const exec: ToolExecutor = async (c) => {
    executadas.push(c.name);
    return { content: JSON.stringify({ pct: 64 }) };
  };
  const r = await runAgentLoop(p, "sys", [], [{ role: "user", text: "progresso?" }], exec);

  assert.deepEqual(executadas, ["progresso_cmos"]);
  assert.equal(r.text, "estamos em 64%");
  assert.equal(r.iterations, 2);
  // A 2ª chamada ao modelo já carrega o tool_result.
  const ultima = p.chamadas[1].messages;
  assert.equal(ultima[ultima.length - 1].role, "tool");
  assert.equal(r.trace[0].tool, "progresso_cmos");
  assert.equal(r.trace[0].ok, true);
});

test("tools da mesma rodada voltam numa única mensagem", async () => {
  const p = fakeProvider([
    {
      toolCalls: [
        { id: "a", name: "buscar_empresas", input: { termo: "ambev" } },
        { id: "b", name: "metricas_gerais", input: {} },
      ],
      stopReason: "tool_use",
    },
    { text: "pronto", stopReason: "end_turn" },
  ]);
  const r = await runAgentLoop(p, "sys", [], [{ role: "user", text: "x" }], semTools);
  const msgTool = r.messages.filter((m) => m.role === "tool");
  assert.equal(msgTool.length, 1);
  assert.equal((msgTool[0] as any).results.length, 2);
});

test("tool que lança vira tool_result de erro, não exceção", async () => {
  const p = fakeProvider([
    { toolCalls: [{ id: "t1", name: "quebra", input: {} }], stopReason: "tool_use" },
    { text: "não consegui consultar", stopReason: "end_turn" },
  ]);
  const exec: ToolExecutor = async () => {
    throw new Error("Supabase 500");
  };
  const r = await runAgentLoop(p, "sys", [], [{ role: "user", text: "x" }], exec);
  assert.equal(r.text, "não consegui consultar");
  assert.equal(r.trace[0].ok, false);
  const results = (r.messages.find((m) => m.role === "tool") as any).results;
  assert.equal(results[0].isError, true);
  assert.match(results[0].content, /Supabase 500/);
});

test("teto de iterações interrompe o loop infinito de tools", async () => {
  const p = fakeProvider([{ toolCalls: [{ id: "t", name: "loop", input: {} }], stopReason: "tool_use" }]);
  const r = await runAgentLoop(p, "sys", [], [{ role: "user", text: "x" }], semTools, {
    maxIterations: 3,
  });
  assert.equal(r.iterations, 3);
  assert.equal(r.stoppedBy, "max_iterations");
  assert.match(r.text, /limite de passos/i);
});

test("deadline corta antes de chamar o modelo de novo", async () => {
  let t = 0;
  const now = () => (t += 1000); // cada consulta ao relógio avança 1s
  const p = fakeProvider([{ toolCalls: [{ id: "t", name: "x", input: {} }], stopReason: "tool_use" }]);
  const r = await runAgentLoop(p, "sys", [], [{ role: "user", text: "x" }], semTools, {
    maxIterations: 50,
    deadlineMs: 2000,
    now,
  });
  assert.equal(r.stoppedBy, "deadline");
  assert.ok(r.iterations < 50);
});

test("recusa do modelo encerra sem estourar", async () => {
  const p = fakeProvider([{ text: "", stopReason: "refusal" }]);
  const r = await runAgentLoop(p, "sys", [], [{ role: "user", text: "x" }], semTools);
  assert.equal(r.stoppedBy, "refusal");
});

test("histórico anterior é preservado no resultado", async () => {
  const p = fakeProvider([{ text: "ok", stopReason: "end_turn" }]);
  const historico = [
    { role: "user" as const, text: "primeira" },
    { role: "assistant" as const, text: "resposta" },
    { role: "user" as const, text: "segunda" },
  ];
  const r = await runAgentLoop(p, "sys", [], historico, semTools);
  assert.equal(r.messages.length, 4);
  assert.equal(r.messages[0].role, "user");
});
