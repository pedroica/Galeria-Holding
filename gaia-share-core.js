/* ═══════════════════════════════════════════════════════════════════════════
   GAIA SHARE CORE — empacotamento + criptografia do board GAIA
   Usado por:
     • block_gaia_share.js  (CRM — gera o link / publica)
     • gaia.html            (página do time — abre o board, somente leitura)

   Modelo de segurança:
   O board é serializado num formato compacto e criptografado no navegador
   com AES-GCM 256, chave derivada do CÓDIGO DE ACESSO via PBKDF2-SHA256
   (210k iterações). Nem a URL, nem o servidor, nem o KV veem os dados em
   claro — só quem tem o código consegue abrir. O link/servidor carregam
   apenas o texto cifrado.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  var VERSION = 1;
  var ITER = 210000;

  /* ── base64url ──────────────────────────────────────────────────────────── */
  function b64urlEnc(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDec(str) {
    var s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ── formato compacto ───────────────────────────────────────────────────────
     Arrays posicionais em vez de objetos: o link fica ~4x menor.
     col:  [id, label, accent]
     card: [name, col, product, tag, note, value]                             */
  function pack(tab, opts) {
    opts = opts || {};
    var cols = (tab.cols || []).filter(function (c) {
      return !(opts.hideCols || []).includes(c.id);
    });
    var colIds = cols.map(function (c) { return c.id; });
    var cards = (tab.cards || []).filter(function (c) {
      return colIds.indexOf(c.col) >= 0;
    });
    return {
      v: VERSION,
      t: opts.title || tab.label || "Pipeline GAIA",
      at: opts.at || 0,
      c: cols.map(function (c) { return [c.id, c.label, c.accent || "gray"]; }),
      k: cards.map(function (c) {
        return [
          c.name || "",
          c.col || "",
          c.product || c.galeria || "",
          c.tag || "",
          opts.hideNotes ? "" : (c.note || c.nota || ""),
          opts.hideValues ? 0 : (+c.value || 0)
        ];
      })
    };
  }

  function unpack(p) {
    if (!p || p.v !== VERSION) throw new Error("Formato do board não reconhecido.");
    return {
      title: p.t || "Pipeline GAIA",
      updatedAt: p.at || 0,
      cols: (p.c || []).map(function (a) {
        return { id: a[0], label: a[1], accent: a[2] };
      }),
      cards: (p.k || []).map(function (a, i) {
        return {
          id: i + 1, name: a[0], col: a[1], product: a[2],
          tag: a[3], note: a[4], value: +a[5] || 0
        };
      })
    };
  }

  /* ── criptografia ───────────────────────────────────────────────────────── */
  function subtle() {
    var c = root.crypto && root.crypto.subtle;
    if (!c) throw new Error(
      "Criptografia indisponível neste navegador/contexto. Use HTTPS (a URL do Vercel já é)."
    );
    return c;
  }

  async function deriveKey(code, salt, usage) {
    var base = await subtle().importKey(
      "raw", new TextEncoder().encode(String(code)), "PBKDF2", false, ["deriveKey"]
    );
    return subtle().deriveKey(
      { name: "PBKDF2", salt: salt, iterations: ITER, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, usage
    );
  }

  /* blob = [ver(1)][salt(16)][iv(12)][ciphertext] → base64url */
  async function encrypt(obj, code) {
    var salt = root.crypto.getRandomValues(new Uint8Array(16));
    var iv = root.crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(code, salt, ["encrypt"]);
    var ct = new Uint8Array(await subtle().encrypt(
      { name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(JSON.stringify(obj))
    ));
    var out = new Uint8Array(1 + 16 + 12 + ct.length);
    out[0] = VERSION;
    out.set(salt, 1); out.set(iv, 17); out.set(ct, 29);
    return b64urlEnc(out);
  }

  async function decrypt(blob, code) {
    var raw = b64urlDec(blob);
    if (raw.length < 30 || raw[0] !== VERSION) throw new Error("Link inválido ou corrompido.");
    var key = await deriveKey(code, raw.slice(1, 17), ["decrypt"]);
    var plain;
    try {
      plain = await subtle().decrypt(
        { name: "AES-GCM", iv: raw.slice(17, 29) }, key, raw.slice(29)
      );
    } catch (e) {
      var err = new Error("Código de acesso incorreto.");
      err.wrongCode = true;
      throw err;
    }
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /* ── endpoint do board publicado (link fixo, opcional) ──────────────────── */
  var API = "/api/gaia-board";

  async function fetchPublished() {
    var r = await fetch(API, { cache: "no-store" });
    var j = null;
    try { j = await r.json(); } catch (e) {}
    if (r.status === 501) throw new Error(
      (j && j.error) || "Link fixo não configurado neste projeto."
    );
    if (r.status === 404) throw new Error("Nenhum board publicado ainda.");
    if (!r.ok || !j || !j.blob) throw new Error((j && j.error) || ("Erro " + r.status));
    return j; // { blob, updatedAt }
  }

  async function publish(blob, token) {
    var r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gaia-token": token || "" },
      body: JSON.stringify({ blob: blob })
    });
    var j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && j.error) || ("Erro " + r.status + " ao publicar."));
    return j;
  }

  root.GaiaShare = {
    VERSION: VERSION,
    pack: pack,
    unpack: unpack,
    encrypt: encrypt,
    decrypt: decrypt,
    fetchPublished: fetchPublished,
    publish: publish,
    b64urlEnc: b64urlEnc,
    b64urlDec: b64urlDec
  };
})(typeof window !== "undefined" ? window : this);
