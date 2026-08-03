/* ═══════════════════════════════════════════════════════════════
   BLOCO 6 — 🌡 TemperaturaView + 🛟 FerramentasModal (backup/APIs)
   Componentes globais consumidos pelo App (bloco 3).
   ═══════════════════════════════════════════════════════════════ */

/* ── utilidades de normalização compartilhadas (processCSV + IIFE MMN) ── */
function _b6NormStr(n) {
  return (n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizarSetor(s) {
  const SMAP = {
    "beleza": "Beleza", "cosmeticos": "Beleza", "cosméticos": "Beleza", "beleza cosméticos": "Beleza", "beleza e cosméticos": "Beleza", "beleza/cosméticos": "Beleza",
    "nutricao": "FMCG", "nutrição": "FMCG", "bem estar": "FMCG", "bens de consumo": "FMCG", "fmcg": "FMCG", "nutricao bem estar": "FMCG",
    "alimentos": "Food", "food": "Food", "chocolates": "Food", "alimenticio": "Food", "alimentício": "Food", "food beverage": "Food",
    "varejo": "Varejo", "e commerce": "E-commerce", "ecommerce": "E-commerce", "e-commerce": "E-commerce",
    "moda": "Varejo Moda", "varejo moda": "Varejo Moda", "fashion": "Varejo Moda",
    "fintech": "Fintech", "financeiro": "Financeiro", "servicos financeiros": "Fintech", "servicosfinanceiros": "Fintech",
    "saude": "Saude", "saúde": "Saude", "health": "Saude",
    "farma": "Farma", "farmaceutico": "Farma", "farmacêutico": "Farma", "pharma": "Farma",
    "tech": "Tech", "tecnologia": "Tech", "technology": "Tech",
    "b2b tech": "B2B Tech", "software": "B2B Tech", "saas": "B2B Tech",
    "telecom": "Telecom", "telecomunicacoes": "Telecom", "telecomunicações": "Telecom",
    "streaming": "Streaming", "media": "Media", "midia": "Media", "social media": "Social Media",
    "automotivo": "Automotivo", "automotive": "Automotivo",
    "educacao": "Educacao", "educação": "Educacao", "education": "Educacao", "edtech": "Educacao",
    "travel": "Travel", "viagem": "Travel", "turismo": "Travel",
    "energia": "Energia", "energy": "Energia",
    "mineracao": "Mineracao", "mineração": "Mineracao",
    "construcao": "Construcao", "construção": "Construcao",
    "real estate": "Real Estate", "imobiliario": "Real Estate", "imobiliário": "Real Estate",
    "proptech": "Proptech", "pets": "Pets", "pet": "Pets",
    "seguros": "Seguros", "insurance": "Seguros",
    "logistica": "Logistica", "logística": "Logistica", "logistics": "Logistica",
    "mobilidade": "Mobilidade", "marketplace": "Marketplace", "super app": "Super App",
    "agro": "Agro", "agronegocio": "Agro", "agronegócio": "Agro",
    "industria": "Industria", "indústria": "Industria", "manufacturing": "Industria",
    "utilidades": "Utilidades", "entretenimento": "Entretenimento",
    "mmn": "Beleza", "venda direta": "Varejo", "mlm": "Varejo",
    "perfumaria": "Beleza", "suplementos": "FMCG", "oleo": "FMCG", "utensilios": "Varejo", "vestuario": "Varejo"
  };
  const k = _b6NormStr(s || "");
  if (SMAP[k]) return SMAP[k];
  for (const [key, val] of Object.entries(SMAP)) {
    if (k && (k.includes(key) || key.includes(k))) return val;
  }
  return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : "Outros";
}

function TemperaturaView({
  accs,
  curGrupo,
  onEmpresaClick
}) {
  const {
    useState,
    useMemo
  } = React;
  const [filtro, setFiltro] = useState("todos"); // todos | quente | morno | frio | congelado | esfriando
  const [busca, setBusca] = useState("");
  const linhas = useMemo(() => {
    const gid = curGrupo && curGrupo.id || "galeria";
    const nomes = {};
    (typeof LEADS_ALL !== "undefined" ? LEADS_ALL : []).forEach(l => {
      nomes[l.rank] = l;
    });
    const out = [];
    Object.keys(accs || {}).forEach(key => {
      if (key.indexOf(gid + "_") !== 0) return;
      const acc = accs[key] || {};
      const rank = key.slice(gid.length + 1);
      const lead = nomes[rank] || nomes[+rank] || {};
      const temDados = (acc.activities || []).length > 0 || (acc.decisors || []).length > 0;
      if (!temDados) return;
      const t = calcularTemperatura(acc);
      out.push({
        key,
        rank,
        nome: lead.nome || "#" + rank,
        setor: lead.setor || "—",
        nAtividades: (acc.activities || []).length,
        nDecisores: (acc.decisors || []).length,
        ...t
      });
    });
    out.sort((a, b) => b.pontos - a.pontos || a.diasSemContato - b.diasSemContato);
    return out;
  }, [accs, curGrupo]);
  const esfriando = useMemo(() => linhas.filter(l => l.esfriando), [linhas]);
  const visiveis = useMemo(() => {
    let v = linhas;
    if (filtro === "esfriando") v = esfriando;else if (filtro !== "todos") v = v.filter(l => l.status.toLowerCase() === filtro);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      v = v.filter(l => l.nome.toLowerCase().includes(q) || (l.setor || "").toLowerCase().includes(q));
    }
    return v;
  }, [linhas, esfriando, filtro, busca]);
  const contagens = useMemo(() => {
    const c = {
      quente: 0,
      morno: 0,
      frio: 0,
      congelado: 0
    };
    linhas.forEach(l => {
      c[l.status.toLowerCase()] = (c[l.status.toLowerCase()] || 0) + 1;
    });
    return c;
  }, [linhas]);
  const chips = [["todos", "TODOS (" + linhas.length + ")", "#9B9BB4"], ["quente", "🔥 QUENTES (" + contagens.quente + ")", "#E24B4A"], ["morno", "🌡️ MORNOS (" + contagens.morno + ")", "#EF9F27"], ["esfriando", "⚠️ ESFRIANDO (" + esfriando.length + ")", "#FF6B2B"], ["frio", "❄️ FRIOS (" + contagens.frio + ")", "#3498db"], ["congelado", "🧊 CONGELADOS (" + contagens.congelado + ")", "#95a5a6"]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#0D0D0D",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 20px",
      borderBottom: ".5px solid #2D2D44",
      flexShrink: 0,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: "#F5F5F5",
      letterSpacing: -0.3
    }
  }, "🌡 Temperatura dos Deals"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555"
    }
  }, "score de atividades com decay de 30 dias · janela de 90 dias"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("input", {
    className: "kes-search",
    placeholder: "Buscar empresa...",
    value: busca,
    onChange: e => setBusca(e.target.value)
  })), esfriando.length > 0 && filtro !== "esfriando" && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "12px 20px 0",
      padding: "10px 14px",
      background: "rgba(255,107,43,.07)",
      border: ".5px solid rgba(255,107,43,.35)",
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#FF6B2B",
      fontWeight: 600
    }
  }, "⚠️ ", esfriando.length, " deal", esfriando.length > 1 ? "s" : "", " esfriando"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#9B9BB4"
    }
  }, "Estavam quentes/mornos e passaram de 7 dias sem contato — é aqui que se recupera dinheiro escapando."), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    style: {
      padding: "4px 12px",
      fontSize: 10
    },
    onClick: () => setFiltro("esfriando")
  }, "Ver lista")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      padding: "12px 20px 0",
      flexWrap: "wrap",
      flexShrink: 0
    }
  }, chips.map(([id, lbl, cor]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: "kes-chip" + (filtro === id ? " on" : ""),
    style: filtro === id ? {
      borderColor: cor,
      color: cor,
      background: "rgba(255,255,255,.04)"
    } : {},
    onClick: () => setFiltro(id)
  }, lbl))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "12px 20px 24px"
    }
  }, visiveis.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "48px 0",
      textAlign: "center",
      color: "#444",
      fontSize: 12,
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "Nenhuma empresa nesse filtro.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10
    }
  }, "A temperatura considera apenas empresas com decisores ou atividades registradas.")) : /*#__PURE__*/React.createElement("table", {
    className: "pex-table",
    style: {
      minWidth: 720
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 36
    }
  }), /*#__PURE__*/React.createElement("th", null, "Empresa"), /*#__PURE__*/React.createElement("th", null, "Setor"), /*#__PURE__*/React.createElement("th", null, "Temperatura"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Pontos"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Dias s/ contato"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Atividades"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Decisores"))), /*#__PURE__*/React.createElement("tbody", null, visiveis.map(l => /*#__PURE__*/React.createElement("tr", {
    key: l.key,
    style: {
      cursor: onEmpresaClick ? "pointer" : "default"
    },
    onClick: () => onEmpresaClick && onEmpresaClick(l)
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 16
    }
  }, l.emoji), /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: 500
    }
  }, l.nome, l.esfriando && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 8,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#FF6B2B",
      border: ".5px solid rgba(255,107,43,.4)",
      borderRadius: 100,
      padding: "1px 6px"
    }
  }, "ESFRIANDO")), /*#__PURE__*/React.createElement("td", {
    style: {
      color: "#9B9BB4",
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, l.setor), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "pex-badge",
    style: {
      background: "rgba(255,255,255,.04)",
      color: l.cor,
      border: ".5px solid " + l.cor
    }
  }, l.status.toUpperCase())), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "IBM Plex Mono,monospace",
      color: l.cor,
      fontWeight: 700
    }
  }, l.pontos), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "IBM Plex Mono,monospace",
      color: l.diasSemContato > 14 ? "#E24B4A" : "#9B9BB4"
    }
  }, l.diasSemContato >= 999 ? "—" : l.diasSemContato), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4"
    }
  }, l.nAtividades), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4"
    }
  }, l.nDecisores)))))));
}
function FerramentasModal({
  onClose
}) {
  const {
    useState,
    useEffect
  } = React;
  const [msg, setMsg] = useState("");
  const [hk, setHk] = useState(getHunterKey());
  const [lk, setLk] = useState(getLushaKey());
  const [waUrl, setWaUrl] = useState(typeof getWAVerifyUrl === "function" ? getWAVerifyUrl() : "");
  const [waKey, setWaKey] = useState(typeof getWAVerifyKey === "function" ? getWAVerifyKey() : "");
  const [proxy, setProxy] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [importando, setImportando] = useState(false);
  const [diagInfo, setDiagInfo] = useState(null);
  const fileRef = React.useRef(null);
  const csvRef = React.useRef(null);

  // ── Diagnóstico e recuperação de slots ────────────────────────────────────
  const doSincronizarSlots = () => {
    try {
      var raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}");
      var keys = Object.keys(raw);
      var syncCount = 0; var updateCount = 0;
      var szKB = Math.round(JSON.stringify(raw).length / 1024);
      var slotTotal = 0;

      keys.forEach(function(k) {
        var entry = raw[k];
        if (!entry || !entry.decisores) return;
        ["ceo","cmo","gerencia"].forEach(function(s) {
          var sl = entry.decisores[s];
          if (!sl || !sl.nome) return;
          slotTotal++;
          var existing = entry.decisors || [];
          var decName  = (sl.nome  || "").toLowerCase().trim();
          var decEmail = (sl.email || "").toLowerCase().trim();
          var matchIdx = -1;
          for (var mi = 0; mi < existing.length; mi++) {
            var ed = existing[mi];
            if (decEmail && ed.email && ed.email.toLowerCase() === decEmail) { matchIdx = mi; break; }
            if (decName  && ed.nome  && ed.nome.toLowerCase().trim() === decName) { matchIdx = mi; break; }
          }
          if (matchIdx >= 0) {
            var changed = false;
            if (sl.email    && !existing[matchIdx].email) { existing[matchIdx].email = sl.email; changed = true; }
            if (sl.telefone && !existing[matchIdx].wa)    { existing[matchIdx].wa    = sl.telefone; changed = true; }
            if (sl.cargo    && !existing[matchIdx].cargo) { existing[matchIdx].cargo  = sl.cargo; changed = true; }
            if (sl.linkedin && !existing[matchIdx].li)    { existing[matchIdx].li    = sl.linkedin; changed = true; }
            if (changed) updateCount++;
          } else {
            entry.decisors = existing.concat([{
              nome: sl.nome, cargo: sl.cargo||"", email: sl.email||"",
              wa: sl.telefone||"", li: sl.linkedin||"",
              fromMailing: false, addedAt: "slot-recovery:"+s,
            }]);
            syncCount++;
          }
        });
      });

      try {
        localStorage.setItem("gh_decisores_v3", JSON.stringify(raw));
        setDiagInfo({
          szKB, slotTotal, syncCount, updateCount,
          msg: syncCount + " novos + " + updateCount + " atualizados em decisors[]. Recarregue a página para ver.",
        });
        setMsg("✅ Sincronização concluída — " + (syncCount+updateCount) + " contatos sincronizados.");
      } catch(qe) {
        setMsg("❌ QUOTA CHEIA (" + szKB + "KB) — exporte um backup e importe num navegador limpo.");
      }
    } catch(e) {
      setMsg("❌ Erro: " + e.message);
    }
  };

  const doDiag = () => {
    try {
      var raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}");
      var keys = Object.keys(raw);
      var slotTotal = 0; var comEmail = 0;
      keys.forEach(function(k) {
        var e = raw[k];
        if (!e || !e.decisores) return;
        ["ceo","cmo","gerencia"].forEach(function(s) {
          var sl = e.decisores[s];
          if (sl && sl.nome) { slotTotal++; if (sl.email) comEmail++; }
        });
      });
      var szKB = Math.round(JSON.stringify(raw).length / 1024);
      var quotaOk = true;
      try { localStorage.setItem("__qt__", new Array(50000).join("x")); localStorage.removeItem("__qt__"); } catch(q) { quotaOk = false; }
      setDiagInfo({ szKB, slotTotal, comEmail, quotaOk, keys: keys.length });
      setMsg("Diagnóstico: " + slotTotal + " slots preenchidos | " + szKB + "KB | quota " + (quotaOk?"OK":"CHEIA!"));
    } catch(e) { setMsg("Erro: " + e.message); }
  };
  useEffect(() => {
    let alive = true;
    window.__ghProxyInfo().then(p => {
      if (alive) setProxy(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  const doExport = () => {
    try {
      const meta = ghExportBackup();
      setMsg("✅ Backup exportado — " + meta.keys + " chaves de dados no arquivo.");
    } catch (e) {
      setMsg("❌ Erro ao exportar: " + e.message);
    }
  };
  const doImport = ev => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const n = ghImportBackup(rd.result);
        setMsg("✅ " + n + " chaves restauradas. Recarregando em 2s...");
        setTimeout(() => location.reload(), 2000);
      } catch (e) {
        setMsg("❌ Erro ao importar: " + e.message);
      }
    };
    rd.readAsText(f);
    ev.target.value = "";
  };
  const saveKeys = () => {
    setHunterKey(hk.trim());
    setLushaKey(lk.trim());
    if (typeof setWAVerifyUrl === "function") { setWAVerifyUrl(waUrl.trim()); setWAVerifyKey(waKey.trim()); }
    setMsg("✅ Chaves locais salvas (usadas só quando não há proxy /api).");
  };

  // ── CSV import helpers ─────────────────────────────────────────────────────
  function parseCSVLine(line) {
    const result = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { cur += c; }
      } else {
        if (c === '"') { inQ = true; }
        else if (c === ',') { result.push(cur.trim()); cur = ""; }
        else { cur += c; }
      }
    }
    result.push(cur.trim());
    return result;
  }

  const normStr = _b6NormStr;

  function mapKanbanCol(est) {
    const e = normStr(est || "");
    if (!e || e.includes("para acionar") || e.includes("acionar") || e.includes("novo") || e.includes("prosp")) return "para_acionar";
    if (e.includes("email")) return "email";
    if (e.includes("linkedin")) return "linkedin";
    if (e.includes("whatsapp") || e === "wa") return "whatsapp";
    if (e.includes("respond")) return "respondeu";
    if (e.includes("negoc")) return "negociacao";
    if (e.includes("reuni")) return "reuniao";
    return "para_acionar";
  }

  function getWeekKeyNow() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d.toISOString().slice(0, 10);
  }

  function processCSV(text) {
    try { ghExportBackup(); } catch (e) { console.warn("Backup antes do import falhou:", e); }
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
    if (lines.length < 2) throw new Error("CSV sem dados (mínimo 2 linhas incluindo cabeçalho)");

    const header = parseCSVLine(lines[0]).map(h => normStr(h).replace(/ /g, "_"));
    const ci = k => header.indexOf(k);
    const get = (row, c) => (c >= 0 && row[c] != null) ? row[c].trim() : "";

    const C = {
      empresa: ci("empresa"), cnpj: ci("cnpj"), setor: ci("setor"),
      website: ci("website"), tier: ci("tier"), porte: ci("porte_faturamento"),
      estagio: ci("estagio_kanban"),
      dNome: ci("decisor_nome"), dCargo: ci("decisor_cargo"),
      dEmail: ci("decisor_email"), dTel: ci("decisor_telefone"),
      dLi: ci("decisor_linkedin"), dStatus: ci("decisor_status")
    };

    if (C.empresa < 0) throw new Error("Coluna 'empresa' não encontrada. Verifique o cabeçalho do CSV.");

    // group rows by company (key = CNPJ limpo OU nome normalizado)
    const grupos = {};
    const ignoradas = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.every(c => !c)) continue;
      const empNome = get(row, C.empresa);
      if (!empNome) { ignoradas.push("Linha " + (i + 1) + ": coluna 'empresa' vazia"); continue; }
      const cnpj = get(row, C.cnpj).replace(/\D/g, "");
      const chave = cnpj || normStr(empNome);
      if (!grupos[chave]) {
        grupos[chave] = {
          nome: empNome, cnpj,
          setor: get(row, C.setor), website: get(row, C.website),
          tier: get(row, C.tier), porte: get(row, C.porte),
          estagio: get(row, C.estagio), decisores: []
        };
      }
      const dNome = get(row, C.dNome);
      if (dNome) {
        grupos[chave].decisores.push({
          nome: dNome, cargo: get(row, C.dCargo),
          email: get(row, C.dEmail), wa: get(row, C.dTel),
          li: get(row, C.dLi), status: get(row, C.dStatus) || "sugerido"
        });
      }
    }

    // load existing data from localStorage
    const customLeads = loadSt("ghub_custom_leads", []);
    const decisores = loadSt("gh_decisores_v3", {});
    const kanban = loadSt("gh_kanban_v3", {});

    // build lookup: normStr(nome) → rank  (seed + custom)
    const lookup = {};
    if (typeof LEADS_ALL !== "undefined") LEADS_ALL.forEach(l => { lookup[normStr(l.nome)] = l.rank; });
    customLeads.forEach(l => { lookup[normStr(l.nome)] = l.rank; });
    const cnpjLookup = {};
    customLeads.forEach(l => { if (l.cnpj) cnpjLookup[l.cnpj.replace(/\D/g, "")] = l.rank; });

    let nextRk = Math.max(9000, ...customLeads.map(c => c.rank || 9000)) + 1;
    const report = { novas: 0, atualizadas: 0, decisoresAdicionados: 0, ignoradas };
    const weekKey = getWeekKeyNow();
    const semanaKan = kanban[weekKey] ? Object.assign({}, kanban[weekKey]) : {};

    Object.values(grupos).forEach(grp => {
      const normalName = normStr(grp.nome);
      let rank = (grp.cnpj && cnpjLookup[grp.cnpj]) || lookup[normalName];

      if (!rank) {
        // nova empresa
        rank = nextRk++;
        customLeads.push({
          rank, nome: grp.nome.toUpperCase(), setor: normalizarSetor(grp.setor),
          segmento_detalhe: grp.setor, website: grp.website,
          tier: grp.tier, porte: grp.porte, cnpj: grp.cnpj,
          cli: false, custom: true
        });
        lookup[normalName] = rank;
        if (grp.cnpj) cnpjLookup[grp.cnpj] = rank;
        report.novas++;
      } else {
        report.atualizadas++;
      }

      // write decisors under galeria_{rank}
      const accKey = "galeria_" + rank;
      const ex = decisores[accKey] || { decisors: [], sugeridos: [], activities: [] };
      const all = [...(ex.decisors || []), ...(ex.sugeridos || [])];
      const ckEmail = new Set(all.map(d => (d.email || "").toLowerCase()).filter(Boolean));
      const ckNC = new Set(all.map(d => normStr(d.nome) + "|" + (d.cargo || "").toLowerCase()));

      grp.decisores.forEach(dec => {
        const emailLow = (dec.email || "").toLowerCase().trim();
        const nc = normStr(dec.nome) + "|" + (dec.cargo || "").toLowerCase();
        if ((emailLow && ckEmail.has(emailLow)) || ckNC.has(nc)) {
          ignoradas.push("Decisor '" + dec.nome + "' já existe em " + grp.nome);
          return;
        }
        const decObj = { nome: dec.nome, cargo: dec.cargo, email: dec.email, wa: dec.wa, li: dec.li, fromMailing: false, addedAt: "import" };
        if ((dec.status || "").toLowerCase() === "confirmado") {
          ex.decisors = [...(ex.decisors || []), decObj];
        } else {
          ex.sugeridos = [...(ex.sugeridos || []), decObj];
        }
        if (emailLow) ckEmail.add(emailLow);
        ckNC.add(nc);
        report.decisoresAdicionados++;
      });
      decisores[accKey] = ex;

      // add to acionamentos kanban
      const kanCol = mapKanbanCol(grp.estagio);
      const card = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 9)),
        nome: grp.nome.toUpperCase(), cargo: "Prospect",
        empresa: grp.nome.toUpperCase(), canal: kanCol,
        addedAt: new Date().toLocaleDateString("pt-BR"),
        badge: grp.tier ? ("Tier " + grp.tier) : "Import"
      };
      semanaKan[kanCol] = [...(semanaKan[kanCol] || []), card];
    });

    // persist
    saveSt("ghub_custom_leads", customLeads);
    saveSt("gh_decisores_v3", decisores);
    saveSt("gh_kanban_v3", Object.assign({}, kanban, { [weekKey]: semanaKan }));
    return report;
  }

  const doImportCSV = ev => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    ev.target.value = "";
    setImportando(true);
    setMsg("");
    setImportReport(null);
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const rep = processCSV(rd.result);
        setImportReport(rep);
        if (rep.decisoresAdicionados > 0) window.dispatchEvent(new CustomEvent("gh:decisor:added",{detail:{qtd:rep.decisoresAdicionados,source:"csv"}}));
        if (typeof window.__refreshFromStorage === 'function') window.__refreshFromStorage();
      } catch (e) {
        setMsg("❌ Erro ao processar CSV: " + e.message);
      }
      setImportando(false);
    };
    rd.readAsText(f, "UTF-8");
  };

  const proxyLabel = proxy === null ? "verificando..." : proxy === false ? "❌ indisponível (modo direto com chaves locais)" : "✅ ativo — Claude:" + (proxy.claude ? "✓" : "✗") + " Hunter:" + (proxy.hunter ? "✓" : "✗") + " Lusha:" + (proxy.lusha ? "✓" : "✗");

  return /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-ov",
    onClick: e => { if (e.target === e.currentTarget) onClose(); }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal"
  },

  /*#__PURE__*/React.createElement("div", { className: "kes-modal-title" }, "🛟 Ferramentas — Backup & APIs"),

  // ── Backup ──
  /*#__PURE__*/React.createElement("div", { className: "kes-label", style: { marginBottom: 8 } }, "BACKUP DOS DADOS (decisores, kanban, atividades, tudo)"),
  /*#__PURE__*/React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
    /*#__PURE__*/React.createElement("button", { className: "kes-btn-p", onClick: doExport }, "⬇ Exportar backup (.json)"),
    /*#__PURE__*/React.createElement("button", { className: "kes-btn-s", onClick: () => fileRef.current && fileRef.current.click() }, "⬆ Importar backup"),
    /*#__PURE__*/React.createElement("input", { ref: fileRef, type: "file", accept: "application/json,.json", style: { display: "none" }, onChange: doImport }),
    /*#__PURE__*/React.createElement("button", {
      className: "kes-btn-s",
      style: { borderColor: "rgba(0,255,148,.4)", color: "#00FF94" },
      disabled: importando,
      onClick: () => csvRef.current && csvRef.current.click()
    }, importando ? "⏳ Importando..." : "📥 Importar empresas (CSV)"),
    /*#__PURE__*/React.createElement("input", { ref: csvRef, type: "file", accept: ".csv,text/csv", style: { display: "none" }, onChange: doImportCSV })
  ),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#555", marginTop: 8, lineHeight: 1.6 }
  }, "Exporte um backup antes de qualquer atualização do site. Os dados vivem no navegador (localStorage) — trocar de máquina ou limpar o navegador sem backup = perda de dados. Um snapshot automático diário das chaves críticas também é mantido internamente."),

  // ── Recuperação de Decisores ────────────────────────────────────────────────
  /*#__PURE__*/React.createElement("div", { className: "kes-label", style: { marginBottom: 8, marginTop: 18, color: "#F59E0B" } }, "⚠️ RECUPERAÇÃO DE DECISORES (slots → lista)"),
  /*#__PURE__*/React.createElement("div", { style: { fontSize: 9, color: "#888", marginBottom: 8, fontFamily: "IBM Plex Mono,monospace" } },
    "Se os decisores enriquecidos via 🗺 Cobertura não aparecem na view principal, clique em Sincronizar. Isso copia os slots (CEO/CMO/Gerência) para a lista de decisores visível em cada empresa."),
  /*#__PURE__*/React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
    /*#__PURE__*/React.createElement("button", {
      className: "kes-btn-s",
      style: { borderColor: "rgba(245,158,11,.4)", color: "#F59E0B" },
      onClick: doDiag
    }, "🔍 Diagnóstico de armazenamento"),
    /*#__PURE__*/React.createElement("button", {
      className: "kes-btn-s",
      style: { borderColor: "rgba(245,158,11,.4)", color: "#F59E0B" },
      onClick: doSincronizarSlots
    }, "🔄 Sincronizar slots → decisores")
  ),
  diagInfo && /*#__PURE__*/React.createElement("div", {
    style: { marginTop: 8, padding: "8px 12px", background: "#111", borderRadius: 6, border: ".5px solid rgba(245,158,11,.3)",
             fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#F59E0B", lineHeight: 1.7 }
  },
    diagInfo.keys !== undefined && ("Entradas: " + diagInfo.keys + " | Tamanho: " + diagInfo.szKB + "KB | Quota: " + (diagInfo.quotaOk ? "OK ✓" : "CHEIA ⚠") + "\n"),
    diagInfo.slotTotal !== undefined && ("Slots preenchidos: " + diagInfo.slotTotal + (diagInfo.comEmail !== undefined ? " (" + diagInfo.comEmail + " com e-mail)" : "") + "\n"),
    diagInfo.msg && diagInfo.msg
  ),

  // ── Relatório de importação CSV ──
  importReport && /*#__PURE__*/React.createElement("div", {
    style: { marginTop: 14, background: "#0D0D0D", border: ".5px solid rgba(0,255,148,.3)", borderRadius: 8, padding: "14px 16px" }
  },
    /*#__PURE__*/React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#00FF94", marginBottom: 10 } }, "📊 Relatório da Importação"),
    /*#__PURE__*/React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 } },
      /*#__PURE__*/React.createElement("div", { style: { background: "#111827", borderRadius: 6, padding: "8px 12px", textAlign: "center" } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: "#00FF94", fontFamily: "IBM Plex Mono,monospace" } }, importReport.novas),
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", marginTop: 3 } }, "Empresas novas")
      ),
      /*#__PURE__*/React.createElement("div", { style: { background: "#111827", borderRadius: 6, padding: "8px 12px", textAlign: "center" } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: "#60A5FA", fontFamily: "IBM Plex Mono,monospace" } }, importReport.atualizadas),
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", marginTop: 3 } }, "Atualizadas")
      ),
      /*#__PURE__*/React.createElement("div", { style: { background: "#111827", borderRadius: 6, padding: "8px 12px", textAlign: "center" } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: "#A78BFA", fontFamily: "IBM Plex Mono,monospace" } }, importReport.decisoresAdicionados),
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", marginTop: 3 } }, "Decisores adicionados")
      )
    ),
    importReport.ignoradas.length > 0 && /*#__PURE__*/React.createElement("div", { style: { marginBottom: 10 } },
      /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, fontFamily: "IBM Plex Mono,monospace", color: "#EF9F27", marginBottom: 4 } },
        importReport.ignoradas.length + " linha(s) ignorada(s):"
      ),
      /*#__PURE__*/React.createElement("div", { style: { maxHeight: 80, overflowY: "auto", fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#555", lineHeight: 1.7 } },
        importReport.ignoradas.map((m, i) => /*#__PURE__*/React.createElement("div", { key: i }, "• " + m))
      )
    ),
    /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, fontFamily: "IBM Plex Mono,monospace", color: "#9B9BB4", marginBottom: 10, lineHeight: 1.6 } },
      "Dados gravados no localStorage. Recarregue a página para ver as empresas importadas no CRM."
    ),
    /*#__PURE__*/React.createElement("button", {
      className: "kes-btn-p",
      style: { width: "100%" },
      onClick: () => { if (confirm("Recarregar a página agora? Dados já foram salvos.")) location.reload(); }
    }, "🔄 Recarregar página para ver importação")
  ),

  /*#__PURE__*/React.createElement("div", { className: "kes-divider" }),

  // ── APIs ──
  /*#__PURE__*/React.createElement("div", { className: "kes-label", style: { marginBottom: 6 } },
    "PROXY DE APIs (/api na Vercel): ",
    /*#__PURE__*/React.createElement("span", { style: { color: "#F5F5F5", textTransform: "none" } }, proxyLabel)
  ),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#555", marginBottom: 10, lineHeight: 1.6 }
  }, "Com o proxy ativo, as chaves ficam só no servidor (variáveis de ambiente da Vercel) e os campos abaixo são ignorados. Sem proxy, o app usa as chaves locais abaixo, salvas apenas neste navegador."),
  /*#__PURE__*/React.createElement("div", { className: "kes-field" },
    /*#__PURE__*/React.createElement("label", { className: "kes-label" }, "Hunter.io API key (fallback local)"),
    /*#__PURE__*/React.createElement("input", { className: "kes-input", type: "password", value: hk, onChange: e => setHk(e.target.value), placeholder: "nova chave após revogar a antiga" })
  ),
  /*#__PURE__*/React.createElement("div", { className: "kes-field" },
    /*#__PURE__*/React.createElement("label", { className: "kes-label" }, "Lusha API key (fallback local)"),
    /*#__PURE__*/React.createElement("input", { className: "kes-input", type: "password", value: lk, onChange: e => setLk(e.target.value), placeholder: "nova chave após revogar a antiga" })
  ),
  /*#__PURE__*/React.createElement("div", { className: "kes-divider" }),
  /*#__PURE__*/React.createElement("div", { className: "kes-label", style: { marginBottom: 6 } }, "🔍 WA VERIFY (Evolution API — opcional)"),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 9, fontFamily: "IBM Plex Mono,monospace", color: "#555", marginBottom: 10, lineHeight: 1.6 }
  }, "Endpoint Evolution API para verificar se números têm WhatsApp ativo. Ex: https://evolution.seudominio.com/chat/whatsappNumbers/nome-instancia"),
  /*#__PURE__*/React.createElement("div", { className: "kes-field" },
    /*#__PURE__*/React.createElement("label", { className: "kes-label" }, "Endpoint URL"),
    /*#__PURE__*/React.createElement("input", { className: "kes-input", type: "text", value: waUrl, onChange: e => setWaUrl(e.target.value), placeholder: "https://evolution.seudominio.com/chat/whatsappNumbers/instancia" })
  ),
  /*#__PURE__*/React.createElement("div", { className: "kes-field" },
    /*#__PURE__*/React.createElement("label", { className: "kes-label" }, "API Key"),
    /*#__PURE__*/React.createElement("input", { className: "kes-input", type: "password", value: waKey, onChange: e => setWaKey(e.target.value), placeholder: "apikey da Evolution API" })
  ),
  /*#__PURE__*/React.createElement("button", { className: "kes-btn-s", onClick: saveKeys }, "Salvar chaves locais"),

  msg && /*#__PURE__*/React.createElement("div", {
    style: { marginTop: 12, fontSize: 11, color: "#F5F5F5", background: "#0D0D0D", border: ".5px solid #2D2D44", borderRadius: 8, padding: "8px 12px" }
  }, msg),

  /*#__PURE__*/React.createElement("div", { className: "kes-modal-acts" },
    /*#__PURE__*/React.createElement("button", { className: "kes-btn-s", onClick: onClose }, "Fechar")
  )));
}

