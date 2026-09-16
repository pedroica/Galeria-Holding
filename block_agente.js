/* ═══════════════════════════════════════════════════════════════════════════
   AGENTE OUTBOUND — aba "Agente"
   Usa window.__supaClient (gh-store.js) — URL e key hardcoded no gh-store.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const h = React.createElement;
  const { useState } = React;

  // Usa o cliente Supabase centralizado do gh-store.js
  const SUPA_URL  = "https://uetltlnjmobeiunxfsqi.supabase.co";
  const SUPA_ANON = "sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r";

  function baseUrl() { return SUPA_URL; }
  function headers(extra) {
    return Object.assign({ apikey: SUPA_ANON, Authorization: "Bearer " + SUPA_ANON }, extra || {});
  }

  // ── Supabase REST ─────────────────────────────────────────────────────────
  async function supaCount(table) {
    const res = await fetch(baseUrl() + "/rest/v1/" + table + "?select=id", {
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    });
    if (!res.ok) throw new Error("Supabase " + res.status + ": " + (await res.text()).slice(0, 200));
    const cr = res.headers.get("content-range");
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

  // Normalização IDÊNTICA ao gh_norm() do Postgres (lower + &→e + remove
  // não-alfanumérico + colapsa). Usada no dedup para nunca colidir com o
  // índice único companies(gh_norm(name)) durante o upsert.
  function dbNorm(s) {
    return (s || "").toLowerCase().replace(/&/g, " e ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // Monta as linhas p/ `companies`, dedup por nome normalizado + marca blocklist
  function buildRows() {
    const bl = window.GH_BL;
    const norm = dbNorm;
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
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);

    async function testConn() {
      setBusy(true); setStatus("Testando conexão…");
      try {
        const n = await supaCount("crm_empresas");
        setStatus("✅ Conectado — crm_empresas: " + (n == null ? "?" : n) + " linhas.");
      } catch (e) { setStatus("❌ " + e.message); }
      setBusy(false);
    }

    async function migrate() {
      setBusy(true);
      try {
        const built = buildRows();
        setStatus("Migrando " + built.rows.length + " empresas (" + built.blocked + " bloqueadas)…");
        const CHUNK = 500; let done = 0;
        for (let i = 0; i < built.rows.length; i += CHUNK) {
          // Mapeia para crm_empresas: nome, fonte, bloqueada
          const rows = built.rows.slice(i, i + CHUNK).map(function(r) {
            return { nome: r.name, fonte: 'prosp', bloqueada: r.blocked };
          });
          await supaUpsert("crm_empresas", rows, "nome");
          done += Math.min(CHUNK, built.rows.length - i);
          setStatus("Migrando… " + done + "/" + built.rows.length);
        }
        const n = await supaCount("crm_empresas");
        setStatus("✅ Concluído: " + built.rows.length + " enviadas (" + built.blocked +
          " bloqueadas). Total em crm_empresas: " + (n == null ? "?" : n) + ".");
      } catch (e) { setStatus("❌ " + e.message); }
      setBusy(false);
    }

    const nComp = crmCompanies().length;

    return h("div", { className: "ag-wrap", style: { maxWidth: 820, margin: "0 auto" } },
      h("div", { style: { fontSize: 20, fontWeight: 600, color: "#F5F5F5", marginBottom: 4 } }, "🚀 Agente Outbound"),
      h("div", { style: { fontSize: 11, color: "#9B9BB4", marginBottom: 18, lineHeight: 1.6 } },
        "Migração de empresas para Supabase (crm_empresas). Conexão via central-galeria — hardcoded."),

      // Status conexão
      h("div", { style: { background: "#111827", border: ".5px solid #2D2D44", borderRadius: 10, padding: 16, marginBottom: 14 } },
        h("div", { style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 } },
          "Conexão: central-galeria (uetltlnjmobeiunxfsqi)"),
        h("div", { style: { display: "flex", gap: 8 } },
          h("button", { className: "gh-btn-secondary", onClick: testConn, disabled: busy }, "Testar conexão"))),

      // Migração
      h("div", { style: { background: "#1A1A2E", border: ".5px solid #2D2D44", borderRadius: 10, padding: 16, marginBottom: 14 } },
        h("div", { style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 } }, "Empresas (" + nComp + " no CRM)"),
        h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          h("button", { className: "gh-btn-ghost", onClick: exportJson, disabled: busy }, "Exportar (JSON)"),
          h("button", { className: "gh-btn-primary", onClick: migrate, disabled: busy },
            busy ? "Trabalhando…" : "Migrar → crm_empresas"))),

      status && h("div", { style: { background: "#0D0D0D", border: ".5px solid #2D2D44", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "IBM Plex Mono,monospace", color: "#F5F5F5", lineHeight: 1.6, whiteSpace: "pre-wrap" } }, status));
  }

  window.AgenteView = AgenteView;
})();
