/* ═══════════════════════════════════════════════════════════════════════════
   AGENTE OUTBOUND — aba "Agente" (Fase 1: config Supabase + migração empresas)
   Isolado, prefixo .ag-. Roda no navegador (que alcança o Supabase).
   Config em localStorage 'gh_supa_cfg_v1' (URL + publishable key — client-side).
   Nas próximas fases esta aba ganha o funil/dashboard e o pausar/retomar.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const h = React.createElement;
  const { useState } = React;
  const CFG_KEY = "gh_supa_cfg_v1";

  function getCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
  function baseUrl() { return (getCfg().url || "").replace(/\/+$/, ""); }
  function headers(extra) {
    const k = getCfg().anonKey || "";
    return Object.assign({ apikey: k, Authorization: "Bearer " + k }, extra || {});
  }

  // ── Supabase REST (fetch, sem dependência) ────────────────────────────────
  async function supaCount(table) {
    const res = await fetch(baseUrl() + "/rest/v1/" + table + "?select=id", {
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    });
    if (!res.ok) throw new Error("Supabase " + res.status + ": " + (await res.text()).slice(0, 200));
    const cr = res.headers.get("content-range"); // "0-0/1234"
    return cr && cr.includes("/") ? parseInt(cr.split("/")[1], 10) : null;
  }
  async function supaUpsert(table, rows, onConflict) {
    const res = await fetch(baseUrl() + "/rest/v1/" + table + "?on_conflict=" + onConflict, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error("Supabase " + res.status + ": " + (await res.text()).slice(0, 300));
    return true;
  }

  // ── Fonte de empresas do CRM ──────────────────────────────────────────────
  function crmCompanies() {
    const src = (typeof PROSP !== "undefined" ? PROSP : (window.PROSP || []));
    return Array.isArray(src) ? src : [];
  }

  // Monta as linhas p/ `companies`, dedup por nome normalizado + marca blocklist
  function buildRows() {
    const bl = window.GH_BL;
    const norm = bl ? bl.norm : function (s) { return (s || "").toLowerCase().trim(); };
    const seen = new Set();
    const rows = [];
    let blocked = 0;
    crmCompanies().forEach(function (c) {
      const key = norm(c.nome);
      if (!key || seen.has(key)) return; // dedup por nome normalizado (evita colisão do índice único)
      seen.add(key);
      const b = bl ? bl.check({ name: c.nome }) : { blocked: false };
      if (b.blocked) blocked++;
      rows.push({
        crm_key: "prosp_" + c.rank,
        rank: c.rank,
        name: c.nome,
        segmento: c.setor || null,
        blocked: !!b.blocked,
        blocked_reason: b.blocked ? (b.entryName + " (" + b.reason + ")") : null,
      });
    });
    return { rows: rows, blocked: blocked };
  }

  function exportJson() {
    const data = crmCompanies();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "empresas-galeria.json";
    document.body.appendChild(a); a.click(); a.remove();
  }

  function AgenteView() {
    const cfg0 = getCfg();
    const [url, setUrl] = useState(cfg0.url || "");
    const [anonKey, setAnonKey] = useState(cfg0.anonKey || "");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const configured = !!(baseUrl() && getCfg().anonKey);

    function persist() { saveCfg({ url: url.trim(), anonKey: anonKey.trim() }); setStatus("✅ Config salva."); }

    async function testConn() {
      persist(); setBusy(true); setStatus("Testando conexão…");
      try {
        const n = await supaCount("companies");
        setStatus("✅ Conectado. Tabela companies: " + (n == null ? "?" : n) + " linhas.");
      } catch (e) { setStatus("❌ " + e.message); }
      setBusy(false);
    }

    async function migrate() {
      persist(); setBusy(true);
      try {
        const built = buildRows();
        setStatus("Migrando " + built.rows.length + " empresas (" + built.blocked + " bloqueadas)…");
        const CHUNK = 500; let done = 0;
        for (let i = 0; i < built.rows.length; i += CHUNK) {
          await supaUpsert("companies", built.rows.slice(i, i + CHUNK), "crm_key");
          done += Math.min(CHUNK, built.rows.length - i);
          setStatus("Migrando… " + done + "/" + built.rows.length);
        }
        const n = await supaCount("companies");
        setStatus("✅ Migração concluída: " + built.rows.length + " enviadas (" + built.blocked +
          " marcadas como blocklist). Total em companies: " + (n == null ? "?" : n) + ".");
      } catch (e) { setStatus("❌ " + e.message); }
      setBusy(false);
    }

    const nComp = crmCompanies().length;

    return h("div", { className: "ag-wrap", style: { maxWidth: 820, margin: "0 auto" } },
      h("div", { style: { fontSize: 20, fontWeight: 600, color: "#F5F5F5", marginBottom: 4 } }, "🚀 Agente Outbound"),
      h("div", { style: { fontSize: 11, color: "#9B9BB4", marginBottom: 18, lineHeight: 1.6 } },
        "Fase 1 — migração das empresas do CRM para o Supabase (fonte única da verdade). ",
        "O enriquecimento Lusha e a esteira rodam no worker (Railway)."),

      // Config Supabase
      h("div", { style: { background: "#111827", border: ".5px solid #2D2D44", borderRadius: 10, padding: 16, marginBottom: 14 } },
        h("div", { style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 } }, "Conexão Supabase"),
        h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          h("input", { className: "gh-input", placeholder: "SUPABASE_URL (https://xxxx.supabase.co)", value: url, onChange: function (e) { setUrl(e.target.value); } }),
          h("input", { className: "gh-input", placeholder: "publishable key (sb_publishable_…)", value: anonKey, onChange: function (e) { setAnonKey(e.target.value); } })),
        h("div", { style: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" } },
          h("button", { className: "gh-btn-ghost", onClick: persist, disabled: busy }, "Salvar"),
          h("button", { className: "gh-btn-secondary", onClick: testConn, disabled: busy }, "Testar conexão"))),

      // Migração
      h("div", { style: { background: "#1A1A2E", border: ".5px solid #2D2D44", borderRadius: 10, padding: 16, marginBottom: 14 } },
        h("div", { style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 } }, "Empresas (" + nComp + " no CRM)"),
        h("div", { style: { fontSize: 11, color: "#9B9BB4", marginBottom: 12, lineHeight: 1.6 } },
          "Sobe as empresas para a tabela ", h("code", { style: { color: "#FF6B2B" } }, "companies"),
          ", deduplicando por nome e já marcando as que caem na blocklist. Reexecutar é seguro (upsert)."),
        h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          h("button", { className: "gh-btn-ghost", onClick: exportJson, disabled: busy }, "Exportar empresas (JSON)"),
          h("button", { className: "gh-btn-primary", onClick: migrate, disabled: busy || !configured },
            busy ? "Trabalhando…" : "Migrar → Supabase"))),

      status && h("div", { style: { background: "#0D0D0D", border: ".5px solid #2D2D44", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "IBM Plex Mono,monospace", color: "#F5F5F5", lineHeight: 1.6, whiteSpace: "pre-wrap" } }, status),
      !configured && h("div", { style: { fontSize: 10, color: "#EF9F27", marginTop: 8, fontFamily: "IBM Plex Mono,monospace" } }, "Preencha e salve a conexão Supabase para habilitar a migração."));
  }

  window.AgenteView = AgenteView;
})();
