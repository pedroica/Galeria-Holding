/* ═══════════════════════════════════════════════════════════════════════════
   COMPARTILHAR BOARD GAIA — modal do CRM (botão "🔗 Compartilhar" no
   Pipeline GAIA). Gera o acesso restrito do time à página /gaia.html:

     • Link com snapshot  → o board cifrado viaja dentro do próprio link.
                            Funciona sem nenhuma configuração.
     • Link fixo          → publica o board cifrado em /api/gaia-board;
                            o time usa sempre a mesma URL (/gaia.html).

   Em ambos os casos o conteúdo é cifrado com o código de acesso (AES-GCM,
   PBKDF2). Sem o código, o link não abre nada.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const h = React.createElement;
  const { useState } = React;
  const TOKEN_KEY = "gh_gaia_publish_token";
  const CODE_KEY = "gh_gaia_share_code";

  const C = {
    bg: "#111827", line: "#2D2D44", sunk: "#0f1623", txt: "#F5F5F5",
    dim: "#9B9BB4", faint: "#6B6B85", accent: "#A78BFA", ok: "#34D399", err: "#f87171"
  };

  function randomCode() {
    const alpha = "abcdefghijkmnopqrstuvwxyz23456789"; // sem l/1/o/0
    const rnd = new Uint8Array(8);
    (window.crypto || {}).getRandomValues
      ? window.crypto.getRandomValues(rnd)
      : rnd.forEach((_, i) => (rnd[i] = Math.floor(Math.random() * 256)));
    let s = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) s += "-";
      s += alpha[rnd[i] % alpha.length];
    }
    return "gaia-" + s;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (e2) { return false; }
    }
  }

  const inputStyle = {
    width: "100%", background: "#0D0D0D", border: ".5px solid " + C.line,
    borderRadius: 6, padding: "8px 10px", color: C.txt, fontSize: 12,
    fontFamily: "IBM Plex Mono,monospace", outline: "none"
  };
  const labelStyle = {
    fontSize: 9, color: C.faint, letterSpacing: 1.2, textTransform: "uppercase",
    fontFamily: "IBM Plex Mono,monospace", display: "block", marginBottom: 6
  };
  function btnStyle(kind) {
    const base = {
      padding: "8px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600,
      fontFamily: "IBM Plex Mono,monospace", cursor: "pointer", border: "none"
    };
    if (kind === "primary") return { ...base, background: C.accent, color: "#0D0D0D" };
    if (kind === "ghost") return {
      ...base, background: "transparent", color: C.dim, border: ".5px solid " + C.line
    };
    return base;
  }

  function Check({ on, onChange, label }) {
    return h("label", {
      style: {
        display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
        fontSize: 11, color: on ? C.txt : C.dim, fontFamily: "IBM Plex Mono,monospace"
      }
    },
      h("input", { type: "checkbox", checked: on, onChange: e => onChange(e.target.checked),
        style: { accentColor: C.accent, cursor: "pointer" } }),
      label
    );
  }

  function Section({ title, desc, children }) {
    return h("div", {
      style: {
        background: C.sunk, border: ".5px solid " + C.line, borderRadius: 10,
        padding: 14, display: "flex", flexDirection: "column", gap: 10
      }
    },
      h("div", null,
        h("div", { style: { fontSize: 12, fontWeight: 600, color: C.txt } }, title),
        desc && h("div", {
          style: { fontSize: 10, color: C.faint, marginTop: 3, lineHeight: 1.6,
                   fontFamily: "IBM Plex Mono,monospace" }
        }, desc)
      ),
      children
    );
  }

  function GaiaShareModal({ tab, onClose }) {
    const [code, setCode] = useState(() => {
      try { return localStorage.getItem(CODE_KEY) || randomCode(); }
      catch (e) { return randomCode(); }
    });
    const [hideValues, setHideValues] = useState(true);
    const [hideNotes, setHideNotes] = useState(false);
    const [incPerdido, setIncPerdido] = useState(false);
    const [link, setLink] = useState("");
    const [token, setToken] = useState(() => {
      try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    });
    const [msg, setMsg] = useState(null); // { kind:'ok'|'err', text }

    const cardCount = (tab.cards || []).filter(c =>
      incPerdido || c.col !== "perdido"
    ).length;

    function payload() {
      return window.GaiaShare.pack(tab, {
        title: "Pipeline GAIA",
        at: Date.now(),
        hideValues, hideNotes,
        hideCols: incPerdido ? [] : ["perdido"]
      });
    }

    function rememberCode(c) {
      try { localStorage.setItem(CODE_KEY, c); } catch (e) {}
    }

    async function genLink() {
      setMsg(null);
      if (!code || code.length < 6) {
        return setMsg({ kind: "err", text: "Use um código com pelo menos 6 caracteres." });
      }
      try {
        const blob = await window.GaiaShare.encrypt(payload(), code);
        const url = location.origin + "/gaia.html#s=" + blob;
        setLink(url);
        rememberCode(code);
        const done = await copy(url);
        setMsg({
          kind: "ok",
          text: done ? "Link gerado e copiado. Mande o link e o código separados."
                     : "Link gerado — copie do campo abaixo."
        });
      } catch (e) {
        setMsg({ kind: "err", text: e.message || "Falha ao gerar o link." });
      }
    }

    async function doPublish() {
      setMsg(null);
      if (!code || code.length < 6) {
        return setMsg({ kind: "err", text: "Use um código com pelo menos 6 caracteres." });
      }
      if (!token) {
        return setMsg({ kind: "err", text: "Informe o GAIA_PUBLISH_TOKEN configurado no Vercel." });
      }
      try {
        const blob = await window.GaiaShare.encrypt(payload(), code);
        await window.GaiaShare.publish(blob, token);
        try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
        rememberCode(code);
        const url = location.origin + "/gaia.html";
        setLink(url);
        await copy(url);
        setMsg({ kind: "ok", text: "Board publicado. O time abre " + url + " com o código." });
      } catch (e) {
        setMsg({ kind: "err", text: e.message || "Falha ao publicar." });
      }
    }

    return h("div", {
      style: {
        position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 2000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
      },
      onClick: e => { if (e.target === e.currentTarget) onClose(); }
    },
      h("div", {
        style: {
          background: C.bg, border: ".5px solid " + C.line, borderRadius: 12,
          width: "100%", maxWidth: 520, padding: 22, maxHeight: "92vh", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 14
        }
      },
        /* cabeçalho */
        h("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 } },
          h("div", null,
            h("div", { style: { fontSize: 15, fontWeight: 700, color: C.txt } }, "🔗 Compartilhar Board GAIA"),
            h("div", {
              style: { fontSize: 10, color: C.faint, marginTop: 4, lineHeight: 1.6,
                       fontFamily: "IBM Plex Mono,monospace" }
            }, "Acesso somente leitura ao pipeline GAIA. O time não enxerga o CRM, a base de empresas nem os contatos.")
          ),
          h("button", { onClick: onClose, style: { ...btnStyle("ghost"), padding: "4px 10px" } }, "✕")
        ),

        /* código de acesso */
        h("div", null,
          h("label", { style: labelStyle }, "Código de acesso (a senha do time)"),
          h("div", { style: { display: "flex", gap: 6 } },
            h("input", {
              value: code, onChange: e => setCode(e.target.value.trim()),
              spellCheck: false, style: inputStyle
            }),
            h("button", { onClick: () => setCode(randomCode()), style: btnStyle("ghost") }, "Sortear")
          ),
          h("div", {
            style: { fontSize: 9.5, color: C.faint, marginTop: 6, lineHeight: 1.6,
                     fontFamily: "IBM Plex Mono,monospace" }
          }, "É a chave que decifra o board. Sem ela o link não abre nada — mande o código por outro canal (não no mesmo e-mail do link).")
        ),

        /* o que compartilhar */
        h("div", null,
          h("label", { style: labelStyle }, "O que vai no board (" + cardCount + " cards)"),
          h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
            h(Check, { on: hideValues, onChange: setHideValues, label: "Ocultar valores (R$)" }),
            h(Check, { on: hideNotes, onChange: setHideNotes, label: "Ocultar as notas dos cards" }),
            h(Check, { on: incPerdido, onChange: setIncPerdido, label: "Incluir coluna Perdido / Arquivo" })
          )
        ),

        /* modo 1 — link com snapshot */
        h(Section, {
          title: "1. Link com snapshot",
          desc: "Não precisa configurar nada. O board viaja cifrado dentro do link — é uma foto de agora; gere um novo link quando quiser atualizar."
        },
          h("button", { onClick: genLink, style: btnStyle("primary") }, "Gerar link e copiar")
        ),

        /* modo 2 — link fixo */
        h(Section, {
          title: "2. Link fixo (sempre atualizado)",
          desc: "Publica o board cifrado no servidor. O time usa sempre /gaia.html e vê a versão mais recente. Exige um Upstash Redis / Vercel KV no projeto e a env var GAIA_PUBLISH_TOKEN."
        },
          h("input", {
            value: token, onChange: e => setToken(e.target.value.trim()),
            type: "password", placeholder: "GAIA_PUBLISH_TOKEN", spellCheck: false, style: inputStyle
          }),
          h("button", { onClick: doPublish, style: btnStyle("primary") }, "Publicar board")
        ),

        /* resultado */
        link && h("div", null,
          h("label", { style: labelStyle }, "Link do time"),
          h("textarea", {
            value: link, readOnly: true, rows: 3,
            onFocus: e => e.target.select(),
            style: { ...inputStyle, resize: "vertical", fontSize: 10, lineHeight: 1.5 }
          }),
          h("button", {
            onClick: async () => setMsg({
              kind: "ok",
              text: (await copy(link)) ? "Link copiado." : "Copie manualmente do campo acima."
            }),
            style: { ...btnStyle("ghost"), marginTop: 6 }
          }, "Copiar de novo")
        ),

        msg && h("div", {
          style: {
            fontSize: 10.5, lineHeight: 1.6, fontFamily: "IBM Plex Mono,monospace",
            color: msg.kind === "ok" ? C.ok : C.err,
            background: (msg.kind === "ok" ? "rgba(52,211,153,.08)" : "rgba(248,113,113,.08)"),
            border: ".5px solid " + (msg.kind === "ok" ? "rgba(52,211,153,.25)" : "rgba(248,113,113,.25)"),
            borderRadius: 6, padding: "9px 11px"
          }
        }, msg.text)
      )
    );
  }

  window.GaiaShareModal = GaiaShareModal;
})();
