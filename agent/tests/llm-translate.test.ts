import { test } from "node:test";
import assert from "node:assert/strict";
import { toAnthropicMessages } from "../src/llm/claude.ts";
import { toOpenAiMessages, parseToolArguments, createQwenProvider } from "../src/llm/qwen.ts";
import { decideBrain } from "../src/llm/router.ts";
import { loadEnv } from "../src/config.ts";
import type { AgentMessage } from "../src/llm/types.ts";

const HISTORICO: AgentMessage[] = [
  { role: "user", text: "quantos faltam?" },
  {
    role: "assistant",
    text: "vou consultar",
    toolCalls: [{ id: "t1", name: "progresso_cmos", input: { detalhe: true } }],
  },
  { role: "tool", results: [{ toolUseId: "t1", content: '{"pct":64}' }] },
  { role: "assistant", text: "64%" },
];

test("Anthropic: tool_results de uma rodada viram UMA mensagem user", () => {
  const m = toAnthropicMessages([
    { role: "user", text: "x" },
    {
      role: "assistant",
      text: "",
      toolCalls: [
        { id: "a", name: "t1", input: {} },
        { id: "b", name: "t2", input: {} },
      ],
    },
    {
      role: "tool",
      results: [
        { toolUseId: "a", content: "1" },
        { toolUseId: "b", content: "2" },
      ],
    },
  ]);
  assert.equal(m.length, 3);
  assert.equal(m[2].role, "user");
  assert.equal((m[2].content as any[]).length, 2);
  assert.equal((m[2].content as any[])[0].type, "tool_result");
});

test("Anthropic: assistant sem texto e sem tool não vira mensagem vazia", () => {
  const m = toAnthropicMessages([
    { role: "user", text: "x" },
    { role: "assistant", text: "" },
  ]);
  assert.equal(m.length, 1);
});

test("Anthropic: erro de tool carrega is_error", () => {
  const m = toAnthropicMessages([
    { role: "user", text: "x" },
    { role: "assistant", text: "", toolCalls: [{ id: "a", name: "t", input: {} }] },
    { role: "tool", results: [{ toolUseId: "a", content: "falhou", isError: true }] },
  ]);
  assert.equal((m[2].content as any[])[0].is_error, true);
});

test("OpenAI/Qwen: system vem primeiro e cada tool_result é uma mensagem", () => {
  const m = toOpenAiMessages("prompt do agente", HISTORICO) as any[];
  assert.equal(m[0].role, "system");
  assert.equal(m[0].content, "prompt do agente");
  assert.equal(m[2].role, "assistant");
  assert.equal(m[2].tool_calls[0].function.name, "progresso_cmos");
  assert.equal(m[2].tool_calls[0].function.arguments, '{"detalhe":true}');
  assert.equal(m[3].role, "tool");
  assert.equal(m[3].tool_call_id, "t1");
});

test("argumentos malformados do Qwen não derrubam a chamada", () => {
  assert.deepEqual(parseToolArguments('{"a":1}'), { a: 1 });
  assert.deepEqual(parseToolArguments("não é json"), {});
  assert.deepEqual(parseToolArguments("[1,2]"), {});
  assert.deepEqual(parseToolArguments(undefined), {});
});

test("Qwen: resposta com tool_calls é traduzida para o formato neutro", async () => {
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        model: "qwen-plus",
        choices: [{
          finish_reason: "tool_calls",
          message: {
            content: null,
            tool_calls: [{ id: "call_1", function: { name: "buscar_empresas", arguments: '{"termo":"ambev"}' } }],
          },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
      { status: 200 },
    );
  const p = createQwenProvider({ apiKey: "k", baseUrl: "https://x/v1", fetchImpl: fakeFetch as any });
  const t = await p.complete({ system: "s", messages: [{ role: "user", text: "oi" }], tools: [] });
  assert.equal(t.stopReason, "tool_use");
  assert.equal(t.toolCalls[0].name, "buscar_empresas");
  assert.deepEqual(t.toolCalls[0].input, { termo: "ambev" });
  assert.equal(t.usage.inputTokens, 100);
});

test("Qwen: erro HTTP vira exceção com o corpo no texto", async () => {
  const fakeFetch = async () => new Response("sem crédito", { status: 429 });
  const p = createQwenProvider({ apiKey: "k", baseUrl: "https://x/v1", fetchImpl: fakeFetch as any });
  await assert.rejects(
    () => p.complete({ system: "s", messages: [], tools: [] }),
    /Qwen 429.*sem crédito/s,
  );
});

test("roteador: sem Qwen configurado, buscador cai para Claude", () => {
  const env = loadEnv({ ANTHROPIC_API_KEY: "sk-ant-x" });
  const d = decideBrain("buscador", "qwen", env, {});
  assert.deepEqual(d, { brain: "claude", reason: "qwen_unavailable" });
});

test("roteador: com Qwen configurado, respeita a persona", () => {
  const env = loadEnv({ QWEN_API_KEY: "k", QWEN_BASE_URL: "https://x/v1" });
  assert.equal(decideBrain("buscador", "qwen", env, {}).brain, "qwen");
  assert.equal(decideBrain("vendedor", "claude", env, {}).brain, "claude");
});

test("roteador: env AGENT_BRAIN_<ID> tem prioridade sobre a persona", () => {
  const env = loadEnv({ QWEN_API_KEY: "k", QWEN_BASE_URL: "https://x/v1", ANTHROPIC_API_KEY: "sk" });
  const d = decideBrain("vendedor", "claude", env, { AGENT_BRAIN_VENDEDOR: "qwen" });
  assert.deepEqual(d, { brain: "qwen", reason: "env_override" });
});
