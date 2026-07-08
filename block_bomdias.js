// block_bomdias.js — ☀️ Bom Dia: briefing diário de 10 decisores
// Carregado via runBlock (s1) após block_regua.js e block_regua_views.js.
// Usa: getDecisoresVencidos, registrarToque, PROSP, GRUPO, gerarEmail, getClaudeKey

const { useState, useMemo, useCallback, useEffect, useRef } = React;

// ── helpers de storage ─────────────────────────────────────────────────────

function _bdHoje() {
  return new Date().toISOString().slice(0, 10);
}

function _bdLoad() {
  try { return JSON.parse(localStorage.getItem("gh_bomdias_v1") || "{}"); }
  catch(e) { return {}; }
}

function _bdSave(obj) {
  try { localStorage.setItem("gh_bomdias_v1", JSON.stringify(obj)); }
  catch(e) { console.error("[BomDia] save error", e); }
}

// ── seleção diária ─────────────────────────────────────────────────────────
// Retorna o store gh_bomdias_v1 com os items do dia.
// Se já existe seleção de hoje para este grupo, devolve o existente.
// Caso contrário seleciona os top-10 vencidos, rotacionando pelos do histórico.

function selecionarDiarioBomDia(grupoId, leads, accs) {
  var store = _bdLoad();
  var hoje  = _bdHoje();

  // mesma seleção se for o mesmo dia e grupo
  if (store.data === hoje && store.grupoId === grupoId &&
      store.items && store.items.length > 0) {
    return store;
  }

  var vencidos = typeof getDecisoresVencidos === "function"
    ? getDecisoresVencidos(grupoId, leads, 7, accs)
    : [];

  // rotação: evita repetir ranks recentes (últimos 30)
  var historico = store.historico || [];
  var recent = historico.slice(-30);

  var candidatos = vencidos.filter(function(v) {
    return recent.indexOf(v.lead.rank) === -1;
  });
  // se restaram menos de 5, reutiliza o pool inteiro
  if (candidatos.length < 5) candidatos = vencidos;

  var top10 = candidatos.slice(0, 10);

  var items = top10.map(function(v) {
    var dec = v.decisor || {};
    var of  = v.proxOferta;
    return {
      rank:            v.lead.rank,
      grupoId:         grupoId,
      leadNome:        v.lead.nome  || "",
      leadSetor:       v.lead.setor || "",
      decisorNome:     dec.nome     || "",
      decisorCargo:    dec.cargo    || "",
      decisorEmail:    dec.email    || "",
      decisorWa:       dec.telefone || dec.wa || "",
      decisorLinkedin: dec.linkedin || dec.li || "",
      score:           v.score   || 50,
      diasDesde:       v.diasDesde || 0,
      ofertaGrupoId:   of ? of.grupo.id   : grupoId,
      ofertaGrupoName: of ? of.grupo.name : "Galeria",
      ofertaAngulo:    of ? of.angulo     : "Apresentação",
      ofertaAnguloIdx: of ? (of.anguloIdx || 0) : 0,
      emailGerado:     null,
      linkedinGerado:  null,
      waEnviado:       false,
      emailEnviado:    false,
      linkedinEnviado: false,
      ignorado:        false,
    };
  });

  var newRanks     = top10.map(function(v){ return v.lead.rank; });
  var novoHistorico = historico.concat(newRanks).slice(-100);

  var newStore = { data: hoje, grupoId: grupoId, items: items, historico: novoHistorico };
  _bdSave(newStore);
  return newStore;
}

// ── geração de conteúdo via Claude ────────────────────────────────────────

async function _bdGerarEmail(item) {
  if (typeof gerarEmail !== "function") {
    return { assunto: "⚠ gerarEmail não disponível", corpo: "" };
  }
  var G     = typeof GRUPO !== "undefined" ? GRUPO : [];
  var grupo = G.find(function(g){ return g.id === item.ofertaGrupoId; }) || G[0];
  if (!grupo) return { assunto: "⚠ Grupo não encontrado", corpo: "" };

  return gerarEmail(
    item.decisorNome,
    item.leadNome,
    item.leadSetor,
    grupo,
    item.ofertaAngulo,
    "direto e pessoal, sem corporativês",
    ""
  );
}

