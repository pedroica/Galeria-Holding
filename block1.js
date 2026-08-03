const {
  useState,
  useMemo,
  useEffect,
  useCallback
} = React;
function AddCompanyModal({
  onSave,
  onClose,
  nextRank
}) {
  const [nome, setNome] = useState("");
  const [setor, setSetor] = useState("E-commerce");
  const [setorCustom, setSetorCustom] = useState("");
  const [site, setSite] = useState("");
  const [cidade, setCidade] = useState("");
  const [err, setErr] = useState("");
  const handleSave = () => {
    if (!nome.trim()) {
      setErr("Nome da empresa obrigatório.");
      return;
    }
    const finalSetor = setor === "Outros" && setorCustom.trim() ? setorCustom.trim() : setor;
    onSave({
      rank: nextRank,
      nome: nome.trim().toUpperCase(),
      setor: finalSetor,
      site: site.trim(),
      cidade: cidade.trim(),
      cli: false,
      custom: true
    });
    onClose();
  };
  const inp = {
    background: "#0D0D0D",
    border: ".5px solid #2D2D44",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#F5F5F5",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "IBM Plex Mono,monospace"
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod",
    style: {
      maxWidth: 500,
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 800,
      fontSize: 15,
      color: "#F5F5F5",
      letterSpacing: -.5
    }
  }, "+ Nova Empresa"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555",
      marginTop: 3
    }
  }, "Disponível em todas as empresas do grupo")), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#555",
      cursor: "pointer",
      fontSize: 22,
      lineHeight: 1
    }
  }, "×")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 5,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Nome da empresa *"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...inp,
      fontSize: 14,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: .5
    },
    placeholder: "Ex: POTTENCIAL SEGURADORA",
    value: nome,
    onChange: e => {
      setNome(e.target.value);
      setErr("");
    },
    onKeyDown: e => e.key === "Enter" && handleSave(),
    autoFocus: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 5,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Setor"), /*#__PURE__*/React.createElement("select", {
    style: {
      ...inp,
      cursor: "pointer"
    },
    value: setor,
    onChange: e => setSetor(e.target.value)
  }, SETORES_LIST.map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }, s)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 5,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Cidade"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "São Paulo, SP",
    value: cidade,
    onChange: e => setCidade(e.target.value)
  }))), setor === "Outros" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 5,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Setor personalizado"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "Digite o setor...",
    value: setorCustom,
    onChange: e => setSetorCustom(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 5,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Site (opcional)"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "www.empresa.com.br",
    value: site,
    onChange: e => setSite(e.target.value)
  })), err && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#FF4757",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 12,
      padding: "8px 12px",
      background: "rgba(255,71,87,.06)",
      border: ".5px solid rgba(255,71,87,.2)",
      borderRadius: 6
    }
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 8,
      border: ".5px solid #2D2D44",
      background: "transparent",
      color: "#9B9BB4",
      fontSize: 12,
      cursor: "pointer"
    }
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    onClick: handleSave,
    style: {
      flex: 2,
      padding: "10px 0",
      borderRadius: 8,
      border: "none",
      background: "#FF6B2B",
      color: "#fff",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, "✓ Adicionar empresa"))));
}
function EnrichAgent({
  empresa,
  grupo,
  acc,
  onAccUpdate,
  onClose
}) {
  const [nomeCMO, setNomeCMO] = useState("");
  const [cargoCMO, setCargoCMO] = useState("CMO");
  const [lushaResult, setLushaResult] = useState(null);
  const [lushaLoading, setLushaLoading] = useState(false);
  const [lushaMsg, setLushaMsg] = useState("");
  const [done, setDone] = useState(false);
  const openGoogle = () => {
    const q = encodeURIComponent('"' + empresa + '" CMO OR "Head de Mídia" OR "Head de Marketing" site:linkedin.com');
    window.open("https://www.google.com/search?q=" + q, "_blank");
  };
  const runLusha = async () => {
    if (!nomeCMO.trim()) return;
    setLushaLoading(true);
    setLushaMsg("");
    const parts = nomeCMO.trim().split(" ");
    const fn = parts[0];
    const ln = parts.slice(1).join(" ") || parts[0];
    const res = await lushaEnrich(fn, ln, empresa);
    setLushaLoading(false);
    if (!res.phone && !res.email) {
      setLushaMsg("Lusha não encontrou dados — adicione manualmente após salvar.");
    } else {
      setLushaMsg("");
    }
    setLushaResult(res);
    setDone(true);
  };
  const salvar = () => {
    if (!nomeCMO.trim()) return;
    const d = {
      nome: nomeCMO.trim(),
      cargo: cargoCMO,
      email: lushaResult ? lushaResult.email || "" : "",
      wa: lushaResult ? lushaResult.phone || "" : "",
      li: "",
      aiSuggested: true,
      addedAt: new Date().toLocaleDateString("pt-BR")
    };
    const existing = acc.decisors || [];
    if (!existing.find(x => x.nome === d.nome)) {
      onAccUpdate({
        ...acc,
        decisors: [...existing, d]
      });
    }
    onClose();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle",
    style: {
      marginBottom: 0
    }
  }, "⚡ Agente de Enriquecimento"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#444",
      cursor: "pointer",
      fontSize: 20
    }
  }, "×")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontFamily: "DM Mono,monospace",
      color: "#555",
      marginBottom: 14
    }
  }, "Empresa: ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#eee",
      fontWeight: 700
    }
  }, empresa)), /*#__PURE__*/React.createElement("div", {
    className: "enrich-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "enrich-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "enrich-num"
  }, "1"), /*#__PURE__*/React.createElement("div", {
    className: "enrich-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Buscar CMO/Head de Mídia no Google"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#555",
      marginBottom: 8
    }
  }, "Abre busca no Google para encontrar o responsável por mídia/marketing no LinkedIn."), /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: openGoogle,
    style: {
      color: "#A78BFA",
      borderColor: "rgba(167,139,250,.3)"
    }
  }, "🔍 Abrir Google + LinkedIn"))), /*#__PURE__*/React.createElement("div", {
    className: "enrich-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "enrich-num"
  }, "2"), /*#__PURE__*/React.createElement("div", {
    className: "enrich-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "Informar nome encontrado"), /*#__PURE__*/React.createElement("div", {
    className: "g2",
    style: {
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "NOME COMPLETO"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "Ex: Ana Paula Silva",
    value: nomeCMO,
    onChange: e => setNomeCMO(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "CARGO"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "CMO, Head de Mídia...",
    value: cargoCMO,
    onChange: e => setCargoCMO(e.target.value)
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "enrich-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "enrich-num"
  }, "3"), /*#__PURE__*/React.createElement("div", {
    className: "enrich-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Enriquecer com Lusha"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#555",
      marginBottom: 8
    }
  }, "Busca telefone e email corporativo automaticamente."), /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: runLusha,
    disabled: !nomeCMO || lushaLoading,
    style: {
      color: "#A78BFA",
      borderColor: "rgba(167,139,250,.3)"
    }
  }, lushaLoading ? "Buscando..." : "⚡ Enriquecer com Lusha"), lushaMsg && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#FFB547",
      fontFamily: "DM Mono,monospace",
      marginTop: 6
    }
  }, lushaMsg))), done && /*#__PURE__*/React.createElement("div", {
    className: "enrich-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "enrich-num",
    style: {
      background: "rgba(52,211,153,.2)",
      borderColor: "rgba(52,211,153,.4)",
      color: "#34D399"
    }
  }, "✓"), /*#__PURE__*/React.createElement("div", {
    className: "enrich-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: "#34D399",
      marginBottom: 4
    }
  }, "Resultado Lusha"), lushaResult && (lushaResult.email || lushaResult.phone) ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, lushaResult.email && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "DM Mono,monospace",
      color: "#60A5FA"
    }
  }, "✉ ", lushaResult.email), lushaResult.phone && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "DM Mono,monospace",
      color: "#25D366"
    }
  }, "💬 ", lushaResult.phone)) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "DM Mono,monospace",
      color: "#555"
    }
  }, "Dados não encontrados — preencha manualmente após salvar.")))), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: onClose
  }, "Cancelar"), nomeCMO && /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: grupo.color
    },
    onClick: salvar
  }, "✓ Salvar Decisor"))));
}
function EmailModal({
  dc,
  empresa,
  setor,
  grupo,
  angulo,
  hist,
  restrictions,
  onClose
}) {
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const [tom, setTom] = useState("Direto e estratégico");
  const gerar = () => {
    setLoading(true);
    gerarEmail(dc && dc.nome, empresa, setor, grupo, angulo, tom, hist).then(e => {
      setEmail(e);
      setLoading(false);
    }).catch(() => {
      setEmail({
        assunto: "Erro — configure a Claude API.",
        corpo: ""
      });
      setLoading(false);
    });
  };
  useEffect(() => {
    gerar();
  }, []);
  const cp = (txt, k) => {
    navigator.clipboard.writeText(txt);
    setCopied(k);
    setTimeout(() => setCopied(""), 2500);
  };
  const oo = () => email && window.open(`https://outlook.office.com/mail/deeplink/compose?${dc && dc.email ? "to=" + dc.email + "&" : ""}subject=${encodeURIComponent(email.assunto)}&body=${encodeURIComponent(email.corpo)}`, "_blank");
  const og = () => email && window.open(`https://mail.google.com/mail/?view=cm&${dc && dc.email ? "to=" + dc.email + "&" : ""}su=${encodeURIComponent(email.assunto)}&body=${encodeURIComponent(email.corpo)}`, "_blank");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.92)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#0e0e0e",
      borderRadius: 10,
      width: "100%",
      maxWidth: 560,
      border: "1px solid #222",
      maxHeight: "92vh",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px",
      borderBottom: "1px solid #1a1a1a",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: grupo.color
    }
  }, "Email IA — ", grupo.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#444",
      marginTop: 2,
      fontFamily: "DM Mono,monospace"
    }
  }, empresa, dc && dc.nome ? " · " + dc.nome : "")), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#444",
      cursor: "pointer",
      fontSize: 20
    }
  }, "×")), restrictions && restrictions.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "12px 20px 0",
      background: "rgba(255,71,87,.06)",
      border: "1px solid rgba(255,71,87,.25)",
      borderRadius: 5,
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#FF4757",
      fontWeight: 700,
      marginBottom: 4
    }
  }, "⚠ ATENÇÃO — Lead com restrição de conflito"), restrictions.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#884040",
      marginTop: 2
    }
  }, r.reason, " · ", r.category))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 12,
      flexWrap: "wrap"
    }
  }, ["Direto e estratégico", "Provocativo", "Consultivo", "Follow-up"].map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => setTom(t),
    style: {
      padding: "4px 9px",
      borderRadius: 3,
      border: "1px solid " + (tom === t ? grupo.color : "#1e1e1e"),
      background: "transparent",
      color: tom === t ? grupo.color : "#444",
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      cursor: "pointer"
    }
  }, t)), /*#__PURE__*/React.createElement("button", {
    onClick: gerar,
    style: {
      padding: "4px 9px",
      borderRadius: 3,
      border: "1px solid #1e1e1e",
      background: "transparent",
      color: "#444",
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      cursor: "pointer",
      marginLeft: "auto"
    }
  }, "↺ Regerar")), loading ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 40,
      color: "#333",
      fontFamily: "DM Mono,monospace",
      fontSize: 11
    }
  }, "Gerando email personalizado...") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      color: "#333",
      fontFamily: "DM Mono,monospace",
      letterSpacing: "1px",
      textTransform: "uppercase",
      marginBottom: 4
    }
  }, "ASSUNTO"), /*#__PURE__*/React.createElement("input", {
    style: {
      width: "100%",
      background: "#111",
      border: "1px solid #1e1e1e",
      borderRadius: 3,
      padding: "8px 10px",
      color: "#eee",
      fontFamily: "DM Mono,monospace",
      fontSize: 12,
      outline: "none"
    },
    value: email.assunto,
    onChange: e => setEmail(em => ({
      ...em,
      assunto: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      color: "#333",
      fontFamily: "DM Mono,monospace",
      letterSpacing: "1px",
      textTransform: "uppercase",
      marginBottom: 4
    }
  }, "CORPO"), /*#__PURE__*/React.createElement("textarea", {
    style: {
      width: "100%",
      background: "#111",
      border: "1px solid #1e1e1e",
      borderRadius: 3,
      padding: "8px 10px",
      color: "#eee",
      fontFamily: "DM Mono,monospace",
      fontSize: 11,
      outline: "none",
      minHeight: 180,
      resize: "vertical",
      lineHeight: 1.7
    },
    value: email.corpo,
    onChange: e => setEmail(em => ({
      ...em,
      corpo: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      borderRadius: 5,
      overflow: "hidden",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#f1f3f4",
      padding: "6px 12px",
      display: "flex",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "#ff5f57"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "#febc2e"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "#28c840"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 16px 6px",
      fontFamily: "Arial,sans-serif",
      fontSize: 14,
      fontWeight: 700,
      color: "#000",
      borderBottom: "1px solid #e0e0e0"
    }
  }, email.assunto), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 16px 14px",
      fontFamily: "Arial,sans-serif",
      fontSize: 12.5,
      color: "#111",
      lineHeight: 1.75,
      whiteSpace: "pre-wrap"
    }
  }, email.corpo)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 6,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: oo,
    style: {
      padding: "10px 0",
      borderRadius: 4,
      border: "none",
      background: "#0078d4",
      color: "#fff",
      fontWeight: 700,
      fontSize: 12,
      cursor: "pointer"
    }
  }, "Abrir no Outlook"), /*#__PURE__*/React.createElement("button", {
    onClick: og,
    style: {
      padding: "10px 0",
      borderRadius: 4,
      border: "none",
      background: "#ea4335",
      color: "#fff",
      fontWeight: 700,
      fontSize: 12,
      cursor: "pointer"
    }
  }, "Abrir no Gmail")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => cp(email.corpo, "corpo"),
    style: {
      padding: "8px 0",
      borderRadius: 4,
      border: "1px solid #1e1e1e",
      background: copied === "corpo" ? "#16a34a" : "#111",
      color: copied === "corpo" ? "#fff" : "#555",
      fontSize: 11,
      cursor: "pointer"
    }
  }, copied === "corpo" ? "Copiado!" : "Copiar corpo"), /*#__PURE__*/React.createElement("button", {
    onClick: () => cp("Assunto: " + email.assunto + "\n\n" + email.corpo, "tudo"),
    style: {
      padding: "8px 0",
      borderRadius: 4,
      border: "1px solid #1e1e1e",
      background: copied === "tudo" ? "#16a34a" : "#111",
      color: copied === "tudo" ? "#fff" : "#555",
      fontSize: 11,
      cursor: "pointer"
    }
  }, copied === "tudo" ? "Copiado!" : "Copiar tudo"))))));
}
function MoverDecidorModal({
  decisor,
  empAtual,
  onMover,
  onClose
}) {
  const [busca, setBusca] = useState("");
  const [dest, setDest] = useState(null);
  const lista = (typeof PROSP !== "undefined" ? PROSP : []).filter(e => busca.length > 1 && e.nome.toLowerCase().includes(busca.toLowerCase()) && e.nome !== empAtual).slice(0, 20);
  return /*#__PURE__*/React.createElement("div", {
    className: "modov",
    style: {
      zIndex: 3000
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod",
    style: {
      maxWidth: 460,
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: "#F5F5F5"
    }
  }, "🔀 Mover Decisor"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginTop: 2
    }
  }, decisor.nome, " · saindo de ", empAtual)), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#555",
      cursor: "pointer",
      fontSize: 20
    }
  }, "×")), /*#__PURE__*/React.createElement("input", {
    value: busca,
    onChange: e => setBusca(e.target.value),
    placeholder: "Digite o nome da empresa destino...",
    autoFocus: true,
    style: {
      width: "100%",
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 8,
      padding: "10px 12px",
      color: "#F5F5F5",
      fontSize: 12,
      outline: "none",
      boxSizing: "border-box",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 220,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      marginBottom: 14
    }
  }, busca.length > 1 && lista.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 16,
      color: "#555",
      fontSize: 11
    }
  }, "Nenhuma empresa encontrada"), lista.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.rank,
    onClick: () => setDest(e),
    style: {
      padding: "10px 12px",
      borderRadius: 8,
      cursor: "pointer",
      background: dest && dest.rank === e.rank ? "rgba(167,139,250,.12)" : "#111827",
      border: dest && dest.rank === e.rank ? ".5px solid #A78BFA" : ".5px solid #2D2D44"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: "#F5F5F5"
    }
  }, e.nome), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, e.setor || "—")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 8,
      border: ".5px solid #2D2D44",
      background: "transparent",
      color: "#9B9BB4",
      fontSize: 12,
      cursor: "pointer"
    }
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    onClick: () => dest && onMover(dest),
    disabled: !dest,
    style: {
      flex: 2,
      padding: "10px 0",
      borderRadius: 8,
      border: "none",
      fontSize: 12,
      fontWeight: 700,
      background: dest ? "#A78BFA" : "#1e2433",
      color: dest ? "#fff" : "#555",
      cursor: dest ? "pointer" : "not-allowed"
    }
  }, "Mover para ", dest ? dest.nome : "..."))));
}
function DecCard({
  dc,
  empresa,
  setor,
  grupo,
  isEditing,
  onToggleEdit,
  onUpdate,
  onRemove,
  pdKey,
  restrictions,
  onWALog,
  onMoveEmpresa
}) {
  const [pdStatus, setPdStatus] = useState(null);
  const [pdLoading, setPdLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showMover, setShowMover] = useState(false);
  const [waStatus, setWaStatus] = useState(dc.waVerified || {});
  const [waVerifying, setWaVerifying] = useState(false);
  const verifyEmail = async () => {
    if (!dc.email) return;
    setVerifying(true);
    const v = await hunterVerify(dc.email);
    if (v) onUpdate("emailStatus", v.result);
    setVerifying(false);
  };
  const verifyWA = async () => {
    if (!phones.length || waVerifying) return;
    if (typeof ghVerifyWANumbers !== "function") return;
    setWaVerifying(true);
    const result = await ghVerifyWANumbers(phones);
    if (result) {
      setWaStatus(result);
      onUpdate("waVerified", result);
    }
    setWaVerifying(false);
  };
  const syncPD = async () => {
    if (!pdKey || !dc.email) return;
    setPdLoading(true);
    const ex = await pipedriveSearch(dc.email, pdKey);
    setPdStatus(ex ? "exists" : (await pipedriveCreate(dc, empresa, pdKey)) ? "ok" : "error");
    setPdLoading(false);
  };
  const openWA = num => {
    if (!num) return;
    const n = num.replace(/[^0-9]/g, "");
    const c = n.startsWith("55") && n.length >= 12 ? n : "55" + n;
    window.open("https://wa.me/" + c, "_blank");
    if (onWALog) onWALog(dc.nome);
  };
  const stC = {
    "ok": "#34D399",
    "invalid": "#FF4757",
    "risky": "#FFB547",
    "unknown": "#555",
    "exists": "#A78BFA"
  };
  const phones = [dc.wa, dc.wa2, dc.wa3, dc.wa4].filter(Boolean);
  // Derived accent colors from grupo
  const acBase = grupo.color || "#6b64f3";
  const acRgb  = grupo.rgb  || "107,100,243";
  return /*#__PURE__*/React.createElement(React.Fragment, null,
    showEmail && /*#__PURE__*/React.createElement(EmailModal, {dc, empresa, setor, grupo, angulo: grupo.angles[0], hist: "", restrictions, onClose: () => setShowEmail(false)}),
    showMover && /*#__PURE__*/React.createElement(MoverDecidorModal, {
      decisor: dc, empAtual: empresa,
      onMover: dest => { onMoveEmpresa && onMoveEmpresa(dc, dest); setShowMover(false); },
      onClose: () => setShowMover(false)
    }),
    /*#__PURE__*/React.createElement("div", {
      style: {
        width: 190,
        minWidth: 190,
        background: `linear-gradient(160deg,rgba(${acRgb},.22) 0%,#0d0d18 55%)`,
        border: `1px solid rgba(${acRgb},.28)`,
        borderRadius: 15,
        boxShadow: `1px 5px 28px 0px rgba(${acRgb},.18)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingBottom: 14,
        fontFamily: "IBM Plex Mono,monospace",
        position: "relative",
        overflow: "hidden"
      }
    },
      /* ── top accent bar ── */
      /*#__PURE__*/React.createElement("div", {
        style: {
          width: "60%", height: 4,
          background: acBase,
          borderRadius: "0 0 10px 10px",
          marginBottom: 16,
          boxShadow: `0 2px 8px rgba(${acRgb},.5)`
        }
      }),
      /* ── avatar ── */
      /*#__PURE__*/React.createElement("div", {
        style: {
          width: 64, height: 64,
          background: `rgba(${acRgb},.22)`,
          border: `1.5px solid rgba(${acRgb},.45)`,
          borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 700, color: acBase,
          letterSpacing: -1,
          marginBottom: 10,
          boxShadow: `0 2px 12px rgba(${acRgb},.2)`
        }
      }, initials(dc.nome || "?")),
      /* ── name + badges ── */
      /*#__PURE__*/React.createElement("div", {style: {textAlign: "center", paddingInline: 10, marginBottom: 2}},
        /*#__PURE__*/React.createElement("div", {
          style: {
            fontWeight: 700, color: "#F5F5F5", fontSize: 13,
            lineHeight: 1.25, letterSpacing: -.3,
            wordBreak: "break-word"
          }
        }, dc.nome || "Sem nome"),
        (dc.aiSuggested || dc.fromMailing) && /*#__PURE__*/React.createElement("div", {style: {display: "flex", gap: 4, justifyContent: "center", marginTop: 4}},
          dc.aiSuggested  && /*#__PURE__*/React.createElement("span", {style: {fontSize: 7, padding: "1px 5px", borderRadius: 10, background: "rgba(167,139,250,.15)", color: "#A78BFA"}}, "IA"),
          dc.fromMailing  && /*#__PURE__*/React.createElement("span", {style: {fontSize: 7, padding: "1px 5px", borderRadius: 10, background: "rgba(96,165,250,.1)", color: "#60A5FA"}}, "mailing")
        )
      ),
      /* ── cargo ── */
      /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10, color: `rgba(${acRgb},.75)`, fontWeight: 500,
          textAlign: "center", paddingInline: 8, marginBottom: 10,
          lineHeight: 1.3
        }
      }, dc.cargo || /*#__PURE__*/React.createElement("span", {style: {color: "#333", fontStyle: "italic"}}, "sem cargo")),
      /* ── contact status badges ── */
      /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center",
          paddingInline: 8, marginBottom: 10
        }
      },
        dc.email && /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 8, padding: "2px 7px", borderRadius: 20,
            background: dc.emailStatus ? (stC[dc.emailStatus]+"22"||"#1a1a2e") : "rgba(255,255,255,.05)",
            color: dc.emailStatus ? stC[dc.emailStatus] : "#666",
            border: `1px solid ${dc.emailStatus ? stC[dc.emailStatus]+"55" : "#222"}`,
            maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          },
          title: dc.email
        }, "✉ ", dc.email.split("@")[0]),
        !dc.email && /*#__PURE__*/React.createElement("span", {style: {fontSize: 8, color: "#333", padding: "2px 7px", border: "1px solid #1a1a1a", borderRadius: 20}}, "sem email"),
        phones.map((p, i) => /*#__PURE__*/React.createElement("span", {
          key: i,
          style: {
            fontSize: 8, padding: "2px 7px", borderRadius: 20,
            background: waStatus[p] === true ? "rgba(37,211,102,.1)" : waStatus[p] === false ? "rgba(255,71,87,.06)" : "rgba(37,211,102,.04)",
            color: waStatus[p] === true ? "#25D366" : waStatus[p] === false ? "#666" : "#25D366",
            border: `1px solid ${waStatus[p] === true ? "rgba(37,211,102,.4)" : waStatus[p] === false ? "rgba(255,71,87,.2)" : "rgba(37,211,102,.15)"}`,
            textDecoration: waStatus[p] === false ? "line-through" : "none"
          }
        }, "💬", waStatus[p] === true ? " ✓" : waStatus[p] === false ? " ✗" : ""))
      ),
      /* ── primary action buttons ── */
      /*#__PURE__*/React.createElement("div", {style: {display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap", paddingInline: 8, marginBottom: 8}},
        dc.email && /*#__PURE__*/React.createElement("button", {
          onClick: () => setShowEmail(true),
          style: {
            padding: "5px 10px", borderRadius: 8, border: "none",
            background: `rgba(${acRgb},.25)`, color: acBase,
            fontSize: 9, fontWeight: 600, cursor: "pointer",
            fontFamily: "IBM Plex Mono,monospace"
          }
        }, "✉ Email"),
        phones.map((p, i) => /*#__PURE__*/React.createElement("button", {
          key: i,
          onClick: () => openWA(p),
          style: {
            padding: "5px 10px", borderRadius: 8, border: "none",
            background: waStatus[p] === false ? "rgba(80,80,80,.2)" : "rgba(37,211,102,.12)",
            color: waStatus[p] === false ? "#666" : "#25D366",
            fontSize: 9, fontWeight: 600, cursor: "pointer",
            fontFamily: "IBM Plex Mono,monospace"
          }
        }, "💬", phones.length > 1 ? " WA"+(i+1) : " WA")),
        dc.li && /*#__PURE__*/React.createElement("button", {
          onClick: () => window.open(dc.li.startsWith("http") ? dc.li : "https://"+dc.li, "_blank"),
          style: {
            padding: "5px 10px", borderRadius: 8, border: "none",
            background: "rgba(96,165,250,.1)", color: "#60A5FA",
            fontSize: 9, fontWeight: 600, cursor: "pointer",
            fontFamily: "IBM Plex Mono,monospace"
          }
        }, "in LinkedIn")
      ),
      /* ── secondary actions ── */
      /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap",
          paddingInline: 8, borderTop: "1px solid rgba(255,255,255,.05)",
          paddingTop: 8
        }
      },
        dc.ig && /*#__PURE__*/React.createElement("button", {
          onClick: () => window.open(dc.ig.startsWith("http") ? dc.ig : dc.ig.startsWith("@") ? "https://instagram.com/"+dc.ig.slice(1) : "https://"+dc.ig, "_blank"),
          style: {padding: "3px 7px", borderRadius: 6, border: "1px solid rgba(225,48,108,.2)", background: "rgba(225,48,108,.06)", color: "#E1306C", fontSize: 8, cursor: "pointer"}
        }, "📸"),
        dc.fb && /*#__PURE__*/React.createElement("button", {
          onClick: () => window.open(dc.fb.startsWith("http") ? dc.fb : "https://"+dc.fb, "_blank"),
          style: {padding: "3px 7px", borderRadius: 6, border: "1px solid rgba(24,119,242,.2)", background: "rgba(24,119,242,.06)", color: "#1877F2", fontSize: 8, cursor: "pointer"}
        }, "fb"),
        dc.email && !dc.emailStatus && /*#__PURE__*/React.createElement("button", {
          onClick: verifyEmail, disabled: verifying,
          style: {padding: "3px 7px", borderRadius: 6, border: "1px solid #222", background: "#111", color: "#777", fontSize: 8, cursor: "pointer"}
        }, verifying ? "..." : "Validar ✉"),
        phones.length > 0 && typeof getWAVerifyUrl === "function" && getWAVerifyUrl() && /*#__PURE__*/React.createElement("button", {
          onClick: verifyWA, disabled: waVerifying,
          title: "Verificar quais números têm WhatsApp ativo",
          style: {padding: "3px 7px", borderRadius: 6, border: "1px solid rgba(37,211,102,.2)", background: "rgba(37,211,102,.05)", color: "#25D366", fontSize: 8, cursor: "pointer"}
        }, waVerifying ? "..." : "🔍 WA"),
        pdKey && dc.email && /*#__PURE__*/React.createElement("button", {
          onClick: syncPD, disabled: pdLoading,
          style: {padding: "3px 7px", borderRadius: 6, border: "1px solid rgba(167,139,250,.2)", background: "rgba(167,139,250,.06)", color: "#A78BFA", fontSize: 8, cursor: "pointer"}
        }, pdLoading ? "..." : pdStatus === "exists" ? "No Pipe" : pdStatus === "ok" ? "Criado!" : "Pipe"),
        onMoveEmpresa && /*#__PURE__*/React.createElement("button", {
          onClick: () => setShowMover(true), title: "Mover para outra empresa",
          style: {padding: "3px 7px", borderRadius: 6, border: "1px solid #222", background: "#111", color: "#666", fontSize: 8, cursor: "pointer"}
        }, "🔀"),
        /*#__PURE__*/React.createElement("button", {
          onClick: onToggleEdit,
          style: {
            padding: "3px 7px", borderRadius: 6, fontSize: 8, cursor: "pointer",
            border: isEditing ? `1px solid rgba(${acRgb},.4)` : "1px solid #222",
            background: isEditing ? `rgba(${acRgb},.12)` : "#111",
            color: isEditing ? acBase : "#777"
          }
        }, isEditing ? "✕ Fechar" : "✏ Editar"),
        /*#__PURE__*/React.createElement("button", {
          onClick: onRemove,
          style: {padding: "3px 7px", borderRadius: 6, border: "1px solid rgba(255,71,87,.2)", background: "rgba(255,71,87,.06)", color: "#FF4757", fontSize: 8, cursor: "pointer"}
        }, "✕")
      )
    ),
    /* ── edit form (expands below card) ── */
    isEditing && /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#0a0a12",
        border: `1px solid rgba(${acRgb},.2)`,
        borderRadius: 8, padding: 12, marginTop: 6,
        width: 190, fontFamily: "IBM Plex Mono,monospace"
      }
    },
      /*#__PURE__*/React.createElement("div", {className: "g2"},
        [["nome", "Nome"], ["cargo", "Cargo"], ["email", "Email"]].map(([f, pl]) =>
          /*#__PURE__*/React.createElement("div", {className: "frow", key: f},
            /*#__PURE__*/React.createElement("div", {className: "flbl"}, pl),
            /*#__PURE__*/React.createElement("input", {className: "finp", placeholder: pl, value: dc[f] || "", onChange: e => onUpdate(f, e.target.value)})
          )
        )
      ),
      /*#__PURE__*/React.createElement("div", {className: "g2"},
        [["wa","WA 1"],["wa2","WA 2"],["wa3","WA 3"],["wa4","WA 4"]].map(([f, pl]) =>
          /*#__PURE__*/React.createElement("div", {className: "frow", key: f},
            /*#__PURE__*/React.createElement("div", {className: "flbl"}, pl),
            /*#__PURE__*/React.createElement("input", {className: "finp", placeholder: "5511999...", value: dc[f] || "", onChange: e => onUpdate(f, e.target.value)})
          )
        )
      ),
      /*#__PURE__*/React.createElement("div", {className: "g2"},
        /*#__PURE__*/React.createElement("div", {className: "frow"},
          /*#__PURE__*/React.createElement("div", {className: "flbl"}, "LinkedIn"),
          /*#__PURE__*/React.createElement("input", {className: "finp", placeholder: "linkedin.com/in/...", value: dc.li || "", onChange: e => onUpdate("li", e.target.value)})
        ),
        /*#__PURE__*/React.createElement("div", {className: "frow"},
          /*#__PURE__*/React.createElement("div", {className: "flbl"}, "Instagram"),
          /*#__PURE__*/React.createElement("input", {className: "finp", placeholder: "@usuario", value: dc.ig || "", onChange: e => onUpdate("ig", e.target.value)})
        )
      ),
      /*#__PURE__*/React.createElement("div", {className: "frow"},
        /*#__PURE__*/React.createElement("div", {className: "flbl"}, "Facebook"),
        /*#__PURE__*/React.createElement("input", {className: "finp", placeholder: "facebook.com/...", value: dc.fb || "", onChange: e => onUpdate("fb", e.target.value)})
      )
    )
  );
}
function RestrictionsPanel({
  onClose
}) {
  const byAgency = {};
  RESTRICTIONS.forEach(r => {
    r.agencies.forEach(ag => {
      if (!byAgency[ag]) byAgency[ag] = [];
      byAgency[ag].push(r);
    });
  });
  const agMap = {
    "galeria": "Galeria",
    "mila": "Milà",
    "404": "404",
    "cccaramelo": "cccaramelo"
  };
  const agColor = {
    "galeria": "#E8C97A",
    "mila": "#C9A87C",
    "404": "#7EB8D4",
    "cccaramelo": "#E8916A"
  };
  const resLeads = PROSP.filter(l => {
    return GRUPO.some(g => checkRestrictions(l, g.id).length > 0);
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod mod-wide"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "modtitle",
    style: {
      marginBottom: 4
    }
  }, "⚠ Painel de Restrições de Conflito"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#444"
    }
  }, "Revisão trimestral recomendada · Última atualização: ", new Date().toLocaleDateString("pt-BR"))), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#444",
      cursor: "pointer",
      fontSize: 20
    }
  }, "×")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "rgba(255,181,71,.05)",
      border: "1px solid rgba(255,181,71,.2)",
      borderRadius: 5,
      padding: "10px 14px",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#FFB547",
      fontWeight: 700,
      marginBottom: 4
    }
  }, "📅 LEMBRETE TRIMESTRAL"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#887040",
      lineHeight: 1.6
    }
  }, "Revise estas restrições a cada 3 meses para confirmar se os clientes e contratos ainda estão ativos. Restrições expiradas são removidas automaticamente quando a data vence.")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#444",
      marginBottom: 12
    }
  }, resLeads.length, " leads restritos identificados na base"), Object.keys(byAgency).sort().map(ag => /*#__PURE__*/React.createElement("div", {
    key: ag,
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: agColor[ag] || "#888",
      fontFamily: "DM Mono,monospace",
      letterSpacing: 1,
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: agColor[ag] || "#888",
      display: "inline-block"
    }
  }), (agMap[ag] || ag).toUpperCase(), " — ", byAgency[ag].length, " RESTRIÇÕES"), byAgency[ag].map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "res-row"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700
    }
  }, r.reason), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      fontFamily: "DM Mono,monospace",
      color: "#444",
      marginTop: 2
    }
  }, r.category)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 3
    }
  }, r.keywords.slice(0, 6).map((k, ki) => /*#__PURE__*/React.createElement("span", {
    key: ki,
    style: {
      fontSize: 7,
      fontFamily: "DM Mono,monospace",
      padding: "1px 5px",
      borderRadius: 100,
      background: "rgba(255,71,87,.08)",
      color: "#FF4757",
      border: "1px solid rgba(255,71,87,.18)"
    }
  }, k)), r.keywords.length > 6 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 7,
      fontFamily: "DM Mono,monospace",
      color: "#444"
    }
  }, "+", r.keywords.length - 6))), r.expiresAt && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      fontFamily: "DM Mono,monospace",
      color: "#FFB547",
      whiteSpace: "nowrap",
      marginLeft: 8
    }
  }, "até ", new Date(r.expiresAt).toLocaleDateString("pt-BR")))))), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: onClose
  }, "Fechar"), /*#__PURE__*/React.createElement("button", {
    className: "btn btnsm",
    style: {
      background: "rgba(255,181,71,.15)",
      color: "#FFB547",
      border: "1px solid rgba(255,181,71,.3)"
    },
    onClick: () => {
      saveSt("ghub_res_review", new Date().toISOString());
      onClose();
    }
  }, "✓ Confirmar revisão trimestral"))));
}
function getSequenceStatus(acc, grupo) {
  var acts = acc.activities || [];
  var decs = acc.decisors || [];
  var channels = ["email", "whatsapp", "linkedin"];
  return decs.map(function (d) {
    var decActs = acts.filter(function (a) {
      return a.decisor === d.nome;
    });
    var usedCh = new Set(decActs.map(function (a) {
      return a.type;
    }));
    var hasReply = decActs.some(function (a) {
      return a.type === "response";
    });
    var nextCh = channels.find(function (ch) {
      return !usedCh.has(ch);
    }) || null;
    return {
      dec: d,
      contacted: decActs.length > 0,
      hasReply: hasReply,
      nextChannel: nextCh,
      attempts: decActs.length,
      lastDate: decActs.length > 0 ? decActs[decActs.length - 1].date : null
    };
  });
}
function getNextAction(acc, grupo) {
  if (!acc || !grupo) return {
    dec: null,
    channel: null,
    reason: "Configure a conta primeiro"
  };
  var seq = getSequenceStatus(acc, grupo);
  var uncontacted = seq.find(function (s) {
    return !s.contacted;
  });
  if (uncontacted) return {
    dec: uncontacted.dec,
    channel: "email",
    reason: "Primeiro contato"
  };
  var noReply = seq.find(function (s) {
    return s.contacted && !s.hasReply && s.nextChannel;
  });
  if (noReply) return {
    dec: noReply.dec,
    channel: noReply.nextChannel,
    reason: "Sem resposta — tentando " + noReply.nextChannel
  };
  return {
    dec: null,
    channel: null,
    reason: "Todos os canais usados — buscar novos decisores"
  };
}
function NextActionPanel({
  acc,
  grupo,
  onEmail,
  onEnrich
}) {
  var nextAct = getNextAction(acc, grupo);
  if (!nextAct || !nextAct.dec && !nextAct.reason) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "rgba(" + grupo.rgb + ",.04)",
      border: "1px solid rgba(" + grupo.rgb + ",.15)",
      borderRadius: 8,
      padding: 14,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: grupo.color,
      letterSpacing: 1,
      marginBottom: 6
    }
  }, "🎯 PRÓXIMA AÇÃO"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 4
    }
  }, nextAct.dec ? nextAct.dec.nome + " — " + (nextAct.channel || "").toUpperCase() : "Buscar novos decisores"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#666",
      fontFamily: "DM Mono,monospace",
      marginBottom: 8
    }
  }, nextAct.reason), nextAct.channel === "email" && nextAct.dec && /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: grupo.color,
      color: "#000"
    },
    onClick: onEmail
  }, "✉ Enviar agora"), nextAct.channel === "whatsapp" && nextAct.dec && nextAct.dec.wa && /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    style: {
      color: "#25D366",
      borderColor: "rgba(37,211,102,.3)"
    },
    onClick: function () {
      window.open("https://wa.me/" + (() => {
        var n = (nextAct.dec.wa || "").replace(/[^0-9]/g, "");
        return n.startsWith("55") && n.length >= 12 ? n : "55" + n;
      })(), "_blank");
    }
  }, "💬 WhatsApp"), nextAct.channel === "linkedin" && nextAct.dec && /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    style: {
      color: "#0077B5",
      borderColor: "rgba(0,119,181,.3)"
    },
    onClick: function () {
      window.open(nextAct.dec.li && nextAct.dec.li.startsWith("http") ? nextAct.dec.li : "https://www.linkedin.com", "_blank");
    }
  }, "in LinkedIn"), !nextAct.dec && /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    style: {
      color: "#FFB547",
      borderColor: "rgba(255,181,71,.3)"
    },
    onClick: onEnrich
  }, "⚡ Enriquecer"));
}
function AgentView({
  grupo,
  lead,
  acc,
  pdKey,
  onAccUpdate
}) {
  const [tab, setTab] = useState("overview");
  const [curAngle, setCurAngle] = useState(0);
  const [emailModal, setEmailModal] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [monLoading, setMonLoading] = useState(false);
  const [actModal, setActModal] = useState(false);
  const [decModal, setDecModal] = useState(false);
  const [enrichModal, setEnrichModal] = useState(false);
  const [editDec, setEditDec] = useState({});
  const [actType, setActType] = useState("email");
  const [actDec, setActDec] = useState("");
  const [actNote, setActNote] = useState("");
  const [newDec, setNewDec] = useState({
    nome: "",
    cargo: "",
    email: "",
    wa: "",
    wa2: "",
    wa3: "",
    li: "",
    ig: "",
    fb: ""
  });
  const setor = lead.setor || "";
  const fit = grupo.fit(setor);
  const dor = grupo.dor(setor);
  const restrictions = checkRestrictions(lead, grupo.id);
  const isRestricted = restrictions.length > 0;
  const hist = (acc.activities || []).map(a => a.typeLabel + " " + a.date + (a.note ? ": " + a.note : "")).join("; ");
  const decStr = (acc.decisors || []).map(d => d.nome + " (" + d.cargo + ")").join(", ");
  const tabs = [["overview", "VISÃO GERAL"], ["decisores", "DECISORES"], ["historico", "HISTÓRICO"], ["email", "EMAIL"], ["intel", "INTELIGÊNCIA"], ["pipeline", "TOP 50"], ["comunidade", "COMUNIDADE"]];
  const genIntel = async () => {
    setIntelLoading(true);
    const t = await gerarIntel(lead.nome, setor, grupo, decStr, hist);
    onAccUpdate({
      ...acc,
      intel: t
    });
    setIntelLoading(false);
  };
  const runMon = async () => {
    setMonLoading(true);
    const al = await gerarAlertas(lead.nome, setor, grupo);
    onAccUpdate({
      ...acc,
      alerts: [...(acc.alerts || []), ...al.map(a => ({
        ...a,
        date: new Date().toLocaleDateString("pt-BR")
      }))]
    });
    setMonLoading(false);
  };
  const saveAct = async () => {
    const tmap = {
      email: "✉ Email",
      call: "📞 Ligação",
      whatsapp: "💬 WhatsApp",
      linkedin: "in LinkedIn",
      meeting: "🤝 Reunião",
      response: "↩ Resposta"
    };
    const a = {
      type: actType,
      typeLabel: tmap[actType] || actType,
      decisor: actDec,
      note: actNote,
      date: new Date().toLocaleDateString("pt-BR"),
      synced: false
    };
    const newActs = [...(acc.activities || []), a];
    onAccUpdate({
      ...acc,
      activities: newActs
    });
    if (pdKey) {
      await createActivity(acc.pdDealId, tmap[actType] + " — " + lead.nome, actNote, pdKey);
      a.synced = true;
    }
    setActModal(false);
    setActNote("");
    if (newActs.length >= 3 && newActs.length % 3 === 0) setTimeout(genIntel, 800);
  };
  const logWA = nomeDec => {
    const a = {
      type: "whatsapp",
      typeLabel: "💬 WhatsApp",
      decisor: nomeDec || "",
      note: "Mensagem enviada via WhatsApp",
      date: new Date().toLocaleDateString("pt-BR"),
      synced: false
    };
    onAccUpdate({
      ...acc,
      activities: [...(acc.activities || []), a]
    });
  };
  const saveDec = async () => {
    if (!newDec.nome) return;
    const d = {
      ...newDec,
      addedAt: new Date().toLocaleDateString("pt-BR")
    };
    onAccUpdate({
      ...acc,
      decisors: [...(acc.decisors || []), d]
    });
    if (pdKey) await pipedriveCreate(d, lead.nome, pdKey);
    setDecModal(false);
    setNewDec({
      nome: "",
      cargo: "",
      email: "",
      wa: "",
      wa2: "",
      wa3: "",
      li: "",
      ig: "",
      fb: ""
    });
  };
  const syncDeal = async () => {
    if (!pdKey) return;
    const deal = await createDeal(lead.nome, grupo.name, pdKey);
    if (deal) onAccUpdate({
      ...acc,
      pdDealId: deal.id
    });
  };
  const updDec = (i, f, v) => {
    const a = [...(acc.decisors || [])];
    a[i] = {
      ...a[i],
      [f]: v
    };
    onAccUpdate({
      ...acc,
      decisors: a
    });
  };
  const rmDec = i => {
    const a = [...(acc.decisors || [])];
    a.splice(i, 1);
    onAccUpdate({
      ...acc,
      decisors: a
    });
  };
  const moveDec = (dec, dest) => {
    // Remove from current
    const cur = (acc.decisors || []).filter(d => d.nome !== dec.nome);
    onAccUpdate({
      ...acc,
      decisors: cur
    });
    // Add to dest via global handler
    if (window.__moveDecToEmpresa) window.__moveDecToEmpresa(dec, dest.rank);
  };
  const ResBanner = () => isRestricted ? /*#__PURE__*/React.createElement("div", {
    className: "res-banner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "res-icon"
  }, "⚠"), /*#__PURE__*/React.createElement("div", {
    className: "res-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "res-title"
  }, "LEAD RESTRITO — Conflito de cliente"), /*#__PURE__*/React.createElement("div", {
    className: "res-desc"
  }, "Este anunciante é concorrente direto de um cliente ativo de ", grupo.name, ". Prossiga com cautela e valide com liderança antes de qualquer abordagem."), /*#__PURE__*/React.createElement("div", {
    className: "res-tags"
  }, restrictions.map((r, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "rtag"
  }, r.reason))))) : null;
  const renderTab = () => {
    if (tab === "overview") return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ResBanner, null), /*#__PURE__*/React.createElement("div", {
      className: "acctop"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "accname"
    }, lead.nome), /*#__PURE__*/React.createElement("div", {
      className: "accmeta"
    }, "Rank #", lead.rank, " · ", setor, " · ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: fitColor(fit),
        fontSize: 8,
        background: `rgba(${hexRgb(fitColor(fit))},.08)`,
        border: `1px solid rgba(${hexRgb(fitColor(fit))},.2)`,
        padding: "1px 6px",
        borderRadius: 100
      }
    }, fitLabel(fit)), isRestricted && /*#__PURE__*/React.createElement("span", {
      className: "restag",
      style: {
        marginLeft: 6
      }
    }, "RESTRITO"))), /*#__PURE__*/React.createElement("div", {
      className: "btnrow"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btno btnsm",
      onClick: runMon,
      disabled: monLoading
    }, monLoading ? "..." : "◉ Monitorar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btnp btnsm",
      style: {
        background: grupo.color
      },
      onClick: () => setTab("decisores")
    }, "+ Decisor"))), /*#__PURE__*/React.createElement("div", {
      className: "g3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "clbl"
    }, "DECISORES"), /*#__PURE__*/React.createElement("div", {
      className: "cval"
    }, (acc.decisors || []).length), /*#__PURE__*/React.createElement("div", {
      className: "csub"
    }, "cadastrados")), /*#__PURE__*/React.createElement("div", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "clbl"
    }, "ATIVIDADES"), /*#__PURE__*/React.createElement("div", {
      className: "cval"
    }, (acc.activities || []).length), /*#__PURE__*/React.createElement("div", {
      className: "csub"
    }, "registradas")), /*#__PURE__*/React.createElement("div", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "clbl"
    }, "ÚLTIMO CONTATO"), /*#__PURE__*/React.createElement("div", {
      className: "cval",
      style: {
        fontSize: 12
      }
    }, acc.activities && acc.activities.length > 0 ? acc.activities[acc.activities.length - 1].date : "—"), /*#__PURE__*/React.createElement("div", {
      className: "csub"
    }, acc.activities && acc.activities.length > 0 ? acc.activities[acc.activities.length - 1].typeLabel : "sem contato"))), /*#__PURE__*/React.createElement("div", {
      className: "sec"
    }, "POSICIONAMENTO ", grupo.name.toUpperCase()), /*#__PURE__*/React.createElement("div", {
      className: "aiout",
      style: {
        fontSize: 10,
        padding: 12,
        marginBottom: 14
      }
    }, dor), /*#__PURE__*/React.createElement("div", {
      className: "sec"
    }, "SERVIÇOS RECOMENDADOS"), /*#__PURE__*/React.createElement("div", {
      className: "tags"
    }, grupo.angles.map(a => /*#__PURE__*/React.createElement("span", {
      key: a,
      className: "tag taghl"
    }, a))), acc.intel && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "sec"
    }, "ÚLTIMA ANÁLISE DE IA"), /*#__PURE__*/React.createElement("div", {
      className: "aiout"
    }, acc.intel)), /*#__PURE__*/React.createElement(NextActionPanel, {
      acc: acc,
      grupo: grupo,
      onEmail: () => setEmailModal(true),
      onEnrich: () => {
        setTab("decisores");
        setEnrichModal(true);
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "sec"
    }, "AÇÕES RÁPIDAS"), /*#__PURE__*/React.createElement("div", {
      className: "btnrow"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btno btnsm",
      onClick: () => setTab("email")
    }, "✉ Gerar Email"), /*#__PURE__*/React.createElement("button", {
      className: "btn btno btnsm",
      onClick: () => setActModal(true)
    }, "+ Registrar Atividade"), /*#__PURE__*/React.createElement("button", {
      className: "btn btno btnsm",
      onClick: () => setTab("intel")
    }, "◈ Análise IA"), /*#__PURE__*/React.createElement("button", {
      className: "btn btno btnsm",
      style: {
        color: "#A78BFA",
        borderColor: "rgba(167,139,250,.3)"
      },
      onClick: () => setEnrichModal(true)
    }, "⚡ Enriquecer CMO"), pdKey && /*#__PURE__*/React.createElement("button", {
      className: "btn btno btnsm",
      onClick: syncDeal,
      style: {
        color: "#A78BFA",
        borderColor: "rgba(167,139,250,.3)"
      }
    }, "↑ Criar Deal")));
    if (tab === "decisores") return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ResBanner, null), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sec",
      style: {
        margin: 0,
        flex: 1
      }
    }, "DECISORES DE MARKETING"), /*#__PURE__*/React.createElement("button", {
      className: "btn btnp btnsm",
      style: {
        background: grupo.color,
        marginLeft: 12
      },
      onClick: () => setDecModal(true)
    }, "+ Adicionar")), !(acc.decisors && acc.decisors.length) ? /*#__PURE__*/React.createElement("div", {
      className: "empty",
      style: {
        height: 220
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "emptyicon",
      style: {
        fontSize: 28
      }
    }, "◌"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 700
      }
    }, "Nenhum decisor")) : /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        padding: "8px 0"
      }
    }, (acc.decisors || []).map((d, i) => /*#__PURE__*/React.createElement(DecCard, {
      key: i,
      dc: d,
      empresa: lead.nome,
      setor: setor,
      grupo: grupo,
      isEditing: !!editDec[i],
      onToggleEdit: () => setEditDec(e => ({
        ...e,
        [i]: !e[i]
      })),
      onUpdate: (f, v) => updDec(i, f, v),
      onRemove: () => rmDec(i),
      pdKey: pdKey,
      restrictions: restrictions,
      onWALog: logWA,
      onMoveEmpresa: moveDec
    }))));
    if (tab === "historico") return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sec",
      style: {
        margin: 0,
        flex: 1
      }
    }, "HISTÓRICO DE ATIVIDADES"), /*#__PURE__*/React.createElement("button", {
      className: "btn btnp btnsm",
      style: {
        background: grupo.color,
        marginLeft: 12
      },
      onClick: () => setActModal(true)
    }, "+ Registrar")), !(acc.activities && acc.activities.length) ? /*#__PURE__*/React.createElement("div", {
      className: "empty",
      style: {
        height: 220
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "emptyicon",
      style: {
        fontSize: 28
      }
    }, "◌"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 700
      }
    }, "Nenhuma atividade")) : /*#__PURE__*/React.createElement("div", null, [...(acc.activities || [])].reverse().map((a, i) => {
      const icons = {
        email: "✉",
        call: "📞",
        whatsapp: "💬",
        linkedin: "in",
        meeting: "🤝",
        response: "↩"
      };
      const isWA = a.type === "whatsapp";
      return /*#__PURE__*/React.createElement("div", {
        className: "feeditem",
        key: i,
        style: {
          background: isWA ? "rgba(37,211,102,.04)" : "transparent",
          borderRadius: isWA ? 4 : 0,
          padding: "10px 0"
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "fiicon",
        style: {
          background: isWA ? "rgba(37,211,102,.1)" : "#0e0e0e",
          borderColor: isWA ? "rgba(37,211,102,.3)" : "#181818"
        }
      }, icons[a.type] || "◎"), /*#__PURE__*/React.createElement("div", {
        className: "fibody"
      }, /*#__PURE__*/React.createElement("div", {
        className: "fititle"
      }, a.typeLabel, a.decisor ? " — " + a.decisor : ""), /*#__PURE__*/React.createElement("div", {
        className: "fimeta"
      }, a.date, a.synced && /*#__PURE__*/React.createElement("span", {
        style: {
          color: "#4B9EFF",
          marginLeft: 6
        }
      }, "· sync Pipedrive"), isWA && /*#__PURE__*/React.createElement("span", {
        className: "wa-hist-badge",
        style: {
          marginLeft: 6
        }
      }, "WA registrado")), a.note && /*#__PURE__*/React.createElement("div", {
        className: "finote"
      }, a.note)));
    })));
    if (tab === "email") return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ResBanner, null), /*#__PURE__*/React.createElement("div", {
      className: "sec"
    }, "EMAIL IA — ", grupo.name.toUpperCase()), /*#__PURE__*/React.createElement("div", {
      className: "angtabs"
    }, grupo.angles.map((a, i) => /*#__PURE__*/React.createElement("button", {
      key: i,
      className: "angtab" + (curAngle === i ? " on" : ""),
      onClick: () => setCurAngle(i)
    }, a))), hist && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontFamily: "DM Mono,monospace",
        color: "#333",
        marginBottom: 12,
        padding: "8px 10px",
        background: "#0e0e0e",
        border: "1px solid #181818",
        borderRadius: 3
      }
    }, "◉ ", (acc.activities || []).length, " atividade(s) no histórico — IA personaliza o follow-up."), /*#__PURE__*/React.createElement("button", {
      className: "btn btnp",
      style: {
        background: grupo.color,
        marginBottom: 16
      },
      onClick: () => setEmailModal(true)
    }, "Gerar Email com IA"), emailModal && /*#__PURE__*/React.createElement(EmailModal, {
      dc: (acc.decisors || [])[0],
      empresa: lead.nome,
      setor: setor,
      grupo: grupo,
      angulo: grupo.angles[curAngle],
      hist: hist,
      restrictions: restrictions,
      onClose: () => setEmailModal(false)
    }));
    if (tab === "intel") return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "sec"
    }, "INTELIGÊNCIA DE CONTA — ", grupo.name.toUpperCase()), acc.intel && /*#__PURE__*/React.createElement("div", {
      className: "aiout"
    }, acc.intel), /*#__PURE__*/React.createElement("div", {
      className: "btnrow",
      style: {
        marginBottom: 20
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btnp",
      style: {
        background: grupo.color
      },
      onClick: genIntel,
      disabled: intelLoading
    }, intelLoading ? "Analisando..." : "◈ Gerar Análise"), /*#__PURE__*/React.createElement("button", {
      className: "btn btno",
      onClick: runMon,
      disabled: monLoading
    }, monLoading ? "Monitorando..." : "◉ Monitorar empresa")), acc.alerts && acc.alerts.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "sec"
    }, "ALERTAS"), [...(acc.alerts || [])].reverse().slice(0, 5).map((a, i) => {
      const ug = a.urgency === "change" ? "🔄" : a.urgency === "risk" ? "⚠️" : "📌";
      const bc = a.urgency === "change" ? "rgba(255,181,71,.08)" : "rgba(0,255,148,.04)";
      const tc = a.urgency === "change" ? "#FFB547" : "#00FF94";
      return /*#__PURE__*/React.createElement("div", {
        className: "monitem",
        key: i,
        style: {
          borderColor: bc
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 16,
          flexShrink: 0
        }
      }, ug), /*#__PURE__*/React.createElement("div", {
        className: "monbody"
      }, /*#__PURE__*/React.createElement("div", {
        className: "montitle"
      }, a.title), /*#__PURE__*/React.createElement("div", {
        className: "mondesc"
      }, a.desc), /*#__PURE__*/React.createElement("div", {
        className: "montime"
      }, a.date)), /*#__PURE__*/React.createElement("span", {
        className: "monbadge",
        style: {
          color: tc,
          border: `1px solid ${bc}`,
          background: bc
        }
      }, a.urgency === "change" ? "MUDANÇA" : "NOVO"));
    })));
    if (tab === "comunidade") {
      var noReplyDecs = (acc.decisors || []).filter(function (d) {
        var acts = (acc.activities || []).filter(function (a) {
          return a.decisor === d.nome;
        });
        return acts.length > 0 && !acts.some(function (a) {
          return a.type === "response";
        });
      });
      var contentIdeas = [{
        tipo: "📊",
        titulo: "Ranking das marcas brasileiras com melhor performance em mídia paga",
        canal: "LinkedIn"
      }, {
        tipo: "🎯",
        titulo: "Por que o CPM no Brasil subiu 40% — e o que fazer sobre isso",
        canal: "Email"
      }, {
        tipo: "🏆",
        titulo: "Case: como a Galeria aumentou ROAS em 3x em 90 dias",
        canal: "WhatsApp"
      }, {
        tipo: "📱",
        titulo: "Creator economy B2B: como CMOs usam LinkedIn creators em 2025",
        canal: "LinkedIn"
      }, {
        tipo: "💡",
        titulo: "Estudo exclusivo: o que os 50 maiores anunciantes planejam para 2025",
        canal: "Email"
      }, {
        tipo: "🔥",
        titulo: "Galeria Holding está contratando: Head de Performance e mais",
        canal: "LinkedIn"
      }, {
        tipo: "🌍",
        titulo: "O que agências globais fazem que o Brasil ainda não copiou",
        canal: "Email"
      }, {
        tipo: "🎬",
        titulo: "Vídeo: como integrar performance e criatividade em 5 minutos",
        canal: "WhatsApp"
      }];
      return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          marginBottom: 18
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 20,
          fontWeight: 800,
          fontFamily: "Syne,sans-serif",
          letterSpacing: -1
        }
      }, "🌐 Comunidade"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: "#555",
          fontFamily: "DM Mono,monospace",
          marginTop: 4
        }
      }, "Engaje decisores sem resposta com conteúdo relevante")), noReplyDecs.length > 0 ? /*#__PURE__*/React.createElement("div", {
        style: {
          marginBottom: 20
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "sec"
      }, "SEM RESPOSTA — ", noReplyDecs.length, " decisor(es)"), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
          gap: 10,
          marginBottom: 12
        }
      }, noReplyDecs.map(function (d, i) {
        var decActs = (acc.activities || []).filter(function (a) {
          return a.decisor === d.nome;
        });
        var lastAct = decActs.length > 0 ? decActs[decActs.length - 1] : null;
        return /*#__PURE__*/React.createElement("div", {
          key: i,
          style: {
            background: "var(--s2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8
          }
        }, /*#__PURE__*/React.createElement(AvatarIA, {
          nome: d.nome,
          color: grupo.color,
          rgb: grupo.rgb,
          size: 32
        }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 11,
            fontWeight: 700
          }
        }, d.nome), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 9,
            color: "#555",
            fontFamily: "DM Mono,monospace"
          }
        }, d.cargo))), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 9,
            color: "#FF4757",
            fontFamily: "DM Mono,monospace"
          }
        }, decActs.length, " tentativa(s) sem retorno"), lastAct && /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 9,
            color: "#444",
            fontFamily: "DM Mono,monospace",
            marginTop: 2
          }
        }, "Último: ", lastAct.date));
      }))) : /*#__PURE__*/React.createElement("div", {
        style: {
          background: "rgba(52,211,153,.05)",
          border: "1px solid rgba(52,211,153,.2)",
          borderRadius: 8,
          padding: 14,
          marginBottom: 18,
          fontSize: 12,
          color: "#34D399"
        }
      }, "✓ Todos os decisores contatados — nenhum aguardando engajamento."), /*#__PURE__*/React.createElement("div", {
        className: "sec"
      }, "CONTEÚDOS PARA ENGAJAR"), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 7
        }
      }, contentIdeas.map(function (idea, i) {
        return /*#__PURE__*/React.createElement("div", {
          key: i,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 14px",
            background: "var(--s2)",
            border: "1px solid var(--border)",
            borderRadius: 7
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 20,
            flexShrink: 0
          }
        }, idea.tipo), /*#__PURE__*/React.createElement("div", {
          style: {
            flex: 1
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 2
          }
        }, idea.titulo), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 9,
            color: "#555",
            fontFamily: "DM Mono,monospace"
          }
        }, "Canal: ", idea.canal)), /*#__PURE__*/React.createElement("button", {
          className: "btn btno btnsm",
          style: {
            flexShrink: 0,
            fontSize: 9
          },
          onClick: function () {
            var nome = noReplyDecs.length > 0 ? noReplyDecs[0].nome.split(" ")[0] : "contato";
            var msg = "Olá, " + nome + "! " + idea.titulo + " — Pensei que poderia ser relevante para você. Pedro Ica, Sócio — Galeria Holding.";
            navigator.clipboard.writeText(msg);
          }
        }, "Copiar"));
      })));
    }
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, actModal && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle"
  }, "+ Registrar Atividade"), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "TIPO"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: actType,
    onChange: e => setActType(e.target.value)
  }, [["email", "✉ Email enviado"], ["call", "📞 Ligação"], ["whatsapp", "💬 WhatsApp"], ["linkedin", "in LinkedIn DM"], ["meeting", "🤝 Reunião"], ["response", "↩ Resposta recebida"]].map(([v, l]) => /*#__PURE__*/React.createElement("option", {
    key: v,
    value: v
  }, l)))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "DECISOR"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: actDec,
    onChange: e => setActDec(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "— Geral / Empresa —"), (acc.decisors || []).map((d, i) => /*#__PURE__*/React.createElement("option", {
    key: i
  }, d.nome)))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "NOTA"), /*#__PURE__*/React.createElement("textarea", {
    className: "finp",
    placeholder: "O que aconteceu? Próximo passo...",
    value: actNote,
    onChange: e => setActNote(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: () => setActModal(false)
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: grupo.color
    },
    onClick: saveAct
  }, "Registrar + Sync CRM")))), enrichModal && /*#__PURE__*/React.createElement(EnrichAgent, {
    empresa: lead.nome,
    grupo: grupo,
    acc: acc,
    onAccUpdate: onAccUpdate,
    onClose: () => setEnrichModal(false)
  }), decModal && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle"
  }, "+ Adicionar Decisor"), /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "NOME *"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "Nome completo",
    value: newDec.nome,
    onChange: e => setNewDec(d => ({
      ...d,
      nome: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "CARGO"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "CMO, VP Marketing...",
    value: newDec.cargo,
    onChange: e => setNewDec(d => ({
      ...d,
      cargo: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "EMAIL"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "nome@empresa.com",
    value: newDec.email,
    onChange: e => setNewDec(d => ({
      ...d,
      email: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "WHATSAPP 1"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "5511999...",
    value: newDec.wa,
    onChange: e => setNewDec(d => ({
      ...d,
      wa: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "WHATSAPP 2"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "5511999...",
    value: newDec.wa2,
    onChange: e => setNewDec(d => ({
      ...d,
      wa2: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "WHATSAPP 3"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "5511999...",
    value: newDec.wa3,
    onChange: e => setNewDec(d => ({
      ...d,
      wa3: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "LINKEDIN URL"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "linkedin.com/in/...",
    value: newDec.li,
    onChange: e => setNewDec(d => ({
      ...d,
      li: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "INSTAGRAM"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "@usuario",
    value: newDec.ig,
    onChange: e => setNewDec(d => ({
      ...d,
      ig: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "FACEBOOK"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "facebook.com/...",
    value: newDec.fb,
    onChange: e => setNewDec(d => ({
      ...d,
      fb: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: () => setDecModal(false)
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: grupo.color
    },
    onClick: saveDec
  }, "Salvar + Pipedrive")))), /*#__PURE__*/React.createElement("div", {
    className: "subtabs"
  }, tabs.map(([id, lbl]) => /*#__PURE__*/React.createElement("div", {
    key: id,
    className: "st" + (tab === id ? " on" : ""),
    onClick: () => setTab(id)
  }, lbl))), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, renderTab()));
}
var KANBAN_COLORS = [{
  id: 'purple',
  hex: '#534AB7'
}, {
  id: 'teal',
  hex: '#0F6E56'
}, {
  id: 'blue',
  hex: '#185FA5'
}, {
  id: 'amber',
  hex: '#854F0B'
}, {
  id: 'green',
  hex: '#3B6D11'
}, {
  id: 'red',
  hex: '#A32D2D'
}, {
  id: 'orange',
  hex: '#9B4A00'
}, {
  id: 'gray',
  hex: '#444441'
}, {
  id: 'violet',
  hex: '#5B21B6'
}, {
  id: 'rose',
  hex: '#991B1B'
}];
var KC_HEX = Object.fromEntries(KANBAN_COLORS.map(c => [c.id, c.hex]));
var KC_CYCLE = ['purple', 'teal', 'blue', 'amber', 'green', 'red', 'orange', 'gray', 'violet', 'rose'];
var KB_DEFAULT_TABS = [{
  id: 'gaia',
  label: 'GAIA — CR.IA & BrandSync',
  color: 'purple',
  type: 'cria',
  cols: [{
    id: 'clientes',
    label: 'Clientes Ativos',
    accent: 'green'
  }, {
    id: 'poc',
    label: 'POC / Piloto',
    accent: 'blue'
  }, {
    id: 'reuniao',
    label: 'Reunião Agendada',
    accent: 'purple'
  }, {
    id: 'proposta',
    label: 'Proposta Enviada',
    accent: 'amber'
  }, {
    id: 'aguardando',
    label: 'Aguardando Retorno',
    accent: 'gray'
  }, {
    id: 'hold',
    label: 'On Hold',
    accent: 'red'
  }, {
    id: 'perdido',
    label: 'Perdido / Arquivo',
    accent: 'gray'
  }],
  cards: [{
    id: 1,
    name: 'CVC',
    product: 'CR.IA',
    col: 'clientes',
    tag: 'mrr',
    note: 'MRR ativo'
  }, {
    id: 2,
    name: 'Ella',
    product: 'CR.IA',
    col: 'clientes',
    tag: 'mrr',
    note: 'MRR ativo'
  }, {
    id: 3,
    name: 'Natura',
    product: 'CR.IA',
    col: 'clientes',
    tag: 'camp',
    note: 'Campanhas'
  }, {
    id: 4,
    name: 'Mequi',
    product: 'BrandSync',
    col: 'clientes',
    tag: '',
    note: 'Melhorar critérios, + franqueados, Módulo Mídia'
  }, {
    id: 5,
    name: 'Havaianas',
    product: 'BrandSync',
    col: 'clientes',
    tag: '',
    note: 'Próx. passos: Módulo Mídia'
  }, {
    id: 6,
    name: 'Gemini',
    product: 'CR.IA',
    col: 'clientes',
    tag: 'camp',
    note: 'Campanha feita — Pedro fatura'
  }, {
    id: 7,
    name: 'OLX',
    product: 'CR.IA',
    col: 'poc',
    tag: 'poc-paga',
    note: 'POC paga — modelo de serviço OK'
  }, {
    id: 8,
    name: 'T&F',
    product: 'BrandSync',
    col: 'poc',
    tag: '',
    note: 'Aguardando ok POC'
  }, {
    id: 9,
    name: 'Trousseau',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Aguardando KV'
  }, {
    id: 10,
    name: 'Reckitt',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Reunião agendada'
  }, {
    id: 11,
    name: 'Stellantis',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Reunião agendada 21/05'
  }, {
    id: 12,
    name: 'Ser Educação',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Reunião agendada 18/05'
  }, {
    id: 13,
    name: 'Bauducco',
    product: 'BrandSync',
    col: 'reuniao',
    tag: '',
    note: 'Reunião marcada — preço'
  }, {
    id: 14,
    name: 'Mequi',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Reunião Marangoni'
  }, {
    id: 15,
    name: 'Crefisa + Fama',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Aguardando retorno Superintendente'
  }, {
    id: 16,
    name: 'Unilever',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'A Giovanna ficou de marcar reunião com a Fernanda'
  }, {
    id: 17,
    name: 'All Set',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Agendar um próximo papo'
  }, {
    id: 18,
    name: '99 app',
    product: 'CR.IA',
    col: 'reuniao',
    tag: '',
    note: 'Reunião agendada'
  }, {
    id: 19,
    name: 'Vivo',
    product: 'BrandSync',
    col: 'reuniao',
    tag: '',
    note: 'Eles ficaram de trazer internamente o que esperam da POC — Pedro vai procurar ativamente'
  }, {
    id: 20,
    name: 'Dominos',
    product: 'CR.IA',
    col: 'proposta',
    tag: 'prop',
    note: 'Proposta enviada com Milà — aguardando'
  }, {
    id: 21,
    name: 'Accor',
    product: 'CR.IA',
    col: 'proposta',
    tag: 'prop',
    note: 'Proposta enviada com Caramelo'
  }, {
    id: 22,
    name: 'XP Investimentos',
    product: 'CR.IA',
    col: 'aguardando',
    tag: 'prop',
    note: 'Aguardando retorno proposta'
  }, {
    id: 23,
    name: 'MGMBet',
    product: 'CR.IA',
    col: 'aguardando',
    tag: 'prop',
    note: 'Aguardando retorno proposta'
  }, {
    id: 24,
    name: 'Itaú',
    product: 'CR.IA',
    col: 'aguardando',
    tag: '',
    note: 'Aguardando retorno'
  }, {
    id: 25,
    name: 'Veste S.A.',
    product: 'CR.IA',
    col: 'aguardando',
    tag: '',
    note: 'Aguardando KVs'
  }, {
    id: 26,
    name: 'GM',
    product: 'CR.IA',
    col: 'aguardando',
    tag: '',
    note: 'Aguardando contato Ica'
  }, {
    id: 27,
    name: 'Carrefour',
    product: 'CR.IA',
    col: 'aguardando',
    tag: '',
    note: 'FUP bid folheto'
  }, {
    id: 28,
    name: 'Bet Nacional',
    product: 'CR.IA',
    col: 'aguardando',
    tag: '',
    note: 'Ver com Losso: Globo Play ou Performance'
  }, {
    id: 29,
    name: 'Keta',
    product: 'CR.IA',
    col: 'aguardando',
    tag: '',
    note: 'Ica tentando falar com Igor'
  }, {
    id: 30,
    name: 'Royal Face',
    product: 'BrandSync',
    col: 'aguardando',
    tag: '',
    note: ''
  }, {
    id: 31,
    name: 'Oralsin',
    product: 'BrandSync',
    col: 'aguardando',
    tag: '',
    note: ''
  }, {
    id: 32,
    name: 'Central Ar',
    product: 'CR.IA',
    col: 'hold',
    tag: 'poc-free',
    note: 'POC free — modelo SaaS'
  }, {
    id: 33,
    name: 'Wine',
    product: 'CR.IA',
    col: 'hold',
    tag: 'poc-free',
    note: 'POC free — modelo SaaS'
  }, {
    id: 34,
    name: 'KPI',
    product: 'CR.IA',
    col: 'hold',
    tag: '',
    note: 'Formato parceria + mostrar ferramenta designers'
  }, {
    id: 35,
    name: 'Globo / ANCINE',
    product: 'CR.IA',
    col: 'hold',
    tag: '',
    note: 'On hold'
  }]
}, {
  id: 'holding',
  label: 'Pipeline Holding',
  color: 'orange',
  type: 'lead',
  cols: [{
    id: 'wishlist',
    label: 'Wishlist',
    accent: 'violet'
  }, {
    id: 'primreuniao',
    label: 'Primeira Reunião',
    accent: 'blue'
  }, {
    id: 'contatodir',
    label: 'Contato Direto',
    accent: 'teal'
  }, {
    id: 'negocdiret',
    label: 'Negociando Direto',
    accent: 'amber'
  }, {
    id: 'concorrencia',
    label: 'Concorrências',
    accent: 'orange'
  }, {
    id: 'negociacao',
    label: 'Negociação',
    accent: 'rose'
  }, {
    id: 'clienteativo',
    label: 'Cliente Ativo',
    accent: 'green'
  }, {
    id: 'perdido',
    label: 'Perdido / Arquivo',
    accent: 'gray'
  }],
  cards: [{
    id: 1,
    name: 'Kenner',
    empresa: 'Kenner',
    galeria: '',
    col: 'wishlist',
    value: 0,
    note: ''
  }, {
    id: 2,
    name: 'Cacau Show',
    empresa: 'Cacau Show',
    galeria: '',
    col: 'wishlist',
    value: 0,
    note: ''
  }, {
    id: 3,
    name: 'Azul',
    empresa: 'Azul',
    galeria: '',
    col: 'wishlist',
    value: 0,
    note: ''
  }, {
    id: 4,
    name: 'Minerva',
    empresa: 'Minerva',
    galeria: '',
    col: 'primreuniao',
    value: 0,
    note: 'Contato: Laura'
  }, {
    id: 5,
    name: 'Leroy Merlin',
    empresa: 'Leroy Merlin',
    galeria: 'Catalyst',
    col: 'primreuniao',
    value: 0,
    note: ''
  }, {
    id: 6,
    name: 'GM',
    empresa: 'GM',
    galeria: '',
    col: 'contatodir',
    value: 0,
    note: 'Contato: Bruno Alonso'
  }, {
    id: 7,
    name: 'Trousseau',
    empresa: 'Trousseau',
    galeria: '',
    col: 'contatodir',
    value: 0,
    note: ''
  }, {
    id: 8,
    name: "L'Occitane",
    empresa: "L'Occitane",
    galeria: '',
    col: 'contatodir',
    value: 0,
    note: ''
  }, {
    id: 9,
    name: 'Cervejaria Império',
    empresa: 'Cervejaria Império',
    galeria: '',
    col: 'contatodir',
    value: 0,
    note: ''
  }, {
    id: 10,
    name: 'Vivara',
    empresa: 'Vivara',
    galeria: '',
    col: 'contatodir',
    value: 0,
    note: 'Contato: Marina Kauf.'
  }, {
    id: 11,
    name: 'Apsen',
    empresa: 'Apsen',
    galeria: '',
    col: 'contatodir',
    value: 0,
    note: 'Contato: Jonas Kuhner'
  }, {
    id: 12,
    name: 'PUC Campinas',
    empresa: 'PUC Campinas',
    galeria: '',
    col: 'negocdiret',
    value: 0,
    note: ''
  }, {
    id: 13,
    name: 'Oggi',
    empresa: 'Oggi',
    galeria: '',
    col: 'negocdiret',
    value: 0,
    note: ''
  }, {
    id: 14,
    name: 'Orthodontic',
    empresa: 'Orthodontic',
    galeria: '404',
    col: 'negocdiret',
    value: 0,
    note: ''
  }, {
    id: 15,
    name: 'Odonto Company',
    empresa: 'Odonto Company',
    galeria: '',
    col: 'negocdiret',
    value: 0,
    note: ''
  }, {
    id: 16,
    name: 'Diageo',
    empresa: 'Diageo',
    galeria: '404',
    col: 'concorrencia',
    value: 0,
    note: 'BID Digital, CRM & Data'
  }, {
    id: 17,
    name: 'Positivo',
    empresa: 'Positivo',
    galeria: '',
    col: 'concorrencia',
    value: 0,
    note: ''
  }, {
    id: 18,
    name: 'Daslu',
    empresa: 'Daslu',
    galeria: '',
    col: 'concorrencia',
    value: 0,
    note: ''
  }, {
    id: 19,
    name: 'Accor',
    empresa: 'Accor',
    galeria: 'ccCaramelo',
    col: 'concorrencia',
    value: 0,
    note: ''
  }, {
    id: 20,
    name: 'Hubees',
    empresa: 'Hubees',
    galeria: '404',
    col: 'concorrencia',
    value: 0,
    note: ''
  }, {
    id: 21,
    name: 'Pottencial',
    empresa: 'Pottencial',
    galeria: 'ccCaramelo',
    col: 'concorrencia',
    value: 0,
    note: ''
  }, {
    id: 22,
    name: 'Neutrox',
    empresa: 'Neutrox',
    galeria: '',
    col: 'concorrencia',
    value: 0,
    note: ''
  }, {
    id: 23,
    name: 'Einstein Educação',
    empresa: 'Einstein Educação',
    galeria: 'ccCaramelo',
    col: 'concorrencia',
    value: 0,
    note: ''
  }, {
    id: 24,
    name: 'Unimed',
    empresa: 'Unimed',
    galeria: 'ccCaramelo',
    col: 'concorrencia',
    value: 0,
    note: 'Fernando Al.'
  }, {
    id: 25,
    name: 'Faber Castel',
    empresa: 'Faber Castel',
    galeria: 'Galeria',
    col: 'concorrencia',
    value: 1000000,
    note: ''
  }, {
    id: 26,
    name: 'Tchau Usado',
    empresa: 'Tchau Usado',
    galeria: 'Milà',
    col: 'negociacao',
    value: 600000,
    note: 'Estratégia Milà'
  }, {
    id: 27,
    name: 'Central Ar',
    empresa: 'Central Ar',
    galeria: 'Galeria',
    col: 'negociacao',
    value: 200000,
    note: 'Estratégia Galeria'
  }, {
    id: 28,
    name: 'Arezzo',
    empresa: 'Arezzo',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: 'Contato: Fernanda'
  }, {
    id: 29,
    name: 'Prévias',
    empresa: 'Prévias',
    galeria: 'Milà',
    col: 'clienteativo',
    value: 0,
    note: 'Prévias Milà'
  }, {
    id: 30,
    name: 'Atto Sementes',
    empresa: 'Atto Sementes',
    galeria: 'ccCaramelo',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 31,
    name: 'C6',
    empresa: 'C6',
    galeria: 'Catalyst',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 32,
    name: 'Suzano',
    empresa: 'Suzano',
    galeria: 'Milà',
    col: 'clienteativo',
    value: 2400000,
    note: ''
  }, {
    id: 33,
    name: 'BMG',
    empresa: 'BMG',
    galeria: 'Milà',
    col: 'clienteativo',
    value: 3000000,
    note: ''
  }, {
    id: 34,
    name: 'Vibra',
    empresa: 'Vibra',
    galeria: 'Catalyst',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 35,
    name: 'Curaprox',
    empresa: 'Curaprox',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 36,
    name: 'The News',
    empresa: 'The News',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 37,
    name: 'Drumwave',
    empresa: 'Drumwave',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 38,
    name: 'Dengo',
    empresa: 'Dengo',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 39,
    name: 'Betfair',
    empresa: 'Betfair',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 40,
    name: 'Betnacional',
    empresa: 'Betnacional',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 41,
    name: 'Italac',
    empresa: 'Italac',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 42,
    name: 'Smartfit',
    empresa: 'Smartfit',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }, {
    id: 43,
    name: 'Total Pass',
    empresa: 'Total Pass',
    galeria: '',
    col: 'clienteativo',
    value: 0,
    note: ''
  }]
}];
function kbLoadState() {
  try {
    const s = localStorage.getItem('gh_kanban_v3');
    if (s) return JSON.parse(s);
  } catch (e) {}
  try {
    return {
      tabs: JSON.parse(JSON.stringify(KB_DEFAULT_TABS)),
      activeTab: 'gaia'
    };
  } catch (e) {
    return {
      tabs: [],
      activeTab: 'gaia'
    };
  }
}
function kbSaveState(st) {
  try {
    localStorage.setItem('gh_kanban_v3', JSON.stringify(st));
  } catch (e) {}
}
function kbFmtVal(v) {
  if (!v) return '';
  if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(0) + 'k';
  return 'R$ ' + v.toLocaleString('pt-BR');
}
function kbNextId(tab) {
  return Math.max(0, ...(tab.cards || []).map(c => c.id)) + 1;
}
function kbUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
var KB_ACCENT_STYLES = `
  .kb-col[data-accent="purple"] .kb-cnt{background:rgba(83,74,183,.15);color:#a5a0f5;border-color:transparent}
  .kb-col[data-accent="teal"] .kb-cnt{background:rgba(15,110,86,.15);color:#34d399;border-color:transparent}
  .kb-col[data-accent="blue"] .kb-cnt{background:rgba(24,95,165,.15);color:#60a5fa;border-color:transparent}
  .kb-col[data-accent="amber"] .kb-cnt{background:rgba(133,79,11,.15);color:#fbbf24;border-color:transparent}
  .kb-col[data-accent="green"] .kb-cnt{background:rgba(59,109,17,.15);color:#86efac;border-color:transparent}
  .kb-col[data-accent="red"] .kb-cnt{background:rgba(163,45,45,.15);color:#f87171;border-color:transparent}
  .kb-col[data-accent="orange"] .kb-cnt{background:rgba(155,74,0,.15);color:#fb923c;border-color:transparent}
  .kb-col[data-accent="gray"] .kb-cnt{background:rgba(68,68,65,.2);color:#9ca3af;border-color:transparent}
  .kb-col[data-accent="violet"] .kb-cnt{background:rgba(91,33,182,.15);color:#c4b5fd;border-color:transparent}
  .kb-col[data-accent="rose"] .kb-cnt{background:rgba(153,27,27,.15);color:#fca5a5;border-color:transparent}
  .kb-tag-mrr{background:rgba(59,109,17,.15);color:#86efac}
  .kb-tag-camp{background:rgba(133,79,11,.15);color:#fbbf24}
  .kb-tag-poc-paga{background:rgba(24,95,165,.15);color:#60a5fa}
  .kb-tag-poc-free{background:rgba(68,68,65,.2);color:#9ca3af}
  .kb-tag-prop{background:rgba(83,74,183,.15);color:#a5a0f5}
`;
function KanbanView({
  curGrupo,
  initialTab
}) {
  const _kbInit = React.useMemo(() => kbLoadState(), []);
  const [kbState, setKbState] = useState(_kbInit);
  // Auto-select tab based on group or explicit initialTab prop
  const _resolveInitTab = () => {
    if (initialTab && _kbInit.tabs.find(t => t.id === initialTab)) return initialTab;
    if (curGrupo) {
      // Map grupo id to tab id
      const grupoTabMap = {
        gaia: 'gaia',
        galeria: 'holding',
        mila: 'holding',
        '404': 'holding',
        cccaramelo: 'holding',
        catalyst: 'holding',
        mantiqueira: 'holding',
        agente: 'holding',
        vitrine: 'holding',
        gux: 'holding'
      };
      const mapped = grupoTabMap[curGrupo.id];
      if (mapped && _kbInit.tabs.find(t => t.id === mapped)) return mapped;
    }
    return _kbInit.activeTab || 'gaia';
  };
  const [kbActiveTab, setKbActiveTab] = useState(_resolveInitTab);
  const [dragId, setDragId] = useState(null);
  const [dragTabId, setDragTabId] = useState(null);
  const [kbSearch, setKbSearch] = useState('');
  const [criaFilter, setCriaFilter] = useState('all');
  const [cardModal, setCardModal] = useState(null); // {tabId, cardId or null, colId}
  const [leadModal, setLeadModal] = useState(null);
  const [tabModal, setTabModal] = useState(null); // {tabId or null}
  const [colsModal, setColsModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [tabColor, setTabColor] = useState('purple');
  const [cfName, setCfName] = useState('');
  const [cfProd, setCfProd] = useState('CR.IA');
  const [cfCol, setCfCol] = useState('');
  const [cfTag, setCfTag] = useState('');
  const [cfNote, setCfNote] = useState('');
  const [lfName, setLfName] = useState('');
  const [lfEmpresa, setLfEmpresa] = useState('');
  const [lfGaleria, setLfGaleria] = useState('');
  const [lfCol, setLfCol] = useState('');
  const [lfVal, setLfVal] = useState(0);
  const [lfNote, setLfNote] = useState('');
  const [cfMotivo, setCfMotivo] = useState('perdido');
  const [cfMotivoObs, setCfMotivoObs] = useState('');
  const [lfMotivo, setLfMotivo] = useState('perdido');
  const [lfMotivoObs, setLfMotivoObs] = useState('');
  const [tfName, setTfName] = useState('');
  const [tfType, setTfType] = useState('lead');
  const save = st => {
    setKbState(st);
    kbSaveState({
      ...st,
      activeTab: kbActiveTab
    });
  };
  const getTab = id => kbState.tabs.find(t => t.id === id);
  const activeTabObj = getTab(kbActiveTab);
  const switchKbTab = id => {
    setKbActiveTab(id);
    setCriaFilter('all'); // reset filter on tab switch
    kbSaveState({
      ...kbState,
      activeTab: id
    });
  };
  const visCards = tab => {
    const q = kbSearch.toLowerCase();
    return (tab.cards || []).filter(c => {
      if (tab.type === 'cria' && criaFilter !== 'all' && c.product !== criaFilter) return false;
      if (tab.type === 'lead' && criaFilter !== 'Todos' && (c.galeria || '') !== criaFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.empresa || '').toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q);
    });
  };
  const onDragStart = (tabId, cardId) => {
    setDragId(cardId);
    setDragTabId(tabId);
  };
  const onDrop = colId => {
    if (dragId == null || !dragTabId) return;
    const st = {
      ...kbState,
      tabs: kbState.tabs.map(t => t.id === dragTabId ? {
        ...t,
        cards: t.cards.map(c => c.id === dragId ? {
          ...c,
          col: colId
        } : c)
      } : t)
    };
    save(st);
    setDragId(null);
    setDragTabId(null);
  };
  const openAddCard = colId => {
    const tab = getTab(kbActiveTab);
    if (tab.type === 'cria') {
      setCfName('');
      setCfProd('CR.IA');
      setCfCol(colId || tab.cols[0]?.id || '');
      setCfTag('');
      setCfNote('');
      setCardModal({
        tabId: kbActiveTab,
        cardId: null,
        colId
      });
    } else {
      setLfName('');
      setLfEmpresa('');
      setLfGaleria('');
      setLfCol(colId || tab.cols[0]?.id || '');
      setLfVal(0);
      setLfNote('');
      setLeadModal({
        tabId: kbActiveTab,
        cardId: null,
        colId
      });
    }
  };
  const openEditCard = (tabId, cardId) => {
    const tab = getTab(tabId);
    const card = (tab.cards || []).find(c => c.id === cardId);
    if (!card) return;
    if (tab.type === 'cria') {
      setCfName(card.name);
      setCfProd(card.product || 'CR.IA');
      setCfCol(card.col);
      setCfTag(card.tag || '');
      setCfNote(card.note || '');
      setCfMotivo(card.motivo || 'perdido');
      setCfMotivoObs(card.motivoObs || '');
      setCardModal({
        tabId,
        cardId
      });
    } else {
      setLfName(card.name);
      setLfEmpresa(card.empresa || '');
      setLfGaleria(card.galeria || '');
      setLfCol(card.col);
      setLfVal(card.value || 0);
      setLfNote(card.note || '');
      setLfMotivo(card.motivo || 'perdido');
      setLfMotivoObs(card.motivoObs || '');
      setLeadModal({
        tabId,
        cardId
      });
    }
  };
  const saveCard = () => {
    if (!cfName.trim()) return;
    const tab = getTab(cardModal.tabId);
    const data = {
      name: cfName.trim(),
      product: cfProd,
      col: cfCol,
      tag: cfTag,
      note: cfNote.trim(),
      ...(cfCol === 'perdido' ? {motivo: cfMotivo, motivoObs: cfMotivoObs.trim()} : {})
    };
    const newTabs = kbState.tabs.map(t => {
      if (t.id !== cardModal.tabId) return t;
      if (cardModal.cardId != null) {
        return {
          ...t,
          cards: t.cards.map(c => c.id === cardModal.cardId ? {
            ...c,
            ...data
          } : c)
        };
      } else {
        return {
          ...t,
          cards: [...t.cards, {
            id: kbNextId(t),
            ...data
          }]
        };
      }
    });
    save({
      ...kbState,
      tabs: newTabs
    });
    setCardModal(null);
  };
  const delCard = () => {
    if (!cardModal?.cardId) return;
    if (!window.confirm('Excluir card?')) return;
    const newTabs = kbState.tabs.map(t => t.id === cardModal.tabId ? {
      ...t,
      cards: t.cards.filter(c => c.id !== cardModal.cardId)
    } : t);
    save({
      ...kbState,
      tabs: newTabs
    });
    setCardModal(null);
  };
  const saveLead = () => {
    if (!lfName.trim()) return;
    const data = {
      name: lfName.trim(),
      empresa: lfEmpresa.trim(),
      galeria: lfGaleria,
      col: lfCol,
      value: parseInt(lfVal) || 0,
      note: lfNote.trim(),
      ...(lfCol === 'perdido' ? {motivo: lfMotivo, motivoObs: lfMotivoObs.trim()} : {})
    };
    const newTabs = kbState.tabs.map(t => {
      if (t.id !== leadModal.tabId) return t;
      if (leadModal.cardId != null) {
        return {
          ...t,
          cards: t.cards.map(c => c.id === leadModal.cardId ? {
            ...c,
            ...data
          } : c)
        };
      } else {
        return {
          ...t,
          cards: [...t.cards, {
            id: kbNextId(t),
            ...data
          }]
        };
      }
    });
    save({
      ...kbState,
      tabs: newTabs
    });
    setLeadModal(null);
  };
  const delLead = () => {
    if (!leadModal?.cardId) return;
    if (!window.confirm('Excluir lead?')) return;
    const newTabs = kbState.tabs.map(t => t.id === leadModal.tabId ? {
      ...t,
      cards: t.cards.filter(c => c.id !== leadModal.cardId)
    } : t);
    save({
      ...kbState,
      tabs: newTabs
    });
    setLeadModal(null);
  };
  const openNewTab = () => {
    setTfName('');
    setTfType('lead');
    setTabColor('purple');
    setTabModal({
      tabId: null
    });
  };
  const openEditTab = tabId => {
    const t = getTab(tabId);
    setTfName(t.label);
    setTfType(t.type);
    setTabColor(t.color || 'purple');
    setTabModal({
      tabId
    });
  };
  const saveTab = () => {
    if (!tfName.trim()) return;
    if (tabModal.tabId) {
      const newTabs = kbState.tabs.map(t => t.id === tabModal.tabId ? {
        ...t,
        label: tfName.trim(),
        color: tabColor
      } : t);
      save({
        ...kbState,
        tabs: newTabs
      });
    } else {
      const defCols = tfType === 'cria' ? [{
        id: 'clientes',
        label: 'Clientes',
        accent: 'green'
      }, {
        id: 'pipeline',
        label: 'Em progresso',
        accent: 'blue'
      }, {
        id: 'hold',
        label: 'On hold',
        accent: 'red'
      }] : [{
        id: 'prospect',
        label: 'Prospect',
        accent: 'violet'
      }, {
        id: 'contato',
        label: 'Contato',
        accent: 'teal'
      }, {
        id: 'negociacao',
        label: 'Negociacao',
        accent: 'amber'
      }, {
        id: 'cliente',
        label: 'Cliente',
        accent: 'green'
      }];
      const nt = {
        id: kbUid(),
        label: tfName.trim(),
        color: tabColor,
        type: tfType,
        cols: defCols,
        cards: []
      };
      const newState = {
        ...kbState,
        tabs: [...kbState.tabs, nt]
      };
      save(newState);
      setKbActiveTab(nt.id);
    }
    setTabModal(null);
  };
  const deleteTab = () => {
    if (!tabModal?.tabId) return;
    const t = getTab(tabModal.tabId);
    if (!window.confirm('Excluir aba "' + t.label + '" e todos os dados?')) return;
    const newTabs = kbState.tabs.filter(t => t.id !== tabModal.tabId);
    const newActive = newTabs[0]?.id || '';
    setKbActiveTab(newActive);
    save({
      ...kbState,
      tabs: newTabs
    });
    setTabModal(null);
  };
  const addCol = () => {
    if (!newColName.trim()) return;
    const idx = (activeTabObj?.cols || []).length % KC_CYCLE.length;
    const newTabs = kbState.tabs.map(t => t.id === kbActiveTab ? {
      ...t,
      cols: [...t.cols, {
        id: kbUid(),
        label: newColName.trim(),
        accent: KC_CYCLE[idx]
      }]
    } : t);
    save({
      ...kbState,
      tabs: newTabs
    });
    setNewColName('');
  };
  const renameCol = (colId, newLabel) => {
    const newTabs = kbState.tabs.map(t => t.id === kbActiveTab ? {
      ...t,
      cols: t.cols.map(c => c.id === colId ? {
        ...c,
        label: newLabel
      } : c)
    } : t);
    save({
      ...kbState,
      tabs: newTabs
    });
  };
  const deleteCol = colId => {
    const col = (activeTabObj?.cols || []).find(c => c.id === colId);
    if (!window.confirm('Excluir coluna "' + col?.label + '"?')) return;
    const newTabs = kbState.tabs.map(t => t.id === kbActiveTab ? {
      ...t,
      cols: t.cols.filter(c => c.id !== colId)
    } : t);
    save({
      ...kbState,
      tabs: newTabs
    });
  };
  const changeColAccent = (colId, accent) => {
    const newTabs = kbState.tabs.map(t => t.id === kbActiveTab ? {
      ...t,
      cols: t.cols.map(c => c.id === colId ? {
        ...c,
        accent
      } : c)
    } : t);
    save({
      ...kbState,
      tabs: newTabs
    });
  };
  const renderStats = () => {
    const tab = activeTabObj;
    if (!tab) return null;
    if (tab.type === 'cria') {
      const vis = visCards(tab);
      const ativos = vis.filter(c => c.col === 'clientes').length;
      const pipeline = vis.filter(c => !['clientes', 'hold', 'perdido'].includes(c.col)).length;
      const propostas = vis.filter(c => c.col === 'proposta').length;
      const hold = vis.filter(c => c.col === 'hold').length;
      return [['Clientes ativos', ativos], ['Em pipeline', pipeline], ['Propostas', propostas], ['On hold', hold], ['Visíveis', vis.length]].map(([l, n]) => /*#__PURE__*/React.createElement("div", {
        key: l,
        style: {
          background: '#0e0e0e',
          border: '1px solid #1a1a1a',
          borderRadius: 4,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 7
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 18,
          fontWeight: 700,
          fontFamily: 'DM Mono,monospace',
          color: '#eee'
        }
      }, n), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9,
          color: '#444',
          fontFamily: 'DM Mono,monospace'
        }
      }, l)));
    } else {
      const activeLastCol = [...(tab.cols || [])].reverse().find(c => c.id !== 'perdido')?.id;
      const ativos = (tab.cards || []).filter(c => c.col === activeLastCol).length;
      const pipeline = (tab.cards || []).filter(c => c.col !== activeLastCol && c.col !== 'perdido').length;
      const totalVal = (tab.cards || []).filter(c => c.col === activeLastCol).reduce((a, b) => a + (b.value || 0), 0);
      const vis = visCards(tab);
      return [['Clientes ativos', ativos, null], ['Em pipeline', pipeline, null], ['Receita', null, kbFmtVal(totalVal) || 'R$ 0'], ['Visíveis', vis.length, null]].map(([l, n, v]) => /*#__PURE__*/React.createElement("div", {
        key: l,
        style: {
          background: '#0e0e0e',
          border: '1px solid #1a1a1a',
          borderRadius: 4,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 7
        }
      }, v ? /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'DM Mono,monospace',
          color: '#34D399'
        }
      }, v) : /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 18,
          fontWeight: 700,
          fontFamily: 'DM Mono,monospace',
          color: '#eee'
        }
      }, n), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9,
          color: '#444',
          fontFamily: 'DM Mono,monospace'
        }
      }, l)));
    }
  };
  if (!activeTabObj) return null;
  const accentColor = KC_HEX[kbState.tabs.find(t => t.id === kbActiveTab)?.color || 'purple'] || '#534AB7';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: '#060606',
      fontFamily: 'DM Mono,monospace'
    }
  }, /*#__PURE__*/React.createElement("style", null, KB_ACCENT_STYLES), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      borderBottom: '1px solid #181818',
      background: '#080808',
      flexShrink: 0,
      overflowX: 'auto'
    }
  }, kbState.tabs.map(t => {
    const tc = KC_HEX[t.color] || '#534AB7';
    const isOn = t.id === kbActiveTab;
    return /*#__PURE__*/React.createElement("div", {
      key: t.id,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 14px',
        borderRight: '1px solid #181818',
        cursor: 'pointer',
        borderBottom: `2px solid ${isOn ? tc : 'transparent'}`,
        flexShrink: 0,
        minHeight: 38
      },
      onClick: () => switchKbTab(t.id),
      onDoubleClick: () => openEditTab(t.id),
      title: "Duplo clique para editar aba"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: tc,
        opacity: isOn ? 1 : .3
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        letterSpacing: .3,
        color: isOn ? tc : '#444',
        fontWeight: isOn ? 700 : 400
      }
    }, t.label));
  }), /*#__PURE__*/React.createElement("button", {
    onClick: openNewTab,
    style: {
      padding: '0 12px',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: '#333',
      fontSize: 16,
      flexShrink: 0
    },
    title: "Nova aba"
  }, "+")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      borderBottom: '1px solid #181818',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, activeTabObj.type === 'cria' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, [['all', 'Todos'], ['CR.IA', 'CR.IA'], ['BrandSync', 'BrandSync']].map(([f, l]) => /*#__PURE__*/React.createElement("button", {
    key: f,
    onClick: () => setCriaFilter(f),
    style: {
      padding: '3px 9px',
      borderRadius: 3,
      border: '1px solid',
      fontSize: 9,
      cursor: 'pointer',
      letterSpacing: .3,
      borderColor: criaFilter === f ? accentColor : '#1e1e1e',
      background: criaFilter === f ? `rgba(${hexRgb(accentColor)},.12)` : 'transparent',
      color: criaFilter === f ? accentColor : '#444'
    }
  }, l))), activeTabObj.type === 'lead' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      flexWrap: 'wrap'
    }
  }, ['Todos', 'Galeria', 'GAIA', 'Catalyst', 'Milà', '404', 'ccCaramelo', 'Vitrine', 'A.gente', 'GUX'].map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    onClick: () => setCriaFilter(f),
    style: {
      padding: '3px 9px',
      borderRadius: 3,
      border: '1px solid',
      fontSize: 9,
      cursor: 'pointer',
      letterSpacing: .3,
      borderColor: criaFilter === f ? accentColor : '#1e1e1e',
      background: criaFilter === f ? `rgba(${hexRgb(accentColor)},.12)` : 'transparent',
      color: criaFilter === f ? accentColor : '#444'
    }
  }, f))), /*#__PURE__*/React.createElement("input", {
    value: kbSearch,
    onChange: e => setKbSearch(e.target.value),
    placeholder: "Buscar...",
    style: {
      background: '#060606',
      border: '1px solid #1a1a1a',
      borderRadius: 3,
      padding: '5px 9px',
      color: '#eee',
      fontFamily: 'DM Mono,monospace',
      fontSize: 10,
      outline: 'none',
      width: 140
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setColsModal(true),
    style: {
      padding: '4px 10px',
      border: '1px solid #1e1e1e',
      borderRadius: 3,
      background: 'transparent',
      color: '#444',
      fontSize: 9,
      cursor: 'pointer',
      letterSpacing: .3
    }
  }, "⚙ Colunas"), /*#__PURE__*/React.createElement("button", {
    onClick: () => openAddCard(activeTabObj.cols[0]?.id),
    style: {
      padding: '4px 12px',
      border: 'none',
      borderRadius: 3,
      background: accentColor,
      color: '#fff',
      fontSize: 9,
      cursor: 'pointer',
      fontWeight: 700,
      letterSpacing: .3
    }
  }, "+ ", activeTabObj.type === 'cria' ? 'Novo card' : 'Novo lead')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      padding: '8px 16px',
      flexWrap: 'wrap',
      flexShrink: 0
    }
  }, renderStats()), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowX: 'auto',
      padding: '8px 16px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start',
      minWidth: 'max-content',
      paddingBottom: 16
    }
  }, activeTabObj.cols.map(col => {
    const isPerdido = col.id === 'perdido';
    const colCards = visCards(activeTabObj).filter(c => c.col === col.id);
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: col.id
    }, isPerdido && /*#__PURE__*/React.createElement("div", {
      style: {
        width: 1,
        alignSelf: 'stretch',
        background: '#1a1a1a',
        flexShrink: 0,
        marginTop: 8
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "kb-col",
      "data-accent": isPerdido ? 'gray' : col.accent || 'gray',
      style: {
        width: 200,
        flexShrink: 0,
        background: isPerdido ? '#080808' : '#0a0a0a',
        borderRadius: 6,
        padding: '8px 6px',
        border: isPerdido ? '1px solid #141414' : '1px solid #181818',
        opacity: isPerdido ? 0.72 : 1,
        marginLeft: isPerdido ? 8 : 0
      },
      onDragOver: e => e.preventDefault(),
      onDrop: () => onDrop(col.id)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        padding: '0 3px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: '#333',
        textTransform: 'uppercase',
        letterSpacing: .06 * 16 + 'px',
        flex: 1,
        cursor: 'pointer'
      },
      title: "Duplo clique para renomear",
      onDoubleClick: () => {
        const nv = window.prompt('Renomear coluna:', col.label);
        if (nv) renameCol(col.id, nv);
      }
    }, col.label), /*#__PURE__*/React.createElement("span", {
      className: "kb-cnt",
      style: {
        fontSize: 9,
        fontFamily: 'DM Mono,monospace',
        padding: '1px 6px',
        borderRadius: 20,
        border: '1px solid #222'
      }
    }, colCards.length)), colCards.map(card => {
      const isLead = activeTabObj.type !== 'cria';
      const tagMap = {
        mrr: ['kb-tag-mrr', 'MRR'],
        camp: ['kb-tag-camp', 'Campanhas'],
        'poc-paga': ['kb-tag-poc-paga', 'POC paga'],
        'poc-free': ['kb-tag-poc-free', 'POC free'],
        prop: ['kb-tag-prop', 'Proposta']
      };
      return /*#__PURE__*/React.createElement("div", {
        key: card.id,
        draggable: true,
        onDragStart: () => onDragStart(activeTabObj.id, card.id),
        onClick: () => openEditCard(activeTabObj.id, card.id),
        style: {
          background: '#111',
          border: '1px solid #1a1a1a',
          borderRadius: 4,
          padding: 9,
          marginBottom: 5,
          cursor: 'grab',
          transition: 'border-color .12s'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 5,
          marginBottom: 3
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: '#ddd',
          lineHeight: 1.3
        }
      }, card.name), !isLead && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          padding: '1px 5px',
          borderRadius: 3,
          background: card.product === 'CR.IA' ? 'rgba(83,74,183,.15)' : 'rgba(15,110,86,.15)',
          color: card.product === 'CR.IA' ? '#a5a0f5' : '#34d399',
          flexShrink: 0
        }
      }, card.product), isLead && card.galeria && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          padding: '1px 5px',
          borderRadius: 3,
          background: 'rgba(155,74,0,.15)',
          color: '#fb923c',
          flexShrink: 0
        }
      }, card.galeria)), isLead && card.empresa && card.empresa !== card.name && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: '#444',
          marginTop: 1,
          fontStyle: 'italic'
        }
      }, card.empresa), card.note && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: '#555',
          marginTop: 3,
          lineHeight: 1.45
        }
      }, card.note), !isLead && card.tag && tagMap[card.tag] && /*#__PURE__*/React.createElement("span", {
        className: tagMap[card.tag][0],
        style: {
          display: 'inline-block',
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 3,
          marginTop: 5
        }
      }, tagMap[card.tag][1]), isLead && card.value > 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          fontWeight: 700,
          color: '#34D399',
          fontFamily: 'DM Mono,monospace',
          marginTop: 5
        }
      }, kbFmtVal(card.value)), isPerdido && card.motivo && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          color: card.motivo === 'perdido' ? '#6B2121' : '#3a3a5a',
          background: card.motivo === 'perdido' ? 'rgba(107,33,33,.15)' : 'rgba(58,58,90,.15)',
          borderRadius: 3,
          padding: '1px 5px',
          marginTop: 5,
          display: 'inline-block'
        }
      }, card.motivo === 'perdido' ? '✗ Perdido' : '⏸ Em hold', card.motivoObs ? ' — ' + card.motivoObs : null));
    }), /*#__PURE__*/React.createElement("div", {
      onDragOver: e => e.preventDefault(),
      onDrop: () => onDrop(col.id),
      style: {
        minHeight: 30,
        border: '1px dashed #1a1a1a',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 3,
        transition: 'all .12s',
        cursor: 'default'
      },
      onDragEnter: e => e.currentTarget.style.borderColor = accentColor,
      onDragLeave: e => e.currentTarget.style.borderColor = '#1a1a1a'
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: '#2a2a2a'
      }
    }, "soltar aqui")), /*#__PURE__*/React.createElement("button", {
      onClick: () => openAddCard(col.id),
      style: {
        width: '100%',
        textAlign: 'left',
        fontSize: 9,
        color: '#2a2a2a',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px 3px 0',
        fontFamily: 'DM Mono,monospace'
      }
    }, "+ novo ", activeTabObj.type === 'cria' ? 'card' : 'lead')));
  }))), cardModal && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle"
  }, cardModal.cardId != null ? 'Editar card' : 'Novo card'), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "CLIENTE"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    value: cfName,
    onChange: e => setCfName(e.target.value),
    onKeyDown: e => e.key === 'Enter' && saveCard(),
    autoFocus: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "PRODUTO"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: cfProd,
    onChange: e => setCfProd(e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "CR.IA"), /*#__PURE__*/React.createElement("option", null, "BrandSync"))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "COLUNA"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: cfCol,
    onChange: e => setCfCol(e.target.value)
  }, (activeTabObj.cols || []).map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.label))))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "TAG"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: cfTag,
    onChange: e => setCfTag(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Nenhuma"), /*#__PURE__*/React.createElement("option", {
    value: "mrr"
  }, "MRR"), /*#__PURE__*/React.createElement("option", {
    value: "camp"
  }, "Campanhas"), /*#__PURE__*/React.createElement("option", {
    value: "poc-paga"
  }, "POC paga"), /*#__PURE__*/React.createElement("option", {
    value: "poc-free"
  }, "POC free"), /*#__PURE__*/React.createElement("option", {
    value: "prop"
  }, "Proposta"))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "NOTA"), /*#__PURE__*/React.createElement("textarea", {
    className: "finp",
    rows: "3",
    value: cfNote,
    onChange: e => setCfNote(e.target.value)
  })), cfCol === 'perdido' && /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "MOTIVO"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: cfMotivo,
    onChange: e => setCfMotivo(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "perdido"
  }, "Perdido"), /*#__PURE__*/React.createElement("option", {
    value: "hold"
  }, "Em hold"))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "OBS"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "Motivo, próx. passo...",
    value: cfMotivoObs,
    onChange: e => setCfMotivoObs(e.target.value)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: () => setCardModal(null)
  }, "Cancelar"), cardModal.cardId != null && /*#__PURE__*/React.createElement("button", {
    className: "btn btnsm",
    style: {
      background: 'rgba(255,71,87,.1)',
      color: '#FF4757',
      border: '1px solid rgba(255,71,87,.2)'
    },
    onClick: delCard
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: accentColor
    },
    onClick: saveCard
  }, "Salvar")))), leadModal && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle"
  }, leadModal.cardId != null ? 'Editar lead' : 'Novo lead'), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "CLIENTE / OPORTUNIDADE"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    value: lfName,
    onChange: e => setLfName(e.target.value),
    autoFocus: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "EMPRESA"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    value: lfEmpresa,
    onChange: e => setLfEmpresa(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "EMPRESA GALERIA"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: lfGaleria,
    onChange: e => setLfGaleria(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "—"), ['Galeria', 'ccCaramelo', '404', 'Mila', 'GAIA', 'Catalyst', 'Mantiqueira', 'A.gente', 'Vitrine', 'GUX'].map(g => /*#__PURE__*/React.createElement("option", {
    key: g
  }, g))))), /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "COLUNA"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: lfCol,
    onChange: e => setLfCol(e.target.value)
  }, (activeTabObj.cols || []).map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.label)))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "VALOR (R$)"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    type: "number",
    min: "0",
    value: lfVal,
    onChange: e => setLfVal(e.target.value)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "NOTA"), /*#__PURE__*/React.createElement("textarea", {
    className: "finp",
    rows: "3",
    value: lfNote,
    onChange: e => setLfNote(e.target.value)
  })), lfCol === 'perdido' && /*#__PURE__*/React.createElement("div", {
    className: "g2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "MOTIVO"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: lfMotivo,
    onChange: e => setLfMotivo(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "perdido"
  }, "Perdido"), /*#__PURE__*/React.createElement("option", {
    value: "hold"
  }, "Em hold"))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "OBS"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    placeholder: "Motivo, próx. passo...",
    value: lfMotivoObs,
    onChange: e => setLfMotivoObs(e.target.value)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: () => setLeadModal(null)
  }, "Cancelar"), leadModal.cardId != null && /*#__PURE__*/React.createElement("button", {
    className: "btn btnsm",
    style: {
      background: 'rgba(255,71,87,.1)',
      color: '#FF4757',
      border: '1px solid rgba(255,71,87,.2)'
    },
    onClick: delLead
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: accentColor
    },
    onClick: saveLead
  }, "Salvar")))), tabModal && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle"
  }, tabModal.tabId ? 'Editar aba' : 'Nova aba'), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "NOME DA ABA"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    value: tfName,
    onChange: e => setTfName(e.target.value),
    autoFocus: true
  })), !tabModal.tabId && /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "TIPO DE CARD"), /*#__PURE__*/React.createElement("select", {
    className: "finp",
    value: tfType,
    onChange: e => setTfType(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "cria"
  }, "CR.IA / BrandSync (produto, tag)"), /*#__PURE__*/React.createElement("option", {
    value: "lead"
  }, "Pipeline / Lead (empresa, valor)"))), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "COR"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginTop: 4
    }
  }, KANBAN_COLORS.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    onClick: () => setTabColor(c.id),
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: c.hex,
      cursor: 'pointer',
      outline: tabColor === c.id ? `2px solid ${c.hex}` : '2px solid transparent',
      outlineOffset: 2
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: () => setTabModal(null)
  }, "Cancelar"), tabModal.tabId && /*#__PURE__*/React.createElement("button", {
    className: "btn btnsm",
    style: {
      background: 'rgba(255,71,87,.1)',
      color: '#FF4757',
      border: '1px solid rgba(255,71,87,.2)'
    },
    onClick: deleteTab
  }, "Excluir aba"), /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: KC_HEX[tabColor] || '#534AB7'
    },
    onClick: saveTab
  }, tabModal.tabId ? 'Salvar' : 'Criar aba')))), colsModal && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle"
  }, "Colunas — ", activeTabObj.label), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, (activeTabObj.cols || []).map((col, i) => /*#__PURE__*/React.createElement("div", {
    key: col.id,
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "finp",
    style: {
      flex: 1
    },
    value: col.label,
    onChange: e => renameCol(col.id, e.target.value)
  }), /*#__PURE__*/React.createElement("select", {
    style: {
      background: '#060606',
      border: '1px solid #1a1a1a',
      borderRadius: 3,
      padding: '5px 6px',
      color: '#eee',
      fontFamily: 'DM Mono,monospace',
      fontSize: 9
    },
    value: col.accent || 'gray',
    onChange: e => changeColAccent(col.id, e.target.value)
  }, KC_CYCLE.map(a => /*#__PURE__*/React.createElement("option", {
    key: a,
    value: a
  }, a))), /*#__PURE__*/React.createElement("button", {
    onClick: () => deleteCol(col.id),
    style: {
      padding: '4px 8px',
      border: '1px solid rgba(255,71,87,.3)',
      borderRadius: 3,
      background: 'none',
      color: '#FF4757',
      cursor: 'pointer',
      fontSize: 11
    }
  }, "✕")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "finp",
    style: {
      flex: 1
    },
    placeholder: "Nome da nova coluna...",
    value: newColName,
    onChange: e => setNewColName(e.target.value),
    onKeyDown: e => e.key === 'Enter' && addCol()
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: accentColor
    },
    onClick: addCol
  }, "+ Adicionar")), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: () => setColsModal(false)
  }, "Fechar")))));
}
async function buscarDecisoresClaude(empresa, setor) {
  const prompt = `Busque os principais executivos de marketing, brand, performance e comercial da empresa "${empresa}" (setor: ${setor || 'geral'}) no Brasil.
Para cada pessoa encontrada: nome completo, cargo atual, URL do LinkedIn se disponível.
Foque em: CMO, VP Marketing, Diretor de Marketing, Diretor de Performance, Diretor de Brand, Head de CX, Gerente de Marketing Digital, Diretor Comercial, Head Comercial.
Busque no LinkedIn, site da empresa, Meio & Mensagem e PropMark. Liste no mínimo 5 pessoas.
Responda SOMENTE em JSON sem markdown: [{"nome":"...","cargo":"...","li":"..."}]`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getClaudeKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        tools: [{
          type: "web_search_20250305",
          name: "web_search"
        }],
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });
    const d = await r.json();
    const txt = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    if (!txt) return null;
    return (() => {
      try {
        const clean = txt.replace(/```json[\s\S]*?```|```/g, "").trim();
        const m = clean.match(/\[[\s\S]*\]/);
        return m ? JSON.parse(m[0]) : JSON.parse(clean);
      } catch (jsonErr) {
        return null;
      }
    })();
  } catch (e) {
    return null;
  }
}
function getWeekId(date) {
  const d = new Date(date || Date.now());
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
function getWeekLabelV1(weekId) {
  if (!weekId) return "";
  const [year, w] = weekId.split("-W");
  const jan1 = new Date(parseInt(year), 0, 1);
  const days = (parseInt(w) - 1) * 7 - jan1.getDay() + 1;
  const start = new Date(jan1.getTime() + days * 86400000);
  const end = new Date(start.getTime() + 4 * 86400000);
  const fmt = d => d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short"
  });
  return `Sem ${w} — ${fmt(start)} a ${fmt(end)}`;
}
var KA_COLS = [{
  id: "para_acionar",
  label: "Para Acionar",
  color: "#9B9BB4"
}, {
  id: "email",
  label: "Acionado (Email)",
  color: "#60A5FA"
}, {
  id: "linkedin",
  label: "Acionado (LinkedIn)",
  color: "#A78BFA"
}, {
  id: "whatsapp",
  label: "Acionado (WA)",
  color: "#25D366"
}, {
  id: "respondeu",
  label: "Respondeu",
  color: "#EF9F27"
}, {
  id: "negociacao",
  label: "Em Negociação",
  color: "#1D9E75"
}];
function LLMBox({
  accs,
  curGrupo
}) {
  const [history, setHistory] = useState(() => loadSt("gh_llmbox_v1", []));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const histRef = React.useRef(null);
  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [history]);
  const CHIPS = ["Quais empresas de bet estão no sistema?", "Quantos decisores verificados tenho no total?", "Quais empresas do setor financeiro não foram acionadas?", "Mostre as 10 empresas com mais sugeridos não convertidos", "Quais empresas não têm nenhum contato verificado?", "Quem são os CMOs que já registrei atividade este mês?"];
  const buildContext = () => {
    const empresas = (typeof PROSP !== "undefined" ? PROSP : []).slice(0, 200).map(e => {
      const key = (curGrupo?.id || "galeria") + "_" + e.rank;
      const acc = accs[key] || {};
      return {
        nome: e.nome,
        setor: e.setor,
        rank: e.rank,
        decisoresVerificados: (acc.decisors || []).length,
        decisoresSugeridos: (acc.sugeridos || []).length,
        atividades: (acc.activities || []).length,
        ultimaAtividade: (acc.activities || []).slice(-1)[0]?.date || null,
        decisores: (acc.decisors || []).map(d => ({
          nome: d.nome,
          cargo: d.cargo
        }))
      };
    });
    const kanbanData = loadSt("gh_kanban_v3", {});
    const weekId = getWeekId();
    const semanaAtual = kanbanData[weekId] || {};
    return JSON.stringify({
      empresa_do_grupo: curGrupo?.name || "Galeria",
      total_empresas: empresas.length,
      empresas,
      acionamentos_semana_atual: semanaAtual
    }, null, 0).slice(0, 8000);
  };
  const perguntar = async q => {
    const question = q || input.trim();
    if (!question || loading) return;
    setLoading(true);
    setInput("");
    const ctx = buildContext();
    const needsWeb = /hoje|agora|recente|novo|noticias|notícias|mercado|moviment|semana|mês|mes|atual|lançou|lançamento/i.test(question);
    const prompt = `Você é o assistente analítico do CRM da Galeria Holding. Responda em português, de forma direta e formatada.
Dados do sistema (JSON resumido):
${ctx}

Pergunta: ${question}

${needsWeb ? "Se necessário, use web_search para complementar com dados em tempo real do mercado brasileiro de comunicação e marketing." : ""}
Responda com dados concretos do contexto. Use tabelas de texto quando aplicável. Seja objetivo e direto.`;
    try {
      const body = {
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: prompt
        }]
      };
      if (needsWeb) body.tools = [{
        type: "web_search_20250305",
        name: "web_search"
      }];
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getClaudeKey(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      const answer = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") || "Não foi possível responder agora.";
      const usouWeb = needsWeb && (d.content || []).some(b => b.type === "tool_use" || b.type === "tool_result");
      const newHistory = [...history.slice(-9), {
        q: question,
        a: answer + (usouWeb ? "\n\n🌐 *Resposta complementada com busca em tempo real*" : ""),
        ts: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit"
        })
      }];
      setHistory(newHistory);
      saveSt("gh_llmbox_v1", newHistory);
    } catch (e) {
      const newHistory = [...history.slice(-9), {
        q: question,
        a: "Não foi possível buscar agora. Tente novamente.",
        ts: ""
      }];
      setHistory(newHistory);
      saveSt("gh_llmbox_v1", newHistory);
    }
    setLoading(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "llm-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 20px",
      borderBottom: "1px solid var(--gh-mid)",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--gh-white)",
      letterSpacing: -.3
    }
  }, "🤖 Perguntar ao CRM"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "var(--gh-muted)",
      marginTop: 2
    }
  }, "Consulte seus dados com linguagem natural — contexto: ", curGrupo?.name)), /*#__PURE__*/React.createElement("div", {
    className: "llm-history",
    ref: histRef
  }, history.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 40,
      color: "var(--gh-muted)",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      marginBottom: 12
    }
  }, "🤖"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12
    }
  }, "Faça uma pergunta sobre seus dados")), history.map((item, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "llm-q"
  }, item.q), /*#__PURE__*/React.createElement("div", {
    className: "llm-a"
  }, item.a), item.ts && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#333",
      marginTop: 4,
      textAlign: "right"
    }
  }, item.ts))), loading && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      background: "var(--gh-dark)",
      borderRadius: 8,
      border: "1px solid var(--gh-mid)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lfill",
    style: {
      background: "var(--gh-orange)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--gh-muted)",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "Analisando seus dados..."))), /*#__PURE__*/React.createElement("div", {
    className: "llm-chips"
  }, CHIPS.map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "llm-chip",
    onClick: () => perguntar(c)
  }, c))), /*#__PURE__*/React.createElement("div", {
    className: "llm-input-row"
  }, /*#__PURE__*/React.createElement("input", {
    value: input,
    onChange: e => setInput(e.target.value),
    placeholder: "Faça uma pergunta sobre seus dados...",
    onKeyDown: e => e.key === "Enter" && perguntar()
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => perguntar(),
    disabled: loading || !input.trim(),
    style: {
      padding: "10px 18px",
      borderRadius: 4,
      border: "none",
      background: "var(--gh-orange)",
      color: "#fff",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      opacity: loading || !input.trim() ? 0.5 : 1
    }
  }, loading ? "..." : "Perguntar")));
}
async function buscarMovimentacoesCMO() {
  if (!getClaudeKey()) {
    return [];
  }
  const prompt = `Busque nos sites propmark.com.br, meioemensagem.com.br, exame.com, gkpb.com.br e coletiva.net notícias dos últimos 7 dias sobre executivos de marketing brasileiros que assumiram novos cargos.
Para cada pessoa encontrada: nome completo, novo cargo, empresa atual, empresa anterior (se disponível), fonte da notícia com URL, e LinkedIn se mencionado.
Foque em: CMO, VP Marketing, Diretor de Marketing, Head de Brand, Diretor de Performance, Head de Marketing, Head de CX.
Liste pelo menos 8 pessoas com dados reais e verificados.
Responda SOMENTE em JSON sem markdown: [{"nome":"...","cargo":"...","empresa":"...","empresaAnterior":"...","fonte":"...","fonteUrl":"...","li":"..."}]`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getClaudeKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        tools: [{
          type: "web_search_20250305",
          name: "web_search"
        }],
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });
    const d = await r.json();
    const txt = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    if (!txt) return null;
    return (() => {
      try {
        const clean = txt.replace(/```json[\s\S]*?```|```/g, "").trim();
        const m = clean.match(/\[[\s\S]*\]/);
        return m ? JSON.parse(m[0]) : JSON.parse(clean);
      } catch (jsonErr) {
        return null;
      }
    })();
  } catch (e) {
    return null;
  }
}
var ASSINATURA_HTML = `<table style="font-family:Inter,sans-serif;margin-top:24px;border-top:1px solid #e0e0e0;padding-top:16px;"><tr><td style="padding-right:32px;vertical-align:top;"><p style="margin:0;font-size:15px;font-weight:600;color:#0D0D0D;">Pedro Ica</p><p style="margin:0;font-size:12px;font-style:italic;color:#666;">Head of Growth</p><p style="margin:4px 0 0;font-size:11px;color:#888;">pedro.ica@galeriaholding.co</p></td><td style="border-left:1px solid #e0e0e0;padding-left:32px;vertical-align:middle;"><p style="margin:0;font-size:18px;font-weight:800;color:#0D0D0D;letter-spacing:-0.5px;line-height:1.1;">GALERIA<br>HOLDING</p><p style="margin:4px 0 0;font-size:10px;color:#888;">galeriaholding.co</p></td></tr></table>`;
var ASSINATURA_TEXTO = "\n\u2014\nPedro Ica | Head of Growth\nGaleria Holding\npedro.ica@galeriaholding.co";
