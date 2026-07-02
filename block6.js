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
  const fileRef = React.useRef(null);
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
  const proxyLabel = proxy === null ? "verificando..." : proxy === false ? "❌ indisponível (modo direto com chaves locais)" : "✅ ativo — Claude:" + (proxy.claude ? "✓" : "✗") + " Hunter:" + (proxy.hunter ? "✓" : "✗") + " Lusha:" + (proxy.lusha ? "✓" : "✗");
  return /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-ov",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-title"
  }, "🛟 Ferramentas — Backup & APIs"), /*#__PURE__*/React.createElement("div", {
    className: "kes-label",
    style: {
      marginBottom: 8
    }
  }, "BACKUP DOS DADOS (decisores, kanban, atividades, tudo)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: doExport
  }, "⬇ Exportar backup (.json)"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: () => fileRef.current && fileRef.current.click()
  }, "⬆ Importar backup"), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "application/json,.json",
    style: {
      display: "none"
    },
    onChange: doImport
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555",
      marginTop: 8,
      lineHeight: 1.6
    }
  }, "Exporte um backup antes de qualquer atualização do site. Os dados vivem no navegador (localStorage) — trocar de máquina ou limpar o navegador sem backup = perda de dados. Um snapshot automático diário das chaves críticas também é mantido internamente."), /*#__PURE__*/React.createElement("div", {
    className: "kes-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "kes-label",
    style: {
      marginBottom: 6
    }
  }, "PROXY DE APIs (/api na Vercel): ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#F5F5F5",
      textTransform: "none"
    }
  }, proxyLabel)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555",
      marginBottom: 10,
      lineHeight: 1.6
    }
  }, "Com o proxy ativo, as chaves ficam só no servidor (variáveis de ambiente da Vercel) e os campos abaixo são ignorados. Sem proxy, o app usa as chaves locais abaixo, salvas apenas neste navegador."), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Hunter.io API key (fallback local)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "password",
    value: hk,
    onChange: e => setHk(e.target.value),
    placeholder: "nova chave após revogar a antiga"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Lusha API key (fallback local)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "password",
    value: lk,
    onChange: e => setLk(e.target.value),
    placeholder: "nova chave após revogar a antiga"
  })), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: saveKeys
  }, "Salvar chaves locais"), msg && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 11,
      color: "#F5F5F5",
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 8,
      padding: "8px 12px"
    }
  }, msg), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-acts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: onClose
  }, "Fechar"))));
}
