/* ═══════════════════════════════════════════════════════════════
   BLOCO 6 — 🌡 TemperaturaView + 🛟 FerramentasModal (backup/APIs)
   Componentes globais consumidos pelo App (bloco 3).
   ═══════════════════════════════════════════════════════════════ */

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
  const [proxy, setProxy] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [importando, setImportando] = useState(false);
  const fileRef = React.useRef(null);
  const csvRef = React.useRef(null);
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

  function normStr(n) {
    return (n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  }

  function normSetor(s) {
    const SMAP = {
      "beleza": "Beleza", "cosmeticos": "Beleza", "cosméticos": "Beleza", "beleza cosméticos": "Beleza", "beleza e cosméticos": "Beleza", "beleza/cosméticos": "Beleza",
      "nutricao": "FMCG", "nutrição": "FMCG", "bem estar": "FMCG", "bens de consumo": "FMCG", "fmcg": "FMCG", "nutricao bem estar": "FMCG",
      "alimentos": "Food", "food": "Food", "chocolates": "Food", "alimenticio": "Food", "alimentício": "Food", "food beverage": "Food",
      "varejo": "Varejo", "e commerce": "E-commerce", "ecommerce": "E-commerce", "e-commerce": "E-commerce",
      "moda": "Varejo Moda", "varejo moda": "Varejo Moda", "fashion": "Varejo Moda",
      "fintech": "Fintech", "financeiro": "Financeiro",
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
      "mmn": "Beleza", "venda direta": "Varejo", "mlm": "Varejo"
    };
    const k = normStr(s || "");
    if (SMAP[k]) return SMAP[k];
    for (const [key, val] of Object.entries(SMAP)) {
      if (k && (k.includes(key) || key.includes(k))) return val;
    }
    return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : "Outros";
  }

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
          rank, nome: grp.nome.toUpperCase(), setor: normSetor(grp.setor),
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
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
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
  /*#__PURE__*/React.createElement("button", { className: "kes-btn-s", onClick: saveKeys }, "Salvar chaves locais"),

  msg && /*#__PURE__*/React.createElement("div", {
    style: { marginTop: 12, fontSize: 11, color: "#F5F5F5", background: "#0D0D0D", border: ".5px solid #2D2D44", borderRadius: 8, padding: "8px 12px" }
  }, msg),

  /*#__PURE__*/React.createElement("div", { className: "kes-modal-acts" },
    /*#__PURE__*/React.createElement("button", { className: "kes-btn-s", onClick: onClose }, "Fechar")
  )));
}