/* ─── AUTO-IMPORT MMN (roda 1× na primeira carga, remove-se via flag) ─── */
(function mmnImportOnce() {
  if (localStorage.getItem('ghub_mmn_import_v1')) return;
  if (typeof window.LEADS_ALL === 'undefined' || !window.LEADS_ALL.length) {
    window.addEventListener('DOMContentLoaded', mmnImportOnce, { once: true });
    return;
  }

  function nS(n) {
    if (!n) return '';
    return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').toLowerCase();
  }
  const nSetor = normalizarSetor;
  function mCol(est) {
    const e = nS(est || '');
    if (e.includes('email')) return 'email';
    if (e.includes('linkedin')) return 'linkedin';
    if (e.includes('whatsapp') || e.includes('wa')) return 'whatsapp';
    if (e.includes('respons')) return 'respondeu';
    if (e.includes('negoc')) return 'negociacao';
    if (e.includes('reuni')) return 'reuniao';
    return 'para_acionar';
  }
  function wKey() {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  function lSt(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch { return def; } }
  function sSt(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  const DATA = [
    {n:'Natura',s:'Beleza/Cosméticos',sg:'Cosméticos / Beleza',w:'natura.com.br',t:'A',p:'US$7,1 bi',e:'Novo',m:'Venda direta + MMN',d:[
      {n:'Tatiana Ponce',c:'CMO e Head de Inovação (Natura + Avon LatAm)',li:'linkedin.com/in/tatiana-moraes-de-oliveira-ponce-338a1951',st:'confirmado',g:'Comanda marketing unificado Natura+Avon',o:'2ª maior de venda direta do mundo. Controla Avon.'},
      {n:'Diego Costa',c:'Diretor Sênior de Marketing (submarcas LatAm)',st:'confirmado',g:'Fala de TikTok/Pinterest e IA na perfumaria — fit CR.IA',o:'Fonte: acontecendoaqui (2026)'},
      {n:'Gabriel Fernandes',c:'Diretor de Marca e Comunicação Integrada',st:'confirmado',g:'Ex-Pernod Ricard, chegou em 2025',o:'Fonte: Terra (2025)'}]},
    {n:'Avon',s:'Beleza/Cosméticos',sg:'Cosméticos / Beleza',w:'avon.com.br',t:'A',p:'Parte do Natura&Co',e:'Novo',m:'Venda direta + MMN',d:[
      {n:'Tatiana Ponce',c:'CMO Natura&Co (mkt e P&D Avon LatAm)',st:'confirmado',g:'Brasil é o maior mercado global da Avon',o:'Fonte: Forbes (2024)'}]},
    {n:'Hinode Group',s:'Beleza/Cosméticos',sg:'Cosméticos / Perfumaria',w:'hinode.com.br',t:'A',p:'R$750 mi',e:'Novo',m:'MMN',d:[
      {n:'Sandro Rodrigues',c:'CEO (família controladora)',st:'sugerido',g:'Empresa familiar, mirando geração Z e TikTok',o:'Confirmar head de marketing via Lusha'}]},
    {n:'Herbalife',s:'Nutrição/Bem-estar',sg:'Nutrição / Bem-estar',w:'herbalife.com.br',t:'A',p:'US$5,5 bi',e:'Novo',m:'MMN',d:[
      {n:'Jordan Rizetto',c:'VP e Diretor Geral Brasil',st:'confirmado',g:'Veio do marketing — sensível a pauta de marca',o:'Fonte: Propmark/ABEVD'}]},
    {n:'Amway',s:'Nutrição/Bem-estar',sg:'Bem-estar / Casa / Beleza',w:'amway.com.br',t:'A',p:'US$7,3 bi',e:'Novo',m:'MMN',d:[
      {n:'Daniele Côrtes',c:'CEO / Country Manager Brasil',st:'sugerido',g:'Confirmar diretor(a) de marketing via Lusha',o:'Fonte: LinkedIn'}]},
    {n:'Mary Kay',s:'Beleza/Cosméticos',sg:'Cosméticos / Beleza',w:'marykay.com.br',t:'A',p:'Top global',e:'Novo',m:'MMN',d:[
      {n:'Vick Gallo',c:'VP de Marketing Brasil',st:'confirmado',g:'Criou o TikTok líder mundial do grupo. Perfil digital-first — fit CR.IA',o:'Fonte: Meio&Mensagem (2025)'}]},
    {n:'Jequiti',s:'Beleza/Cosméticos',sg:'Cosméticos / Perfumaria',w:'jequiti.com.br',t:'A',p:'R$466 mi',e:'Novo',m:'Venda direta',d:[
      {n:'Larissa Fontanini',c:'Diretora de Marketing',st:'confirmado',g:'Sinergia com mídia SBT. Reestruturação (skincare, varejo, live)',o:'Fonte: ABEVD/Exame'},
      {n:'Eduardo Ribeiro',c:'CEO',st:'confirmado',g:'Plano de dobrar consultores e entrar no varejo',o:'Fonte: iNews'}]},
    {n:'Cacau Show',s:'Chocolates/Alimentos',sg:'Chocolates / Presentes',w:'cacaushow.com.br',t:'A',p:'R$6,8 bi (rede)',e:'Novo',m:'Venda direta + franquias',d:[
      {n:'Lilian Rodrigues',c:'Diretora de Marketing',st:'confirmado',g:'Ex-Boticário, foco 2025 em live commerce — fit conteúdo/criação',o:'Fonte: D.Comercio'},
      {n:'Daniel Roque',c:'VP de Negócios',st:'confirmado',g:'Se o ângulo for a rede de venda direta, o decisor é ele',o:'Patrocínio TV no SBT = apetite de mídia'}]},
    {n:'Forever Living',s:'Nutrição/Bem-estar',sg:'Bem-estar / Aloe vera',w:'foreverliving.com',t:'A',p:'158 países',e:'Novo',m:'MMN',d:[]},
    {n:'Tupperware',s:'Utensílios/Casa',sg:'Utensílios domésticos',w:'tupperware.com.br',t:'A',p:'Marca global clássica',e:'Novo',m:'Venda direta',d:[]},
    {n:'iGreen Energy',s:'Energia',sg:'Energia (mercado livre)',w:'igreenenergy.com.br',t:'B',p:'Maior case de crescimento 2025',e:'Novo',m:'MMN',d:[]},
    {n:'Amakha Paris',s:'Perfumaria',sg:'Perfumaria',w:'amakhaparis.com.br',t:'B',p:'Crescimento rápido',e:'Novo',m:'MMN',d:[]},
    {n:'Zyone',s:'Beleza/Cosméticos',sg:'Cosméticos',w:'zyone.com.br',t:'B',p:'Salto institucional 2025',e:'Novo',m:'MMN',d:[]},
    {n:'Atlântica Natural',s:'Nutrição/Bem-estar',sg:'Nutrição / Bem-estar',w:'',t:'B',p:'Destaque 2025',e:'Novo',m:'MMN',d:[]},
    {n:'Akmos',s:'Nutrição/Bem-estar',sg:'Nutrição / Cosméticos / Casa',w:'akmos.com.br',t:'B',p:'Base fiel',e:'Novo',m:'MMN',d:[]},
    {n:'Akmel',s:'Nutrição/Bem-estar',sg:'Bem-estar / Cosméticos',w:'',t:'B',p:'Consistência',e:'Novo',m:'MMN',d:[]},
    {n:'Moments Paris',s:'Perfumaria',sg:'Perfumaria premium',w:'',t:'B',p:'Posicionamento premium',e:'Novo',m:'MMN',d:[]},
    {n:'Boulevard Monde',s:'Nutrição/Bem-estar',sg:'Bem-estar / Cosméticos',w:'boulevardmonde.com.br',t:'B',p:'100 mil+ revendedores',e:'Novo',m:'MMN',d:[]},
    {n:'Omnilife',s:'Nutrição/Bem-estar',sg:'Suplementos',w:'omnilife.com',t:'B',p:'US$573 mi',e:'Novo',m:'MMN',d:[]},
    {n:'Nu Skin',s:'Beleza/Cosméticos',sg:'Beleza / Anti-idade',w:'nuskin.com',t:'B',p:'US$2,5 bi',e:'Novo',m:'MMN',d:[]},
    {n:'Oriflame',s:'Beleza/Cosméticos',sg:'Cosméticos',w:'oriflame.com',t:'C',p:'US$1,38 bi',e:'Novo',m:'MMN',d:[]},
    {n:'Jeunesse',s:'Beleza/Cosméticos',sg:'Beleza / Bem-estar',w:'jeunesseglobal.com',t:'C',p:'Global',e:'Novo',m:'MMN',d:[]},
    {n:'Vorwerk (Thermomix/Jafra)',s:'Utensílios/Casa',sg:'Eletrodomésticos / Cosméticos',w:'thermomix.com.br',t:'C',p:'US$4,48 bi',e:'Novo',m:'Venda direta',d:[]},
    {n:'Young Living',s:'Nutrição/Bem-estar',sg:'Óleos essenciais',w:'youngliving.com',t:'C',p:'US$2,2 bi',e:'Novo',m:'MMN',d:[]},
    {n:'4Life Research',s:'Nutrição/Bem-estar',sg:'Suplementos / Imunidade',w:'4life.com',t:'C',p:'Global',e:'Novo',m:'MMN',d:[]},
    {n:'Hy Cite (Royal Prestige)',s:'Utensílios/Casa',sg:'Utensílios / Casa',w:'royalprestige.com',t:'C',p:'US$341 mi',e:'Novo',m:'Venda direta',d:[]},
    {n:'Mahogany',s:'Perfumaria',sg:'Cosméticos / Perfumaria',w:'mahogany.com.br',t:'C',p:'Rede nacional',e:'Novo',m:'Venda direta',d:[]},
    {n:'DeMillus',s:'Vestuário',sg:'Vestuário / Lingerie',w:'demillus.com.br',t:'C',p:'Tradicional nacional',e:'Novo',m:'Venda direta',d:[]},
    {n:'Jan Rosê',s:'Beleza/Cosméticos',sg:'Cosméticos',w:'janrose.com.br',t:'C',p:'Nacional',e:'Novo',m:'Venda direta',d:[]},
    {n:'Crystallini',s:'Beleza/Cosméticos',sg:'Cosméticos / Semijoias',w:'',t:'C',p:'Nacional',e:'Novo',m:'Venda direta',d:[]},
    {n:'Odorata',s:'Perfumaria',sg:'Cosméticos / Perfumaria',w:'',t:'C',p:'Nacional',e:'Novo',m:'Venda direta',d:[]},
    {n:'Yakult',s:'Nutrição/Bem-estar',sg:'Alimentício / Probióticos',w:'yakult.com.br',t:'C',p:'Global',e:'Novo',m:'Venda direta',d:[]},
    {n:'Refin',s:'Serviços Financeiros',sg:'Serviços financeiros',w:'',t:'C',p:'Expansão 2025',e:'Novo',m:'MMN',d:[]},
    {n:'APVS Brasil',s:'Serviços Financeiros',sg:'Proteção veicular / Associação',w:'apvsbrasil.com.br',t:'C',p:'Grande operação',e:'Novo',m:'MMN',d:[]},
    {n:'Maravilhas da Terra (MDT)',s:'Nutrição/Bem-estar',sg:'Bem-estar / Chás funcionais',w:'',t:'C',p:'Crescimento acelerado',e:'Novo',m:'MMN',d:[]},
    {n:'USANA',s:'Nutrição/Bem-estar',sg:'Nutrição / Suplementos',w:'usana.com',t:'C',p:'US$1,14 bi',e:'Novo',m:'MMN',d:[]},
    {n:"Nature's Sunshine",s:'Nutrição/Bem-estar',sg:'Suplementos / Fitoterápicos',w:'naturessunshine.com',t:'C',p:'US$385 mi',e:'Novo',m:'MMN',d:[]},
  ];

  try {
    if (typeof ghExportBackup === 'function') ghExportBackup();
  } catch(e) {}

  const cLeads = lSt('ghub_custom_leads', []);
  const decDB  = lSt('gh_decisores_v3', {});
  const kanDB  = lSt('gh_kanban_v3', {});
  const wk     = wKey();

  const lkup = {};
  const allL = (typeof window.LEADS_ALL !== 'undefined' && Array.isArray(window.LEADS_ALL)) ? window.LEADS_ALL : [];
  allL.forEach(l => { if (l && l.nome) lkup[nS(l.nome)] = l.rank; });
  cLeads.forEach(l => { if (l && l.nome) lkup[nS(l.nome)] = l.rank; });
  let maxR = 9000;
  cLeads.forEach(l => { if (l.rank > maxR) maxR = l.rank; });
  allL.forEach(l => { if (l.rank > maxR) maxR = l.rank; });

  let novas = 0, atualiz = 0, decAdd = 0;

  for (const co of DATA) {
    const ck = nS(co.n);
    let rank = lkup[ck];
    if (!rank) {
      maxR++;
      rank = maxR;
      lkup[ck] = rank;
      cLeads.push({ rank, nome: co.n.toUpperCase(), setor: nSetor(co.s),
        segmento_detalhe: co.sg, website: co.w, tier: co.t,
        porte: co.p, modelo: co.m, cli: false, custom: true });
      novas++;
    } else {
      atualiz++;
    }
    const dbK = 'galeria_' + rank;
    if (!decDB[dbK]) decDB[dbK] = { decisors: [], sugeridos: [], activities: [] };
    const entry = decDB[dbK];
    for (const d of (co.d || [])) {
      if (!d.n) continue;
      const arr = d.st === 'confirmado' ? entry.decisors : entry.sugeridos;
      const dup = arr.find(x => nS(x.nome) === nS(d.n) && nS(x.cargo) === nS(d.c));
      if (!dup) {
        arr.push({ nome: d.n, cargo: d.c, email: '', wa: '', li: d.li || '',
          fromMailing: false, addedAt: 'import', gancho: d.g || '', observacoes: d.o || '' });
        decAdd++;
      }
    }
    if (!kanDB[wk]) kanDB[wk] = {};
    const col = mCol(co.e);
    if (!kanDB[wk][col]) kanDB[wk][col] = [];
    const cId = 'galeria_' + rank;
    if (!kanDB[wk][col].includes(cId)) kanDB[wk][col].push(cId);
  }

  sSt('ghub_custom_leads', cLeads);
  sSt('gh_decisores_v3', decDB);
  sSt('gh_kanban_v3', kanDB);
  localStorage.setItem('ghub_mmn_import_v1', '1');

  console.log('[MMN Import] ✅ ' + novas + ' novas | ' + atualiz + ' atualizadas | ' + decAdd + ' decisores');
})();
