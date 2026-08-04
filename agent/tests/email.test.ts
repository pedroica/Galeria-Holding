import { test } from "node:test";
import assert from "node:assert/strict";
import { inferArea } from "../src/email/area.ts";
import { render, renderD0, renderFollowupD4 } from "../src/email/template.ts";
import { buildRfc822, buildDraftRaw } from "../src/email/draft.ts";

test("inferArea: segmento → área", () => {
  assert.equal(inferArea("Siderurgia"), "Construção");
  assert.equal(inferArea("Banco"), "Varejo PF");
  assert.equal(inferArea("Agronegócio"), "Agro");
  assert.equal(inferArea("Bebidas"), "Grande Consumo");
  // fallback nunca vaza vazio
  assert.equal(inferArea(""), "seu segmento");
  assert.equal(inferArea("Blockchain Quântico"), "Blockchain Quântico");
});

test("render: NENHUM placeholder pode vazar", () => {
  // faltando AREA → deve lançar (não vaza {AREA})
  assert.throws(() => render("Oi {NOME}, sobre {AREA}", { NOME: "Ana" }), /Placeholder sem valor: \{AREA\}/);
  // placeholder desconhecido no template também é pego
  assert.throws(() => render("Oi {NOME} {XPTO}", { NOME: "Ana", XPTO: "" }), /Placeholder/);
});

test("renderD0: assunto + corpo personalizados, sem placeholders", () => {
  const r = renderD0({ NOME: "Débora", EMPRESA: "Gerdau", AREA: "Construção" });
  assert.equal(r.subject, "Reunião Pedro Ica / Gerdau");
  assert.match(r.text, /^Débora,/);
  assert.match(r.text, /relevante para Construção/);
  assert.ok(!/\{[A-Z]/.test(r.text), "vazou placeholder no texto");
  assert.ok(!/\{[A-Z]/.test(r.html), "vazou placeholder no html");
  assert.match(r.html, /Pedro Ica/);
  assert.match(r.html, /Growth/);
});

test("renderD0 em lote: nenhuma empresa vaza placeholder", () => {
  const empresas = [
    { NOME: "Mariana Moreira", EMPRESA: "Ambev", AREA: inferArea("Bebidas") },
    { NOME: "Tati Lima", EMPRESA: "Localiza", AREA: inferArea("Locação de veículos") },
    { NOME: "Malu", EMPRESA: "Suzano", AREA: inferArea("Papel e Celulose") },
  ];
  for (const e of empresas) {
    const r = renderD0(e);
    assert.ok(!/\{[A-ZÁ]/.test(r.subject + r.text + r.html), `vazou em ${e.EMPRESA}`);
  }
});

test("followup D+4: curto e sem placeholder", () => {
  const r = renderFollowupD4({ NOME: "Débora", EMPRESA: "Gerdau", AREA: "Construção" });
  assert.match(r.text, /convite pros 15 minutos/);
  assert.ok(!/\{[A-Z]/.test(r.text));
});

test("buildRfc822: headers + partes text/html com assunto UTF-8 codificado", () => {
  const r = renderD0({ NOME: "Débora", EMPRESA: "Gerdau", AREA: "Construção" });
  const mime = buildRfc822({
    fromName: "Pedro Ica", fromEmail: "pedro.ica@galeriaholding.co",
    toName: "Débora Baum", toEmail: "debora.baum@gerdau.com.br",
    subject: r.subject, text: r.text, html: r.html,
  });
  assert.match(mime, /To: =\?UTF-8\?B\?.*\?= <debora\.baum@gerdau\.com\.br>/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/); // "Reunião" tem acento → codificado
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /text\/plain/);
  assert.match(mime, /text\/html/);
});

test("buildDraftRaw: base64url válido e decodifica de volta", () => {
  const raw = buildDraftRaw({
    fromEmail: "pedro.ica@galeriaholding.co",
    toEmail: "x@empresa.com.br",
    subject: "Reunião Pedro Ica / X",
    text: "Oi", html: "<p>Oi</p>",
  });
  assert.ok(!/[+/=]/.test(raw), "raw deve ser base64url (sem + / =)");
  const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.match(decoded, /To: x@empresa\.com\.br/);
  assert.match(decoded, /Content-Type: multipart\/alternative/);
});
