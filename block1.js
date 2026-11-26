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
