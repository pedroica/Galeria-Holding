import { test } from "node:test";
import assert from "node:assert/strict";
import { renderD0 } from "../src/email/template.ts";
import { inferArea } from "../src/email/area.ts";
import { buildGraphDraft, getAccessToken } from "../src/email/outlook.ts";

test("buildGraphDraft: monta payload do Graph (HTML + destinatário)", () => {
  const r = renderD0({ NOME: "Mariana", EMPRESA: "Ambev", AREA: inferArea("Bebidas") });
  const msg = buildGraphDraft(r, { name: "Mariana Moreira", email: "mariana@ambev.com.br" });
  assert.equal(msg.subject, "Reunião Pedro Ica / Ambev");
  assert.equal(msg.body.contentType, "HTML");
  assert.match(msg.body.content, /Grande Consumo/);
  assert.equal(msg.toRecipients[0].emailAddress.address, "mariana@ambev.com.br");
  assert.equal(msg.toRecipients[0].emailAddress.name, "Mariana Moreira");
  assert.ok(!/\{[A-ZÁ]/.test(msg.body.content), "vazou placeholder");
});

test("buildGraphDraft: sem email lança", () => {
  const r = renderD0({ NOME: "X", EMPRESA: "Y", AREA: "Z" });
  assert.throws(() => buildGraphDraft(r, { email: "" }), /destinat/);
});

test("getAccessToken: troca refresh por access token (fetch injetado)", async () => {
  let calledUrl = "";
  const fakeFetch = (async (url: any, init: any) => {
    calledUrl = String(url);
    const params = new URLSearchParams(init.body);
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("refresh_token"), "RT123");
    return { ok: true, json: async () => ({ access_token: "AT456" }) } as any;
  }) as unknown as typeof fetch;

  const tok = await getAccessToken(
    { tenant: "common", clientId: "cid", clientSecret: "sec", refreshToken: "RT123" },
    fakeFetch,
  );
  assert.equal(tok, "AT456");
  assert.match(calledUrl, /login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/token/);
});