async function _bdGerarLinkedin(item) {
  var key = typeof getClaudeKey === "function" ? getClaudeKey() : null;
  if (!key) {
    var primeiro = (item.decisorNome || "").split(" ")[0] || "tudo bem?";
    return "Bom dia, " + primeiro + "! Sou Pedro Ica, Head of Growth da Galeria Holding. "
      + "Curto muito o que a " + item.leadNome + " está fazendo no setor de "
      + item.leadSetor + " e adoraria trocar uma ideia. Posso chamar?";
  }
  var prompt =
    "Escreva uma mensagem de conexão LinkedIn CURTA (máximo 280 caracteres) para "
    + item.decisorNome + ", " + item.decisorCargo + " da empresa " + item.leadNome
    + " (setor " + item.leadSetor + "). "
    + "Tom: humano, direto, sem pitch imediato. "
    + "Assine como Pedro Ica, Head of Growth da Galeria Holding. "
    + "Retorne APENAS o texto da mensagem, sem aspas nem explicações.";
  try {
    var r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }]
      })
    });
    var d = await r.json();
    if (d.error) return "Erro API: " + (d.error.message || d.error.type);
    return (d.content && d.content[0] && d.content[0].text) || "";
  } catch(e) {
    return "Erro de conexão: " + e.message;
  }
}

// ── BomDiaView ─────────────────────────────────────────────────────────────

