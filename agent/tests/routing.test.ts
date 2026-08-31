import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, textoAjuda } from "../src/agents/routing.ts";

test("mensagem sem barra vai para o agente atual", () => {
  const c = parseCommand("quantos CMOs faltam?", "buscador");
  assert.deepEqual(c, { tipo: "mensagem", agente: "buscador", texto: "quantos CMOs faltam?", trocou: false });
});

test("/vendedor troca de agente e sinaliza a troca", () => {
  const c = parseCommand("/vendedor", "secretaria");
  assert.equal(c.tipo, "mensagem");
  if (c.tipo !== "mensagem") return;
  assert.equal(c.agente, "vendedor");
  assert.equal(c.trocou, true);
});

test("/vendedor com pergunta junto troca e já manda a pergunta", () => {
  const c = parseCommand("/vendedor quem eu falo hoje?", "secretaria");
  if (c.tipo !== "mensagem") return assert.fail("esperava mensagem");
  assert.equal(c.agente, "vendedor");
  assert.equal(c.texto, "quem eu falo hoje?");
  assert.equal(c.trocou, true);
});

test("trocar para o agente que já está ativo não conta como troca", () => {
  const c = parseCommand("/buscador e aí?", "buscador");
  if (c.tipo !== "mensagem") return assert.fail("esperava mensagem");
  assert.equal(c.trocou, false);
});

test("apelidos e acentos resolvem para o mesmo agente", () => {
  for (const alias of ["/sec", "/secretária", "/agenda"]) {
    const c = parseCommand(alias, "vendedor");
    if (c.tipo !== "mensagem") return assert.fail("esperava mensagem");
    assert.equal(c.agente, "secretaria", alias);
  }
  for (const alias of ["/cmo", "/cmos", "/busca"]) {
    const c = parseCommand(alias, "secretaria");
    if (c.tipo !== "mensagem") return assert.fail("esperava mensagem");
    assert.equal(c.agente, "buscador", alias);
  }
});

test("/ajuda, /status e /novo têm tratamento próprio", () => {
  assert.equal(parseCommand("/ajuda").tipo, "ajuda");
  assert.equal(parseCommand("/help").tipo, "ajuda");
  assert.equal(parseCommand("/status").tipo, "status");
  const novo = parseCommand("/novo vendedor", "secretaria");
  assert.deepEqual(novo, { tipo: "novo", agente: "vendedor" });
});

test("/novo sem argumento mantém o agente atual", () => {
  assert.deepEqual(parseCommand("/novo", "buscador"), { tipo: "novo", agente: "buscador" });
});

test("barra desconhecida vira texto normal em vez de erro", () => {
  const c = parseCommand("/chefe manda ver", "secretaria");
  if (c.tipo !== "mensagem") return assert.fail("esperava mensagem");
  assert.equal(c.agente, "secretaria");
  assert.equal(c.texto, "/chefe manda ver");
});

test("mensagem vazia é ignorada", () => {
  assert.equal(parseCommand("   ").tipo, "vazio");
});

test("ajuda lista os três agentes", () => {
  const t = textoAjuda();
  for (const id of ["/secretaria", "/vendedor", "/buscador"]) assert.ok(t.includes(id), id);
});
