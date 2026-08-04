import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  nameTokens,
  canonicalName,
  normalizeDomain,
  domainMatches,
  normalizePhoneBR,
  isGenericEmail,
} from "../src/lib/normalize.ts";

test("normalizeName: acentos e caixa", () => {
  assert.equal(normalizeName("Itaú"), "itau");
  assert.equal(normalizeName("3 Corações"), "3 coracoes");
  assert.equal(normalizeName("McDonald's"), "mcdonald s");
  assert.equal(normalizeName("Track & Field"), "track e field");
});

test("nameTokens: remove sufixos societários e conectores", () => {
  assert.deepEqual(nameTokens("Banco Itaú S.A."), ["banco", "itau"]);
  assert.deepEqual(nameTokens("Track & Field"), ["track", "field"]);
  assert.deepEqual(nameTokens("Laticínios Bela Vista LTDA"), ["laticinios", "bela", "vista"]);
});

test("canonicalName: forma compacta estável", () => {
  assert.equal(canonicalName("Itaú Unibanco S.A."), "itau unibanco");
});

test("normalizeDomain: extrai de url e email", () => {
  assert.equal(normalizeDomain("https://www.Itau.com.br/pra"), "itau.com.br");
  assert.equal(normalizeDomain("plima@3coracoes.com.br"), "3coracoes.com.br");
  assert.equal(normalizeDomain("MAIL.NATURA.COM.BR"), "mail.natura.com.br");
});

test("domainMatches: igual ou subdomínio", () => {
  assert.equal(domainMatches("mail.itau.com.br", "itau.com.br"), true);
  assert.equal(domainMatches("itau.com.br", "itau.com.br"), true);
  assert.equal(domainMatches("naoitau.com.br", "itau.com.br"), false);
  assert.equal(domainMatches("itau.com.br.evil.com", "itau.com.br"), false);
});

test("normalizePhoneBR: valida celular BR", () => {
  assert.equal(normalizePhoneBR("(11) 99999-8888"), "+5511999998888");
  assert.equal(normalizePhoneBR("+55 11 99999 8888"), "+5511999998888");
  assert.equal(normalizePhoneBR("5511999998888"), "+5511999998888");
  // Fixo (não começa com 9) → inválido como celular
  assert.equal(normalizePhoneBR("(11) 3628-0472"), null);
  assert.equal(normalizePhoneBR("123"), null);
});

test("isGenericEmail: descarta role-based", () => {
  assert.equal(isGenericEmail("contato@empresa.com"), true);
  assert.equal(isGenericEmail("marketing@empresa.com"), true);
  assert.equal(isGenericEmail("debora.baum@gerdau.com.br"), false);
});
