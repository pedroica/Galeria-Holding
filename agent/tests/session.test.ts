import { test } from "node:test";
import assert from "node:assert/strict";
import { trimHistory, claimMessage, MAX_HISTORY } from "../src/session/store.ts";
import { createToolbox, obj, str } from "../src/tools/registry.ts";
import type { AgentMessage } from "../src/llm/types.ts";

test("histórico curto passa intacto", () => {
  const m: AgentMessage[] = [{ role: "user", text: "a" }, { role: "assistant", text: "b" }];
  assert.deepEqual(trimHistory(m, 10), m);
});

test("corte nunca deixa tool_result órfão no começo da janela", () => {
  const m: AgentMessage[] = [];
  for (let i = 0; i < 10; i++) {
    m.push({ role: "user", text: `p${i}` });
    m.push({ role: "assistant", text: "", toolCalls: [{ id: `t${i}`, name: "x", input: {} }] });
    m.push({ role: "tool", results: [{ toolUseId: `t${i}`, content: "{}" }] });
    m.push({ role: "assistant", text: `r${i}` });
  }
  const t = trimHistory(m, 6);
  assert.equal(t[0].role, "user");
  assert.ok(t.length <= 6);
});

test("se não sobrar nenhum turno de usuário, recomeça limpo", () => {
  const m: AgentMessage[] = [
    { role: "user", text: "a" },
    { role: "assistant", text: "b" },
    { role: "assistant", text: "c" },
  ];
  assert.deepEqual(trimHistory(m, 2), []);
});

test("MAX_HISTORY é o default", () => {
  const m: AgentMessage[] = Array.from({ length: MAX_HISTORY + 4 }, () => ({
    role: "user" as const,
    text: "x",
  }));
  assert.equal(trimHistory(m).length, MAX_HISTORY);
});

test("claimMessage: mensagem nova é aceita, repetida é recusada", async () => {
  const vistos = new Set<string>();
  const db: any = {
    async insert(_t: string, rows: any[]) {
      const id = rows[0].wamid;
      if (vistos.has(id)) throw new Error('duplicate key value violates unique constraint (23505)');
      vistos.add(id);
      return [];
    },
  };
  assert.equal(await claimMessage(db, "wamid.1"), true);
  assert.equal(await claimMessage(db, "wamid.1"), false); // reentrega da Meta
  assert.equal(await claimMessage(db, "wamid.2"), true);
});

test("claimMessage propaga erro que não seja de duplicidade", async () => {
  const db: any = { async insert() { throw new Error("Supabase 503"); } };
  await assert.rejects(() => claimMessage(db, "wamid.9"), /503/);
});

// ── Toolbox: a allowlist é a fronteira de segurança entre os agentes ────────
const toolFake = (name: string, external = false) => ({
  name,
  description: "teste",
  inputSchema: obj({ x: str("x") }),
  external,
  handler: async () => ({ chamou: name }),
});

test("toolbox só expõe as tools da allowlist do agente", () => {
  const tb = createToolbox([toolFake("a"), toolFake("b"), toolFake("c")]);
  assert.deepEqual(tb.specs(["a", "c"]).map((s) => s.name), ["a", "c"]);
});

test("chamar tool fora da allowlist devolve erro, não executa", async () => {
  const tb = createToolbox([toolFake("a"), toolFake("secreta")]);
  const r = await tb.execute(
    { id: "1", name: "secreta", input: {} },
    ["a"],
    { agentId: "secretaria", from: "55119", dryRun: false },
  );
  assert.equal(r.isError, true);
  assert.match(r.content, /não tem permissão/);
});

test("tool inexistente devolve erro em vez de estourar", async () => {
  const tb = createToolbox([toolFake("a")]);
  const r = await tb.execute({ id: "1", name: "inventada", input: {} }, ["a"], {
    agentId: "x", from: "y", dryRun: false,
  });
  assert.equal(r.isError, true);
  assert.match(r.content, /não existe/);
});

test("DRY_RUN bloqueia tool externa e deixa passar as internas", async () => {
  const tb = createToolbox([toolFake("interna"), toolFake("gasta_credito", true)]);
  const ctx = { agentId: "buscador", from: "y", dryRun: true };

  const bloqueada = await tb.execute({ id: "1", name: "gasta_credito", input: {} }, ["gasta_credito", "interna"], ctx);
  assert.equal(bloqueada.isError, true);
  assert.match(bloqueada.content, /DRY_RUN/);

  const ok = await tb.execute({ id: "2", name: "interna", input: {} }, ["gasta_credito", "interna"], ctx);
  assert.equal(ok.isError, undefined);
  assert.match(ok.content, /interna/);
});

test("com DRY_RUN desligado a tool externa roda", async () => {
  const tb = createToolbox([toolFake("gasta_credito", true)]);
  const r = await tb.execute({ id: "1", name: "gasta_credito", input: {} }, ["gasta_credito"], {
    agentId: "buscador", from: "y", dryRun: false,
  });
  assert.equal(r.isError, undefined);
});
