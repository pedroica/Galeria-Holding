import { test } from "node:test";
import assert from "node:assert/strict";
import { BlocklistMatcher } from "../src/lib/blocklist.ts";
import { BLOCKLIST_SEED } from "../src/data/blocklist.seed.ts";

const m = new BlocklistMatcher(BLOCKLIST_SEED);

test("bloqueia por nome exato", () => {
  const r = m.check({ name: "Itaú" });
  assert.equal(r.blocked, true);
  assert.equal(r.entryName, "Itaú");
});

test("bloqueia variação de nome (Itau Unibanco ≈ Itaú)", () => {
  assert.equal(m.isBlocked({ name: "Itau Unibanco" }), true);
  assert.equal(m.isBlocked({ name: "Banco Itaú S.A." }), true);
  assert.equal(m.isBlocked({ name: "ITAÚ BBA" }), true);
});

test("bloqueia McDonald's em várias grafias", () => {
  assert.equal(m.isBlocked({ name: "McDonald's" }), true);
  assert.equal(m.isBlocked({ name: "McDonalds" }), true);
  assert.equal(m.isBlocked({ name: "Arcos Dorados" }), true);
});

test("bloqueia por domínio de email", () => {
  const r = m.check({ email: "plima@3coracoes.com.br" });
  assert.equal(r.blocked, true);
  assert.equal(r.reason, "domain");
  assert.equal(r.entryName, "3 Corações");
});

test("bloqueia grupo econômico por domínio (natura.com.br e naturaeco.com)", () => {
  assert.equal(m.isBlocked({ domain: "natura.com.br" }), true);
  assert.equal(m.isBlocked({ email: "maria@naturaeco.com" }), true);
});

test("bloqueia grupo econômico Stellantis por marca (Peugeot, Fiat, Jeep)", () => {
  assert.equal(m.isBlocked({ name: "Peugeot do Brasil" }), true);
  assert.equal(m.isBlocked({ name: "Fiat" }), true);
  assert.equal(m.isBlocked({ name: "Jeep Brasil" }), true);
});

// ── Guardas contra falso-positivo ──────────────────────────────────────────
test("NÃO bloqueia empresa fora da lista (Gerdau)", () => {
  assert.equal(m.isBlocked({ name: "Gerdau", email: "debora.baum@gerdau.com.br" }), false);
});

test("NÃO bloqueia '99' como substring/token parcial (Loja 99 Variedades)", () => {
  assert.equal(m.isBlocked({ name: "Loja 99 Variedades" }), false);
  // mas bloqueia o nome exato "99"
  assert.equal(m.isBlocked({ name: "99" }), true);
});

test("NÃO bloqueia 'Naturalle' (natura não é token inteiro)", () => {
  assert.equal(m.isBlocked({ name: "Naturalle Alimentos" }), false);
});

test("NÃO confunde domínio parecido", () => {
  assert.equal(m.isBlocked({ email: "x@itau.com.br.evil.com" }), false);
  assert.equal(m.isBlocked({ email: "x@naoitau.com.br" }), false);
});

test("entrada inativa não bloqueia", () => {
  const m2 = new BlocklistMatcher([
    { id: "x", canonicalName: "Teste", aliases: ["teste"], domains: [], active: false },
  ]);
  assert.equal(m2.isBlocked({ name: "Teste" }), false);
});