var BomDiaView = function BomDiaView(_ref) {
  var accs     = _ref.accs;
  var curGrupo = _ref.curGrupo;

  var MONO  = "IBM Plex Mono,monospace";
  var leads = typeof PROSP !== "undefined" ? PROSP : [];

  // ── state ────────────────────────────────────────────────────────────────
  var _st = useState(function() {
    return selecionarDiarioBomDia(curGrupo.id, leads, accs);
  });
  var store    = _st[0]; var setStore    = _st[1];

  var _gl  = useState({});    var genLoading    = _gl[0];  var setGenLoading    = _gl[1];
  var _ga  = useState(false); var genAll        = _ga[0];  var setGenAll        = _ga[1];
  var _exp = useState(null);  var expanded      = _exp[0]; var setExpanded      = _exp[1];
  var abortRef = useRef(false);

  // recarregar quando grupo muda
  var mountRef = useRef(false);
  useEffect(function() {
    if (!mountRef.current) { mountRef.current = true; return; }
    setStore(selecionarDiarioBomDia(curGrupo.id, leads, accs));
    setExpanded(null);
  }, [curGrupo.id]);

  var items = store.items || [];

  // ── helpers ──────────────────────────────────────────────────────────────
  function updateItem(rank, patch) {
    setStore(function(prev) {
      var newItems = (prev.items || []).map(function(it) {
        return it.rank === rank ? Object.assign({}, it, patch) : it;
      });
      var ns = Object.assign({}, prev, { items: newItems });
      _bdSave(ns);
      return ns;
    });
  }

  function marcarEnviado(item, canal) {
    var patch = {};
    if (canal === "wa")    patch.waEnviado    = true;
    if (canal === "email") patch.emailEnviado  = true;
    if (canal === "li")    patch.linkedinEnviado = true;
    updateItem(item.rank, patch);
    if (typeof registrarToque === "function") {
      registrarToque(item.grupoId, item.rank,
        item.ofertaGrupoId, item.ofertaAnguloIdx, item.decisorNome);
    }
  }

  // ── geração individual ────────────────────────────────────────────────
  function gerarEmail(item) {
    var key = item.rank + "_e";
    setGenLoading(function(p){ return Object.assign({}, p, { [key]: true }); });
    _bdGerarEmail(item).then(function(res) {
      updateItem(item.rank, { emailGerado: res });
      setGenLoading(function(p){ var n = Object.assign({}, p); delete n[key]; return n; });
    }).catch(function() {
      setGenLoading(function(p){ var n = Object.assign({}, p); delete n[key]; return n; });
    });
  }

  function gerarLinkedin(item) {
    var key = item.rank + "_l";
    setGenLoading(function(p){ return Object.assign({}, p, { [key]: true }); });
    _bdGerarLinkedin(item).then(function(res) {
      updateItem(item.rank, { linkedinGerado: res });
      setGenLoading(function(p){ var n = Object.assign({}, p); delete n[key]; return n; });
    }).catch(function() {
      setGenLoading(function(p){ var n = Object.assign({}, p); delete n[key]; return n; });
    });
  }

  // ── gerar tudo ────────────────────────────────────────────────────────
  async function gerarTudo() {
    abortRef.current = false;
    setGenAll(true);
    var active = items.filter(function(it) { return !it.ignorado; });
    for (var i = 0; i < active.length; i++) {
      if (abortRef.current) break;
      var item = active[i];
      // re-lê store para ver se já foi gerado em iteração anterior
      var cur = _bdLoad();
      var curIt = (cur.items || []).find(function(x){ return x.rank === item.rank; }) || item;
      if (!curIt.emailGerado) {
        var emailRes = await _bdGerarEmail(item);
        updateItem(item.rank, { emailGerado: emailRes });
      }
      if (abortRef.current) break;
      if (!curIt.linkedinGerado) {
        var liRes = await _bdGerarLinkedin(item);
        updateItem(item.rank, { linkedinGerado: liRes });
      }
      // breve pausa entre chamadas
      if (i < active.length - 1) {
        await new Promise(function(r){ setTimeout(r, 400); });
      }
    }
    setGenAll(false);
  }

  // ── nova seleção ──────────────────────────────────────────────────────
  function novaSelecao() {
    var s = _bdLoad();
    _bdSave(Object.assign({}, s, { data: "" }));
    setStore(selecionarDiarioBomDia(curGrupo.id, leads, accs));
    setExpanded(null);
  }

  // ── stats ─────────────────────────────────────────────────────────────
  var stats = useMemo(function() {
    var a = items.filter(function(it){ return !it.ignorado; });
    return {
      total:      a.length,
      waSent:     a.filter(function(it){ return it.waEnviado; }).length,
      emailSent:  a.filter(function(it){ return it.emailEnviado; }).length,
      liSent:     a.filter(function(it){ return it.linkedinEnviado; }).length,
      emailReady: a.filter(function(it){ return it.emailGerado; }).length,
      liReady:    a.filter(function(it){ return it.linkedinGerado; }).length,
    };
  }, [items]);

  // ── estilos ────────────────────────────────────────────────────────────
  function btn(color, ghost, small) {
    return {
      fontSize: small ? 8 : 9,
      padding:  small ? "3px 7px" : "5px 11px",
      borderRadius: 5,
      border: "1px solid " + color,
      background: ghost ? "transparent" : color + "22",
      color: color,
      cursor: "pointer",
      fontFamily: MONO,
      whiteSpace: "nowrap",
      lineHeight: 1.4,
    };
  }
  function chip(color) {
    return {
      fontSize: 9, padding: "3px 9px", borderRadius: 10,
      background: "rgba(0,0,0,.3)", border: "1px solid " + color,
      color: color, fontFamily: MONO, whiteSpace: "nowrap",
    };
  }
  function scoreColor(s) {
    if (s >= 70) return "#00FF94";
    if (s >= 40) return "#FFB547";
    return "#FF6B6B";
  }

  // ── wa / mailto links ────────────────────────────────────────────────
  function waHref(item) {
    var phone = (item.decisorWa || "").replace(/\D/g, "");
    if (!phone) return null;
    var pn = (item.decisorNome || "").split(" ")[0];
    return "https://wa.me/" + (phone.startsWith("55") ? phone : "55" + phone)
      + "?text=" + encodeURIComponent("Bom dia, " + pn + "! 👋");
  }
  function mailtoHref(item) {
    if (!item.emailGerado || !item.decisorEmail) return null;
    return "mailto:" + item.decisorEmail
      + "?subject=" + encodeURIComponent(item.emailGerado.assunto || "")
      + "&body="    + encodeURIComponent(item.emailGerado.corpo   || "");
  }
  function liHref(item) {
    if (!item.decisorLinkedin) return null;
    return item.decisorLinkedin.startsWith("http")
      ? item.decisorLinkedin
      : "https://" + item.decisorLinkedin;
  }

  // ── card ─────────────────────────────────────────────────────────────
  function renderCard(item, idx) {
    var wa      = waHref(item);
    var mailto  = mailtoHref(item);
    var li      = liHref(item);
    var expE    = expanded === item.rank + "_e";
    var expL    = expanded === item.rank + "_l";
    var genE    = genLoading[item.rank + "_e"];
    var genL    = genLoading[item.rank + "_l"];

    return React.createElement("div", {
      key: item.rank,
      style: {
        background: item.ignorado ? "rgba(20,20,35,.4)" : "rgba(28,28,55,.7)",
        border: "1px solid " + (item.ignorado ? "#252535" : "#3a3a6a"),
        borderRadius: 8, padding: "12px 14px",
        opacity: item.ignorado ? 0.5 : 1,
        transition: "opacity .15s",
      }
    },

      // ── cabeçalho do card ──────────────────────────────────────────
      React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "flex-start" } },

        // badge score + posição
        React.createElement("div", {
          style: { display: "flex", flexDirection: "column", alignItems: "center",
                   minWidth: 30, paddingTop: 2 }
        },
          React.createElement("span", { style: { fontSize: 8, color: "#555570", fontFamily: MONO } },
            "#" + (idx + 1)),
          React.createElement("span", {
            style: { fontSize: 11, fontWeight: 700, color: scoreColor(item.score), fontFamily: MONO }
          }, item.score)
        ),

        // empresa + decisor
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", {
            style: { fontSize: 12, fontWeight: 700, color: "#E0E0FF",
                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
          }, item.leadNome),
          React.createElement("div", { style: { fontSize: 9, color: "#9B9BB4", marginTop: 1 } },
            item.leadSetor
            + (item.diasDesde >= 999 ? " · nunca contatado" : " · " + item.diasDesde + "d sem contato")
          ),
          item.decisorNome && React.createElement("div", {
            style: { fontSize: 10, color: "#A78BFA", marginTop: 4,
                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
          },
            item.decisorNome,
            React.createElement("span", { style: { fontSize: 8, color: "#555570" } },
              " · " + (item.decisorCargo || ""))
          ),
          React.createElement("div", { style: { fontSize: 8, color: "#3d3d6b", marginTop: 2 } },
            item.ofertaGrupoName + " · " + item.ofertaAngulo)
        ),

        // botão ignorar
        React.createElement("button", {
          style: { fontSize: 9, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
                   border: "1px solid #3a3a5c", background: "transparent",
                   color: item.ignorado ? "#A78BFA" : "#555570", fontFamily: MONO },
          onClick: function(){ updateItem(item.rank, { ignorado: !item.ignorado }); },
          title: item.ignorado ? "Restaurar contato" : "Ignorar hoje"
        }, item.ignorado ? "↩" : "✕")
      ),

      // ── canais (só se não ignorado) ────────────────────────────────
      !item.ignorado && React.createElement("div", {
        style: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }
      },

        // WhatsApp
        wa
          ? React.createElement("a", {
              href: wa, target: "_blank", rel: "noopener noreferrer",
              style: Object.assign({}, btn(item.waEnviado ? "#1a6b3a" : "#25D366", false),
                { textDecoration: "none" }),
              onClick: function(){ setTimeout(function(){ marcarEnviado(item, "wa"); }, 800); }
            }, item.waEnviado ? "✓ WA" : "💬 Bom dia WA")
          : React.createElement("span", {
              style: { fontSize: 9, color: "#333356", fontFamily: MONO, padding: "5px 0" }
            }, "sem WA"),

        // Email
        item.decisorEmail
          ? (item.emailGerado
              ? React.createElement(React.Fragment, null,
                  React.createElement("button", {
                    style: btn(item.emailEnviado ? "#1a4a8a" : "#60A5FA", item.emailEnviado),
                    onClick: function(){
                      setExpanded(expE ? null : item.rank + "_e");
                    }
                  }, item.emailEnviado ? "✓ email" : "✉ ver email"),
                  !item.emailEnviado && mailto && React.createElement("a", {
                    href: mailto, target: "_blank", rel: "noopener noreferrer",
                    style: Object.assign({}, btn("#60A5FA", false), { textDecoration: "none" }),
                    onClick: function(){ marcarEnviado(item, "email"); }
                  }, "📤 abrir Gmail"),
                  React.createElement("button", {
                    style: btn("#60A5FA", true, true),
                    onClick: function(){ gerarEmail(item); },
                    title: "Regen"
                  }, "↺")
                )
              : React.createElement("button", {
                  style: btn("#60A5FA", true),
                  disabled: !!genE,
                  onClick: function(){ gerarEmail(item); }
                }, genE ? "⏳ gerando..." : "✉ gerar email"))
          : React.createElement("span", {
              style: { fontSize: 9, color: "#333356", fontFamily: MONO, padding: "5px 0" }
            }, "sem email"),

        // LinkedIn
        (li || item.decisorLinkedin)
          ? (item.linkedinGerado
              ? React.createElement(React.Fragment, null,
                  React.createElement("button", {
                    style: btn(item.linkedinEnviado ? "#0a3a7a" : "#0A66C2", item.linkedinEnviado),
                    onClick: function(){
                      setExpanded(expL ? null : item.rank + "_l");
                    }
                  }, item.linkedinEnviado ? "✓ LI" : "🔗 ver msg LI"),
                  !item.linkedinEnviado && React.createElement("button", {
                    style: btn("#0A66C2", false),
                    onClick: function(){
                      navigator.clipboard.writeText(item.linkedinGerado || "");
                      marcarEnviado(item, "li");
                      if (li) window.open(li, "_blank");
                    }
                  }, "📋 copiar + abrir"),
                  React.createElement("button", {
                    style: btn("#0A66C2", true, true),
                    onClick: function(){ gerarLinkedin(item); },
                    title: "Regen"
                  }, "↺")
                )
              : React.createElement("button", {
                  style: btn("#0A66C2", true),
                  disabled: !!genL,
                  onClick: function(){ gerarLinkedin(item); }
                }, genL ? "⏳..." : "🔗 gerar LI"))
          : null
      ),

      // ── draft email expandido ──────────────────────────────────────
      expE && item.emailGerado && React.createElement("div", { style: { marginTop: 8 } },
        React.createElement("div", {
          style: { fontSize: 8, color: "#60A5FA", fontFamily: MONO, marginBottom: 3 }
        }, "Assunto: " + (item.emailGerado.assunto || "")),
        React.createElement("div", {
          style: { background: "rgba(0,0,0,.3)", borderRadius: 5, padding: "8px 10px",
                   fontSize: 9, color: "#C0C0D0", lineHeight: 1.65, whiteSpace: "pre-wrap",
                   wordBreak: "break-word", maxHeight: 200, overflowY: "auto", fontFamily: MONO }
        }, item.emailGerado.corpo || "")
      ),

      // ── draft LinkedIn expandido ───────────────────────────────────
      expL && item.linkedinGerado && React.createElement("div", { style: { marginTop: 8 } },
        React.createElement("div", {
          style: { background: "rgba(0,0,0,.3)", borderRadius: 5, padding: "8px 10px",
                   fontSize: 9, color: "#C0C0D0", lineHeight: 1.65, whiteSpace: "pre-wrap",
                   wordBreak: "break-word", fontFamily: MONO }
        }, item.linkedinGerado)
      )
    );
  }

  // ── render principal ───────────────────────────────────────────────────
  var hoje = _bdHoje();
  var dataFmt = new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR",
    { weekday: "long", day: "numeric", month: "long" });

  return React.createElement("div", {
    style: {
      padding: "16px 20px", overflowY: "auto", flex: 1,
      display: "flex", flexDirection: "column", gap: 10,
    }
  },

    // ── header ──────────────────────────────────────────────────────────
    React.createElement("div", {
      style: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }
    },
      React.createElement("div", null,
        React.createElement("div", {
          style: { fontSize: 15, fontWeight: 700, color: "#E0E0FF", fontFamily: MONO }
        }, "☀️ Bom Dia, Pedro"),
        React.createElement("div", { style: { fontSize: 9, color: "#555570", marginTop: 2 } },
          dataFmt + " · " + curGrupo.name)
      ),
      React.createElement("div", {
        style: { marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }
      },
        React.createElement("button", {
          style: btn("#555570", true),
          onClick: novaSelecao,
          title: "Selecionar 10 contatos diferentes"
        }, "🔄 nova seleção"),
        React.createElement("button", {
          style: Object.assign({}, btn("#A78BFA", false),
            { fontWeight: 700, opacity: genAll ? 0.6 : 1 }),
          disabled: genAll,
          onClick: function() {
            if (genAll) { abortRef.current = true; setGenAll(false); }
            else gerarTudo();
          }
        }, genAll ? "⏹ parar" : "⚡ gerar tudo (" + stats.total + ")")
      )
    ),

    // ── chips de progresso ───────────────────────────────────────────────
    stats.total > 0 && React.createElement("div", {
      style: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 4 }
    },
      React.createElement("span", { style: chip("#25D366") },
        "💬 WA " + stats.waSent + "/" + stats.total),
      React.createElement("span", { style: chip("#60A5FA") },
        "✉ email " + stats.emailSent + "/" + stats.total),
      React.createElement("span", { style: chip("#0A66C2") },
        "🔗 LI " + stats.liSent + "/" + stats.total),
      stats.emailReady > 0 && React.createElement("span", { style: chip("#A78BFA") },
        "✏ " + stats.emailReady + " rascunhos prontos")
    ),

    // ── dica de uso (só se nenhuma abordagem gerada ainda) ───────────────
    stats.emailReady === 0 && stats.total > 0 && React.createElement("div", {
      style: { fontSize: 9, color: "#555570", fontFamily: MONO,
               padding: "6px 10px", background: "rgba(167,139,250,.07)",
               borderRadius: 5, border: "1px solid rgba(167,139,250,.15)" }
    },
      "💡 Clique em ",
      React.createElement("strong", { style: { color: "#A78BFA" } }, "⚡ gerar tudo"),
      " para ter e-mails + msgs LinkedIn prontos em segundos. ",
      "WhatsApp já está disponível para quem tem número."
    ),

    // ── estado vazio ─────────────────────────────────────────────────────
    items.length === 0 && React.createElement("div", {
      style: { textAlign: "center", padding: "60px 0", color: "#555570", fontSize: 11 }
    },
      React.createElement("div", { style: { fontSize: 22, marginBottom: 8 } }, "🎉"),
      React.createElement("div", null, "Nenhum contato vencido no momento"),
      React.createElement("div", { style: { fontSize: 9, marginTop: 6 } },
        "Todos os decisores foram contatados recentemente neste grupo."
      )
    ),

    // ── cards ────────────────────────────────────────────────────────────
    items.map(renderCard)
  );
};

window.BomDiaView = BomDiaView;
