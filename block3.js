const {
  useState,
  useMemo,
  useEffect,
  useCallback
} = React;
function FigurinhasV2({
  accs,
  setAccs,
  curGrupo,
  alertas,
  onKanbanAdd
}) {
  const [search, setSearch] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [selEmpresa, setSelEmpresa] = useState(null);
  const [enrichLoading, setEnrichLoading] = useState({});
  const [abordagemDecidor, setAbordagemDecidor] = useState(null);
  const empresas = useMemo(() => {
    const base = (typeof PROSP !== "undefined" ? PROSP : []).filter(e => e.setor);
    return base.map(e => ({
      ...e,
      score: calcularScore(e, accs, curGrupo.id, alertas)
    }));
  }, [accs, curGrupo.id, alertas]);
  const setores = useMemo(() => {
    const s = new Set(empresas.map(e => e.setor).filter(Boolean));
    return ["Todos", ...Array.from(s).sort()];
  }, [empresas]);
  const getAcc = rank => {
    const k = curGrupo.id + "_" + rank;
    return (accs || {})[k] || {
      decisors: [],
      sugeridos: [],
      activities: []
    };
  };
  const filtradas = useMemo(() => {
    return empresas.filter(e => {
      const acc = getAcc(e.rank);
      const nVer = (acc.decisors || []).length;
      const q = (search || "").toLowerCase();
      if (q && !e.nome.toLowerCase().includes(q)) return false;
      if (filtroSetor !== "Todos" && e.setor !== filtroSetor) return false;
      if (filtroStatus === "sem" && nVer > 0) return false;
      if (filtroStatus === "parcial" && (nVer === 0 || nVer >= 5)) return false;
      if (filtroStatus === "completo" && nVer < 5) return false;
      return true;
    }).sort((a, b) => b.score - a.score);
  }, [empresas, search, filtroSetor, filtroStatus, accs]);
  const enriquecerEmpresa = async empresa => {
    if (!getClaudeKey()) {
      alert("⚠ Configure a Claude API Key em ⚙ Configurações (botão no canto superior direito) para usar esta funcionalidade.");
      return;
    }
    setEnrichLoading(p => ({
      ...p,
      [empresa.rank]: true
    }));
    const prompt = `Encontre os principais executivos de marketing e área comercial da empresa ${empresa.nome} no Brasil.
Para cada pessoa retorne APENAS um JSON array com objetos contendo:
nome (string), cargo (string), linkedin (string ou null).
Foco em: CMO, VP Marketing, Diretor de Marketing, Diretor de Performance,
Gerente de Performance, Brand Manager, Diretor de Brand, Head de Customer Success,
Diretor Comercial, Head Comercial, VP Comercial, Gerente Comercial.
Mínimo 5 pessoas. Retorne SOMENTE o JSON, sem texto adicional.`;
    const txt = await claudeSearch(prompt, 2000);
    const lista = parseJSON(txt);
    if (lista && Array.isArray(lista) && lista.length > 0) {
      const k = curGrupo.id + "_" + empresa.rank;
      const existing = (accs || {})[k] || {
        decisors: [],
        sugeridos: [],
        activities: []
      };
      const jaVerificados = (existing.decisors || []).map(d => normalizarNome(d.nome));
      const jaSugeridos = (existing.sugeridos || []).map(d => normalizarNome(d.nome));
      const novos = lista.filter(s => {
        const n = normalizarNome(s.nome);
        return !jaVerificados.includes(n) && !jaSugeridos.includes(n);
      }).map(s => ({
        ...s,
        aiSuggested: true,
        addedAt: new Date().toLocaleDateString("pt-BR")
      }));
      const novoAcc = {
        ...existing,
        sugeridos: [...(existing.sugeridos || []), ...novos]
      };
      const newAccs = {
        ...(accs || {}),
        [k]: novoAcc
      };
      setAccs(newAccs);
      lsSet("gh_decisores_v3", newAccs);
    } else {
      alert("Não foi possível buscar agora. Tente novamente.");
    }
    setEnrichLoading(p => ({
      ...p,
      [empresa.rank]: false
    }));
  };
  const confirmarSugerido = (empresa, sugerido) => {
    const k = curGrupo.id + "_" + empresa.rank;
    const existing = (accs || {})[k] || {
      decisors: [],
      sugeridos: [],
      activities: []
    };
    const novoVer = {
      ...sugerido,
      confirmedAt: new Date().toLocaleDateString("pt-BR")
    };
    const novoAcc = {
      ...existing,
      decisors: [...(existing.decisors || []), novoVer],
      sugeridos: (existing.sugeridos || []).filter(s => normalizarNome(s.nome) !== normalizarNome(sugerido.nome))
    };
    const newAccs = {
      ...(accs || {}),
      [k]: novoAcc
    };
    setAccs(newAccs);
    lsSet("gh_decisores_v3", newAccs);
  };
  const removerDecidor = (empresa, decisor, tipo) => {
    const k = curGrupo.id + "_" + empresa.rank;
    const existing = (accs || {})[k] || {
      decisors: [],
      sugeridos: [],
      activities: []
    };
    let novoAcc;
    if (tipo === "verificado") {
      novoAcc = {
        ...existing,
        decisors: (existing.decisors || []).filter(d => normalizarNome(d.nome) !== normalizarNome(decisor.nome))
      };
    } else {
      novoAcc = {
        ...existing,
        sugeridos: (existing.sugeridos || []).filter(d => normalizarNome(d.nome) !== normalizarNome(decisor.nome))
      };
    }
    const newAccs = {
      ...(accs || {}),
      [k]: novoAcc
    };
    setAccs(newAccs);
    lsSet("gh_decisores_v3", newAccs);
  };
  if (selEmpresa) {
    const acc = getAcc(selEmpresa.rank);
    const verificados = acc.decisors || [];
    const sugeridos = acc.sugeridos || [];
    const atividades = acc.activities || [];
    const score = selEmpresa.score;
    const saveAcc = novoAcc => {
      const k = curGrupo.id + "_" + selEmpresa.rank;
      const newAccs = Object.assign({}, accs || {});
      newAccs[k] = novoAcc;
      setAccs(newAccs);
      lsSet("gh_decisores_v3", newAccs);
    };
    const confirmarSug = sug => {
      const novoAcc = Object.assign({}, acc);
      novoAcc.decisors = verificados.concat([Object.assign({}, sug, {
        confirmedAt: new Date().toLocaleDateString("pt-BR")
      })]);
      novoAcc.sugeridos = sugeridos.filter(function (s) {
        return normalizarNome(s.nome) !== normalizarNome(sug.nome);
      });
      saveAcc(novoAcc);
    };
    const removerVerif = dec => {
      if (!window.confirm("Remover " + dec.nome + "?")) return;
      const novoAcc = Object.assign({}, acc);
      novoAcc.decisors = verificados.filter(function (d) {
        return normalizarNome(d.nome) !== normalizarNome(dec.nome);
      });
      saveAcc(novoAcc);
    };
    const removerSug = dec => {
      const novoAcc = Object.assign({}, acc);
      novoAcc.sugeridos = sugeridos.filter(function (d) {
        return normalizarNome(d.nome) !== normalizarNome(dec.nome);
      });
      saveAcc(novoAcc);
    };
    const editDecEmail = (idx, val) => {
      const novos = verificados.map(function (d, i) {
        return i === idx ? Object.assign({}, d, {
          email: val
        }) : d;
      });
      saveAcc(Object.assign({}, acc, {
        decisors: novos
      }));
    };
    const editDecWa = (idx, val) => {
      const novos = verificados.map(function (d, i) {
        return i === idx ? Object.assign({}, d, {
          wa: val
        }) : d;
      });
      saveAcc(Object.assign({}, acc, {
        decisors: novos
      }));
    };
    const logAt = (dec, tipo) => {
      const at = {
        type: tipo,
        decisor: dec.nome,
        date: new Date().toLocaleDateString("pt-BR"),
        desc: (tipo === "wa" ? "WA" : "Email") + " - " + dec.nome
      };
      const novoAcc = Object.assign({}, acc, {
        activities: atividades.concat([at])
      });
      saveAcc(novoAcc);
    };
    const [showAdd, setShowAdd] = React.useState(false);
    const [fNome, setFNome] = React.useState("");
    const [fCargo, setFCargo] = React.useState("");
    const [fEmail, setFEmail] = React.useState("");
    const [fWa, setFWa] = React.useState("");
    const [fLi, setFLi] = React.useState("");
    const [fWa2, setFWa2] = React.useState("");
    const [fWa3, setFWa3] = React.useState("");
    const [fIg, setFIg] = React.useState("");
    const [fFb, setFFb] = React.useState("");
    const salvarNovo = () => {
      if (!fNome.trim()) return;
      const novo = {
        nome: fNome.trim(),
        cargo: fCargo.trim(),
        email: fEmail.trim(),
        wa: fWa.trim(),
        wa2: fWa2.trim(),
        wa3: fWa3.trim(),
        li: fLi.trim(),
        ig: fIg.trim(),
        fb: fFb.trim(),
        addedAt: new Date().toLocaleDateString("pt-BR")
      };
      saveAcc(Object.assign({}, acc, {
        decisors: verificados.concat([novo])
      }));
      setFNome("");
      setFCargo("");
      setFEmail("");
      setFWa("");
      setFWa2("");
      setFWa3("");
      setFLi("");
      setFIg("");
      setFFb("");
      setShowAdd(false);
    };
    const inp = {
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 7,
      padding: "8px 11px",
      color: "#F5F5F5",
      fontSize: 12,
      outline: "none",
      width: "100%",
      boxSizing: "border-box",
      fontFamily: "IBM Plex Mono,monospace"
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "#0D0D0D"
      }
    }, abordagemDecidor && /*#__PURE__*/React.createElement(AbordagemModal, {
      decisor: abordagemDecidor,
      empresa: selEmpresa.nome,
      setor: selEmpresa.setor,
      onClose: function () {
        setAbordagemDecidor(null);
      },
      onKanbanAdd: onKanbanAdd
    }), showAdd && /*#__PURE__*/React.createElement("div", {
      style: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.9)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#111827",
        border: ".5px solid #2D2D44",
        borderRadius: 12,
        width: "100%",
        maxWidth: 420,
        padding: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 600,
        color: "#F5F5F5",
        marginBottom: 16
      }
    }, "+ Novo Decisor"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace",
        marginBottom: 3,
        textTransform: "uppercase"
      }
    }, "Nome *"), /*#__PURE__*/React.createElement("input", {
      style: inp,
      value: fNome,
      onChange: function (e) {
        setFNome(e.target.value);
      },
      placeholder: "Ex: Ana Souza"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace",
        marginBottom: 3,
        textTransform: "uppercase"
      }
    }, "Cargo"), /*#__PURE__*/React.createElement("input", {
      style: inp,
      value: fCargo,
      onChange: function (e) {
        setFCargo(e.target.value);
      },
      placeholder: "CMO, Dir. Marketing..."
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace",
        marginBottom: 3,
        textTransform: "uppercase"
      }
    }, "Email"), /*#__PURE__*/React.createElement("input", {
      style: Object.assign({}, inp, {
        color: "#60A5FA"
      }),
      value: fEmail,
      onChange: function (e) {
        setFEmail(e.target.value);
      },
      placeholder: "email@empresa.com"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace",
        marginBottom: 3,
        textTransform: "uppercase"
      }
    }, "WhatsApp"), /*#__PURE__*/React.createElement("input", {
      style: Object.assign({}, inp, {
        color: "#25D366"
      }),
      value: fWa,
      onChange: function (e) {
        setFWa(e.target.value);
      },
      placeholder: "5511999999999"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace",
        marginBottom: 3,
        textTransform: "uppercase"
      }
    }, "LinkedIn"), /*#__PURE__*/React.createElement("input", {
      style: Object.assign({}, inp, {
        color: "#A78BFA"
      }),
      value: fLi,
      onChange: function (e) {
        setFLi(e.target.value);
      },
      placeholder: "linkedin.com/in/..."
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setShowAdd(false);
      },
      style: {
        padding: "8px 16px",
        borderRadius: 8,
        border: ".5px solid #2D2D44",
        background: "transparent",
        color: "#9B9BB4",
        fontSize: 12,
        cursor: "pointer"
      }
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      onClick: salvarNovo,
      style: {
        padding: "8px 20px",
        borderRadius: 8,
        border: "none",
        background: "#FF6B2B",
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer"
      }
    }, "Salvar")))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 20px",
        borderBottom: ".5px solid #2D2D44",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setSelEmpresa(null);
      },
      style: {
        padding: "5px 12px",
        borderRadius: 6,
        border: ".5px solid #2D2D44",
        background: "transparent",
        color: "#9B9BB4",
        fontSize: 11,
        cursor: "pointer"
      }
    }, "Voltar"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 600,
        color: "#F5F5F5"
      }
    }, selEmpresa.nome), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#555",
        fontFamily: "IBM Plex Mono,monospace",
        marginTop: 2
      }
    }, selEmpresa.setor)), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setShowAdd(true);
      },
      style: {
        padding: "8px 18px",
        borderRadius: 7,
        border: "none",
        background: "#FF6B2B",
        color: "#fff",
        fontSize: 12,
        cursor: "pointer",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16,
        lineHeight: 1
      }
    }, "+"), " Adicionar Decisor")), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: "auto",
        padding: "16px 20px"
      }
    }, verificados.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#1a1f2e",
        border: ".5px solid #2D2D44",
        borderRadius: 10,
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "linear-gradient(135deg," + getGrad(selEmpresa.nome)[0] + "," + getGrad(selEmpresa.nome)[1] + ")",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        color: "#fff"
      }
    }, ini(selEmpresa.nome)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "#F5F5F5"
      }
    }, selEmpresa.nome), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }, selEmpresa.setor, " · ", verificados.length, " decisor", verificados.length !== 1 ? "es" : ""))), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 1,
        height: 20,
        background: "#2D2D44"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 0,
        position: "relative",
        justifyContent: "center",
        paddingTop: 20,
        paddingBottom: 8
      }
    }, verificados.length > 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        top: 40,
        left: "10%",
        right: "10%",
        height: 1,
        background: "linear-gradient(90deg,transparent,#2D2D44 20%,#2D2D44 80%,transparent)",
        zIndex: 0
      }
    }), verificados.map(function (d, idx) {
      const g = getGrad(d.nome);
      const hasEmail = !!(d.email && d.email.trim());
      const hasWA = !!(d.wa && d.wa.trim());
      const hasLI = !!(d.linkedin && d.linkedin.trim());
      return /*#__PURE__*/React.createElement("div", {
        key: idx,
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 220,
          padding: "0 8px 16px",
          position: "relative",
          zIndex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 1,
          height: 20,
          background: "#2D2D44",
          marginBottom: 0,
          flexShrink: 0
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          width: "100%",
          background: "#111827",
          border: ".5px solid #2D2D44",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,.4)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          background: "linear-gradient(135deg," + g[0] + "22," + g[1] + "11)",
          borderBottom: ".5px solid #2D2D44",
          padding: "16px 14px 12px",
          position: "relative"
        }
      }, /*#__PURE__*/React.createElement("button", {
        onClick: function () {
          removerVerif(d);
        },
        title: "Remover",
        style: {
          position: "absolute",
          top: 8,
          right: 8,
          background: "rgba(255,71,87,.1)",
          border: ".5px solid rgba(255,71,87,.25)",
          borderRadius: 5,
          color: "#FF4757",
          cursor: "pointer",
          fontSize: 10,
          padding: "2px 6px",
          lineHeight: 1
        }
      }, "✕"), /*#__PURE__*/React.createElement("div", {
        style: {
          width: 52,
          height: 52,
          borderRadius: 13,
          background: "linear-gradient(135deg," + g[0] + "," + g[1] + ")",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 800,
          color: "#fff",
          marginBottom: 10,
          boxShadow: "0 2px 12px rgba(0,0,0,.3)"
        }
      }, ini(d.nome)), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 15,
          fontWeight: 700,
          color: "#F5F5F5",
          lineHeight: 1.2,
          marginBottom: 4
        }
      }, d.nome), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: "#9B9BB4",
          fontFamily: "IBM Plex Mono,monospace",
          letterSpacing: .3
        }
      }, d.cargo || "—")), /*#__PURE__*/React.createElement("div", {
        style: {
          padding: "10px 10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 6
        }
      }, hasEmail ? /*#__PURE__*/React.createElement("a", {
        href: "mailto:" + d.email,
        onClick: function () {
          logAt(d, "email");
        },
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          border: ".5px solid rgba(96,165,250,.3)",
          background: "rgba(96,165,250,.06)",
          textDecoration: "none",
          cursor: "pointer"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 16,
          flexShrink: 0
        }
      }, "✉️"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "#60A5FA",
          fontWeight: 700,
          fontFamily: "IBM Plex Mono,monospace",
          letterSpacing: .5
        }
      }, "EMAIL"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "rgba(96,165,250,.6)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }
      }, d.email)), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: "rgba(96,165,250,.4)"
        }
      }, "↗")) : /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          border: ".5px dashed #1e2433"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 16,
          opacity: 0.25,
          flexShrink: 0
        }
      }, "✉️"), /*#__PURE__*/React.createElement("input", {
        value: d.email || "",
        onChange: function (e) {
          editDecEmail(idx, e.target.value);
        },
        placeholder: "adicionar email...",
        style: {
          flex: 1,
          background: "transparent",
          border: "none",
          color: "#60A5FA",
          fontSize: 10,
          fontFamily: "IBM Plex Mono,monospace",
          outline: "none"
        }
      })), hasWA ? /*#__PURE__*/React.createElement("a", {
        href: "https://wa.me/" + (() => {
          var n = (d.wa || "").replace(/[^0-9]/g, "");
          return n.startsWith("55") && n.length >= 12 ? n : "55" + n;
        })(),
        target: "_blank",
        onClick: function () {
          logAt(d, "wa");
        },
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          border: ".5px solid rgba(37,211,102,.3)",
          background: "rgba(37,211,102,.06)",
          textDecoration: "none",
          cursor: "pointer"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 16,
          flexShrink: 0
        }
      }, "💬"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "#25D366",
          fontWeight: 700,
          fontFamily: "IBM Plex Mono,monospace",
          letterSpacing: .5
        }
      }, "WHATSAPP"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "rgba(37,211,102,.6)"
        }
      }, d.wa)), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: "rgba(37,211,102,.4)"
        }
      }, "↗")) : /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          border: ".5px dashed #1e2433"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 16,
          opacity: 0.25,
          flexShrink: 0
        }
      }, "💬"), /*#__PURE__*/React.createElement("input", {
        value: d.wa || "",
        onChange: function (e) {
          editDecWa(idx, e.target.value);
        },
        placeholder: "5511999...",
        style: {
          flex: 1,
          background: "transparent",
          border: "none",
          color: "#25D366",
          fontSize: 10,
          fontFamily: "IBM Plex Mono,monospace",
          outline: "none"
        }
      })), hasLI ? /*#__PURE__*/React.createElement("a", {
        href: d.linkedin.startsWith("http") ? d.linkedin : "https://" + d.linkedin,
        target: "_blank",
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          border: ".5px solid rgba(10,102,194,.4)",
          background: "rgba(10,102,194,.07)",
          textDecoration: "none",
          cursor: "pointer"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 16,
          flexShrink: 0
        }
      }, "💼"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "#60A5FA",
          fontWeight: 700,
          fontFamily: "IBM Plex Mono,monospace",
          letterSpacing: .5
        }
      }, "LINKEDIN"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "rgba(96,165,250,.6)"
        }
      }, "Ver perfil →")), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: "rgba(96,165,250,.4)"
        }
      }, "↗")) : /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          border: ".5px dashed #1e2433"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 16,
          opacity: 0.25,
          flexShrink: 0
        }
      }, "💼"), /*#__PURE__*/React.createElement("input", {
        value: d.linkedin || "",
        onChange: function (e) {
          var novos = verificados.map(function (x, i) {
            return i === idx ? Object.assign({}, x, {
              linkedin: e.target.value
            }) : x;
          });
          saveAcc(Object.assign({}, acc, {
            decisors: novos
          }));
        },
        placeholder: "linkedin.com/in/...",
        style: {
          flex: 1,
          background: "transparent",
          border: "none",
          color: "#60A5FA",
          fontSize: 10,
          fontFamily: "IBM Plex Mono,monospace",
          outline: "none"
        }
      })))));
    }))), sugeridos.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontFamily: "IBM Plex Mono,monospace",
        color: "#9B9BB4",
        letterSpacing: 1,
        textTransform: "uppercase",
        fontWeight: 700,
        marginBottom: 10
      }
    }, "SUGERIDOS IA (", sugeridos.length, ")"), sugeridos.map(function (d, idx) {
      const g = getGrad(d.nome);
      return /*#__PURE__*/React.createElement("div", {
        key: idx,
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "#0f1118",
          border: ".5px dashed #2D2D44",
          borderRadius: 8,
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "linear-gradient(135deg," + g[0] + "33," + g[1] + "22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          color: "#555",
          flexShrink: 0
        }
      }, ini(d.nome)), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "#9B9BB4"
        }
      }, d.nome), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "#555",
          fontFamily: "IBM Plex Mono,monospace"
        }
      }, d.cargo)), /*#__PURE__*/React.createElement("button", {
        onClick: function () {
          confirmarSug(d);
        },
        style: {
          padding: "5px 12px",
          borderRadius: 6,
          border: ".5px solid #1D9E75",
          background: "rgba(29,158,117,.1)",
          color: "#1D9E75",
          fontSize: 9,
          cursor: "pointer",
          fontWeight: 600
        }
      }, "Confirmar"), /*#__PURE__*/React.createElement("button", {
        onClick: function () {
          removerSug(d);
        },
        style: {
          background: "none",
          border: "none",
          color: "#555",
          cursor: "pointer",
          fontSize: 16
        }
      }, "x"));
    })), verificados.length === 0 && sugeridos.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "60px 20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 36,
        marginBottom: 12
      }
    }, "🎴"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        marginBottom: 6,
        color: "#F5F5F5"
      }
    }, "Nenhum decisor ainda"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        marginBottom: 20,
        color: "#555"
      }
    }, "Cadastre manualmente ou use IA"), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setShowAdd(true);
      },
      style: {
        padding: "12px 28px",
        borderRadius: 8,
        border: "none",
        background: "#FF6B2B",
        color: "#fff",
        fontSize: 13,
        cursor: "pointer",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 18
      }
    }, "+"), " Adicionar Decisor"))));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      background: "#0D0D0D"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 20px",
      borderBottom: ".5px solid #2D2D44",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 500,
      color: "#F5F5F5"
    }
  }, "🎴 Álbum de Figurinhas"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4"
    }
  }, filtradas.length, " empresas · ", curGrupo.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "gh-input",
    style: {
      width: 180,
      padding: "6px 10px"
    },
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Buscar empresa..."
  }), /*#__PURE__*/React.createElement("select", {
    className: "gh-select",
    style: {
      width: 160,
      padding: "6px 10px"
    },
    value: filtroSetor,
    onChange: e => setFiltroSetor(e.target.value)
  }, setores.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4
    }
  }, [["todos", "Todos"], ["sem", "Sem decisores"], ["parcial", "1-4 verificados"], ["completo", "5+ verificados"]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setFiltroStatus(v),
    style: {
      padding: "5px 10px",
      borderRadius: 100,
      border: ".5px solid",
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      cursor: "pointer",
      borderColor: filtroStatus === v ? "#FF6B2B" : "#2D2D44",
      background: filtroStatus === v ? "rgba(255,107,43,.1)" : "transparent",
      color: filtroStatus === v ? "#FF6B2B" : "#9B9BB4"
    }
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "16px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
      gap: 12
    }
  }, filtradas.slice(0, 100).map(e => {
    const acc = getAcc(e.rank);
    const nVer = (acc.decisors || []).length;
    const nSug = (acc.sugeridos || []).length;
    const pct = Math.min(100, nVer / 5 * 100);
    const borCls = nVer >= 5 ? "emp-card-5" : nVer > 0 ? "emp-card-1" : "emp-card-0";
    const g = getGrad(e.nome);
    const sc = e.score;
    return /*#__PURE__*/React.createElement("div", {
      key: e.rank,
      className: "emp-card " + borCls,
      onClick: () => setSelEmpresa(e)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: 8,
        background: `linear-gradient(135deg,${g[0]},${g[1]})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 500,
        color: "#fff",
        flexShrink: 0
      }
    }, ini(e.nome)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 500,
        color: "#F5F5F5",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, e.nome), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        padding: "1px 6px",
        borderRadius: 100,
        background: "#2D2D44",
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }, e.setor)), /*#__PURE__*/React.createElement("div", {
      className: "score-badge " + scoreCls(sc),
      style: {
        width: 30,
        height: 30,
        fontSize: 10,
        flexShrink: 0
      }
    }, sc)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontFamily: "IBM Plex Mono,monospace",
        color: "#9B9BB4",
        marginBottom: 4
      }
    }, nVer > 0 ? `✓ ${nVer} verificado${nVer > 1 ? "s" : ""}  ` : "", nSug > 0 ? `⟳ ${nSug} sugerido${nSug > 1 ? "s" : ""}` : nVer === 0 ? "sem decisores" : ""), /*#__PURE__*/React.createElement("div", {
      className: "cov-bar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cov-fill",
      style: {
        width: pct + "%",
        background: nVer >= 5 ? "#1D9E75" : nVer > 0 ? "#EF9F27" : "#E24B4A"
      }
    })), nVer === 0 && nSug === 0 && /*#__PURE__*/React.createElement("button", {
      className: "gh-btn-secondary",
      style: {
        width: "100%",
        marginTop: 8,
        fontSize: 9,
        padding: "5px 0",
        color: "#FF6B2B",
        borderColor: "rgba(255,107,43,.3)"
      },
      onClick: ev => {
        ev.stopPropagation();
        setSelEmpresa(e);
      }
    }, "+ Adicionar decisor"));
  }))));
}
var KA_COLS_V2 = [{
  id: "para_acionar",
  label: "Para Acionar",
  color: "#9B9BB4"
}, {
  id: "email",
  label: "Acionado — Email",
  color: "#60A5FA"
}, {
  id: "linkedin",
  label: "Acionado — LinkedIn",
  color: "#A78BFA"
}, {
  id: "whatsapp",
  label: "Acionado — WhatsApp",
  color: "#25D366"
}, {
  id: "respondeu",
  label: "Respondeu",
  color: "#EF9F27"
}, {
  id: "negociacao",
  label: "Em Negociação",
  color: "#1D9E75"
}, {
  id: "reuniao",
  label: "Reunião Agendada",
  color: "#FF6B2B"
}];
window.__addToKanbanV2 = null;
function KanbanAcionamentosV2({
  accs
}) {
  const [kanban, setKanban] = useState(() => lsGet("gh_kanban_v3", {}));
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterEmpresa, setFilterEmpresa] = useState("");
  const [moveModal, setMoveModal] = useState(null);
  const weekKey = useMemo(() => getWeekKey(weekOffset), [weekOffset]);
  const weekCards = useMemo(() => kanban[weekKey] || {}, [kanban, weekKey]);
  const totalAcionados = useMemo(() => {
    return KA_COLS_V2.filter(c => c.id !== "para_acionar").reduce((s, c) => s + (weekCards[c.id] || []).length, 0);
  }, [weekCards]);
  const META = lsGet("gh_config_v1", {}).meta_semanal || 50;
  const pct = Math.min(100, Math.round(totalAcionados / META * 100));
  const progressColor = totalAcionados >= META ? "#1D9E75" : totalAcionados >= 25 ? "#EF9F27" : "#E24B4A";
  const addCard = (nome, cargo, empresa, canal) => {
    const newCard = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      nome: nome || "",
      cargo: cargo || "",
      empresa: empresa || "",
      canal: canal || "para_acionar",
      addedAt: new Date().toLocaleDateString("pt-BR")
    };
    setKanban(prev => {
      const wk = {
        ...(prev[weekKey] || {})
      };
      const colId = KA_COLS_V2.find(c => c.id === canal) ? canal : "para_acionar";
      wk[colId] = [...(wk[colId] || []), newCard];
      const next = {
        ...prev,
        [weekKey]: wk
      };
      lsSet("gh_kanban_v3", next);
      return next;
    });
  };
  const moveCard = (card, fromCol, toCol) => {
    setKanban(prev => {
      const wk = {
        ...(prev[weekKey] || {})
      };
      wk[fromCol] = (wk[fromCol] || []).filter(c => c.id !== card.id);
      wk[toCol] = [...(wk[toCol] || []), {
        ...card,
        movedAt: new Date().toLocaleDateString("pt-BR")
      }];
      const next = {
        ...prev,
        [weekKey]: wk
      };
      lsSet("gh_kanban_v3", next);
      return next;
    });
    setMoveModal(null);
  };
  const removeCard = (card, colId) => {
    setKanban(prev => {
      const wk = {
        ...(prev[weekKey] || {})
      };
      wk[colId] = (wk[colId] || []).filter(c => c.id !== card.id);
      const next = {
        ...prev,
        [weekKey]: wk
      };
      lsSet("gh_kanban_v3", next);
      return next;
    });
    if (moveModal) setMoveModal(null);
  };
  const mountedRef = React.useRef(false);
  useEffect(() => {
    window.__addToKanbanV2 = addCard;
    return () => {
      if (window.__addToKanbanV2 === addCard) window.__addToKanbanV2 = null;
    };
  }, [weekKey]);
  const top3Naoacionadas = useMemo(() => {
    const acionadosNomes = new Set();
    KA_COLS_V2.forEach(c => (weekCards[c.id] || []).forEach(cd => acionadosNomes.add((cd.nome || "").toLowerCase())));
    const empresas = (typeof PROSP !== "undefined" ? PROSP : []).filter(e => e.setor);
    return empresas.map(e => ({
      ...e,
      score: calcularScore(e, accs, "galeria", [])
    })).filter(e => !acionadosNomes.has(e.nome.toLowerCase())).sort((a, b) => b.score - a.score).slice(0, 3);
  }, [weekCards, accs]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      background: "#0D0D0D"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "Cockpit matinal — ", new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  })), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-item-label"
  }, "Meta semanal"), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-item-val",
    style: {
      color: progressColor
    }
  }, totalAcionados, "/", META), /*#__PURE__*/React.createElement("div", {
    className: "ka-progress-bar",
    style: {
      marginTop: 4,
      height: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ka-progress-fill",
    style: {
      width: pct + "%",
      background: progressColor
    }
  }))), top3Naoacionadas.map((e, i) => /*#__PURE__*/React.createElement("div", {
    key: e.rank,
    className: "cockpit-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-item-label"
  }, "Prioridade #", i + 1), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: "#F5F5F5",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, e.nome), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-item-sub"
  }, e.setor, " · score ", e.score))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 20px 8px",
      borderBottom: ".5px solid #2D2D44",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: "#F5F5F5"
    }
  }, "📋 Acionamentos Semanais"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginLeft: "auto"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setWeekOffset(p => p - 1),
    style: {
      background: "none",
      border: ".5px solid #2D2D44",
      borderRadius: 4,
      padding: "3px 8px",
      color: "#9B9BB4",
      cursor: "pointer",
      fontSize: 13
    }
  }, "‹"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#F5F5F5",
      whiteSpace: "nowrap"
    }
  }, getWeekLabel(weekKey)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setWeekOffset(p => Math.min(0, p + 1)),
    disabled: weekOffset === 0,
    style: {
      background: "none",
      border: ".5px solid #2D2D44",
      borderRadius: 4,
      padding: "3px 8px",
      color: weekOffset === 0 ? "#2D2D44" : "#9B9BB4",
      cursor: weekOffset === 0 ? "default" : "pointer",
      fontSize: 13
    }
  }, "›")), /*#__PURE__*/React.createElement("input", {
    className: "gh-input",
    style: {
      width: 150,
      padding: "5px 10px",
      fontSize: 11
    },
    value: filterEmpresa,
    onChange: e => setFilterEmpresa(e.target.value),
    placeholder: "Filtrar empresa..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowX: "auto",
      padding: "12px 16px",
      overflowY: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
      minWidth: "max-content",
      paddingBottom: 16
    }
  }, KA_COLS_V2.map(col => {
    const cards = (weekCards[col.id] || []).filter(c => !filterEmpresa || (c.empresa || "").toLowerCase().includes(filterEmpresa.toLowerCase()));
    return /*#__PURE__*/React.createElement("div", {
      key: col.id,
      style: {
        width: 195,
        flexShrink: 0,
        background: "#1A1A2E",
        borderRadius: 10,
        padding: "10px 8px",
        border: ".5px solid #2D2D44"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "ka2-col-head",
      style: {
        color: col.color,
        borderBottomColor: col.color
      }
    }, /*#__PURE__*/React.createElement("span", null, col.label), /*#__PURE__*/React.createElement("span", {
      style: {
        background: "rgba(255,255,255,.05)",
        padding: "1px 7px",
        borderRadius: 100,
        fontSize: 10
      }
    }, cards.length)), cards.map((card, i) => /*#__PURE__*/React.createElement("div", {
      key: card.id || i,
      className: "ka-card",
      onClick: () => setMoveModal({
        card,
        col: col.id
      })
    }, /*#__PURE__*/React.createElement("div", {
      className: "ka-card-name"
    }, card.nome || "Sem nome"), card.cargo && /*#__PURE__*/React.createElement("div", {
      className: "ka-card-cargo"
    }, card.cargo), /*#__PURE__*/React.createElement("div", {
      className: "ka-card-meta"
    }, card.empresa && /*#__PURE__*/React.createElement("span", {
      style: {
        background: "#2D2D44",
        padding: "1px 5px",
        borderRadius: 3,
        fontSize: 8,
        color: "#9B9BB4"
      }
    }, card.empresa), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#2D2D44",
        fontSize: 8
      }
    }, card.addedAt)))), col.id === "para_acionar" && cards.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#2D2D44",
        fontFamily: "IBM Plex Mono,monospace",
        padding: "8px 4px",
        textAlign: "center"
      }
    }, "Adicione via Figurinhas ou Alertas"));
  }))), moveModal && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod",
    style: {
      maxWidth: 360
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: "#F5F5F5",
      marginBottom: 4
    }
  }, moveModal.card.nome), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      marginBottom: 14
    }
  }, moveModal.card.empresa), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 1
    }
  }, "Mover para:"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5,
      marginBottom: 12
    }
  }, KA_COLS_V2.filter(c => c.id !== moveModal.col).map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    onClick: () => moveCard(moveModal.card, moveModal.col, c.id),
    style: {
      padding: "9px 14px",
      borderRadius: 6,
      border: ".5px solid #2D2D44",
      background: "#1A1A2E",
      color: c.color,
      fontSize: 11,
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "IBM Plex Mono,monospace",
      transition: "border-color .15s"
    }
  }, "→ ", c.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-ghost",
    style: {
      flex: 1
    },
    onClick: () => setMoveModal(null)
  }, "Fechar"), /*#__PURE__*/React.createElement("button", {
    style: {
      flex: 1,
      padding: "8px",
      borderRadius: 6,
      border: ".5px solid #E24B4A",
      background: "rgba(226,75,74,.08)",
      color: "#E24B4A",
      cursor: "pointer",
      fontSize: 11
    },
    onClick: () => removeCard(moveModal.card, moveModal.col)
  }, "Remover")))));
}
function AlertasCMOV2({
  onAbordagem
}) {
  const [alertas, setAlertas] = useState(() => lsGet("gh_alertas_v2", []));
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [naoLidos, setNaoLidos] = useState(0);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const alertasHoje = alertas.filter(a => a.date === hoje);
  const jaAtualizouHoje = alertasHoje.length > 0;
  useEffect(() => {
    setNaoLidos(alertas.filter(a => !a.lido).length);
    if (window.__setAlertaBadge) window.__setAlertaBadge(alertas.filter(a => !a.lido).length);
  }, [alertas]);
  const mountedRef = React.useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const updated = alertas.map(a => ({
      ...a,
      lido: true
    }));
    setAlertas(updated);
    lsSet("gh_alertas_v2", updated);
  }, []);
  const atualizar = async () => {
    if (!getClaudeKey()) {
      alert("⚠ Configure a Claude API Key em ⚙ Configurações para buscar alertas.");
      return;
    }
    setLoading(true);
    const prompt = `Busque nos últimos 7 dias notícias sobre executivos que assumiram novos cargos de marketing ou comercial em empresas brasileiras.
Fontes prioritárias: propmark.com.br, meioemensagem.com.br, valor.globo.com, gkpb.com.br, coletiva.net, exame.com.
Para cada pessoa encontrada retorne SOMENTE este JSON array:
[{"nome":"","cargo":"","empresa":"","fonte":"","url_noticia":"","linkedin":null,"data_aproximada":""}]
Retorne apenas o JSON, sem texto adicional.`;
    const txt = await claudeSearch(prompt, 2000);
    const lista = parseJSON(txt);
    if (lista && Array.isArray(lista) && lista.length > 0) {
      const existentes = new Set(alertas.map(a => (a.nome + "|" + a.empresa).toLowerCase()));
      const novos = lista.filter(a => {
        const k = ((a.nome || "") + "|" + (a.empresa || "")).toLowerCase();
        return !existentes.has(k);
      }).map(a => ({
        ...a,
        date: hoje,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        lido: false
      }));
      const updated = [...novos, ...alertas].slice(0, 150);
      setAlertas(updated);
      lsSet("gh_alertas_v2", updated);
    } else {
      alert("Não foi possível buscar agora. Tente novamente.");
    }
    setLoading(false);
  };
  const addToKanban = alerta => {
    if (window.__addToKanbanV2) {
      window.__addToKanbanV2(alerta.nome, alerta.cargo, alerta.empresa, "para_acionar");
      alert((alerta.nome || "Lead") + " adicionado ao Kanban ✓");
    } else {
      const wk = getWeekKey(0);
      const stored = lsGet("gh_kanban_v3", {});
      const semana = {
        ...(stored[wk] || {})
      };
      const card = {
        id: Date.now().toString(36),
        nome: alerta.nome || "",
        cargo: alerta.cargo || "",
        empresa: alerta.empresa || "",
        canal: "para_acionar",
        addedAt: hoje,
        badge: "Novo CMO 🔥"
      };
      semana["para_acionar"] = [...(semana["para_acionar"] || []), card];
      lsSet("gh_kanban_v3", {
        ...stored,
        [wk]: semana
      });
      alert((alerta.nome || "Lead") + " adicionado ao Kanban ✓ (abra Acionamentos para ver)");
    }
  };
  const dispensar = alertaId => {
    const updated = alertas.filter(a => a.id !== alertaId);
    setAlertas(updated);
    lsSet("gh_alertas_v2", updated);
  };
  const byDate = useMemo(() => {
    const groups = {};
    alertas.forEach(a => {
      if (!groups[a.date]) groups[a.date] = [];
      groups[a.date].push(a);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [alertas]);
  const sourceColors = {
    "propmark.com.br": "#FF6B2B",
    "meioemensagem.com.br": "#A78BFA",
    "exame.com": "#60A5FA",
    "gkpb.com.br": "#1D9E75",
    "coletiva.net": "#F472B6",
    "valor.globo.com": "#EF9F27"
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "alert-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "alert-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 500,
      color: "#F5F5F5"
    }
  }, "🔔 Movimentações de Marketing"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      marginTop: 2
    }
  }, "Executivos que assumiram novos cargos no Brasil")), /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-primary",
    style: {
      marginLeft: "auto",
      flexShrink: 0
    },
    onClick: atualizar,
    disabled: loading
  }, loading ? "Buscando..." : "↺ Atualizar alertas")), !jaAtualizouHoje && !loading && alertas.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "12px 20px 0",
      padding: "10px 14px",
      background: "rgba(239,159,39,.06)",
      border: ".5px solid #EF9F27",
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12
    }
  }, "⏰"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "#EF9F27",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "Alertas não atualizados hoje."), /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-secondary",
    style: {
      marginLeft: "auto",
      fontSize: 10,
      padding: "4px 10px"
    },
    onClick: atualizar
  }, "Buscar agora")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "16px 20px"
    }
  }, loading && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16,
      padding: "10px 14px",
      background: "#1A1A2E",
      borderRadius: 8,
      border: ".5px solid #2D2D44"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lfill",
    style: {
      background: "#FF6B2B"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginTop: 4
    }
  }, "Buscando movimentações recentes...")), byDate.map(([date, items]) => /*#__PURE__*/React.createElement("div", {
    key: date,
    className: "alert-date-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "alert-date-label",
    style: {
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 6
    },
    onClick: () => setCollapsed(p => ({
      ...p,
      [date]: !p[date]
    }))
  }, date, date === hoje && /*#__PURE__*/React.createElement("span", {
    className: "alert-today-badge"
  }, "HOJE"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      color: "#9B9BB4",
      fontSize: 10
    }
  }, collapsed[date] ? `▶ ${items.length} alertas` : "▼")), !collapsed[date] && items.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    className: "alert-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "alert-name"
  }, a.nome), /*#__PURE__*/React.createElement("div", {
    className: "alert-cargo"
  }, a.cargo), /*#__PURE__*/React.createElement("div", {
    className: "alert-empresa"
  }, "🏢 ", a.empresa, a.empresaAnterior && ` ← ${a.empresaAnterior}`), /*#__PURE__*/React.createElement("div", {
    className: "alert-source"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: sourceColors[a.fonte] || "#9B9BB4",
      fontWeight: 500
    }
  }, a.fonte || "Fonte desconhecida"), a.url_noticia && /*#__PURE__*/React.createElement("a", {
    href: a.url_noticia,
    target: "_blank",
    rel: "noreferrer",
    style: {
      color: "#60A5FA",
      fontSize: 9
    }
  }, "↗ ver notícia")), /*#__PURE__*/React.createElement("div", {
    className: "alert-actions"
  }, a.linkedin && /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-ghost",
    style: {
      fontSize: 9,
      padding: "4px 10px"
    },
    onClick: () => window.open(a.linkedin.startsWith("http") ? a.linkedin : "https://" + a.linkedin, "_blank")
  }, "in LinkedIn"), /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-primary",
    style: {
      fontSize: 9,
      padding: "5px 12px"
    },
    onClick: () => addToKanban(a)
  }, "+ Kanban"), /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-secondary",
    style: {
      fontSize: 9,
      padding: "5px 12px"
    },
    onClick: () => onAbordagem && onAbordagem({
      nome: a.nome,
      cargo: a.cargo
    }, a.empresa, "")
  }, "✉ Abordagem"), /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-ghost",
    style: {
      fontSize: 9,
      padding: "5px 10px"
    },
    onClick: () => dispensar(a.id)
  }, "Dispensar")))))), alertas.length === 0 && !loading && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 60,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 36,
      marginBottom: 12
    }
  }, "🔔"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13
    }
  }, "Clique em \"Atualizar alertas\" para buscar movimentações"))));
}
function LLMBoxV2({
  accs,
  curGrupo
}) {
  const [history, setHistory] = useState(() => lsGet("gh_llmbox_v2", []));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const histRef = React.useRef(null);
  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [history]);
  const CHIPS = ["Quais concorrências estão abertas na Holding?", "Quem está em negociação e qual o valor?", "Resumo do pipeline GAIA — CR.IA e BrandSync", "Quais clientes ativos e seus valores?", "Quem está em Contato Direto na Holding?", "Próximas ações prioritárias no comercial", "Qual o valor total do pipeline da Holding?", "Quais oportunidades estão paradas há mais tempo?"];
  const buildCtx = () => {
    // ── Kanban GAIA + Holding ──────────────────────────────────
    const kbRaw = lsGet("gh_kanban_v3", {});
    const kbTabs = kbRaw.tabs || KB_DEFAULT_TABS || [];
    const gaiaTab = kbTabs.find(t => t.id === 'gaia') || KB_DEFAULT_TABS.find(t => t.id === 'gaia');
    const holdingTab = kbTabs.find(t => t.id === 'holding') || KB_DEFAULT_TABS.find(t => t.id === 'holding');
    const colLabel = (tab, colId) => (tab?.cols || []).find(c => c.id === colId)?.label || colId;
    const mapCards = tab => (tab?.cards || []).map(c => ({
      nome: c.name,
      coluna: colLabel(tab, c.col),
      etapa: c.col,
      produto: c.product || null,
      empresa_galeria: c.galeria || null,
      valor: c.value || 0,
      tag: c.tag || null,
      nota: c.note || null
    }));
    const gaia_pipeline = mapCards(gaiaTab);
    const holding_pipeline = mapCards(holdingTab);

    // ── Pipeline summaries ─────────────────────────────────────
    const holdingPorEtapa = {};
    (holdingTab?.cols || []).forEach(col => {
      const cards = holding_pipeline.filter(c => c.etapa === col.id);
      holdingPorEtapa[col.label] = {
        quantidade: cards.length,
        valor_total: cards.reduce((s, c) => s + (c.valor || 0), 0),
        empresas: cards.map(c => c.nome + (c.empresa_galeria ? ' (' + c.empresa_galeria + ')' : ''))
      };
    });
    const gaiaPorEtapa = {};
    (gaiaTab?.cols || []).forEach(col => {
      const cards = gaia_pipeline.filter(c => c.etapa === col.id);
      gaiaPorEtapa[col.label] = {
        quantidade: cards.length,
        produtos: [...new Set(cards.map(c => c.produto).filter(Boolean))],
        clientes: cards.map(c => c.nome)
      };
    });

    // ── Pipeline totais ────────────────────────────────────────
    const holding_total_pipeline = holding_pipeline.filter(c => !['clienteativo'].includes(c.etapa)).reduce((s, c) => s + c.valor, 0);
    const holding_clientes_ativos = holding_pipeline.filter(c => c.etapa === 'clienteativo');
    const holding_concorrencias = holding_pipeline.filter(c => c.etapa === 'concorrencia');
    const holding_negociando = holding_pipeline.filter(c => c.etapa === 'negociacao');
    const gaia_clientes_ativos = gaia_pipeline.filter(c => c.etapa === 'clientes');
    const gaia_em_negociacao = gaia_pipeline.filter(c => ['reuniao', 'proposta', 'aguardando'].includes(c.etapa));

    // ── Acionamentos semanais ──────────────────────────────────
    const kanbanAcData = lsGet("gh_kanban_v3", {});
    const wk = getWeekKey(0);
    const semanaAtual = kanbanAcData[wk] || {};

    // ── Alertas CMO ────────────────────────────────────────────
    const alertas = lsGet("gh_alertas_v2", []).slice(0, 15);
    const ctx = {
      // Contexto geral
      empresa_do_grupo: curGrupo?.name || "Galeria",
      data_hoje: new Date().toLocaleDateString("pt-BR"),
      // GAIA — CR.IA & BrandSync
      gaia: {
        resumo: {
          clientes_ativos: gaia_clientes_ativos.length,
          em_negociacao: gaia_em_negociacao.length,
          total_cards: gaia_pipeline.length
        },
        por_etapa: gaiaPorEtapa,
        todos_os_cards: gaia_pipeline
      },
      // Pipeline Holding
      holding: {
        resumo: {
          total_oportunidades: holding_pipeline.length,
          clientes_ativos: holding_clientes_ativos.length,
          em_concorrencia: holding_concorrencias.length,
          em_negociacao: holding_negociando.length,
          valor_pipeline_ativo: holding_total_pipeline
        },
        por_etapa: holdingPorEtapa,
        concorrencias_detalhes: holding_concorrencias.map(c => ({
          nome: c.nome,
          empresa_galeria: c.empresa_galeria,
          nota: c.nota
        })),
        negociando_detalhes: holding_negociando.map(c => ({
          nome: c.nome,
          valor: c.valor,
          empresa_galeria: c.empresa_galeria,
          nota: c.nota
        })),
        clientes_ativos_detalhes: holding_clientes_ativos.map(c => ({
          nome: c.nome,
          valor: c.valor,
          empresa_galeria: c.empresa_galeria
        }))
      },
      // Acionamentos desta semana (Kanban de acionamentos)
      acionamentos_semana: semanaAtual,
      // Alertas de movimentação de CMOs
      alertas_cmo_recentes: alertas.map(a => ({
        nome: a.nome,
        cargo: a.cargo,
        empresa: a.empresa,
        data: a.date
      }))
    };
    return JSON.stringify(ctx, null, 0).slice(0, 12000);
  };
  const perguntar = async q => {
    const question = (q || input).trim();
    if (!question || loading) return;
    if (!getClaudeKey()) {
      const entry = {
        q: question,
        a: "⚠ Claude API Key não configurada. Clique em ⚙ Configurações e insira sua chave sk-ant-...",
        ts: ""
      };
      const newH = [...history.slice(-9), entry];
      setHistory(newH);
      lsSet("gh_llmbox_v2", newH);
      return;
    }
    setLoading(true);
    setInput("");
    const needsWeb = /hoje|recente|novo|noticia|mercado|moviment|atual|lancou|lançou/i.test(question);
    const ctx = buildCtx();
    const prompt = `Você é o assistente comercial da Galeria Holding — especialista em análise de pipeline de vendas e oportunidades.

DADOS DO SISTEMA (JSON completo com pipeline GAIA e Holding):
${ctx}

INSTRUÇÕES:
- Responda em português, de forma direta e acionável
- Use os dados do JSON acima — especialmente gaia.por_etapa e holding.por_etapa
- Para perguntas sobre pipeline: mostre valores, etapas, empresas Galeria responsáveis
- Para concorrências: destaque urgência e empresa Galeria envolvida
- Formate com tabelas quando houver múltiplos itens
- Se algum dado não existir no JSON, diga claramente
${needsWeb ? "- Se precisar de contexto de mercado externo, use web_search" : ""}

PERGUNTA: ${question}`;
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getClaudeKey(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const d = await r.json();
      let answer;
      if (d.error) {
        answer = "❌ Erro da API: " + d.error.type + " — " + d.error.message + (d.error.type === 'authentication_error' ? "\n\n👉 Verifique sua Claude API Key em ⚙ Configurações." : "");
      } else {
        answer = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") || "Sem resposta da API. Tente novamente.";
      }
      const usouWeb = needsWeb && (d.content || []).some(b => b.type === "tool_use");
      const entry = {
        q: question,
        a: answer + (usouWeb ? "\n\n🌐 Complementado com busca em tempo real" : ""),
        ts: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit"
        })
      };
      const newH = [...history.slice(-9), entry];
      setHistory(newH);
      lsSet("gh_llmbox_v2", newH);
    } catch (e) {
      const errMsg = e.name === 'AbortError' ? "⏱ Timeout — a requisição demorou mais de 30s. Tente uma pergunta mais curta." : "❌ Erro de conexão: " + e.message + ". Verifique sua API key em ⚙ Configurações.";
      const entry = {
        q: question,
        a: errMsg,
        ts: ""
      };
      const newH = [...history.slice(-9), entry];
      setHistory(newH);
      lsSet("gh_llmbox_v2", newH);
    }
    setLoading(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "llm-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 20px",
      borderBottom: ".5px solid #2D2D44",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 500,
      color: "#F5F5F5"
    }
  }, "🤖 Assistente Comercial"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      marginTop: 2
    }
  }, "Consulte seus dados com linguagem natural — ", curGrupo?.name)), /*#__PURE__*/React.createElement("div", {
    className: "llm-history",
    ref: histRef
  }, history.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 60,
      color: "#9B9BB4",
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
      color: "#2D2D44",
      marginTop: 4,
      textAlign: "right"
    }
  }, item.ts))), loading && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      background: "#1A1A2E",
      borderRadius: 8,
      border: ".5px solid #2D2D44"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lfill",
    style: {
      background: "#FF6B2B"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
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
    className: "gh-btn-primary",
    onClick: () => perguntar(),
    disabled: loading || !input.trim()
  }, loading ? "..." : "Perguntar")));
}
function fitScore(lead, grupo) {
  if (!lead || !grupo || typeof grupo.fit !== "function") return 0;
  const f = grupo.fit(lead.setor || "");
  const base = f === "alto" ? 100 : f === "medio" ? 60 : 20;
  const boost = lead.rank <= 50 ? 30 : lead.rank <= 100 ? 20 : lead.rank <= 200 ? 10 : 0;
  const res = checkRestrictions(lead, grupo.id);
  return base + boost + (res.length > 0 ? -50 : 0);
}
function getTop50(grupo) {
  if (!grupo || !grupo.id || typeof grupo.fit !== "function") return [];
  return (typeof PROSP !== "undefined" ? PROSP : []).filter(l => l && l.nome && l.setor).map(l => ({
    ...l,
    score: fitScore(l, grupo)
  })).sort((a, b) => b.score - a.score).slice(0, 50);
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function nowStr() {
  return new Date().toLocaleString("pt-BR");
}
// sharedGet/Set e personalGet/Set agora vêm de gh-store.js (carregado antes)

function AprovacaoHoje() {
  const [itens, setItens] = useState(null);
  const [busy, setBusy] = useState({});
  useEffect(() => {
    (async () => {
      const fn = window.__filaHoje;
      if (fn) { const data = await fn(); setItens(data); }
      else setItens([]);
    })();
  }, []);
  const aprovar = async (id) => {
    setBusy(p => ({ ...p, [id]: 'ok' }));
    await (window.__filaAprovar || (async () => {}))(id);
    setItens(p => p.filter(x => x.id !== id));
  };
  const descartar = async (id) => {
    setBusy(p => ({ ...p, [id]: 'skip' }));
    await (window.__filaDescartar || (async () => {}))(id);
    setItens(p => p.filter(x => x.id !== id));
  };
  const s = { fontFamily: "'IBM Plex Mono',monospace" };
  if (itens === null) return /*#__PURE__*/React.createElement("div", { style: { flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#2D2D44",...s,fontSize:10 } }, "Carregando fila...");
  if (itens.length === 0) return /*#__PURE__*/React.createElement("div", { style: { flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,opacity:.3 } },
    /*#__PURE__*/React.createElement("div", { style: { fontSize:36 } }, "✅"),
    /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:11,color:"#F5F5F5" } }, "Nada para aprovar hoje")
  );
  return /*#__PURE__*/React.createElement("div", { style: { flex:1,overflow:"hidden",display:"flex",flexDirection:"column" } },
    /*#__PURE__*/React.createElement("div", { style: { padding:"14px 20px 10px",borderBottom:".5px solid #2D2D44",display:"flex",alignItems:"center",gap:10,flexShrink:0 } },
      /*#__PURE__*/React.createElement("div", { style: { fontSize:15,fontWeight:500,color:"#F5F5F5",letterSpacing:"-.3px" } }, "Aprovar hoje"),
      /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:10,padding:"2px 9px",borderRadius:100,background:"rgba(255,107,43,.1)",color:"#FF6B2B",border:".5px solid rgba(255,107,43,.3)" } }, itens.length)
    ),
    /*#__PURE__*/React.createElement("div", { style: { flex:1,overflowY:"auto",padding:"14px 20px" } },
      itens.map(item => /*#__PURE__*/React.createElement("div", { key:item.id, style: { background:"#1A1A2E",border:".5px solid #2D2D44",borderRadius:10,padding:14,marginBottom:10,display:"flex",alignItems:"flex-start",gap:12 } },
        /*#__PURE__*/React.createElement("div", { style: { flex:1 } },
          /*#__PURE__*/React.createElement("div", { style: { fontSize:12,fontWeight:600,color:"#F5F5F5",marginBottom:3 } }, item.empresa_nome),
          item.decisor_nome && /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:10,color:"#FF6B2B",marginBottom:3 } }, item.decisor_nome, item.decisor_email ? " · " + item.decisor_email : ""),
          /*#__PURE__*/React.createElement("div", { style: { display:"flex",gap:6,flexWrap:"wrap",marginTop:4 } },
            item.canal && /*#__PURE__*/React.createElement("span", { style: { ...s,fontSize:8,padding:"2px 7px",borderRadius:100,background:"rgba(96,165,250,.1)",color:"#60A5FA",border:".5px solid rgba(96,165,250,.2)" } }, item.canal),
            item.data_sugerida && /*#__PURE__*/React.createElement("span", { style: { ...s,fontSize:8,color:"#9B9BB4" } }, item.data_sugerida),
            item.fonte && /*#__PURE__*/React.createElement("span", { style: { ...s,fontSize:8,color:"#2D2D44" } }, item.fonte)
          ),
          item.nota && /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:10,color:"#9B9BB4",marginTop:6,borderLeft:"2px solid #2D2D44",paddingLeft:7,lineHeight:1.6 } }, item.nota)
        ),
        /*#__PURE__*/React.createElement("div", { style: { display:"flex",flexDirection:"column",gap:5,flexShrink:0 } },
          /*#__PURE__*/React.createElement("button", { className:"gh-btn-primary", style:{ padding:"5px 14px",fontSize:11 }, onClick:()=>aprovar(item.id), disabled:!!busy[item.id] }, "✓ Aprovar"),
          /*#__PURE__*/React.createElement("button", { className:"gh-btn-ghost", style:{ padding:"5px 14px",fontSize:11 }, onClick:()=>descartar(item.id), disabled:!!busy[item.id] }, "✗ Pular")
        )
      ))
    )
  );
}
async function logActivity(curUser, empresa, grupoName, tipo, tipoLabel, decisor, nota) {
  const entry = {
    id: uid(),
    isoDate: today(),
    time: new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    }),
    userId: curUser ? curUser.id : "pedro",
    userName: curUser ? curUser.name : "Pedro Ica",
    empresa,
    grupoName,
    tipo,
    tipoLabel,
    decisor: decisor || "",
    nota: nota || ""
  };
  const log = (await sharedGet("activities_log")) || [];
  log.push(entry);
  if (log.length > 3000) log.splice(0, log.length - 3000);
  await sharedSet("activities_log", log);
  return entry;
}
function AvatarIA({
  nome,
  size
}) {
  const ini = initials(nome || "?");
  const s = size || 64;
  const grads = [["#E8C97A", "#C9A87C"], ["#A78BFA", "#7C3AED"], ["#34D399", "#059669"], ["#60A5FA", "#2563EB"], ["#F472B6", "#DB2777"], ["#FB923C", "#EA580C"], ["#7EB8D4", "#0369A1"], ["#00FF94", "#00C570"]];
  const g = grads[(nome || "A").charCodeAt(0) % grads.length];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: s,
      height: s,
      borderRadius: "50%",
      flexShrink: 0,
      background: "linear-gradient(135deg," + g[0] + "," + g[1] + ")",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.round(s * .32),
      fontWeight: 800,
      color: "#fff",
      fontFamily: "Syne,sans-serif",
      letterSpacing: -1,
      boxShadow: "0 4px 14px rgba(0,0,0,.4)"
    }
  }, ini);
}
function SmartBatch({
  grupo,
  accs,
  pdKey,
  onActivitySaved
}) {
  const [sel, setSel] = useState({});
  const [emailModal, setEmailModal] = useState(null);
  const [queue, setQueue] = useState([]);
  const [sentCount, setSentCount] = useState(0);
  const today3 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const candidates = useMemo(() => {
    if (!grupo || !grupo.id) return [];
    return getTop50(grupo).filter(l => l && l.nome && checkRestrictions(l, grupo.id).length === 0).map(l => {
      const k = grupo.id + "_" + l.rank;
      const a2 = accs[k] || {};
      const acts = a2.activities || [];
      const lastE = acts.filter(a => a.type === "email").slice(-1)[0];
      let lastISO = "";
      if (lastE && lastE.date) {
        const p = lastE.date.split("/");
        if (p.length === 3) lastISO = p[2] + "-" + p[1] + "-" + p[0];
      }
      const contacted = new Set(acts.map(a => a.decisor).filter(Boolean));
      const decs = a2.decisors || [];
      const nextDec = decs.find(d => !contacted.has(d.nome)) || decs[0] || null;
      return {
        ...l,
        lastEmailDate: lastE ? lastE.date : null,
        lastTema: lastE ? lastE.note || "" : "",
        contactedRecently: lastISO > today3,
        nextDec,
        ndecs: decs.length
      };
    }).filter(l => !l.contactedRecently).slice(0, 80);
  }, [grupo, accs]);
  const nSel = Object.values(sel).filter(Boolean).length;
  const autoSelect = () => {
    const sectors = {};
    const chosen = {};
    let count = 0;
    for (const l of candidates) {
      if (count >= 50) break;
      const sec = l.setor || "other";
      if (!sectors[sec]) sectors[sec] = 0;
      if (sectors[sec] >= 6) continue;
      chosen[l.rank] = true;
      sectors[sec]++;
      count++;
    }
    setSel(chosen);
  };
  const openQueue = () => {
    const sl = candidates.filter(l => sel[l.rank]);
    setQueue(sl);
    if (sl.length > 0) setEmailModal(sl[0]);
  };
  const advance = lead => {
    setSentCount(n => n + 1);
    if (onActivitySaved) onActivitySaved(lead.nome, "email", "✉ Email", lead.nextDec ? lead.nextDec.nome : "", "Lote");
    const rem = queue.filter(l => l.rank !== lead.rank);
    if (rem.length > 0) {
      setQueue(rem);
      setEmailModal(rem[0]);
    } else {
      setEmailModal(null);
      setQueue([]);
    }
  };
  const gc = grupo ? grupo.color : "#E8C97A";
  const gr = grupo ? grupo.rgb : "232,201,122";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "28px 32px",
      overflowY: "auto",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 20,
      flexWrap: "wrap",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      fontFamily: "Syne,sans-serif",
      letterSpacing: -1
    }
  }, "✉ Disparo Inteligente — 50/dia"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#555",
      fontFamily: "DM Mono,monospace",
      marginTop: 4
    }
  }, "Máx 6/setor · Anti-duplicata 3 dias · Prioriza decisores não contatados")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: autoSelect
  }, "⚡ Selecionar 50"), nSel > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: gc,
      color: "#000"
    },
    onClick: openQueue
  }, "✉ Disparar ", nSel))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 10,
      marginBottom: 20
    }
  }, [["SELECIONADOS", nSel, gc], ["DISPONÍVEIS", candidates.length, "#eee"], ["ENVIADOS HOJE", sentCount, "#34D399"], ["TOTAL BASE", PROSP.length, "#60A5FA"]].map(([l, v, col]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      background: "#0e0e0e",
      border: "1px solid #1a1a1a",
      borderRadius: 8,
      padding: 16,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#444",
      letterSpacing: 1,
      marginBottom: 6
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      color: col,
      fontFamily: "Syne,sans-serif"
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, candidates.slice(0, 60).map(l => {
    const isSel = !!sel[l.rank];
    const fit = grupo ? grupo.fit(l.setor || "") : "medio";
    const fc = fitColor(fit);
    return /*#__PURE__*/React.createElement("div", {
      key: l.rank,
      onClick: () => setSel(s => ({
        ...s,
        [l.rank]: !s[l.rank]
      })),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        cursor: "pointer",
        background: isSel ? "rgba(" + gr + ",.06)" : "#0e0e0e",
        border: "1px solid " + (isSel ? "rgba(" + gr + ",.3)" : "#1a1a1a"),
        borderRadius: 7,
        transition: "all .15s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 20,
        height: 20,
        borderRadius: 4,
        flexShrink: 0,
        border: "2px solid " + (isSel ? gc : "#2a2a2a"),
        background: isSel ? gc : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: "#000"
      }
    }, isSel && "✓"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 7,
        flexWrap: "wrap"
      }
    }, "#", l.rank, " ", l.nome, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontFamily: "DM Mono,monospace",
        padding: "1px 6px",
        borderRadius: 100,
        background: "rgba(" + hexRgb(fc) + ",.1)",
        color: fc,
        border: "1px solid rgba(" + hexRgb(fc) + ",.25)"
      }
    }, fitLabel(fit))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#555",
        fontFamily: "DM Mono,monospace",
        marginTop: 2
      }
    }, l.setor, l.lastEmailDate ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#444"
      }
    }, " · ", l.lastEmailDate, l.lastTema ? " — " + String(l.lastTema).slice(0, 28) : "") : /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#34D399"
      }
    }, " · nunca contatado")), l.nextDec && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: gc,
        fontFamily: "DM Mono,monospace",
        marginTop: 2
      }
    }, "→ ", l.nextDec.nome, " · ", l.nextDec.cargo)), /*#__PURE__*/React.createElement("button", {
      className: "btn btno btnsm",
      onClick: e => {
        e.stopPropagation();
        setEmailModal(l);
      },
      style: {
        flexShrink: 0
      }
    }, "✉"));
  })), emailModal && grupo && /*#__PURE__*/React.createElement(EmailModal, {
    dc: emailModal.nextDec || null,
    empresa: emailModal.nome,
    setor: emailModal.setor || "",
    grupo: grupo,
    angulo: grupo.angles[0],
    hist: "",
    restrictions: checkRestrictions(emailModal, grupo.id),
    onClose: () => advance(emailModal)
  }));
}
function ColdCallView({
  grupo,
  accs,
  onActivitySaved
}) {
  const [done, setDone] = useState({});
  const [noteMap, setNoteMap] = useState({});
  const dateStr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
  const callList = useMemo(() => {
    if (!grupo || !grupo.id) return [];
    return getTop50(grupo).filter(l => l && l.nome && checkRestrictions(l, grupo.id).length === 0).map(l => {
      const a2 = accs[grupo.id + "_" + l.rank] || {};
      const lastC = (a2.activities || []).filter(a => a.type === "call").slice(-1)[0];
      let ds = 999;
      if (lastC && lastC.date) {
        const p = lastC.date.split("/");
        if (p.length === 3) {
          const d = new Date(p[2], p[1] - 1, p[0]);
          ds = Math.floor((Date.now() - d.getTime()) / 86400000);
        }
      }
      return {
        ...l,
        daysSince: ds,
        ndecs: (a2.decisors || []).length
      };
    }).sort((a, b) => b.daysSince - a.daysSince).slice(0, 15);
  }, [grupo, accs]);
  const gc = grupo ? grupo.color : "#E8C97A";
  const todayDone = Object.values(done).filter(Boolean).length;
  const logCall = async (lead, tipo) => {
    setDone(d => ({
      ...d,
      [lead.rank]: tipo
    }));
    if (onActivitySaved) await onActivitySaved(lead.nome, tipo, tipo === "call" ? "📞 Cold Call" : "✉ Email", "", noteMap[lead.rank] || "");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "28px 32px",
      overflowY: "auto",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      fontFamily: "Syne,sans-serif",
      letterSpacing: -1
    }
  }, "📞 Cold Calls — Hoje"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#555",
      fontFamily: "DM Mono,monospace",
      marginTop: 4,
      textTransform: "capitalize"
    }
  }, dateStr, " · ", grupo ? grupo.name : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 10,
      marginBottom: 20
    }
  }, [["FEITOS", todayDone, gc], ["LISTA", callList.length, "#eee"], ["RESTAM", Math.max(0, callList.length - todayDone), "#FFB547"]].map(([l, v, col]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      background: "#0e0e0e",
      border: "1px solid #1a1a1a",
      borderRadius: 8,
      padding: 16,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#444",
      letterSpacing: 1,
      marginBottom: 6
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 800,
      color: col,
      fontFamily: "Syne,sans-serif"
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, callList.map(l => {
    const isDone = !!done[l.rank];
    const dotC = isDone ? "#34D399" : l.daysSince < 3 ? "#FF4757" : l.daysSince < 7 ? "#FFB547" : "#2a2a2a";
    return /*#__PURE__*/React.createElement("div", {
      key: l.rank,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: isDone ? "rgba(52,211,153,.04)" : "#0e0e0e",
        border: "1px solid " + (isDone ? "rgba(52,211,153,.25)" : "#1a1a1a"),
        borderRadius: 8,
        opacity: isDone ? .65 : 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: dotC,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 7
      }
    }, l.nome, l.ndecs > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: "#4B9EFF",
        border: "1px solid rgba(75,158,255,.3)",
        padding: "1px 6px",
        borderRadius: 100,
        fontFamily: "DM Mono,monospace"
      }
    }, l.ndecs, " dec.")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#555",
        fontFamily: "DM Mono,monospace",
        marginTop: 2
      }
    }, l.setor, " · #", l.rank, " · ", l.daysSince === 999 ? "nunca contatado" : l.daysSince === 0 ? "hoje" : "há " + l.daysSince + " dias"), !isDone && /*#__PURE__*/React.createElement("input", {
      placeholder: "Nota rápida...",
      value: noteMap[l.rank] || "",
      onChange: e => setNoteMap(n => ({
        ...n,
        [l.rank]: e.target.value
      })),
      style: {
        marginTop: 6,
        width: "100%",
        maxWidth: 280,
        background: "#060606",
        border: "1px solid #1e1e1e",
        borderRadius: 4,
        padding: "4px 8px",
        color: "#eee",
        fontSize: 10,
        fontFamily: "DM Mono,monospace",
        outline: "none"
      }
    })), !isDone ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 6,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => logCall(l, "call"),
      style: {
        padding: "7px 14px",
        borderRadius: 5,
        border: "none",
        background: gc,
        color: "#000",
        fontWeight: 700,
        fontSize: 11,
        cursor: "pointer"
      }
    }, "📞 Ligar"), /*#__PURE__*/React.createElement("button", {
      onClick: () => logCall(l, "email"),
      style: {
        padding: "7px 12px",
        borderRadius: 5,
        border: "1px solid #1e1e1e",
        background: "transparent",
        color: "#aaa",
        fontSize: 11,
        cursor: "pointer"
      }
    }, "✉")) : /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#34D399",
        fontFamily: "DM Mono,monospace",
        flexShrink: 0
      }
    }, "✓ ", done[l.rank] === "call" ? "ligado" : "enviado"));
  })));
}
function HoldingView() {
  const [sel, setSel] = useState(null);
  const RESTR = typeof RESTRICTIONS !== "undefined" ? RESTRICTIONS : [];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "28px 32px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: "-1px",
      fontFamily: "Syne,sans-serif"
    }
  }, "Galeria Holding"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#555",
      fontFamily: "DM Mono,monospace",
      marginTop: 5
    }
  }, "Todas as empresas — clique para ver conflitos de cliente")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))",
      gap: 12
    }
  }, GRUPO.map(g => {
    const myRes = RESTR.filter(r => r.agencies && r.agencies.includes(g.id));
    const isOpen = sel === g.id;
    return /*#__PURE__*/React.createElement("div", {
      key: g.id,
      onClick: () => setSel(isOpen ? null : g.id),
      style: {
        background: "#0e0e0e",
        border: "1px solid " + (isOpen ? g.color : "#1a1a1a"),
        borderRadius: 10,
        padding: 18,
        cursor: "pointer",
        transition: "all .2s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: g.color
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        fontFamily: "Syne,sans-serif",
        color: g.color
      }
    }, g.name)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#444",
        fontFamily: "DM Mono,monospace",
        lineHeight: 1.5,
        marginBottom: 10
      }
    }, g.desc), isOpen && (myRes.length > 0 ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontFamily: "DM Mono,monospace",
        color: "#FF4757",
        marginBottom: 7,
        letterSpacing: 1
      }
    }, "⚠ CONFLITOS"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 4
      }
    }, myRes.map((r, i) => /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        fontSize: 8,
        fontFamily: "DM Mono,monospace",
        padding: "2px 6px",
        borderRadius: 3,
        background: "rgba(255,71,87,.1)",
        color: "#FF4757",
        border: "1px solid rgba(255,71,87,.2)"
      }
    }, r.category)))) : /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        fontFamily: "DM Mono,monospace",
        color: "#34D399"
      }
    }, "✓ Sem restrições")), !isOpen && myRes.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontFamily: "DM Mono,monospace",
        color: "rgba(255,71,87,.5)",
        marginTop: 5
      }
    }, myRes.length, " conflito(s)"));
  })));
}
function Dashboard({
  curUser,
  onClose
}) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("today");
  useEffect(() => {
    (async () => {
      const l = (await sharedGet("activities_log")) || [];
      setLog(l);
      setLoading(false);
    })();
  }, []);
  const todayStr = today();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const filtered = log.filter(e => {
    if (period === "today") return e.isoDate === todayStr;
    if (period === "week") return e.isoDate >= weekAgo;
    return true;
  });
  const todayCount = log.filter(e => e.isoDate === todayStr).length;
  const weekCount = log.filter(e => e.isoDate >= weekAgo).length;
  const callCount = filtered.filter(e => e.tipo === "call").length;
  const meetCount = filtered.filter(e => e.tipo === "meeting").length;
  const ratio = callCount > 0 ? (meetCount / callCount * 100).toFixed(0) + "%" : "—";
  const byEmpresa = {};
  filtered.forEach(e => {
    byEmpresa[e.empresa] = (byEmpresa[e.empresa] || 0) + 1;
  });
  const maxE = Math.max(...Object.values(byEmpresa), 1);
  const exportCSV = () => {
    const rows = ["data,hora,usuario,empresa,decisor,tipo,nota"];
    filtered.forEach(e => {
      rows.push([e.isoDate, e.time, e.userName, e.empresa, e.decisor, e.tipo, e.nota].join(","));
    });
    const blob = new Blob([rows.join("\n")], {
      type: "text/csv"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dashboard_" + period + ".csv";
    a.click();
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.92)",
      zIndex: 9999,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: 20,
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#0e0e0e",
      border: "1px solid #1e1e1e",
      borderRadius: 10,
      width: "100%",
      maxWidth: 700,
      padding: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      fontFamily: "Syne,sans-serif"
    }
  }, "📊 Dashboard Comercial")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: exportCSV,
    style: {
      padding: "5px 12px",
      border: "1px solid #1e1e1e",
      borderRadius: 3,
      background: "transparent",
      color: "#34D399",
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      cursor: "pointer"
    }
  }, "↓ CSV"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#555",
      cursor: "pointer",
      fontSize: 22
    }
  }, "×"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 10,
      marginBottom: 20
    }
  }, [["HOJE", todayCount, "#E8C97A"], ["7 DIAS", weekCount, "#eee"], ["COLD CALLS", callCount, "#60A5FA"], ["RATIO REUNIÃO", ratio, "#34D399"]].map(([l, v, col]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      background: "#111",
      border: "1px solid #1a1a1a",
      borderRadius: 8,
      padding: 16,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#444",
      letterSpacing: 1,
      marginBottom: 6
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      color: col,
      fontFamily: "Syne,sans-serif"
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 16
    }
  }, [["today", "Hoje"], ["week", "7 dias"], ["all", "Tudo"]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setPeriod(v),
    style: {
      padding: "4px 10px",
      borderRadius: 3,
      border: "1px solid " + (period === v ? "#E8C97A" : "#1e1e1e"),
      background: period === v ? "rgba(232,201,122,.08)" : "transparent",
      color: period === v ? "#E8C97A" : "#555",
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      cursor: "pointer"
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#444",
      letterSpacing: 1,
      marginBottom: 10,
      textTransform: "uppercase"
    }
  }, "Top Empresas"), Object.entries(byEmpresa).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e, n]) => /*#__PURE__*/React.createElement("div", {
    key: e,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 11,
      color: "#888",
      fontFamily: "DM Mono,monospace",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, e), /*#__PURE__*/React.createElement("div", {
    style: {
      width: n / maxE * 80,
      height: 4,
      background: "#E8C97A",
      borderRadius: 2,
      opacity: .7
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#E8C97A",
      minWidth: 20,
      textAlign: "right",
      fontFamily: "DM Mono,monospace"
    }
  }, n)))), loading ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 20,
      color: "#333",
      fontSize: 11
    }
  }, "Carregando...") : filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 20,
      color: "#333",
      fontSize: 11
    }
  }, "Nenhuma atividade no período") : /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 280,
      overflowY: "auto"
    }
  }, [...filtered].reverse().map((e, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "10px 0",
      borderBottom: "1px solid #111"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: "50%",
      background: "#111",
      border: "1px solid #1a1a1a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13,
      flexShrink: 0
    }
  }, {
    email: "✉",
    call: "📞",
    whatsapp: "💬",
    linkedin: "in",
    meeting: "🤝",
    response: "↩"
  }[e.tipo] || "◎"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600
    }
  }, e.empresa, e.decisor ? " → " + e.decisor : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#555",
      fontFamily: "DM Mono,monospace",
      marginTop: 2
    }
  }, e.isoDate, " ", e.time, " · ", e.userName), e.nota && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#666",
      marginTop: 3,
      borderLeft: "2px solid #1a1a1a",
      paddingLeft: 8
    }
  }, e.nota)))))));
}
function ModalPortal({
  children
}) {
  var el = typeof document !== "undefined" ? document.getElementById("modal-root") : null;
  if (!el || !ReactDOM.createPortal) return children;
  return ReactDOM.createPortal(children, el);
}
function MagicLinkScreen() {
  const [email, setEmail] = useState("pedroica@gmail.com");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    if (!email || !email.includes("@")) { setErr("E-mail inválido."); return; }
    setErr(""); setLoading(true);
    const res = await (window.__supaSendMagicLink || (async () => ({ error: new Error("gh-store não carregado") })))(email);
    setLoading(false);
    if (res && res.error) { setErr(res.error.message || "Erro ao enviar."); return; }
    setSent(true);
  };
  const s = { fontFamily: "'IBM Plex Mono',monospace" };
  if (sent) return /*#__PURE__*/React.createElement("div", { style: { display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0D0D0D" } },
    /*#__PURE__*/React.createElement("div", { style: { textAlign:"center",maxWidth:340,padding:36 } },
      /*#__PURE__*/React.createElement("div", { style: { fontSize:32,marginBottom:16 } }, "📬"),
      /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:13,color:"#F5F5F5",marginBottom:8 } }, "Link enviado para"),
      /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:11,color:"#FF6B2B",marginBottom:20 } }, email),
      /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:10,color:"#9B9BB4",lineHeight:1.7 } }, "Verifique sua caixa de entrada e clique no link para entrar. Você pode fechar esta aba.")
    )
  );
  return /*#__PURE__*/React.createElement("div", { style: { display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0D0D0D" } },
    /*#__PURE__*/React.createElement("div", { style: { width:"100%",maxWidth:360,padding:36,background:"#1A1A2E",border:".5px solid #2D2D44",borderRadius:12 } },
      /*#__PURE__*/React.createElement("div", { style: { textAlign:"center",marginBottom:28 } },
        /*#__PURE__*/React.createElement("div", { style: { width:8,height:8,borderRadius:2,background:"#FF6B2B",margin:"0 auto 14px" } }),
        /*#__PURE__*/React.createElement("div", { style: { fontSize:20,fontWeight:500,color:"#F5F5F5",letterSpacing:"-.3px" } }, "Galeria Holding"),
        /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:9,color:"#9B9BB4",letterSpacing:2,marginTop:4 } }, "CENTRAL COMERCIAL")
      ),
      /*#__PURE__*/React.createElement("div", { style: { marginBottom:10 } },
        /*#__PURE__*/React.createElement("label", { style: { ...s,fontSize:9,color:"#9B9BB4",letterSpacing:.5,textTransform:"uppercase",display:"block",marginBottom:5 } }, "E-mail"),
        /*#__PURE__*/React.createElement("input", { className:"gh-input", type:"email", placeholder:"seu@email.com", value:email, onChange:e=>setEmail(e.target.value), onKeyDown:e=>e.key==="Enter"&&send() })
      ),
      err && /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:10,color:"#E24B4A",marginBottom:10 } }, err),
      /*#__PURE__*/React.createElement("button", { className:"gh-btn-primary", onClick:send, disabled:loading, style:{ width:"100%",marginTop:6 } }, loading ? "Enviando..." : "Enviar link de acesso"),
      /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:9,color:"#2D2D44",textAlign:"center",marginTop:14 } }, "Acesso por magic link — sem senha")
    )
  );
}
function App() {
  const [curGrupo, setCurGrupo] = useState(GRUPO[0]);
  const [curLead, setCurLead] = useState(null);
  const [sbQ, setSbQ] = useState("");
  const [fitFil, setFitFil] = useState("all");
  const [visLimit, setVisLimit] = useState(200);
  useEffect(() => { setVisLimit(200); }, [fitFil, sbQ, curGrupo]);
  const [accs, setAccs] = useState(() => {
    const v1 = loadSt("ghub_accs", {});
    const v3 = loadSt("gh_decisores_v3", {});
    // Merge v3 into v1 (v3 has sugeridos from FigurinhasV2)
    const merged = {
      ...v1
    };
    Object.keys(v3).forEach(k => {
      if (!merged[k]) {
        merged[k] = v3[k];
      } else {
        merged[k] = {
          ...merged[k],
          sugeridos: [...(merged[k].sugeridos || []), ...(v3[k].sugeridos || []).filter(s => !(merged[k].sugeridos || []).some(x => x.nome === s.nome))]
        };
      }
    });
    return merged;
  });
  const [customLeads, setCustomLeads] = useState(() => {
    const saved = loadSt("ghub_custom_leads", []);
    PROSP = buildProsp(saved);
    return saved;
  });
  const [addCoModal, setAddCoModal] = useState(false);
  const [pdKey, setPdKey] = useState(() => loadSt("ghub_pd", ""));
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgPD, setCfgPD] = useState("");
  const [cfgClaude, setCfgClaude] = useState(() => getClaudeKey());
  const [resOpen, setResOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [viewMode, setViewMode] = useState("empresas");
  const switchView = v => {
    setViewMode(v);
    setCurLead(null);
  };
  const switchGrupo = g => {
    setCurGrupo(g);
    setCurLead(null);
    setViewMode('hotpipeline');
  };
  // ── Fase B — navegação principal ──────────────────────────────
  const [navSection, setNavSection] = useState('base'); // holding|agencia|aprovar|base|ferramentas
  const [agenciaId, setAgenciaId] = useState('gaia');
  const [agenciaTab, setAgenciaTab] = useState('pipeline'); // pipeline|noticias|servicos|cases|credenciais|textos
  const ALL_AGENCIAS = [
    ...(typeof GRUPO !== 'undefined' ? GRUPO : []),
    {id:'atelie', name:'Ateliê', color:'#E879F9', rgb:'232,121,249'},
    {id:'frame', name:'Frame', color:'#38BDF8', rgb:'56,189,248'},
    {id:'studioga', name:'Studio GA', color:'#A3E635', rgb:'163,230,53'}
  ];
  const curAgencia = ALL_AGENCIAS.find(a => a.id === agenciaId) || ALL_AGENCIAS[0];
  const AGENCIA_UUIDS = {
    '404':        '14a057af-31c6-4606-8236-4c97d8067335',
    'agente':     '910f125d-82f7-4fbc-889d-2eb9b33d8198',
    'atelie':     '32e8bd8a-d698-4781-b9f4-7b9855132942',
    'catalyst':   '74886b76-2650-41e1-8d46-3c742681fadd',
    'cccaramelo': 'e8d734ba-b3e9-425b-942e-b8b56c98f56b',
    'frame':      'e26e3106-33e8-43de-95c5-546477573186',
    'gaia':       'a8aecdac-1001-4643-bcd4-e818307b6d92',
    'galeria':    '960142b5-a688-41f8-8719-d516eeb843c6',
    'gux':        'ac8b92de-ab48-4153-bf18-c23b5ea19bfe',
    'mantiqueira':'1a67ab05-e42e-4975-be11-b6bf7f23ce03',
    'mila':       'b0473d79-afd9-404e-8784-04b4556a5a2c',
    'studioga':   'd1d6bc56-ee70-4b5c-bb2e-3a7e428ea70f',
    'vitrine':    '2bb87ce9-b175-43d0-9213-1e1021661e54',
  };
  const navTo = (section, agId, tab) => {
    setNavSection(section);
    if (agId) { setAgenciaId(agId); setCurGrupo(GRUPO.find(g => g.id === agId) || GRUPO[0]); }
    if (tab) setAgenciaTab(tab);
  };
  const [alertaBadge, setAlertaBadge] = useState(() => lsGet("gh_alertas_v2", []).filter(a => !a.lido).length);
  const [showTutorial, setShowTutorial] = useState(false);
  const [abordagemGlobal, setAbordagemGlobal] = useState(null); // {decisor, empresa, setor}
  const [curUser, setCurUser] = useState(null);
  const [sessLoading, setSessLoading] = useState(true);
  const lastReview = loadSt("ghub_res_review", null);
  const showReminder = !lastReview || new Date() - new Date(lastReview) > 90 * 24 * 60 * 60 * 1000;
  useEffect(() => {
    let sub = null;
    (async () => {
      // Tenta sessão Supabase primeiro
      const supaSess = await (window.__supaGetSession || (async () => null))();
      if (supaSess) {
        setCurUser({
          id: supaSess.user.id,
          name: (supaSess.user.user_metadata && supaSess.user.user_metadata.name) || supaSess.user.email || "Pedro Ica",
          role: (supaSess.user.user_metadata && supaSess.user.user_metadata.role) || "admin"
        });
        setSessLoading(false);
        if (typeof window.__hydrateFromSupabase === 'function') window.__hydrateFromSupabase();
      } else {
        // Fallback: sessão cacheada no localStorage
        const localSess = await personalGet("session");
        if (localSess) {
          setCurUser({ id: localSess.uid || "pedro", name: localSess.name || "Pedro Ica", role: localSess.role || "admin" });
        }
        setSessLoading(false);
      }
    })();
    // Escuta mudanças de auth (magic link redirect)
    if (window.__supaOnAuthChange) {
      const { data } = window.__supaOnAuthChange((event, session) => {
        if (session) {
          setCurUser({
            id: session.user.id,
            name: (session.user.user_metadata && session.user.user_metadata.name) || session.user.email || "Pedro Ica",
            role: (session.user.user_metadata && session.user.user_metadata.role) || "admin"
          });
          // Hidrata localStorage com dados do Supabase logo após o login
          if (typeof window.__hydrateFromSupabase === 'function') {
            window.__hydrateFromSupabase();
          }
        } else if (event === "SIGNED_OUT") {
          setCurUser(null);
        }
      });
      if (data && data.subscription) sub = data.subscription;
    }
    return () => { if (sub) sub.unsubscribe(); };
  }, []);
  const logout = async () => {
    await (window.__supaSignOut || (async () => {}))();
    setCurUser(null);
  };
  const onActivitySaved = async (empresa, tipo, tipoLabel, decisor, nota) => {
    if (curUser) await logActivity(curUser, empresa, curGrupo.name, tipo, tipoLabel, decisor, nota);
  };
  useEffect(() => {
    saveSt("ghub_accs", accs);
    saveSt("gh_decisores_v3", accs);
  }, [accs]);
  useEffect(() => {
    window.__setAlertaBadge = setAlertaBadge;
  }, []);
  useEffect(() => {
    // Auto-show config on first load if no Claude key
    if (!getClaudeKey()) {
      const shown = loadSt("ghub_cfg_shown", false);
      if (!shown) {
        saveSt("ghub_cfg_shown", true);
        setTimeout(() => {
          setCfgClaude("");
          setCfgPD(pdKey);
          setCfgOpen(true);
        }, 800);
      }
    }
  }, []);
  useEffect(() => {
    saveSt("ghub_pd", pdKey);
  }, [pdKey]);
  useEffect(() => {
    saveSt("ghub_custom_leads", customLeads);
    PROSP = buildProsp(customLeads);
  }, [customLeads]);
  useEffect(() => {
    window.__addCustomEmpresa = function (novaEmp) {
      setCustomLeads(function (prev) {
        const updated = [...prev, novaEmp];
        PROSP = buildProsp(updated);
        return updated;
      });
    };
    return function () {
      delete window.__addCustomEmpresa;
    };
  }, []);
  useEffect(() => {
    window.__refreshFromStorage = function () {
      const newLeads = loadSt('ghub_custom_leads', []);
      setCustomLeads(function (prev) {
        PROSP = buildProsp(newLeads);
        return newLeads;
      });
      setAccs(function (prev) {
        const fromStorage = loadSt('gh_decisores_v3', {});
        return Object.assign({}, fromStorage, prev);
      });
    };
    return function () { delete window.__refreshFromStorage; };
  }, []);
  useEffect(() => {
    window.__moveDecToEmpresa = function (dec, destRank) {
      setAccs(function (prev) {
        var k = curGrupo.id + "_" + destRank;
        var ex = prev[k] || {
          decisors: [],
          sugeridos: [],
          activities: []
        };
        if (ex.decisors.find(function (d) {
          return d.nome === dec.nome;
        })) return prev;
        var updated = Object.assign({}, prev, {
          [k]: Object.assign({}, ex, {
            decisors: [...ex.decisors, Object.assign({}, dec, {
              movedAt: new Date().toLocaleDateString("pt-BR")
            })]
          })
        });
        lsSet("gh_decisores_v3", updated);
        return updated;
      });
    };
    return function () {
      delete window.__moveDecToEmpresa;
    };
  }, [curGrupo]);
  useEffect(() => {
    document.documentElement.style.setProperty("--tc", curGrupo.color);
    document.documentElement.style.setProperty("--tcr", curGrupo.rgb);
  }, [curGrupo]);
  const allLeads = useMemo(() => buildProsp(customLeads), [customLeads]);
  // filteredBase não depende de accs — editar um decisor não recomputa 2000+ leads
  const filteredBase = useMemo(() => allLeads.filter(d => {
    const fit = curGrupo.fit(d.setor || "");
    const res = checkRestrictions(d, curGrupo.id);
    if (fitFil === "restrito" && res.length === 0) return false;
    if (fitFil === "alto" && fit !== "alto") return false;
    if (fitFil === "medio" && fit !== "medio") return false;
    if (sbQ && !d.nome.toUpperCase().includes(sbQ.toUpperCase())) return false;
    return true;
  }), [curGrupo, fitFil, sbQ, allLeads]);
  // filtered adiciona o filtro CRM por cima — só recomputa allLeads quando fitFil="crm"
  const filtered = useMemo(() => {
    if (fitFil !== "crm") return filteredBase;
    const prefix = curGrupo.id + "_";
    return filteredBase.filter(d => !!accs[prefix + d.rank]);
  }, [filteredBase, fitFil, accs, curGrupo.id]);
  const addCompany = co => {
    setCustomLeads(prev => {
      const updated = [...prev, co];
      PROSP = buildProsp(updated);
      return updated;
    });
    setCurLead(co);
  };
  const removeCompany = rank => {
    setCustomLeads(prev => {
      const updated = prev.filter(c => c.rank !== rank);
      PROSP = buildProsp(updated);
      return updated;
    });
    setCurLead(null);
  };
  const nextRank = useCallback(
    () => Math.max(9000, ...(customLeads.length ? customLeads.map(c => c.rank || 9000) : [9000])) + 1,
    [customLeads]
  );
  const accKey = (g, r) => g.id + "_" + r;
  const getAcc = () => curLead ? accs[accKey(curGrupo, curLead.rank)] || {
    decisors: [],
    activities: [],
    intel: null,
    alerts: [],
    pdDealId: null
  } : {};
  const setAcc = v => setAccs(a => ({
    ...a,
    [accKey(curGrupo, curLead.rank)]: v
  }));
  if (sessLoading) return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "#060606",
      color: "#333",
      fontFamily: "DM Mono,monospace",
      fontSize: 12
    }
  }, "Carregando...");
  if (!curUser) return /*#__PURE__*/React.createElement(MagicLinkScreen, null);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden"
    }
  }, addCoModal && /*#__PURE__*/React.createElement(AddCompanyModal, {
    onSave: addCompany,
    onClose: () => setAddCoModal(false),
    nextRank: nextRank()
  }), cfgOpen && /*#__PURE__*/React.createElement("div", {
    className: "modov"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modtitle"
  }, "⚙ Configurações"), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "CLAUDE API KEY"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    type: "password",
    placeholder: "sk-ant-...",
    value: cfgClaude,
    onChange: e => setCfgClaude(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flbl"
  }, "PIPEDRIVE API KEY"), /*#__PURE__*/React.createElement("input", {
    className: "finp",
    type: "password",
    placeholder: "api key do pipedrive",
    value: cfgPD,
    onChange: e => setCfgPD(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      color: "#555",
      marginTop: 4,
      marginBottom: 12,
      lineHeight: 1.6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#FF6B2B"
    }
  }, "Claude API Key obrigatória"), " para enriquecer empresas, gerar emails e abordagens.", /*#__PURE__*/React.createElement("br", null), "Obtenha em: ", /*#__PURE__*/React.createElement("a", {
    href: "https://console.anthropic.com/settings/keys",
    target: "_blank",
    style: {
      color: "#60A5FA"
    }
  }, "console.anthropic.com/settings/keys"), /*#__PURE__*/React.createElement("br", null), "Pipedrive: opcional (sincroniza atividades no CRM)."), /*#__PURE__*/React.createElement("div", {
    className: "modacts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btno btnsm",
    onClick: () => setCfgOpen(false)
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "btn btnp btnsm",
    style: {
      background: curGrupo.color
    },
    onClick: () => {
      setPdKey(cfgPD);
      setClaudeKey(cfgClaude);
      setCfgOpen(false);
    }
  }, "Salvar")))), resOpen && /*#__PURE__*/React.createElement(RestrictionsPanel, {
    onClose: () => setResOpen(false)
  }), showReminder && /*#__PURE__*/React.createElement("div", {
    className: "reminder",
    style: {
      padding: "10px 18px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, "📅"), /*#__PURE__*/React.createElement("div", {
    className: "reminder-txt"
  }, "Revisão trimestral de restrições pendente — confirme se os clientes e conflitos ainda estão ativos."), /*#__PURE__*/React.createElement("button", {
    className: "reminder-btn",
    onClick: () => setResOpen(true)
  }, "Ver restrições"), /*#__PURE__*/React.createElement("button", {
    className: "reminder-btn",
    style: {
      borderColor: "rgba(255,181,71,.2)",
      color: "#555"
    },
    onClick: () => saveSt("ghub_res_review", new Date().toISOString())
  }, "Dispensar")), /*#__PURE__*/React.createElement("div", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26,
      height: 26,
      borderRadius: 6,
      background: "#FF6B2B",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "IBM Plex Mono,monospace",
      fontSize: 14,
      fontWeight: 500,
      color: "#fff",
      letterSpacing: -.5,
      flexShrink: 0
    }
  }, "G"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "IBM Plex Mono,monospace",
      fontSize: 11,
      color: "#F5F5F5",
      letterSpacing: .5,
      whiteSpace: "nowrap"
    }
  }, "GALERIA HOLDING")),
  React.createElement("div", { style:{ display:'flex', alignItems:'stretch', flex:1 } },
    [['holding','Holding'],['agencia','Agências'],['aprovar','Aprovar hoje'],['base','Base'],['ferramentas','Ferramentas']].map(([s, l]) =>
      React.createElement("div", {
        key: s,
        onClick: () => { if (s === 'ferramentas') { setToolsOpen(true); } else { navTo(s, null, null); } },
        style: { display:'flex', alignItems:'center', padding:'0 16px', borderRight:'.5px solid #2D2D44', borderBottom: navSection === s ? '2px solid #FF6B2B' : '2px solid transparent', cursor:'pointer', fontFamily:'IBM Plex Mono,monospace', fontSize:10, color: navSection === s ? '#FF6B2B' : '#9B9BB4', letterSpacing:'.5px', transition:'all .15s', whiteSpace:'nowrap', flexShrink:0 }
      }, l)
    )
  ),
  React.createElement("div", { className:"tb-right", style:{ gap:6 } },
    alertaBadge > 0 && React.createElement("span", { style:{ background:'#E24B4A', color:'#fff', borderRadius:'50%', width:16, height:16, fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } }, alertaBadge),
    React.createElement("button", { onClick:() => setToolsOpen(true), style:{ padding:'4px 8px', border:'.5px solid #2D2D44', borderRadius:4, background:'transparent', color:'#9B9BB4', fontSize:9, fontFamily:'IBM Plex Mono,monospace', cursor:'pointer' }, title:'Backup & APIs' }, "🛟"),
    React.createElement("button", { className:'cfgbtn', onClick:() => { setCfgPD(pdKey); setCfgClaude(getClaudeKey()); setCfgOpen(true); }, style:{ borderColor: getClaudeKey() ? '' : 'rgba(255,107,43,.5)', color: getClaudeKey() ? '' : '#FF6B2B' }, title: getClaudeKey() ? 'Configurações' : '⚠ Configure a Claude API Key' }, "⚙", !getClaudeKey() && " ⚠"),
    React.createElement("button", { className:'resbtn', onClick:() => setResOpen(true) }, "⚠"),
    React.createElement("button", { onClick:logout, style:{ padding:'4px 8px', border:'.5px solid #2D2D44', borderRadius:4, background:'transparent', color:'#555', fontSize:9, fontFamily:'IBM Plex Mono,monospace', cursor:'pointer' }, title:'Sair' }, curUser?.name?.split(" ")[0] || "Sair", " ↩")
  )), navSection === 'agencia' && React.createElement("div", { style:{ display:'flex', alignItems:'stretch', background:'#080810', borderBottom:'.5px solid #1A1A2E', paddingLeft:60, height:30 } },
    ALL_AGENCIAS.map(a => React.createElement("div", { key:a.id, onClick:()=>navTo('agencia', a.id, null), style:{ display:'flex', alignItems:'center', padding:'0 12px', borderRight:'.5px solid #1A1A2E', borderBottom: agenciaId===a.id ? '2px solid '+a.color : '2px solid transparent', cursor:'pointer', fontFamily:'IBM Plex Mono,monospace', fontSize:9, color: agenciaId===a.id ? a.color : '#555', whiteSpace:'nowrap', flexShrink:0, transition:'all .15s' } }, a.name))
  ), navSection === 'agencia' && React.createElement("div", { style:{ display:'flex', alignItems:'stretch', background:'#080810', borderBottom:'.5px solid #1A1A2E', paddingLeft:60, height:26 } },
    [['pipeline','Pipeline'],['noticias','Notícias'],['servicos','Serviços'],['cases','Cases'],['credenciais','Credenciais'],['textos','Textos'],['enviar','Enviar pipeline']].map(([t,l]) =>
      React.createElement("div", { key:t, onClick:()=>setAgenciaTab(t), style:{ display:'flex', alignItems:'center', padding:'0 12px', fontFamily:'IBM Plex Mono,monospace', fontSize:9, cursor:'pointer', borderBottom: agenciaTab===t ? '2px solid #FF6B2B' : '2px solid transparent', color: agenciaTab===t ? '#FF6B2B' : '#555', transition:'all .15s', whiteSpace:'nowrap' } }, l)
    )
  ), showTutorial && /*#__PURE__*/React.createElement(TutorialOverlay, {
    onClose: () => setShowTutorial(false)
  }), abordagemGlobal && /*#__PURE__*/React.createElement(AbordagemModal, {
    decisor: abordagemGlobal.decisor || {},
    empresa: abordagemGlobal.empresa || "",
    setor: abordagemGlobal.setor || "",
    onClose: () => setAbordagemGlobal(null),
    onKanbanAdd: (nome, cargo, emp, canal) => {
      if (window.__addToKanbanV2) window.__addToKanbanV2(nome, cargo, emp, canal);
    }
  }), dashOpen && /*#__PURE__*/React.createElement(Dashboard, {
    curUser: curUser,
    onClose: () => setDashOpen(false)
  }), toolsOpen && /*#__PURE__*/React.createElement(FerramentasModal, {
    onClose: () => setToolsOpen(false)
  }), navSection === 'holding' ? React.createElement(HoldingHome, { agencias: ALL_AGENCIAS }) : navSection === 'agencia' ? React.createElement(AgenciaHome, { agencia: curAgencia, tab: agenciaTab, navTo: navTo, agenciaUuids: AGENCIA_UUIDS }) : navSection === 'aprovar' ? React.createElement("div", { className:"panel", style:{flex:1,overflow:'auto'} }, React.createElement(AprovacaoHoje, null)) : navSection === 'base' ? React.createElement("div", { className:"ws", style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'} }, React.createElement(EmpresasView, { accs: accs, setAccs: setAccs, curGrupo: curGrupo, alertas: lsGet("gh_alertas_v2", []), onKanbanAdd: () => {} })) : viewMode === "outbound" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(OutboundView, {
    accs: accs,
    setAccs: setAccs,
    curGrupo: curGrupo,
    onAddCompany: addCompany,
    nextRank: nextRank
  })) : viewMode === "temperatura" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(TemperaturaView, {
    accs: accs,
    curGrupo: curGrupo
  })) : viewMode === "figurinhas2" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(FigurinhasV2, {
    accs: accs,
    setAccs: setAccs,
    curGrupo: curGrupo,
    alertas: lsGet("gh_alertas_v2", []),
    onKanbanAdd: (nome, cargo, emp, canal) => {
      if (window.__addToKanbanV2) window.__addToKanbanV2(nome, cargo, emp, canal);
    }
  })) : viewMode === "ka2" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(KanbanAcionamentosV2, {
    accs: accs
  })) : viewMode === "top10" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(Top10View, {
    accs: accs,
    alertas: lsGet("gh_alertas_v2", []),
    curGrupo: curGrupo,
    onEmpresaClick: () => switchView("figurinhas2")
  })) : viewMode === "alertas2" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(AlertasCMOV2, {
    onAbordagem: (dec, emp, set) => setAbordagemGlobal({
      decisor: dec,
      empresa: emp,
      setor: set
    })
  })) : viewMode === "calls" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(ColdCallView, {
    grupo: curGrupo,
    accs: accs,
    onActivitySaved: onActivitySaved
  })) : viewMode === "kanban" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(KanbanView, {
    curGrupo: curGrupo,
    initialTab: curGrupo?.id === "gaia" ? "gaia" : curGrupo?.id && curGrupo.id !== "gaia" ? "holding" : undefined
  })) : viewMode === "empresas" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(EmpresasView, {
    accs: accs,
    setAccs: setAccs,
    curGrupo: curGrupo,
    alertas: lsGet("gh_alertas_v2", []),
    onKanbanAdd: d => switchView("ka2")
  })) : viewMode === "pipeline_gaia" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(PipelineView, {
    tipo: "gaia"
  })) : viewMode === "pipeline_holding" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(PipelineView, {
    tipo: "holding"
  })) : viewMode === "estrategico" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(StrategicHub, null)) : viewMode === "cobertura" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, typeof CoberturaView !== "undefined" && /*#__PURE__*/React.createElement(CoberturaView, {
    accs: accs,
    setAccs: setAccs,
    curGrupo: curGrupo
  })) : viewMode === "ranking" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, typeof RankingView !== "undefined" && /*#__PURE__*/React.createElement(RankingView, {
    accs: accs,
    curGrupo: curGrupo
  })) : viewMode === "aprovarhoje" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }
  }, /*#__PURE__*/React.createElement(AprovacaoHoje, null)) : viewMode === "estrelas" ? /*#__PURE__*/React.createElement("div", {
    className: "ws",
    style: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }
  }, /*#__PURE__*/React.createElement(EstrelasPorAgenciaView, { accs: accs, curGrupo: curGrupo })) : /*#__PURE__*/React.createElement("div", {
    className: "ws"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb",
    style: {
      "--tc": curGrupo.color,
      "--tcr": curGrupo.rgb
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sbhead"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sbtitle"
  }, "ANUNCIANTES"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sbcnt"
  }, filtered.length > visLimit ? (Math.min(visLimit, filtered.length) + " de " + filtered.length) : filtered.length), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAddCoModal(true),
    style: {
      padding: "2px 8px",
      borderRadius: 3,
      border: "1px solid rgba(0,255,148,.3)",
      background: "rgba(0,255,148,.06)",
      color: "#00FF94",
      fontSize: 9,
      fontFamily: "DM Mono,monospace",
      cursor: "pointer",
      fontWeight: 700
    }
  }, "+ Empresa"))), /*#__PURE__*/React.createElement("div", {
    className: "sbsearch"
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar empresa...",
    value: sbQ,
    onChange: e => setSbQ(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "sbfil"
  }, [["all", "TODOS"], ["alto", "FIT ALTO"], ["medio", "FIT MED"], ["crm", "NO CRM"], ["restrito", "RESTRITOS"]].map(([f, l]) => /*#__PURE__*/React.createElement("button", {
    key: f,
    className: "fb" + (fitFil === f ? " on" : "") + (f === "restrito" ? " res" : ""),
    onClick: () => setFitFil(f)
  }, l))), /*#__PURE__*/React.createElement("div", {
    className: "sblist"
  }, filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: { textAlign: "center", padding: "32px 16px", color: "#3d3d5c", fontSize: 10, fontFamily: "IBM Plex Mono,monospace", lineHeight: 1.7, whiteSpace: "pre-line" }
  }, sbQ ? ("Nenhum resultado para\n\"" + sbQ + "\"") : fitFil === "crm" ? "Nenhuma empresa\nno CRM deste grupo ainda" : "Nenhuma empresa\nneste filtro"), filtered.slice(0, visLimit).map(d => {
    const fit = curGrupo.fit(d.setor || "");
    const fc = fitColor(fit);
    const res = checkRestrictions(d, curGrupo.id);
    const isRes = res.length > 0;
    const isSel = curLead && curLead.rank === d.rank;
    const hasCrm = !!accs[accKey(curGrupo, d.rank)];
    const tempData = hasCrm ? calcularTemperatura(accs[accKey(curGrupo, d.rank)]) : null;
    return /*#__PURE__*/React.createElement("div", {
      key: d.rank + d.nome,
      className: "coitem" + (isSel ? " sel" : "") + (isRes ? " restricted" : ""),
      onClick: () => setCurLead(d)
    }, /*#__PURE__*/React.createElement("span", {
      className: "corank"
    }, d.rank), /*#__PURE__*/React.createElement("div", {
      className: "cobody"
    }, /*#__PURE__*/React.createElement("div", {
      className: "coname"
    }, d.nome, isRes && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 7,
        marginLeft: 5,
        color: "#FF4757"
      }
    }, "●"), d.custom && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 7,
        marginLeft: 4,
        padding: "1px 4px",
        borderRadius: 2,
        background: "rgba(0,255,148,.08)",
        color: "#00FF94",
        border: "1px solid rgba(0,255,148,.2)"
      }
    }, "★")), /*#__PURE__*/React.createElement("div", {
      className: "cosec"
    }, d.setor, isRes && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "rgba(255,71,87,.6)",
        marginLeft: 4,
        fontSize: 7
      }
    }, "conflito"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 3
      }
    }, isRes ? /*#__PURE__*/React.createElement("span", {
      className: "restag"
    }, "RESTRITO") : /*#__PURE__*/React.createElement("span", {
      className: "fittag",
      style: {
        background: `rgba(${hexRgb(fc)},.08)`,
        color: fc,
        border: `1px solid rgba(${hexRgb(fc)},.2)`
      }
    }, fitLabel(fit)), hasCrm && /*#__PURE__*/React.createElement("div", {
      title: tempData ? (tempData.emoji + " " + tempData.status + " · " + tempData.pontos + "pts") : "CRM",
      style: { width: 6, height: 6, borderRadius: "50%", background: (tempData && tempData.nivel > 0) ? tempData.cor : "#3d3d5c", flexShrink: 0, transition: "background .3s" }
    }), d.custom && /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        if (window.confirm("Remover " + d.nome + "?")) removeCompany(d.rank);
      },
      style: {
        fontSize: 8,
        padding: "1px 4px",
        borderRadius: 2,
        border: "1px solid rgba(255,71,87,.2)",
        background: "rgba(255,71,87,.06)",
        color: "#FF4757",
        cursor: "pointer",
        fontFamily: "DM Mono,monospace"
      }
    }, "✕")));
  }), filtered.length > visLimit && /*#__PURE__*/React.createElement("div", {
    style: { padding: "8px 10px", textAlign: "center", borderTop: ".5px solid #2D2D44" }
  }, /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 9, color: "#9B9BB4", fontFamily: "IBM Plex Mono,monospace", marginRight: 8 }
  }, "mostrando " + Math.min(visLimit, filtered.length) + " de " + filtered.length), /*#__PURE__*/React.createElement("button", {
    onClick: function() { setVisLimit(function(v) { return v + 200; }); },
    style: { fontSize: 9, color: "#60A5FA", background: "transparent", border: ".5px solid #2D2D44", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: "IBM Plex Mono,monospace" }
  }, "+ Ver mais"))
  )), /*#__PURE__*/React.createElement("div", {
    className: "main",
    style: {
      "--tc": curGrupo.color,
      "--tcr": curGrupo.rgb
    }
  }, curLead ? /*#__PURE__*/React.createElement(AgentView, {
    key: curGrupo.id + "_" + curLead.rank,
    grupo: curGrupo,
    lead: curLead,
    acc: getAcc(),
    pdKey: pdKey,
    onAccUpdate: setAcc
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "subtabs"
  }), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "emptyicon"
  }, "◎"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800
    }
  }, curGrupo.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "DM Mono,monospace",
      maxWidth: 220,
      lineHeight: 1.7,
      textAlign: "center"
    }
  }, curGrupo.desc, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "Selecione um anunciante para começar a prospecção.")))))));
}

/* ═══════════════════════════════════════════════════════════════
   ESTRELAS POR AGÊNCIA — rating de empresas por grupo/uuid
   ═══════════════════════════════════════════════════════════════ */
function StarWidget({ value, onChange, size }) {
  const sz = size || 16;
  return /*#__PURE__*/React.createElement("span", { style: { cursor: onChange ? "pointer" : "default", fontSize: sz, lineHeight: 1, whiteSpace: "nowrap" } },
    [1,2,3,4,5].map(n => /*#__PURE__*/React.createElement("span", {
      key: n,
      title: n + " estrela" + (n > 1 ? "s" : ""),
      onClick: onChange ? () => onChange(n === value ? 0 : n) : undefined,
      style: { color: n <= (value || 0) ? "#FF6B2B" : "#2D2D44", transition: "color .12s" }
    }, "★"))
  );
}

function EstrelasPorAgenciaView({ accs, curGrupo }) {
  const GRUPOS = typeof GRUPO !== "undefined" ? GRUPO : [];
  const [estrelas, setEstrelas] = React.useState({});
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const empresas = React.useMemo(() => {
    return (typeof PROSP !== "undefined" ? PROSP : [])
      .filter(e => e && e.nome && e.setor)
      .filter(e => !search || e.nome.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 100);
  }, [search]);

  // Carrega estrelas do localStorage (Supabase é assíncrono; faz merge quando retorna)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("gh_estrelas_v1");
      if (raw) setEstrelas(JSON.parse(raw));
    } catch (e) {}
    setLoading(false);
  }, []);

  const handleStar = async (companyKey, grupoId, val) => {
    // Atualiza local imediatamente
    setEstrelas(prev => {
      const next = { ...prev, [companyKey]: { ...(prev[companyKey] || {}), [grupoId]: val } };
      try { localStorage.setItem("gh_estrelas_v1", JSON.stringify(next)); } catch (e) {}
      return next;
    });
    // Persiste em Supabase (com uuid=null por ora; uuid virá do companies)
    if (window.__setEstrela) await window.__setEstrela(companyKey, grupoId, val, null);
  };

  const s = { fontFamily: "'IBM Plex Mono',monospace" };
  return /*#__PURE__*/React.createElement("div", { style: { flex:1,overflow:"hidden",display:"flex",flexDirection:"column" } },
    /*#__PURE__*/React.createElement("div", { style: { padding:"12px 20px 10px",borderBottom:".5px solid #2D2D44",display:"flex",alignItems:"center",gap:12,flexShrink:0,flexWrap:"wrap" } },
      /*#__PURE__*/React.createElement("div", { style: { fontSize:14,fontWeight:500,color:"#F5F5F5" } }, "Estrelas por Agência"),
      /*#__PURE__*/React.createElement("input", { style: { ...s,background:"#1A1A2E",border:".5px solid #2D2D44",borderRadius:6,padding:"5px 11px",color:"#F5F5F5",fontSize:11,outline:"none",width:200 }, placeholder:"Buscar empresa...", value:search, onChange:e=>setSearch(e.target.value) })
    ),
    /*#__PURE__*/React.createElement("div", { style: { flex:1,overflowX:"auto",overflowY:"auto" } },
      /*#__PURE__*/React.createElement("table", { style: { borderCollapse:"collapse",width:"100%",minWidth:600 } },
        /*#__PURE__*/React.createElement("thead", null,
          /*#__PURE__*/React.createElement("tr", { style: { position:"sticky",top:0,background:"#111827",zIndex:1 } },
            /*#__PURE__*/React.createElement("th", { style: { ...s,fontSize:8,color:"#9B9BB4",textTransform:"uppercase",letterSpacing:1,padding:"10px 16px",textAlign:"left",borderBottom:".5px solid #2D2D44",minWidth:200,position:"sticky",left:0,background:"#111827" } }, "Empresa"),
            GRUPOS.map(g => /*#__PURE__*/React.createElement("th", { key:g.id, style: { ...s,fontSize:8,color:g.id===curGrupo.id?"#FF6B2B":"#9B9BB4",textTransform:"uppercase",letterSpacing:1,padding:"10px 12px",textAlign:"center",borderBottom:".5px solid #2D2D44",whiteSpace:"nowrap" } }, g.name))
          )
        ),
        /*#__PURE__*/React.createElement("tbody", null,
          loading ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", { colSpan:GRUPOS.length+1, style:{textAlign:"center",padding:32,...s,fontSize:10,color:"#2D2D44"} }, "carregando..."))
          : empresas.map(emp => {
            const baseKey = curGrupo.id + "_" + emp.rank;
            const compEstrelas = estrelas[baseKey] || {};
            return /*#__PURE__*/React.createElement("tr", { key:emp.rank, style:{borderBottom:".5px solid #111827"} },
              /*#__PURE__*/React.createElement("td", { style:{padding:"8px 16px",fontSize:11,color:"#F5F5F5",fontWeight:500,position:"sticky",left:0,background:"#0D0D0D",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"} }, emp.nome),
              GRUPOS.map(g => {
                const key = g.id + "_" + emp.rank;
                const val = (estrelas[key] || {})[g.id] || 0;
                const isMe = g.id === curGrupo.id;
                return /*#__PURE__*/React.createElement("td", { key:g.id, style:{padding:"6px 12px",textAlign:"center"} },
                  /*#__PURE__*/React.createElement(StarWidget, { value:val, size:13, onChange:isMe ? (v => handleStar(key, g.id, v)) : null })
                );
              })
            );
          })
        )
      )
    )
  );
}

/* ═══════════════════════════════════════════════════════════════
   PIPELINE VIEW — GAIA e Holding
   Visual kanban limpo, sem precisar clicar em botão extra
   ═══════════════════════════════════════════════════════════════ */

function PipelineView({
  tipo
}) {
  // tipo = 'gaia' ou 'holding'
  const isGaia = tipo === 'gaia';

  // Carrega dados do localStorage ou usa defaults
  const [kbData, setKbData] = React.useState(() => {
    const saved = lsGet('gh_kanban_v3', {});
    const tabs = saved.tabs || KB_DEFAULT_TABS;
    return {
      gaia: tabs.find(t => t.id === 'gaia') || KB_DEFAULT_TABS.find(t => t.id === 'gaia'),
      holding: tabs.find(t => t.id === 'holding') || KB_DEFAULT_TABS.find(t => t.id === 'holding')
    };
  });
  const tab = isGaia ? kbData.gaia : kbData.holding;
  const [dragId, setDragId] = React.useState(null);
  const [overCol, setOverCol] = React.useState(null);
  const [editCard, setEditCard] = React.useState(null); // card obj | {_new, col}
  const [empresaOpen, setEmpresaOpen] = React.useState(null); // card obj
  const [filterEmp, setFilterEmp] = React.useState('Todos');
  const [search, setSearch] = React.useState('');
  const [shareOpen, setShareOpen] = React.useState(false);
  if (!tab) return null;

  // ── Persistência ─────────────────────────────────────────────
  const persist = newTab => {
    const saved = lsGet('gh_kanban_v3', {});
    const tabs = (saved.tabs || KB_DEFAULT_TABS).map(t => t.id === newTab.id ? newTab : t);
    lsSet('gh_kanban_v3', {
      ...saved,
      tabs
    });
    setKbData(prev => ({
      ...prev,
      [tipo]: newTab
    }));
  };

  // ── Filtro ────────────────────────────────────────────────────
  const cards = React.useMemo(() => {
    return (tab.cards || []).filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.nota || c.note || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (!isGaia && filterEmp !== 'Todos' && (c.galeria || '') !== filterEmp) return false;
      if (isGaia && filterEmp !== 'Todos' && (c.product || '') !== filterEmp) return false;
      return true;
    });
  }, [tab.cards, search, filterEmp]);

  // ── Stats ─────────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    if (isGaia) {
      return [{
        label: 'Clientes Ativos',
        val: cards.filter(c => c.col === 'clientes').length,
        color: '#34D399'
      }, {
        label: 'Em Reunião',
        val: cards.filter(c => c.col === 'reuniao').length,
        color: '#A78BFA'
      }, {
        label: 'Proposta',
        val: cards.filter(c => c.col === 'proposta').length,
        color: '#fbbf24'
      }, {
        label: 'Aguardando',
        val: cards.filter(c => c.col === 'aguardando').length,
        color: '#9ca3af'
      }, {
        label: 'Total',
        val: cards.length,
        color: '#FF6B2B'
      }];
    } else {
      const pipeline = cards.filter(c => c.col !== 'clienteativo').reduce((s, c) => s + (+c.value || 0), 0);
      const ativos = cards.filter(c => c.col === 'clienteativo').reduce((s, c) => s + (+c.value || 0), 0);
      return [{
        label: 'Pipeline',
        val: kbFmtVal(pipeline) || '—',
        color: '#FF6B2B',
        big: true
      }, {
        label: 'Clientes Ativos',
        val: kbFmtVal(ativos) || '—',
        color: '#34D399',
        big: true
      }, {
        label: 'Concorrências',
        val: cards.filter(c => c.col === 'concorrencia').length,
        color: '#fb923c'
      }, {
        label: 'Negociando',
        val: cards.filter(c => c.col === 'negociacao').length,
        color: '#f472b6'
      }, {
        label: 'Total',
        val: cards.length,
        color: '#eee'
      }];
    }
  }, [cards]);

  // ── Drag & Drop ───────────────────────────────────────────────
  const onDrop = colId => {
    if (!dragId) return;
    const newCards = (tab.cards || []).map(c => c.id === dragId ? {
      ...c,
      col: colId
    } : c);
    persist({
      ...tab,
      cards: newCards
    });
    setDragId(null);
    setOverCol(null);
  };

  // ── CRUD ──────────────────────────────────────────────────────
  const saveCard = data => {
    let newCards;
    if (data.id && !data._new) {
      newCards = (tab.cards || []).map(c => c.id === data.id ? {
        ...c,
        ...data
      } : c);
    } else {
      const {
        _new,
        ...rest
      } = data;
      const newId = Math.max(0, ...(tab.cards || []).map(c => c.id || 0)) + 1;
      newCards = [...(tab.cards || []), {
        ...rest,
        id: newId
      }];
    }
    persist({
      ...tab,
      cards: newCards
    });
    setEditCard(null);
  };
  const deleteCard = id => {
    if (!window.confirm('Remover card?')) return;
    persist({
      ...tab,
      cards: (tab.cards || []).filter(c => c.id !== id)
    });
    setEditCard(null);
  };

  // ── Cores por coluna ─────────────────────────────────────────
  const ACCENT = {
    purple: '#a5a0f5',
    teal: '#34d399',
    blue: '#60a5fa',
    amber: '#fbbf24',
    green: '#86efac',
    red: '#f87171',
    orange: '#fb923c',
    gray: '#9ca3af',
    violet: '#c4b5fd',
    rose: '#fca5a5'
  };
  const colColor = col => ACCENT[col.accent || 'gray'] || '#9ca3af';
  const colVal = colId => (tab.cards || []).filter(c => c.col === colId).reduce((s, c) => s + (+c.value || 0), 0);

  // ── GAIA tag labels ──────────────────────────────────────────
  const TAG_MAP = {
    mrr: 'MRR',
    'poc-paga': 'POC paga',
    'poc-free': 'POC free',
    prop: 'Proposta',
    camp: 'Campanha'
  };
  const TAG_COLOR = {
    mrr: '#86efac',
    'poc-paga': '#60a5fa',
    'poc-free': '#9ca3af',
    prop: '#a5a0f5',
    camp: '#fbbf24'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0D0D0D',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '10px 20px',
      borderBottom: '.5px solid #2D2D44',
      flexShrink: 0,
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#F5F5F5',
      marginRight: 8
    }
  }, isGaia ? '⚡ Pipeline GAIA' : '🏢 Pipeline Holding'), stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.label,
    style: {
      background: '#111827',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '6px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: s.big ? 16 : 20,
      fontWeight: 700,
      fontFamily: 'IBM Plex Mono,monospace',
      color: s.color,
      lineHeight: 1
    }
  }, s.val), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 8,
      color: '#555',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, s.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Buscar...",
    style: {
      background: '#1A1A2E',
      border: '.5px solid #2D2D44',
      borderRadius: 6,
      padding: '5px 10px',
      color: '#F5F5F5',
      fontSize: 11,
      fontFamily: 'IBM Plex Mono,monospace',
      outline: 'none',
      width: 140
    }
  }), isGaia ? ['Todos', 'CR.IA', 'BrandSync'].map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    onClick: () => setFilterEmp(f),
    style: {
      padding: '4px 10px',
      borderRadius: 100,
      border: '.5px solid',
      fontSize: 9,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer',
      borderColor: filterEmp === f ? '#FF6B2B' : '#2D2D44',
      background: filterEmp === f ? 'rgba(255,107,43,.12)' : 'transparent',
      color: filterEmp === f ? '#FF6B2B' : '#9B9BB4'
    }
  }, f)) : ['Todos', 'Galeria', 'GAIA', 'Milà', '404', 'ccCaramelo', 'Catalyst'].map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    onClick: () => setFilterEmp(f),
    style: {
      padding: '4px 10px',
      borderRadius: 100,
      border: '.5px solid',
      fontSize: 9,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer',
      borderColor: filterEmp === f ? '#FF6B2B' : '#2D2D44',
      background: filterEmp === f ? 'rgba(255,107,43,.12)' : 'transparent',
      color: filterEmp === f ? '#FF6B2B' : '#9B9BB4'
    }
  }, f)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setEditCard({
      _new: true,
      col: (tab.cols || [])[0]?.id || '',
      name: '',
      galeria: '',
      value: '',
      product: 'CR.IA',
      note: ''
    }),
    style: {
      padding: '5px 14px',
      borderRadius: 8,
      border: 'none',
      background: '#FF6B2B',
      color: '#fff',
      fontSize: 11,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer',
      fontWeight: 600
    }
  }, "+ Card"), isGaia && /*#__PURE__*/React.createElement("button", {
    onClick: () => setShareOpen(true),
    title: "Gerar acesso somente leitura deste board para o time",
    style: {
      padding: '5px 14px',
      borderRadius: 8,
      border: '.5px solid rgba(167,139,250,.4)',
      background: 'rgba(167,139,250,.12)',
      color: '#A78BFA',
      fontSize: 11,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer',
      fontWeight: 600
    }
  }, "\u{1F517} Compartilhar"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowX: 'auto',
      overflowY: 'hidden',
      padding: '12px 20px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      minWidth: 'max-content',
      height: '100%'
    }
  }, (tab.cols || []).map(col => {
    const colCards = cards.filter(c => c.col === col.id);
    const allColCards = (tab.cards || []).filter(c => c.col === col.id);
    const cc = colColor(col);
    const cv = colVal(col.id);
    const isOver = overCol === col.id;
    return /*#__PURE__*/React.createElement("div", {
      key: col.id,
      style: {
        width: 210,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: 'calc(100vh - 160px)'
      },
      onDragOver: e => {
        e.preventDefault();
        setOverCol(col.id);
      },
      onDrop: () => onDrop(col.id),
      onDragLeave: () => setOverCol(null)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '10px 12px 8px',
        background: isOver ? `rgba(${cc.slice(1).match(/.{2}/g).map(x => parseInt(x, 16)).join(',')},0.08)` : '#111827',
        borderRadius: '8px 8px 0 0',
        border: `.5px solid ${isOver ? cc : '#2D2D44'}`,
        borderBottom: 'none',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 3
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: cc
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: cc,
        textTransform: 'uppercase',
        letterSpacing: .8,
        fontFamily: 'IBM Plex Mono,monospace'
      }
    }, col.label)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontFamily: 'IBM Plex Mono,monospace',
        background: 'rgba(255,255,255,.06)',
        color: '#9B9BB4',
        padding: '1px 7px',
        borderRadius: 100
      }
    }, allColCards.length)), cv > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        fontFamily: 'IBM Plex Mono,monospace',
        color: cc,
        fontWeight: 600
      }
    }, kbFmtVal(cv))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        background: '#0f1623',
        border: `.5px solid ${isOver ? cc : '#2D2D44'}`,
        borderTop: 'none',
        borderRadius: '0 0 8px 8px',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }
    }, colCards.map(card => {
      const galLabel = card.galeria || card.product || null;
      const galColor = {
        'CR.IA': 'rgba(83,74,183,.8)',
        'BrandSync': 'rgba(15,110,86,.8)',
        'Galeria': 'rgba(232,201,122,.8)',
        'Milà': 'rgba(201,168,124,.8)',
        '404': 'rgba(126,184,212,.8)',
        'ccCaramelo': 'rgba(232,145,106,.8)',
        'Catalyst': 'rgba(52,211,153,.8)',
        'GAIA': 'rgba(167,139,250,.8)'
      }[galLabel] || 'rgba(155,155,180,.6)';
      return /*#__PURE__*/React.createElement("div", {
        key: card.id,
        draggable: true,
        onDragStart: () => setDragId(card.id),
        onDragEnd: () => {
          setDragId(null);
          setOverCol(null);
        },
        onClick: () => setEmpresaOpen({...card, _colLabel: col.label}),
        style: {
          background: '#1A1A2E',
          border: `.5px solid ${dragId === card.id ? cc : '#2D2D44'}`,
          borderRadius: 8,
          padding: '10px 11px',
          cursor: 'pointer',
          transition: 'all .15s',
          opacity: dragId === card.id ? .4 : 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 6,
          marginBottom: 4
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 600,
          color: '#F5F5F5',
          lineHeight: 1.3
        }
      }, card.name), /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:4,flexShrink:0}},
      galLabel && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          fontFamily: 'IBM Plex Mono,monospace',
          padding: '2px 7px',
          borderRadius: 100,
          background: galColor,
          color: '#fff',
          whiteSpace: 'nowrap'
        }
      }, galLabel),
      /*#__PURE__*/React.createElement("span", {
        title: 'Editar card',
        onClick: e => { e.stopPropagation(); setEditCard({...card}); },
        style: {fontSize:10, cursor:'pointer', color:'#4B4B6A', padding:'1px 3px', borderRadius:4, lineHeight:1}
      }, '✏️'))), (card.note || card.nota) && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: '#555',
          lineHeight: 1.5,
          marginBottom: 4,
          fontFamily: 'IBM Plex Mono,monospace'
        }
      }, card.note || card.nota), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          marginTop: 2
        }
      }, card.value > 0 && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: '#34D399',
          fontFamily: 'IBM Plex Mono,monospace'
        }
      }, kbFmtVal(card.value)), card.tag && TAG_MAP[card.tag] && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          fontFamily: 'IBM Plex Mono,monospace',
          padding: '1px 6px',
          borderRadius: 100,
          background: `${TAG_COLOR[card.tag]}22`,
          color: TAG_COLOR[card.tag],
          border: `.5px solid ${TAG_COLOR[card.tag]}44`,
          marginLeft: 'auto'
        }
      }, TAG_MAP[card.tag])));
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: 32,
        border: `1px dashed ${isOver ? cc : '#2D2D44'}`,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all .15s',
        marginTop: 2,
        opacity: .6
      },
      onDragOver: e => {
        e.preventDefault();
        setOverCol(col.id);
      },
      onDrop: () => onDrop(col.id)
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: isOver ? cc : '#2D2D44',
        fontFamily: 'IBM Plex Mono,monospace'
      }
    }, isOver ? 'Soltar aqui' : '+ novo card'))));
  }))), empresaOpen && /*#__PURE__*/React.createElement(EmpresaDrawer, {
    card: empresaOpen,
    tab: tab,
    onClose: () => setEmpresaOpen(null),
    onDescartar: id => {
      const fn = window.__kanbanDescartar || (async()=>{});
      fn(id).then(() => {
        persist({...tab, cards: (tab.cards||[]).map(c => c.id===id ? {...c, col:'perdido'} : c)});
        setEmpresaOpen(null);
      });
    },
    onDeletar: id => {
      if (!window.confirm('Deletar este card permanentemente?')) return;
      const fn = window.__kanbanDeletar || (async()=>{});
      fn(id).then(() => {
        persist({...tab, cards: (tab.cards||[]).filter(c => c.id!==id)});
        setEmpresaOpen(null);
      });
    }
  }), editCard && /*#__PURE__*/React.createElement(PipelineCardModal, {
    card: editCard,
    cols: tab.cols || [],
    isGaia: isGaia,
    onSave: saveCard,
    onDelete: editCard.id && !editCard._new ? () => deleteCard(editCard.id) : null,
    onClose: () => setEditCard(null)
  }), shareOpen && window.GaiaShareModal && /*#__PURE__*/React.createElement(window.GaiaShareModal, {
    tab: tab,
    onClose: () => setShareOpen(false)
  }));
}
var SUPA_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
var SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
function supaFetch(path, opts) {
  var hdrs = Object.assign({'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json'}, opts && opts.headers);
  return fetch(SUPA_URL + path, Object.assign({}, opts, {headers: hdrs})).then(function(r){ return r.json(); });
}

function HoldingHome({ agencias }) {
  var COLS = [
    {id:'contato', label:'1º Contato'},
    {id:'reuniao', label:'Reunião'},
    {id:'proposta', label:'Proposta'},
    {id:'negociacao', label:'Negociação'},
    {id:'fechamento', label:'Fechamento'},
  ];
  var AG = Array.isArray(agencias) ? agencias : [];
  var [cards, setCards] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [filterAg, setFilterAg] = React.useState('all');
  var [filterCol, setFilterCol] = React.useState('all');
  var [search, setSearch] = React.useState('');
  var [dragging, setDragging] = React.useState(null);

  React.useEffect(function() {
    supaFetch('/rest/v1/crm_kanban?select=*&order=ordem.asc').then(function(d) {
      setCards(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }, []);

  function agenciaFromCard(card) {
    var agId = (card.agencia_id || card.responsavel || '').toLowerCase().trim();
    return AG.find(function(a) { return a.id.toLowerCase() === agId; })
      || {id: agId, name: card.agencia_id || card.responsavel || '—', color: '#555'};
  }

  var visible = cards.filter(function(c) {
    if (filterAg !== 'all') { var ag = agenciaFromCard(c); if (ag.id !== filterAg) return false; }
    if (filterCol !== 'all' && c.col !== filterCol) return false;
    if (search) { var q = search.toLowerCase(); if (!(c.nome||'').toLowerCase().includes(q) && !(c.produto||'').toLowerCase().includes(q) && !(c.responsavel||'').toLowerCase().includes(q)) return false; }
    return true;
  });

  var weekGoals = React.useMemo(function() {
    var weeks = [];
    var now = new Date();
    for (var w = 0; w < 5; w++) {
      var wStart = new Date(now); wStart.setDate(wStart.getDate() - wStart.getDay() - w * 7); wStart.setHours(0,0,0,0);
      var wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7);
      var wCards = cards.filter(function(c) { var d = new Date(c.atualizado_em); return c.col === 'reuniao' && d >= wStart && d < wEnd; });
      var byAg = {}; wCards.forEach(function(c) { var ag = agenciaFromCard(c); byAg[ag.id] = (byAg[ag.id]||0) + 1; });
      weeks.push({label: w===0?'Esta semana':'Sem -'+w, total: wCards.length, byAg: byAg});
    }
    return weeks;
  }, [cards]);

  function moveCard(cardId, newCol) {
    setCards(function(p) { return p.map(function(c) { return c.id===cardId ? Object.assign({},c,{col:newCol}) : c; }); });
    supaFetch('/rest/v1/crm_kanban?id=eq.'+cardId, {method:'PATCH', headers:{'Prefer':'return=minimal'}, body: JSON.stringify({col:newCol, atualizado_em:new Date().toISOString()})});
  }

  function renderCard(card) {
    var ag = agenciaFromCard(card);
    return React.createElement("div", {key:card.id, draggable:true, onDragStart:function(){setDragging(card.id);}, onDragEnd:function(){setDragging(null);},
      style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderLeft:'2px solid '+ag.color,borderRadius:6,padding:'8px 10px',cursor:'grab',marginBottom:6,userSelect:'none'}},
      React.createElement("div",{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:4}},
        React.createElement("div",{style:{fontSize:12,fontWeight:600,color:'#F5F5F5',lineHeight:1.3,flex:1}}, card.nome||'—'),
        React.createElement("span",{style:{fontSize:8,fontFamily:'IBM Plex Mono,monospace',background:ag.color+'22',color:ag.color,padding:'1px 5px',borderRadius:100,flexShrink:0,marginTop:1}}, ag.name)
      ),
      card.produto && React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',marginTop:3}}, card.produto),
      card.valor && React.createElement("div",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#34D399',marginTop:3}},
        'R$ '+Number(card.valor).toLocaleString('pt-BR')
      )
    );
  }

  return React.createElement("div",{style:{display:'flex',flex:1,flexDirection:'column',overflow:'hidden',background:'#060610'}},
    React.createElement("div",{style:{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',borderBottom:'.5px solid #1A1A2E',flexWrap:'wrap',flexShrink:0}},
      COLS.map(function(c) {
        var cnt = cards.filter(function(k){return k.col===c.id;}).length;
        return React.createElement("div",{key:c.id,style:{display:'flex',alignItems:'center',gap:4,padding:'3px 10px',background:'#0D0D1A',borderRadius:4,border:'.5px solid #1A1A2E'}},
          React.createElement("span",{style:{fontSize:14,fontWeight:700,color:'#FF6B2B',fontFamily:'IBM Plex Mono,monospace'}}, cnt),
          React.createElement("span",{style:{fontSize:9,color:'#555',fontFamily:'IBM Plex Mono,monospace'}}, c.label)
        );
      }),
      React.createElement("div",{style:{flex:1}}),
      React.createElement("input",{value:search,onChange:function(e){setSearch(e.target.value);},placeholder:'Buscar…',style:{background:'#0D0D1A',border:'.5px solid #2D2D44',borderRadius:4,padding:'4px 8px',color:'#F5F5F5',fontSize:11,outline:'none',fontFamily:'IBM Plex Mono,monospace',width:130}}),
      React.createElement("select",{value:filterAg,onChange:function(e){setFilterAg(e.target.value);},style:{background:'#0D0D1A',border:'.5px solid #2D2D44',borderRadius:4,padding:'4px 8px',color:'#9B9BB4',fontSize:11,outline:'none'}},
        React.createElement("option",{value:'all'},'Todas agências'),
        AG.map(function(a){return React.createElement("option",{key:a.id,value:a.id},a.name);})
      ),
      React.createElement("select",{value:filterCol,onChange:function(e){setFilterCol(e.target.value);},style:{background:'#0D0D1A',border:'.5px solid #2D2D44',borderRadius:4,padding:'4px 8px',color:'#9B9BB4',fontSize:11,outline:'none'}},
        React.createElement("option",{value:'all'},'Todas etapas'),
        COLS.map(function(c){return React.createElement("option",{key:c.id,value:c.id},c.label);})
      )
    ),
    React.createElement("div",{style:{display:'flex',flex:1,overflow:'hidden'}},
      React.createElement("div",{style:{display:'flex',flex:1,overflow:'auto',gap:6,padding:'10px 12px'}},
        COLS.map(function(col) {
          var colCards = visible.filter(function(c){return c.col===col.id;});
          return React.createElement("div",{key:col.id,
            onDragOver:function(e){e.preventDefault();},
            onDrop:function(e){e.preventDefault();if(dragging)moveCard(dragging,col.id);},
            style:{flex:'0 0 190px',background:'#08080F',border:'.5px solid #1A1A2E',borderRadius:8,display:'flex',flexDirection:'column',maxHeight:'100%'}},
            React.createElement("div",{style:{padding:'7px 10px',borderBottom:'.5px solid #1A1A2E',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}},
              React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:9,color:'#9B9BB4',fontWeight:700,letterSpacing:.5}}, col.label.toUpperCase()),
              React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:13,color:'#FF6B2B',fontWeight:700}}, colCards.length)
            ),
            React.createElement("div",{style:{overflowY:'auto',padding:'6px',flex:1}},
              loading ? React.createElement("div",{style:{color:'#555',fontSize:11,textAlign:'center',marginTop:20}},'…') :
              colCards.map(renderCard)
            )
          );
        })
      ),
      React.createElement("div",{style:{width:210,borderLeft:'.5px solid #1A1A2E',background:'#08080F',display:'flex',flexDirection:'column',overflow:'auto',padding:'12px 14px',flexShrink:0}},
        React.createElement("div",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:9,color:'#9B9BB4',fontWeight:700,letterSpacing:.5,marginBottom:4}}, 'METAS REUNIÕES'),
        React.createElement("div",{style:{fontSize:8,color:'#555',fontFamily:'IBM Plex Mono,monospace',marginBottom:12}}, '40/sem · 3/agência'),
        weekGoals.map(function(week, wi) {
          return React.createElement("div",{key:wi,style:{marginBottom:14}},
            React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}},
              React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:8,color:'#555'}}, week.label),
              React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:11,fontWeight:700,color:week.total>=40?'#34D399':'#E24B4A'}}, week.total+'/40')
            ),
            AG.map(function(a) {
              var n = week.byAg[a.id] || 0;
              return React.createElement("div",{key:a.id,style:{display:'flex',alignItems:'center',gap:4,marginBottom:2}},
                React.createElement("div",{style:{width:4,height:4,borderRadius:'50%',background:a.color,flexShrink:0}}),
                React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:8,color:'#666',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, a.id),
                React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:8,color:n>=3?'#34D399':'#E24B4A',fontWeight:700}}, n+'/3')
              );
            })
          );
        })
      )
    )
  );
}

function AgNoticiasTab({ agencia, agenciaUuids }) {
  var [noticias, setNoticias] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var agId = agencia ? agencia.id : '';

  React.useEffect(function() {
    if (!agId) return;
    supaFetch('/rest/v1/crm_kanban?select=empresa_id&responsavel=ilike.*'+encodeURIComponent(agId)+'*').then(function(rows) {
      if (!Array.isArray(rows) || rows.length === 0) { setLoading(false); return; }
      var ids = rows.map(function(r){return r.empresa_id;}).filter(Boolean);
      if (ids.length === 0) { setLoading(false); return; }
      var inClause = '('+ids.map(function(i){return '"'+i+'"';}).join(',')+')'
      supaFetch('/rest/v1/crm_noticias?empresa_id=in.'+inClause+'&order=data.desc&limit=50').then(function(n) {
        setNoticias(Array.isArray(n)?n:[]);
        setLoading(false);
      });
    }).catch(function(){setLoading(false);});
  }, [agId]);

  function usarGancho(n) {
    var txt = '[GANCHO] '+n.titulo+(n.resumo?'\n'+n.resumo:'')+(n.url?'\nLink: '+n.url:'');
    try { navigator.clipboard.writeText(txt); } catch(e){}
  }

  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11,padding:20}},'Carregando notícias…');
  if (noticias.length === 0) return React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11,padding:20}},'Nenhuma notícia para empresas do pipeline desta agência.');
  return React.createElement("div",{style:{overflowY:'auto',flex:1,padding:'12px 20px'}},
    noticias.map(function(n) {
      return React.createElement("div",{key:n.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,padding:'10px 14px',marginBottom:8}},
        React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}},
          React.createElement("div",{style:{flex:1}},
            React.createElement("div",{style:{fontSize:13,fontWeight:600,color:'#F5F5F5',lineHeight:1.3,marginBottom:4}}, n.titulo),
            n.resumo && React.createElement("div",{style:{fontSize:11,color:'#9B9BB4',lineHeight:1.5,marginBottom:6}}, n.resumo),
            React.createElement("div",{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
              n.fonte && React.createElement("span",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#555'}}, n.fonte),
              n.data && React.createElement("span",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#555'}}, new Date(n.data).toLocaleDateString('pt-BR')),
              n.sinal && React.createElement("span",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',background:'#FF6B2B22',color:'#FF6B2B',padding:'1px 6px',borderRadius:100}}, n.sinal),
              n.url && React.createElement("a",{href:n.url,target:'_blank',rel:'noopener',style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#60A5FA',textDecoration:'none'}},'↗ Abrir')
            )
          ),
          React.createElement("button",{onClick:function(){usarGancho(n);},style:{padding:'4px 10px',border:'.5px solid #FF6B2B44',borderRadius:4,background:'transparent',color:'#FF6B2B',fontSize:9,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}, 'Usar como gancho')
        )
      );
    })
  );
}

function AgServicosTab({ agencia, agenciaUuids }) {
  var [servicos, setServicos] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [form, setForm] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var agUuid = agenciaUuids && agencia ? (agenciaUuids[agencia.id] || null) : null;

  React.useEffect(function() {
    if (!agUuid) { setLoading(false); return; }
    supaFetch('/rest/v1/crm_servicos?agencia_id=eq.'+agUuid+'&order=nome.asc').then(function(d) {
      setServicos(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, [agUuid]);

  function save() {
    if (!form || !form.nome) return;
    setSaving(true);
    if (form.id) {
      supaFetch('/rest/v1/crm_servicos?id=eq.'+form.id, {method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({nome:form.nome,descricao:form.descricao,preco_min:form.preco_min||null,preco_max:form.preco_max||null,sinais_de_encaixe:form.sinais_de_encaixe})})
        .then(function(d){setSaving(false);setForm(null);setServicos(function(p){return p.map(function(s){return s.id===form.id?Object.assign({},s,d[0]):s;});});});
    } else {
      supaFetch('/rest/v1/crm_servicos', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({agencia_id:agUuid,nome:form.nome,descricao:form.descricao,preco_min:form.preco_min||null,preco_max:form.preco_max||null,sinais_de_encaixe:form.sinais_de_encaixe,ativo:true})})
        .then(function(d){setSaving(false);setForm(null);if(Array.isArray(d))setServicos(function(p){return[...p,...d];});});
    }
  }

  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:'IBM Plex Mono,monospace'};
  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11,padding:20}},'…');
  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    !form && React.createElement("button",{onClick:function(){setForm({nome:'',descricao:'',preco_min:'',preco_max:'',sinais_de_encaixe:'',ticket:'',ativo:true});},style:{marginBottom:12,padding:'6px 14px',border:'.5px solid #FF6B2B44',borderRadius:6,background:'transparent',color:'#FF6B2B',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},'+ Novo serviço'),
    form && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #2D2D44',borderRadius:8,padding:'12px',marginBottom:12}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#FF6B2B',fontFamily:'IBM Plex Mono,monospace',marginBottom:10}}, form.id?'Editar serviço':'Novo serviço'),
      ['nome','descricao','preco_min','preco_max','sinais_de_encaixe'].map(function(f) {
        return React.createElement("div",{key:f,style:{marginBottom:8}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}}, ({nome:'Nome',descricao:'Descrição',preco_min:'Preço mín (R$)',preco_max:'Preço máx (R$)',sinais_de_encaixe:'Ticket de entrada / sinais de encaixe'})[f]),
          f==='descricao' || f==='sinais_de_encaixe'
            ? React.createElement("textarea",{style:Object.assign({},inp,{height:60,resize:'vertical'}),value:form[f]||'',onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,Object.fromEntries([[f,v]]));});}})
            : React.createElement("input",{style:inp,value:form[f]||'',type:f.includes('preco')?'number':'text',onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,Object.fromEntries([[f,v]]));});}})
        );
      }),
      React.createElement("div",{style:{display:'flex',gap:8,marginTop:6}},
        React.createElement("button",{onClick:save,disabled:saving,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#FF6B2B',color:'#fff',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}}, saving?'…':'Salvar'),
        React.createElement("button",{onClick:function(){setForm(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}}, 'Cancelar')
      )
    ),
    !agUuid && React.createElement("div",{style:{color:'#E24B4A',fontFamily:'IBM Plex Mono,monospace',fontSize:11}},'Agência sem UUID cadastrado.'),
    servicos.map(function(s) {
      return React.createElement("div",{key:s.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,padding:'10px 14px',marginBottom:8}},
        React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}},
          React.createElement("div",{style:{flex:1}},
            React.createElement("div",{style:{fontSize:13,fontWeight:600,color:'#F5F5F5',marginBottom:3}}, s.nome),
            s.descricao && React.createElement("div",{style:{fontSize:11,color:'#9B9BB4',lineHeight:1.5,marginBottom:6}}, s.descricao),
            React.createElement("div",{style:{display:'flex',gap:10,flexWrap:'wrap'}},
              s.preco_min && React.createElement("span",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#34D399'}}, 'R$ '+Number(s.preco_min).toLocaleString('pt-BR')+' – '+Number(s.preco_max||s.preco_min).toLocaleString('pt-BR')),
              s.sinais_de_encaixe && React.createElement("span",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#A78BFA'}}, s.sinais_de_encaixe)
            )
          ),
          React.createElement("button",{onClick:function(){setForm(Object.assign({},s));},style:{padding:'3px 8px',border:'.5px solid #2D2D44',borderRadius:4,background:'transparent',color:'#555',fontSize:9,cursor:'pointer'}},'Editar')
        )
      );
    })
  );
}

function AgCasesTab({ agencia, agenciaUuids }) {
  var [cases, setCases] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [form, setForm] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var agUuid = agenciaUuids && agencia ? (agenciaUuids[agencia.id] || null) : null;

  React.useEffect(function() {
    if (!agUuid) { setLoading(false); return; }
    supaFetch('/rest/v1/crm_cases?agencia_id=eq.'+agUuid+'&order=titulo.asc').then(function(d) {
      setCases(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, [agUuid]);

  function thumbUrl(url) {
    if (!url) return null;
    var yt = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return 'https://img.youtube.com/vi/'+yt[1]+'/mqdefault.jpg';
    return null;
  }

  function save() {
    if (!form || !form.titulo) return;
    setSaving(true);
    var payload = {titulo:form.titulo,marca:form.marca,categoria_da_marca:form.categoria_da_marca,tipo:form.tipo,url_video:form.url_video,url_pagina:form.url_pagina,idioma:form.idioma||'pt',resumo:form.resumo,ativo:true};
    if (form.id) {
      supaFetch('/rest/v1/crm_cases?id=eq.'+form.id, {method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)})
        .then(function(d){setSaving(false);setForm(null);setCases(function(p){return p.map(function(s){return s.id===form.id?Object.assign({},s,Array.isArray(d)?d[0]:{}):s;});});});
    } else {
      supaFetch('/rest/v1/crm_cases', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(Object.assign({agencia_id:agUuid},payload))})
        .then(function(d){setSaving(false);setForm(null);if(Array.isArray(d))setCases(function(p){return[...p,...d];});});
    }
  }

  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:'IBM Plex Mono,monospace'};
  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11,padding:20}},'…');
  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    !form && React.createElement("button",{onClick:function(){setForm({titulo:'',marca:'',categoria_da_marca:'',tipo:'',url_video:'',url_pagina:'',idioma:'pt',resumo:''});},style:{marginBottom:12,padding:'6px 14px',border:'.5px solid #FF6B2B44',borderRadius:6,background:'transparent',color:'#FF6B2B',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},'+ Novo case'),
    form && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #2D2D44',borderRadius:8,padding:'12px',marginBottom:12}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#FF6B2B',fontFamily:'IBM Plex Mono,monospace',marginBottom:10}},form.id?'Editar case':'Novo case'),
      [['titulo','Título'],['marca','Marca'],['categoria_da_marca','Categoria'],['tipo','Tipo (video/projeto)'],['url_video','URL do vídeo (YouTube/Vimeo)'],['url_pagina','URL da página'],['resumo','Resumo']].map(function(pair) {
        var f=pair[0],l=pair[1];
        return React.createElement("div",{key:f,style:{marginBottom:8}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}}, l),
          f==='resumo'
            ? React.createElement("textarea",{style:Object.assign({},inp,{height:60,resize:'vertical'}),value:form[f]||'',onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,Object.fromEntries([[f,v]]));});}})
            : React.createElement("input",{style:inp,value:form[f]||'',onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,Object.fromEntries([[f,v]]));});}})
        );
      }),
      form.url_video && thumbUrl(form.url_video) && React.createElement("img",{src:thumbUrl(form.url_video),alt:'thumb',style:{width:'100%',borderRadius:6,marginBottom:8,objectFit:'cover',maxHeight:120}}),
      React.createElement("div",{style:{display:'flex',gap:8,marginTop:6}},
        React.createElement("button",{onClick:save,disabled:saving,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#FF6B2B',color:'#fff',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}}, saving?'…':'Salvar'),
        React.createElement("button",{onClick:function(){setForm(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}}, 'Cancelar')
      )
    ),
    React.createElement("div",{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}},
      cases.map(function(c) {
        var thumb = thumbUrl(c.url_video);
        return React.createElement("div",{key:c.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,overflow:'hidden'}},
          thumb && React.createElement("img",{src:thumb,alt:'thumb',style:{width:'100%',height:120,objectFit:'cover',display:'block'}}),
          React.createElement("div",{style:{padding:'10px 12px'}},
            React.createElement("div",{style:{fontSize:12,fontWeight:600,color:'#F5F5F5',marginBottom:3}}, c.titulo),
            c.marca && React.createElement("div",{style:{fontSize:10,color:'#A78BFA',marginBottom:4}}, c.marca+(c.categoria_da_marca?' · '+c.categoria_da_marca:'')),
            c.resumo && React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',lineHeight:1.5,marginBottom:6}}, c.resumo),
            React.createElement("div",{style:{display:'flex',gap:6}},
              c.url_video && React.createElement("a",{href:c.url_video,target:'_blank',rel:'noopener',style:{fontSize:9,color:'#60A5FA',fontFamily:'IBM Plex Mono,monospace'}},'▶ Vídeo'),
              c.url_pagina && React.createElement("a",{href:c.url_pagina,target:'_blank',rel:'noopener',style:{fontSize:9,color:'#60A5FA',fontFamily:'IBM Plex Mono,monospace'}},'↗ Página'),
              React.createElement("button",{onClick:function(){setForm(Object.assign({},c));},style:{fontSize:9,color:'#555',background:'none',border:'none',cursor:'pointer',fontFamily:'IBM Plex Mono,monospace'}},'Editar')
            )
          )
        );
      })
    )
  );
}

function AgCredenciaisTab({ agencia }) {
  var [blocos, setBlocos] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [form, setForm] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var agId = agencia ? agencia.id : '';

  React.useEffect(function() {
    if (!agId) return;
    supaFetch('/rest/v1/crm_credenciais_blocos?agencia_id=eq.'+agId+'&ativo=eq.true&order=titulo.asc').then(function(d) {
      setBlocos(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, [agId]);

  function save() {
    if (!form || !form.titulo) return;
    setSaving(true);
    var payload = {agencia_id:agId,titulo:form.titulo,tipo:form.tipo||'geral',bloco:form.bloco||{},ativo:true};
    if (form.id) {
      supaFetch('/rest/v1/crm_credenciais_blocos?id=eq.'+form.id, {method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({titulo:form.titulo,tipo:form.tipo,bloco:form.bloco,atualizado_em:new Date().toISOString()})})
        .then(function(){setSaving(false);setForm(null);supaFetch('/rest/v1/crm_credenciais_blocos?agencia_id=eq.'+agId+'&ativo=eq.true&order=titulo.asc').then(function(d){setBlocos(Array.isArray(d)?d:[]);});});
    } else {
      supaFetch('/rest/v1/crm_credenciais_blocos', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)})
        .then(function(d){setSaving(false);setForm(null);if(Array.isArray(d))setBlocos(function(p){return[...p,...d];});});
    }
  }

  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:'IBM Plex Mono,monospace'};
  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11,padding:20}},'…');
  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    !form && React.createElement("button",{onClick:function(){setForm({titulo:'',tipo:'geral',blocoRaw:'{}'});},style:{marginBottom:12,padding:'6px 14px',border:'.5px solid #FF6B2B44',borderRadius:6,background:'transparent',color:'#FF6B2B',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},'+ Nova credencial'),
    form && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #2D2D44',borderRadius:8,padding:'12px',marginBottom:12}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#FF6B2B',fontFamily:'IBM Plex Mono,monospace',marginBottom:10}}, form.id?'Editar credencial':'Nova credencial'),
      [['titulo','Título'],['tipo','Tipo']].map(function(pair) {
        var f=pair[0],l=pair[1];
        return React.createElement("div",{key:f,style:{marginBottom:8}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}}, l),
          React.createElement("input",{style:inp,value:form[f]||'',onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,Object.fromEntries([[f,v]]));});}})
        );
      }),
      React.createElement("div",{style:{marginBottom:8}},
        React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}},'Dados (JSON)'),
        React.createElement("textarea",{style:Object.assign({},inp,{height:100,resize:'vertical',fontFamily:'monospace'}),value:form.blocoRaw||JSON.stringify(form.bloco||{}),onChange:function(e){var v=e.target.value;setForm(function(p){var b=p.bloco;try{b=JSON.parse(v);}catch(ex){}return Object.assign({},p,{blocoRaw:v,bloco:b});});}})
      ),
      React.createElement("div",{style:{display:'flex',gap:8}},
        React.createElement("button",{onClick:save,disabled:saving,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#FF6B2B',color:'#fff',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},saving?'…':'Salvar'),
        React.createElement("button",{onClick:function(){setForm(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},'Cancelar')
      )
    ),
    blocos.length===0 && !form && React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11}},'Nenhuma credencial cadastrada.'),
    blocos.map(function(b) {
      return React.createElement("div",{key:b.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,padding:'10px 14px',marginBottom:8}},
        React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}},
          React.createElement("span",{style:{fontSize:12,fontWeight:600,color:'#F5F5F5'}}, b.titulo),
          React.createElement("div",{style:{display:'flex',gap:6}},
            React.createElement("span",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#A78BFA',background:'#A78BFA22',padding:'1px 6px',borderRadius:100}}, b.tipo),
            React.createElement("button",{onClick:function(){setForm(Object.assign({},b,{blocoRaw:JSON.stringify(b.bloco||{},null,2)}));},style:{fontSize:9,color:'#555',background:'none',border:'none',cursor:'pointer'}},'Editar')
          )
        ),
        b.bloco && Object.keys(b.bloco).length>0 && React.createElement("pre",{style:{fontSize:10,color:'#9B9BB4',background:'#08080F',borderRadius:4,padding:'6px 8px',margin:0,overflowX:'auto',fontFamily:'monospace',whiteSpace:'pre-wrap'}},JSON.stringify(b.bloco,null,2))
      );
    })
  );
}

function AgTextosTab({ agencia }) {
  var [templates, setTemplates] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [form, setForm] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var agId = agencia ? agencia.id : '';
  var ETAPAS = ['contato','reuniao','proposta','negociacao','fechamento'];

  React.useEffect(function() {
    if (!agId) return;
    supaFetch('/rest/v1/crm_templates?agencia_id=eq.'+agId+'&order=etapa.asc,titulo.asc').then(function(d) {
      setTemplates(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, [agId]);

  function save() {
    if (!form || !form.titulo || !form.corpo) return;
    setSaving(true);
    var payload = {agencia_id:agId,etapa:form.etapa||'contato',titulo:form.titulo,corpo:form.corpo,tipo:form.tipo||'email'};
    if (form.id) {
      supaFetch('/rest/v1/crm_templates?id=eq.'+form.id, {method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify(Object.assign(payload,{atualizado_em:new Date().toISOString()}))})
        .then(function(){setSaving(false);setForm(null);setTemplates(function(p){return p.map(function(t){return t.id===form.id?Object.assign({},t,payload):t;});});});
    } else {
      supaFetch('/rest/v1/crm_templates', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)})
        .then(function(d){setSaving(false);setForm(null);if(Array.isArray(d))setTemplates(function(p){return[...p,...d];});});
    }
  }

  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:'IBM Plex Mono,monospace'};
  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11,padding:20}},'…');
  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    !form && React.createElement("button",{onClick:function(){setForm({etapa:'contato',titulo:'',corpo:'',tipo:'email'});},style:{marginBottom:12,padding:'6px 14px',border:'.5px solid #FF6B2B44',borderRadius:6,background:'transparent',color:'#FF6B2B',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},'+ Novo template'),
    form && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #2D2D44',borderRadius:8,padding:'12px',marginBottom:12}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#FF6B2B',fontFamily:'IBM Plex Mono,monospace',marginBottom:10}},form.id?'Editar template':'Novo template'),
      React.createElement("div",{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}},'Etapa'),
          React.createElement("select",{style:Object.assign({},inp),value:form.etapa,onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,{etapa:v});});}},
            ETAPAS.map(function(e){return React.createElement("option",{key:e,value:e},e);})
          )
        ),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}},'Tipo'),
          React.createElement("select",{style:Object.assign({},inp),value:form.tipo,onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,{tipo:v});});}},
            ['email','whatsapp','linkedin','apresentacao'].map(function(t){return React.createElement("option",{key:t,value:t},t);})
          )
        )
      ),
      React.createElement("div",{style:{marginBottom:8}},
        React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}},'Título'),
        React.createElement("input",{style:inp,value:form.titulo,onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,{titulo:v});})}})
      ),
      React.createElement("div",{style:{marginBottom:8}},
        React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2}},'Corpo do texto'),
        React.createElement("textarea",{style:Object.assign({},inp,{height:150,resize:'vertical',lineHeight:1.5}),value:form.corpo,onChange:function(e){var v=e.target.value;setForm(function(p){return Object.assign({},p,{corpo:v});})}})
      ),
      React.createElement("div",{style:{display:'flex',gap:8}},
        React.createElement("button",{onClick:save,disabled:saving,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#FF6B2B',color:'#fff',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},saving?'…':'Salvar'),
        React.createElement("button",{onClick:function(){setForm(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},'Cancelar')
      )
    ),
    ETAPAS.map(function(etapa) {
      var etapaTs = templates.filter(function(t){return t.etapa===etapa;});
      if (etapaTs.length===0) return null;
      return React.createElement("div",{key:etapa,style:{marginBottom:16}},
        React.createElement("div",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:9,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}, etapa),
        etapaTs.map(function(t) {
          return React.createElement("div",{key:t.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,padding:'10px 14px',marginBottom:6}},
            React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}},
              React.createElement("span",{style:{fontSize:12,fontWeight:600,color:'#F5F5F5'}}, t.titulo),
              React.createElement("div",{style:{display:'flex',gap:6}},
                React.createElement("span",{style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#A78BFA',background:'#A78BFA22',padding:'1px 6px',borderRadius:100}}, t.tipo),
                React.createElement("button",{onClick:function(){setForm(Object.assign({},t));},style:{fontSize:9,color:'#555',background:'none',border:'none',cursor:'pointer'}},'Editar')
              )
            ),
            React.createElement("pre",{style:{fontSize:10,color:'#9B9BB4',margin:0,whiteSpace:'pre-wrap',fontFamily:'IBM Plex Mono,monospace',lineHeight:1.5}}, t.corpo)
          );
        })
      );
    })
  );
}

function AgEnviarTab({ agencia }) {
  var [cards, setCards] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [generating, setGenerating] = React.useState(false);
  var [html, setHtml] = React.useState(null);
  var agId = agencia ? agencia.id : '';

  React.useEffect(function() {
    if (!agId) return;
    supaFetch('/rest/v1/crm_kanban?responsavel=ilike.*'+encodeURIComponent(agId)+'*&select=*&order=col.asc,nome.asc').then(function(d) {
      setCards(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, [agId]);

  function generate() {
    setGenerating(true);
    var colLabels = {contato:'1º Contato',reuniao:'Reunião',proposta:'Proposta',negociacao:'Negociação',fechamento:'Fechamento'};
    var byCol = {};
    cards.forEach(function(c){if(!byCol[c.col])byCol[c.col]=[];byCol[c.col].push(c);});
    var colOrder = ['contato','reuniao','proposta','negociacao','fechamento'];
    var rows = colOrder.filter(function(c){return byCol[c]&&byCol[c].length>0;}).map(function(col) {
      var cs = byCol[col];
      var items = cs.map(function(c){return '<li style="margin-bottom:6px"><strong>'+c.nome+'</strong>'+(c.produto?' — '+c.produto:'')+(c.valor?' <span style="color:#34D399">R$ '+Number(c.valor).toLocaleString('pt-BR')+'</span>':'')+'</li>';}).join('');
      return '<div style="margin-bottom:24px"><h3 style="font-family:monospace;font-size:11px;color:#FF6B2B;letter-spacing:1px;text-transform:uppercase;margin:0 0 10px">'+(colLabels[col]||col)+'</h3><ul style="padding-left:18px;margin:0">'+items+'</ul></div>';
    }).join('');
    var htmlStr = '<!DOCTYPE html><html><head><meta charset=UTF-8><title>Pipeline '+agencia.name+'</title></head><body style="background:#060610;color:#F5F5F5;font-family:sans-serif;padding:32px;max-width:600px;margin:0 auto"><div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;border-bottom:1px solid #1A1A2E;padding-bottom:16px"><div style="width:32px;height:32px;background:#FF6B2B;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:monospace;font-weight:bold;color:#fff">G</div><div><div style="font-family:monospace;font-size:14px;font-weight:700">GALERIA HOLDING</div><div style="font-family:monospace;font-size:10px;color:#9B9BB4">Pipeline — '+(agencia.name||'')+'</div></div></div>'+rows+'<div style="margin-top:32px;padding-top:16px;border-top:1px solid #1A1A2E;font-family:monospace;font-size:9px;color:#555">Gerado em '+new Date().toLocaleDateString('pt-BR')+' · Galeria Holding · Confidencial</div></body></html>';
    setHtml(htmlStr);
    setGenerating(false);
  }

  function copyHtml() { try { navigator.clipboard.writeText(html||''); } catch(e){} }

  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11,padding:20}},'…');
  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    React.createElement("div",{style:{marginBottom:16}},
      React.createElement("div",{style:{fontSize:11,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:8}}, cards.length+' cards no pipeline desta agência'),
      React.createElement("div",{style:{display:'flex',gap:8}},
        React.createElement("button",{onClick:generate,disabled:generating,style:{padding:'6px 16px',border:'none',borderRadius:6,background:'#FF6B2B',color:'#fff',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}}, generating?'Gerando…':'Gerar HTML do pipeline'),
        html && React.createElement("button",{onClick:copyHtml,style:{padding:'6px 16px',border:'.5px solid #2D2D44',borderRadius:6,background:'transparent',color:'#9B9BB4',fontSize:11,fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}},'Copiar HTML')
      )
    ),
    html && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,overflow:'hidden'}},
      React.createElement("div",{style:{padding:'8px 14px',borderBottom:'.5px solid #1A1A2E',fontFamily:'IBM Plex Mono,monospace',fontSize:9,color:'#555'}},'Preview (iframe)'),
      React.createElement("iframe",{srcDoc:html,style:{width:'100%',height:400,border:'none'},title:'Pipeline preview'})
    )
  );
}

function AgenciaHome({ agencia, tab, navTo, agenciaUuids }) {
  return React.createElement("div",{style:{display:'flex',flex:1,flexDirection:'column',overflow:'hidden'}},
    tab === 'pipeline' ? React.createElement("div",{style:{flex:1,overflow:'hidden'}},
      React.createElement(PipelineView, { tipo: agencia && agencia.id === 'gaia' ? 'gaia' : 'holding', agenciaFiltro: agencia && agencia.id !== 'gaia' ? agencia.id : null })
    ) :
    tab === 'noticias'    ? React.createElement(AgNoticiasTab,   {agencia:agencia, agenciaUuids:agenciaUuids}) :
    tab === 'servicos'    ? React.createElement(AgServicosTab,   {agencia:agencia, agenciaUuids:agenciaUuids}) :
    tab === 'cases'       ? React.createElement(AgCasesTab,      {agencia:agencia, agenciaUuids:agenciaUuids}) :
    tab === 'credenciais' ? React.createElement(AgCredenciaisTab,{agencia:agencia}) :
    tab === 'textos'      ? React.createElement(AgTextosTab,     {agencia:agencia}) :
    tab === 'enviar'      ? React.createElement(AgEnviarTab,     {agencia:agencia}) :
    React.createElement("div",{style:{padding:20,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11}}, tab)
  );
}

function EmpresaDrawer({ card, tab, onClose, onDescartar, onDeletar }) {
  const nome = card.name || card.nome || '';
  const [loading, setLoading]       = React.useState(true);
  const [empresaId, setEmpresaId]   = React.useState(null);
  const [kanbanId,  setKanbanId]    = React.useState(null);
  const [decisores, setDecisores]   = React.useState([]);
  const [toques,    setToques]      = React.useState([]);
  const [activeTab, setActiveTab]   = React.useState('decisores');
  const [showAddD,  setShowAddD]    = React.useState(false);
  const [showAddT,  setShowAddT]    = React.useState(false);
  const [novoD, setNovoD] = React.useState({nome:'',cargo:'',email:'',wa:''});
  const [novoT, setNovoT] = React.useState({canal:'email',tema:'',resumo:'',resultado:''});
  const [saving,  setSaving]        = React.useState(false);
  const [copied,  setCopied]        = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const match = await (window.__getEmpresaIdByNome || (async()=>null))(nome);
      if (cancelled) return;
      const eid = match && match.empresa_id;
      const kid = match && match.id;
      setEmpresaId(eid); setKanbanId(kid);
      if (eid) {
        const [d, t] = await Promise.all([
          (window.__getDecisores || (async()=>[]))(eid),
          (window.__getToques    || (async()=>[]))(eid)
        ]);
        if (!cancelled) { setDecisores(d); setToques(t); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [nome]);

  const addDecisor = async () => {
    if (!novoD.nome.trim() || !empresaId) return;
    setSaving(true);
    const saved = await (window.__saveDecisor||(async()=>null))({
      empresa_id: empresaId, nome: novoD.nome.trim(),
      cargo: novoD.cargo.trim()||null, email: novoD.email.trim()||null, wa: novoD.wa.trim()||null
    });
    setSaving(false);
    if (saved) { setDecisores(p=>[...p, saved]); setNovoD({nome:'',cargo:'',email:'',wa:''}); setShowAddD(false); }
  };

  const addToque = async () => {
    if (!novoT.resumo.trim() || !empresaId) return;
    setSaving(true);
    const saved = await (window.__saveToque||(async()=>null))({
      empresa_id: empresaId, canal: novoT.canal, direcao: 'saida',
      tema: novoT.tema.trim()||null, resumo: novoT.resumo.trim(),
      resultado: novoT.resultado.trim()||null, data: new Date().toISOString()
    });
    setSaving(false);
    if (saved) { setToques(p=>[saved,...p]); setNovoT({canal:'email',tema:'',resumo:'',resultado:''}); setShowAddT(false); }
  };

  const gerarEmail = () => {
    const stage = card._colLabel || card.col || '';
    const produto = card.product || card.produto || '';
    const dList = decisores.map(d =>
      `• ${d.nome}${d.cargo?' — '+d.cargo:''}${d.email?' | '+d.email:''}${d.wa?' | WA: '+d.wa:''}`
    ).join('\n') || '(nenhum cadastrado)';
    const ultT = toques[0];
    const toqueStr = ultT
      ? `${new Date(ultT.data).toLocaleDateString('pt-BR')} via ${ultT.canal}: ${ultT.resumo}${ultT.resultado?' → '+ultT.resultado:''}`
      : 'Sem histórico';
    const txt = `📌 Status: ${nome}\nEstágio: ${stage}${produto?' | '+produto:''}\n\nDecisores:\n${dList}\n\nÚltimo contato: ${toqueStr}\n\nNota: ${card.note||card.nota||'—'}`;
    try { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(()=>setCopied(false),2500); } catch(e){}
  };

  const S = {
    overlay: {position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.55)',display:'flex',justifyContent:'flex-end'},
    drawer:  {width:420,maxWidth:'95vw',background:'#111827',borderLeft:'.5px solid #2D2D44',display:'flex',flexDirection:'column',height:'100%',overflowY:'auto'},
    hdr:     {padding:'16px 18px 12px',borderBottom:'.5px solid #2D2D44',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,flexShrink:0},
    body:    {flex:1,padding:'0 18px 24px',overflowY:'auto'},
    sec:     {marginTop:20},
    secH:    {fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:10},
    card:    {background:'#1A1A2E',border:'.5px solid #2D2D44',borderRadius:8,padding:'10px 12px',marginBottom:8},
    lbl:     {fontSize:10,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginBottom:2},
    val:     {fontSize:12,color:'#F5F5F5'},
    inp:     {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'6px 10px',color:'#F5F5F5',fontSize:12,outline:'none',boxSizing:'border-box'},
    btn:     {padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:11,fontWeight:600},
    tabBtn:  (active) => ({padding:'5px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:11,fontWeight:600,background:active?'#7C3AED':'#1A1A2E',color:active?'#fff':'#9B9BB4'})
  };

  return /*#__PURE__*/React.createElement("div", {style:S.overlay, onClick:onClose},
    /*#__PURE__*/React.createElement("div", {style:S.drawer, onClick:e=>e.stopPropagation()},
      // ── Header
      /*#__PURE__*/React.createElement("div", {style:S.hdr},
        /*#__PURE__*/React.createElement("div", null,
          /*#__PURE__*/React.createElement("div", {style:{fontSize:16,fontWeight:700,color:'#F5F5F5',lineHeight:1.2}}, nome),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace',marginTop:4}},
            (card._colLabel||card.col||'')+(card.product||card.produto?' · '+(card.product||card.produto):'')
          )
        ),
        /*#__PURE__*/React.createElement("button", {onClick:onClose,style:{background:'none',border:'none',color:'#9B9BB4',cursor:'pointer',fontSize:18,padding:'0 4px',lineHeight:1}}, '✕')
      ),
      // ── Tabs
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:6,padding:'12px 18px 0',flexShrink:0}},
        /*#__PURE__*/React.createElement("button", {style:S.tabBtn(activeTab==='decisores'), onClick:()=>setActiveTab('decisores')}, 'Decisores'+(decisores.length?' ('+decisores.length+')':'')),
        /*#__PURE__*/React.createElement("button", {style:S.tabBtn(activeTab==='historico'),  onClick:()=>setActiveTab('historico')},  'Histórico'+(toques.length?' ('+toques.length+')':''))
      ),
      // ── Body
      /*#__PURE__*/React.createElement("div", {style:S.body},
        loading && /*#__PURE__*/React.createElement("div", {style:{color:'#9B9BB4',fontSize:12,marginTop:24,textAlign:'center'}}, 'Carregando…'),
        !loading && activeTab==='decisores' && /*#__PURE__*/React.createElement("div", {style:S.sec},
          decisores.length===0 && /*#__PURE__*/React.createElement("div", {style:{color:'#4B4B6A',fontSize:12,marginBottom:12}}, 'Nenhum decisor cadastrado.'),
          decisores.map(d => /*#__PURE__*/React.createElement("div", {key:d.id, style:S.card},
            /*#__PURE__*/React.createElement("div", {style:{fontWeight:600,fontSize:13,color:'#F5F5F5',marginBottom:4}}, d.nome),
            d.cargo && /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:'#A78BFA',marginBottom:4}}, d.cargo),
            /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexWrap:'wrap',gap:'4px 12px',marginTop:4}},
              d.email && /*#__PURE__*/React.createElement("a", {href:'mailto:'+d.email,style:{fontSize:11,color:'#60A5FA',textDecoration:'none'}}, '✉ '+d.email),
              d.wa    && /*#__PURE__*/React.createElement("a", {href:'https://wa.me/'+d.wa.replace(/\D/g,''),target:'_blank',rel:'noopener',style:{fontSize:11,color:'#34D399',textDecoration:'none'}}, '📱 '+d.wa),
              d.linkedin_url && /*#__PURE__*/React.createElement("a", {href:d.linkedin_url,target:'_blank',rel:'noopener',style:{fontSize:11,color:'#9B9BB4',textDecoration:'none'}}, 'in')
            ),
            d.ultimo_toque_em && /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:'#4B4B6A',fontFamily:'IBM Plex Mono,monospace',marginTop:6}},
              'Último contato: '+new Date(d.ultimo_toque_em).toLocaleDateString('pt-BR')+(d.ultimo_tema?' — '+d.ultimo_tema:'')
            ),
            d.gancho && /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:'#fbbf24',marginTop:4,fontStyle:'italic'}}, '💡 '+d.gancho),
            d.observacoes && /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:'#9B9BB4',marginTop:4}}, d.observacoes)
          )),
          // Add decisor form
          !showAddD && /*#__PURE__*/React.createElement("button", {
            onClick:()=>setShowAddD(true),
            style:{...S.btn,background:'#7C3AED22',color:'#A78BFA',border:'.5px solid #7C3AED44',marginTop:4,width:'100%'}
          }, '+ Novo decisor'),
          showAddD && /*#__PURE__*/React.createElement("div", {style:{...S.card,marginTop:8}},
            /*#__PURE__*/React.createElement("div", {style:{fontSize:11,fontWeight:700,color:'#A78BFA',marginBottom:10}}, 'Novo decisor'),
            ['nome','cargo','email','wa'].map(f => /*#__PURE__*/React.createElement("div", {key:f,style:{marginBottom:8}},
              /*#__PURE__*/React.createElement("div", {style:S.lbl}, f==='wa'?'WhatsApp':f.charAt(0).toUpperCase()+f.slice(1)),
              /*#__PURE__*/React.createElement("input", {
                style:S.inp, placeholder: f==='nome'?'Nome completo':f==='cargo'?'Cargo / título':f==='email'?'email@empresa.com':'+55 11 9…',
                value: novoD[f], onChange:e=>setNovoD(p=>({...p,[f]:e.target.value})),
                onKeyDown: e=>{ if(e.key==='Enter' && f==='wa') addDecisor(); }
              })
            )),
            /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,marginTop:4}},
              /*#__PURE__*/React.createElement("button", {onClick:addDecisor,disabled:saving,style:{...S.btn,background:'#7C3AED',color:'#fff',flex:1}}, saving?'Salvando…':'Salvar'),
              /*#__PURE__*/React.createElement("button", {onClick:()=>setShowAddD(false),style:{...S.btn,background:'#1A1A2E',color:'#9B9BB4'}}, 'Cancelar')
            )
          )
        ),
        !loading && activeTab==='historico' && /*#__PURE__*/React.createElement("div", {style:S.sec},
          toques.length===0 && /*#__PURE__*/React.createElement("div", {style:{color:'#4B4B6A',fontSize:12,marginBottom:12}}, 'Nenhum contato registrado.'),
          toques.map(t => /*#__PURE__*/React.createElement("div", {key:t.id, style:S.card},
            /*#__PURE__*/React.createElement("div", {style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}},
              /*#__PURE__*/React.createElement("span", {style:{fontSize:10,fontFamily:'IBM Plex Mono,monospace',color:'#9B9BB4'}},
                (t.data?new Date(t.data).toLocaleDateString('pt-BR'):'—')+' · '+t.canal
              ),
              t.resultado && /*#__PURE__*/React.createElement("span", {style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',background:'#34D39922',color:'#34D399',padding:'1px 6px',borderRadius:100}}, t.resultado)
            ),
            t.tema && /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:'#A78BFA',marginBottom:3}}, t.tema),
            /*#__PURE__*/React.createElement("div", {style:{fontSize:12,color:'#F5F5F5',lineHeight:1.5}}, t.resumo)
          )),
          // Add toque form
          !showAddT && /*#__PURE__*/React.createElement("button", {
            onClick:()=>setShowAddT(true),
            style:{...S.btn,background:'#34D39922',color:'#34D399',border:'.5px solid #34D39944',marginTop:4,width:'100%'}
          }, '+ Registrar contato'),
          showAddT && /*#__PURE__*/React.createElement("div", {style:{...S.card,marginTop:8}},
            /*#__PURE__*/React.createElement("div", {style:{fontSize:11,fontWeight:700,color:'#34D399',marginBottom:10}}, 'Novo contato'),
            /*#__PURE__*/React.createElement("div", {style:{marginBottom:8}},
              /*#__PURE__*/React.createElement("div", {style:S.lbl}, 'Canal'),
              /*#__PURE__*/React.createElement("select", {
                value:novoT.canal, onChange:e=>setNovoT(p=>({...p,canal:e.target.value})),
                style:{...S.inp,appearance:'none'}
              }, ['email','whatsapp','ligacao','reuniao','linkedin','outro'].map(c=>
                /*#__PURE__*/React.createElement("option",{key:c,value:c}, c)
              ))
            ),
            /*#__PURE__*/React.createElement("div", {style:{marginBottom:8}},
              /*#__PURE__*/React.createElement("div", {style:S.lbl}, 'Tema / assunto'),
              /*#__PURE__*/React.createElement("input", {style:S.inp, placeholder:'Ex: Proposta CR.IA, Follow-up reunião…', value:novoT.tema, onChange:e=>setNovoT(p=>({...p,tema:e.target.value}))})
            ),
            /*#__PURE__*/React.createElement("div", {style:{marginBottom:8}},
              /*#__PURE__*/React.createElement("div", {style:S.lbl}, 'Resumo *'),
              /*#__PURE__*/React.createElement("textarea", {
                style:{...S.inp,minHeight:60,resize:'vertical'}, placeholder:'O que foi dito / decidido…',
                value:novoT.resumo, onChange:e=>setNovoT(p=>({...p,resumo:e.target.value}))
              })
            ),
            /*#__PURE__*/React.createElement("div", {style:{marginBottom:8}},
              /*#__PURE__*/React.createElement("div", {style:S.lbl}, 'Resultado'),
              /*#__PURE__*/React.createElement("input", {style:S.inp, placeholder:'Ex: reunião marcada, proposta enviada, sem resposta…', value:novoT.resultado, onChange:e=>setNovoT(p=>({...p,resultado:e.target.value}))})
            ),
            /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,marginTop:4}},
              /*#__PURE__*/React.createElement("button", {onClick:addToque,disabled:saving,style:{...S.btn,background:'#34D399',color:'#111',flex:1}}, saving?'Salvando…':'Salvar'),
              /*#__PURE__*/React.createElement("button", {onClick:()=>setShowAddT(false),style:{...S.btn,background:'#1A1A2E',color:'#9B9BB4'}}, 'Cancelar')
            )
          )
        )
      ),
      // ── Footer: email + descartar + deletar
      /*#__PURE__*/React.createElement("div", {style:{borderTop:'.5px solid #2D2D44',padding:'12px 18px',display:'flex',flexDirection:'column',gap:8,flexShrink:0}},
        /*#__PURE__*/React.createElement("button", {onClick:gerarEmail, style:{...S.btn,background:'#1e3a5f',color:'#60A5FA',border:'.5px solid #2563eb44',width:'100%'}},
          copied ? '✅ Copiado!' : '📋 Copiar email de status'
        ),
        /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8}},
          card.id && /*#__PURE__*/React.createElement("button", {
            onClick:()=>onDescartar(card.id),
            style:{...S.btn,background:'#78350f22',color:'#fbbf24',border:'.5px solid #78350f44',flex:1}
          }, '🚫 Desistimos'),
          card.id && /*#__PURE__*/React.createElement("button", {
            onClick:()=>onDeletar(card.id),
            style:{...S.btn,background:'#7f1d1d22',color:'#f87171',border:'.5px solid #7f1d1d44'}
          }, '🗑 Deletar')
        )
      )
    )
  );
}
function PipelineCardModal({
  card,
  cols,
  isGaia,
  onSave,
  onDelete,
  onClose
}) {
  const [f, setF] = React.useState({
    name: card.name || '',
    col: card.col || cols[0]?.id || '',
    galeria: card.galeria || '',
    product: card.product || 'CR.IA',
    value: card.value || '',
    note: card.note || card.nota || '',
    tag: card.tag || ''
  });
  const up = (k, v) => setF(p => ({
    ...p,
    [k]: v
  }));
  const handle = () => {
    if (!f.name.trim()) return;
    onSave({
      ...(card._new ? {} : {
        ...card
      }),
      id: card.id,
      ...f,
      value: parseInt(f.value) || 0
    });
  };
  const EMPRESAS = ['', 'Galeria', 'GAIA', 'Milà', '404', 'ccCaramelo', 'Catalyst', 'Vitrine', 'A.gente', 'GUX', 'Mantiqueira'];
  const TAGS = [['', 'Nenhuma'], ['mrr', 'MRR'], ['poc-paga', 'POC paga'], ['poc-free', 'POC free'], ['prop', 'Proposta'], ['camp', 'Campanha']];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.85)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    },
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#111827',
      border: '.5px solid #2D2D44',
      borderRadius: 12,
      width: '100%',
      maxWidth: 480,
      padding: 24,
      maxHeight: '90vh',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: '#F5F5F5',
      marginBottom: 18
    }
  }, card._new ? '+ Novo Card' : 'Editar Card'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 9,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, "Nome *"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: f.name,
    onChange: e => up('name', e.target.value),
    onKeyDown: e => e.key === 'Enter' && handle(),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 13,
      fontFamily: 'Inter,sans-serif',
      outline: 'none'
    },
    placeholder: "Nome do cliente"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 9,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, "Coluna"), /*#__PURE__*/React.createElement("select", {
    value: f.col,
    onChange: e => up('col', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      fontFamily: 'Inter,sans-serif',
      outline: 'none',
      cursor: 'pointer'
    }
  }, cols.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.label)))), isGaia ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 9,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, "Produto"), /*#__PURE__*/React.createElement("select", {
    value: f.product,
    onChange: e => up('product', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      fontFamily: 'Inter,sans-serif',
      outline: 'none',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("option", null, "CR.IA"), /*#__PURE__*/React.createElement("option", null, "BrandSync"))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 9,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, "Empresa Galeria"), /*#__PURE__*/React.createElement("select", {
    value: f.galeria,
    onChange: e => up('galeria', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      fontFamily: 'Inter,sans-serif',
      outline: 'none',
      cursor: 'pointer'
    }
  }, EMPRESAS.map(e => /*#__PURE__*/React.createElement("option", {
    key: e,
    value: e
  }, e || '—'))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 9,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, "Valor (R$)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "0",
    value: f.value,
    onChange: e => up('value', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      fontFamily: 'IBM Plex Mono,monospace',
      outline: 'none'
    },
    placeholder: "0"
  })), isGaia && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 9,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, "Tag"), /*#__PURE__*/React.createElement("select", {
    value: f.tag,
    onChange: e => up('tag', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      fontFamily: 'Inter,sans-serif',
      outline: 'none',
      cursor: 'pointer'
    }
  }, TAGS.map(([v, l]) => /*#__PURE__*/React.createElement("option", {
    key: v,
    value: v
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 9,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5
    }
  }, "Nota / Próximos passos"), /*#__PURE__*/React.createElement("textarea", {
    value: f.note,
    onChange: e => up('note', e.target.value),
    rows: 3,
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      fontFamily: 'IBM Plex Mono,monospace',
      outline: 'none',
      resize: 'vertical',
      lineHeight: 1.6
    },
    placeholder: "Contexto, próximos passos..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end'
    }
  }, onDelete && /*#__PURE__*/React.createElement("button", {
    onClick: onDelete,
    style: {
      padding: '8px 14px',
      borderRadius: 8,
      border: '.5px solid rgba(226,75,74,.3)',
      background: 'rgba(226,75,74,.08)',
      color: '#E24B4A',
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      padding: '8px 18px',
      borderRadius: 8,
      border: '.5px solid #2D2D44',
      background: 'transparent',
      color: '#9B9BB4',
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    onClick: handle,
    style: {
      padding: '8px 20px',
      borderRadius: 8,
      border: 'none',
      background: '#FF6B2B',
      color: '#fff',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, card._new ? 'Criar' : 'Salvar'))));
}
