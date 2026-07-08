// block_regua_views.js — Fases 2 + 3: Cobertura de Decisores + Enriquecimento Lusha
// Carregado via runBlock (s1) após block_regua.js.
// Usa PROSP, getCoberturaEmpresa, setDecisoresSlot, enriquecerSlotLusha,
// enriquecerBaseLusha (todos definidos em block_regua.js).

const { useState, useMemo, useCallback, useRef } = React;

// ─────────────────────────────────────────────────────────────────────────────
// CoberturaView
// Props: accs, setAccs, curGrupo
// ─────────────────────────────────────────────────────────────────────────────
var CoberturaView = function CoberturaView(_ref) {
  var accs     = _ref.accs;
  var setAccs  = _ref.setAccs;
  var curGrupo = _ref.curGrupo;

  var PAGE = 50;

  // ── filter state ───────────────────────────────────────────────
  var _s  = useState("");    var search    = _s[0];    var setSearch    = _s[1];
  var _g  = useState(true);  var soGaps    = _g[0];    var setSoGaps    = _g[1];
  var _fs = useState(null);  var filtSlot  = _fs[0];   var setFiltSlot  = _fs[1];
  var _ft = useState("");    var filtSetor = _ft[0];   var setFiltSetor = _ft[1];
  var _p  = useState(0);     var page      = _p[0];    var setPage      = _p[1];

  // ── add-manual modal ───────────────────────────────────────────
  var _m  = useState(null);  var modal = _m[0]; var setModal = _m[1];
  var _f  = useState({nome:"",cargo:"",email:"",telefone:"",linkedin:""});
  var form = _f[0]; var setForm = _f[1];

  // ── per-slot enrichment loading (Lusha) ───────────────────────
  var _el = useState({});    var enrichLoading = _el[0]; var setEnrichLoading = _el[1];

  // ── per-company Hunter loading ─────────────────────────────────
  var _hl = useState({});    var hunterLoading  = _hl[0]; var setHunterLoading  = _hl[1];

  // ── per-company Crawler loading ────────────────────────────────
  var _cl = useState({});    var crawlerLoading = _cl[0]; var setCrawlerLoading = _cl[1];

  // ── batch modals ───────────────────────────────────────────────
  var _bm = useState(null);  var batchModal   = _bm[0]; var setBatchModal   = _bm[1];
  var _hm = useState(null);  var hunterModal  = _hm[0]; var setHunterModal  = _hm[1];
  var _cm = useState(null);  var crawlerModal = _cm[0]; var setCrawlerModal = _cm[1];
  var abortRef = useRef(false);

  // ── helpers ────────────────────────────────────────────────────
  var leads = typeof PROSP !== "undefined" ? PROSP : [];
  var SL = typeof SLOT_LABELS !== "undefined" ? SLOT_LABELS : { ceo:"CEO", cmo:"CMO", gerencia:"Gerência" };
  var statusColor = { completa:"#22C55E", parcial:"#F59E0B", vazia:"#EF4444" };
  var statusLabel = { completa:"Completa", parcial:"Parcial", vazia:"Vazia" };
  var MONO = "IBM Plex Mono,monospace";

  // ── rows: all leads in current group that exist in accs ────────
  var allRows = useMemo(function() {
    var prefix = curGrupo.id + "_";
    return leads.map(function(lead) {
      var entry = accs[prefix + lead.rank];
      if (!entry) return null;
      var cob = typeof getCoberturaEmpresa === "function"
        ? getCoberturaEmpresa(curGrupo.id, lead.rank, accs)
        : { status:"vazia", faltantes:["ceo","cmo","gerencia"], preenchidos:0,
            slots:{ ceo:null, cmo:null, gerencia:null } };
      var dominio = typeof _extrairDominio === "function"
        ? _extrairDominio(lead, entry) : null;
      return { lead:lead, cob:cob, dominio:dominio };
    }).filter(Boolean);
  }, [accs, leads, curGrupo]);

  // ── summary ────────────────────────────────────────────────────
  var total     = allRows.length;
  var completas = allRows.filter(function(r){ return r.cob.status === "completa"; }).length;
  var parciais  = allRows.filter(function(r){ return r.cob.status === "parcial"; }).length;
  var vazias    = allRows.filter(function(r){ return r.cob.status === "vazia"; }).length;
  // slots enriquecíveis via Lusha (nome mas sem email/telefone)
  var enrichable = allRows.reduce(function(acc, r) {
    return acc + ["ceo","cmo","gerencia"].filter(function(s) {
      var sl = r.cob.slots[s];
      return sl && sl.nome.trim() && (!sl.email || !sl.telefone);
    }).length;
  }, 0);
  // empresas auto-buscáveis via Hunter (tem domínio + slots vazios)
  var autoBuscaveis = allRows.filter(function(r) {
    return r.dominio && r.cob.status !== "completa";
  }).length;
  // empresas rastreáveis via crawler (CNPJ ou domínio + gaps)
  var crawlaveis = allRows.filter(function(r) {
    var entry = accs[(curGrupo.id + "_" + r.lead.rank)];
    var cnpj = (r.lead.cnpj) || (entry && entry.cnpj) || "";
    return (r.dominio || cnpj) && r.cob.status !== "completa";
  }).length;

  // ── sector list ────────────────────────────────────────────────
  var setores = useMemo(function() {
    var s = {};
    allRows.forEach(function(r){ if (r.lead.setor) s[r.lead.setor] = 1; });
    return Object.keys(s).sort();
  }, [allRows]);

  // ── filtered + pagination ──────────────────────────────────────
  var filtered = useMemo(function() {
    var q = search.toUpperCase();
    return allRows.filter(function(r) {
      if (soGaps && r.cob.status === "completa") return false;
      if (filtSlot && r.cob.faltantes.indexOf(filtSlot) === -1) return false;
      if (filtSetor && r.lead.setor !== filtSetor) return false;
      if (q && r.lead.nome.toUpperCase().indexOf(q) === -1) return false;
      return true;
    });
  }, [allRows, soGaps, filtSlot, filtSetor, search]);

  var pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  var sp    = Math.min(page, pages - 1);
  var pageRows = filtered.slice(sp * PAGE, (sp + 1) * PAGE);

  // ── reload accs from localStorage (called after enrichment) ───
  var refreshAccs = useCallback(function() {
    try {
      var data = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}");
      setAccs(function() { return data; });
    } catch(e) {}
  }, [setAccs]);

  // ── per-slot enrich ────────────────────────────────────────────
  var enrichSlot = useCallback(function(rank, slotName, empresaNome) {
    var lk = rank + "_" + slotName;
    setEnrichLoading(function(prev) { var n = Object.assign({}, prev); n[lk] = true; return n; });
    if (typeof enriquecerSlotLusha !== "function") {
      alert("enriquecerSlotLusha não disponível. Recarregue a página.");
      setEnrichLoading(function(prev) { var n = Object.assign({}, prev); delete n[lk]; return n; });
      return;
    }
    enriquecerSlotLusha(curGrupo.id, rank, slotName, empresaNome).then(function(res) {
      if (res.ok) {
        refreshAccs();
      } else {
        alert("Lusha — " + (res.erro || "Não encontrado"));
      }
      setEnrichLoading(function(prev) { var n = Object.assign({}, prev); delete n[lk]; return n; });
    }).catch(function(e) {
      var msg = String(e);
      if (msg.indexOf("QUOTA_CHEIA") !== -1) {
        alert("⚠️ ESPAÇO LOTADO — o contato da Lusha foi recebido mas NÃO foi salvo!\n\nVá em 🛟 Ferramentas → Exportar backup, guarde o arquivo e depois clique em Limpar dados antigos para liberar espaço.");
      } else {
        alert("Erro ao enriquecer: " + msg);
      }
      setEnrichLoading(function(prev) { var n = Object.assign({}, prev); delete n[lk]; return n; });
    });
  }, [curGrupo, refreshAccs]);

  // ── batch enrich ───────────────────────────────────────────────
  var runBatch = useCallback(function() {
    if (typeof enriquecerBaseLusha !== "function") {
      alert("enriquecerBaseLusha não disponível. Recarregue a página.");
      return;
    }
    abortRef.current = false;
    setBatchModal({ running:true, total:0, done:0, ok:0, falhas:[] });

    enriquecerBaseLusha(curGrupo.id, leads, function(prog) {
      setBatchModal(function(prev) {
        return Object.assign({}, prev, prog, { running: prog.done < prog.total });
      });
    }).then(function(res) {
      setBatchModal(function(prev) {
        return Object.assign({}, prev, res, { running:false });
      });
      refreshAccs();
    }).catch(function(e) {
      setBatchModal(function(prev) {
        return Object.assign({}, prev, { running:false, erro: String(e) });
      });
    });
  }, [curGrupo, leads, refreshAccs]);

  // ── per-company Hunter search ──────────────────────────────────
  var buscarHunter = useCallback(function(rank, lead) {
    if (typeof buscarDecisoresHunter !== "function") {
      alert("buscarDecisoresHunter não disponível. Recarregue a página.");
      return;
    }
    setHunterLoading(function(prev) { var n = Object.assign({}, prev); n[rank] = true; return n; });
    buscarDecisoresHunter(curGrupo.id, rank, lead).then(function(res) {
      if (res.ok && res.preenchidos > 0) {
        refreshAccs();
      } else if (res.erro && res.erro.indexOf("QUOTA") !== -1) {
        alert("⚠️ ESPAÇO LOTADO — dados não salvos. Exporte um backup em 🛟 Ferramentas.");
      } else if (!res.ok) {
        alert("Hunter — " + (res.erro || "Sem resultados para " + (res.dominio||"?")));
      } else {
        refreshAccs(); // preenchidos=0 mas ok, slots já estavam completos
      }
      setHunterLoading(function(prev) { var n = Object.assign({}, prev); delete n[rank]; return n; });
    }).catch(function(e) {
      alert("Erro Hunter: " + e);
      setHunterLoading(function(prev) { var n = Object.assign({}, prev); delete n[rank]; return n; });
    });
  }, [curGrupo, refreshAccs]);

  // ── batch Hunter ───────────────────────────────────────────────
  var runHunterBatch = useCallback(function() {
    if (typeof buscarBaseHunter !== "function") {
      alert("buscarBaseHunter não disponível. Recarregue a página.");
      return;
    }
    setHunterModal({ running:true, total:0, done:0, ok:0, semResult:0, falhas:[] });

    buscarBaseHunter(curGrupo.id, leads, function(prog) {
      setHunterModal(function(prev) {
        return Object.assign({}, prev, prog, { running: prog.done < prog.total });
      });
    }).then(function(res) {
      setHunterModal(function(prev) { return Object.assign({}, prev, res, { running:false }); });
      refreshAccs();
    }).catch(function(e) {
      setHunterModal(function(prev) { return Object.assign({}, prev, { running:false, erro: String(e) }); });
    });
  }, [curGrupo, leads, refreshAccs]);

  // ── per-company Crawler ────────────────────────────────────────
  var buscarCrawler = useCallback(function(rank, lead) {
    if (typeof buscarDecisoresCrawler !== "function") {
      alert("buscarDecisoresCrawler não disponível. Recarregue a página."); return;
    }
    setCrawlerLoading(function(prev) { var n = Object.assign({}, prev); n[rank] = true; return n; });
    buscarDecisoresCrawler(curGrupo.id, rank, lead).then(function(res) {
      if (res.ok) {
        refreshAccs();
        if (!(res.preenchidos > 0)) {
          alert("🕷️ Encontrei contatos mas os slots já estavam preenchidos.");
        }
      } else {
        alert("🕷️ Crawler — " + (res.erro || "Sem resultados nas fontes públicas"));
      }
      setCrawlerLoading(function(prev) { var n = Object.assign({}, prev); delete n[rank]; return n; });
    }).catch(function(e) {
      alert("Erro crawler: " + e);
      setCrawlerLoading(function(prev) { var n = Object.assign({}, prev); delete n[rank]; return n; });
    });
  }, [curGrupo, refreshAccs]);

  // ── batch Crawler ──────────────────────────────────────────────
  var runCrawlerBatch = useCallback(function() {
    if (typeof buscarBaseCrawler !== "function") {
      alert("buscarBaseCrawler não disponível. Recarregue a página."); return;
    }
    setCrawlerModal({ running:true, total:0, done:0, ok:0, semResult:0, falhas:[] });
    buscarBaseCrawler(curGrupo.id, leads, function(prog) {
      setCrawlerModal(function(prev) {
        return Object.assign({}, prev, prog, { running: prog.done < prog.total });
      });
    }).then(function(res) {
      setCrawlerModal(function(prev) { return Object.assign({}, prev, res, { running:false }); });
      refreshAccs();
    }).catch(function(e) {
      setCrawlerModal(function(prev) { return Object.assign({}, prev, { running:false, erro:String(e) }); });
    });
  }, [curGrupo, leads, refreshAccs]);

  // ── save manual slot ───────────────────────────────────────────
  var saveSlot = useCallback(function() {
    if (!modal || !form.nome.trim()) return;
    if (typeof setDecisoresSlot !== "function") return;
    var entry;
    try {
      entry = setDecisoresSlot(curGrupo.id, modal.rank, modal.slot, {
        nome:        form.nome.trim(),
        cargo:       form.cargo.trim(),
        email:       form.email.trim(),
        telefone:    form.telefone.trim(),
        linkedin:    form.linkedin.trim(),
        fonte:       "manual",
        status:      "verificado",
        atualizadoEm: new Date().toLocaleDateString("pt-BR"),
      });
    } catch(e) {
      alert("⚠️ NÃO SALVO — " + e.message);
      return;
    }
    if (entry) {
      var k = curGrupo.id + "_" + modal.rank;
      setAccs(function(prev) { var n = Object.assign({}, prev); n[k] = entry; return n; });
    }
    setModal(null);
    setForm({nome:"",cargo:"",email:"",telefone:"",linkedin:""});
  }, [modal, form, curGrupo, setAccs]);

  // ── export CSV ─────────────────────────────────────────────────
  var exportCSV = useCallback(function() {
    var header = "Empresa,Setor,Status,CEO,CEO_email,CMO,CMO_email,Gerência,Ger_email,Faltantes\n";
    var rows = filtered.map(function(r) {
      var slots = r.cob.slots;
      var fat = r.cob.faltantes.map(function(f){ return SL[f]||f; }).join("|");
      return [
        r.lead.nome, r.lead.setor||"", r.cob.status,
        slots.ceo ? slots.ceo.nome : "", slots.ceo ? slots.ceo.email : "",
        slots.cmo ? slots.cmo.nome : "", slots.cmo ? slots.cmo.email : "",
        slots.gerencia ? slots.gerencia.nome : "", slots.gerencia ? slots.gerencia.email : "",
        fat
      ].map(function(v){ return '"'+(v||"").replace(/"/g,'""')+'"'; }).join(",");
    });
    var blob = new Blob([header+rows.join("\n")], {type:"text/csv;charset=utf-8;"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "cobertura_"+curGrupo.id+".csv";
    a.click(); URL.revokeObjectURL(url);
  }, [filtered, curGrupo, SL]);

  // ── style helpers ──────────────────────────────────────────────
  function chip(color) {
    return { display:"inline-flex", alignItems:"center", padding:"2px 7px", borderRadius:10,
             border:"1px solid "+color+"44", background:color+"18", color:color,
             fontSize:9, fontFamily:MONO, fontWeight:600, flexShrink:0 };
  }
  function fBtn(active, extra) {
    return Object.assign({ padding:"3px 8px",
      border:".5px solid "+(active?"#FF6B2B":"#2D2D44"), borderRadius:4,
      background:active?"rgba(255,107,43,.1)":"transparent",
      color:active?"#FF6B2B":"#9B9BB4", fontSize:9, cursor:"pointer", fontFamily:MONO }, extra||{});
  }
  var GRID = { display:"grid",
               gridTemplateColumns:"2fr 90px 70px 1fr 1fr 1fr 100px",
               gap:6, padding:"5px 8px", borderBottom:".5px solid #1A1A2E", alignItems:"center" };
  var CELL = { fontSize:9, color:"#9B9BB4", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" };
  var INP  = { width:"100%", background:"#0D0D1A", border:".5px solid #2D2D44", borderRadius:4,
               color:"#E0E0FF", padding:"5px 8px", fontSize:9, fontFamily:MONO, outline:"none",
               boxSizing:"border-box" };

  // ── slot cell renderer ─────────────────────────────────────────
  function slotCell(slot) {
    if (!slot || !slot.nome) return React.createElement("span", { style:{fontSize:8,color:"#3d3d5c"} }, "—");
    var hasEmail = !!slot.email;
    var hasPhone = !!slot.telefone;
    var isLusha   = slot.fonte === "lusha"   || slot.status === "enriquecido";
    var isHunter  = slot.fonte === "hunter";
    var isCrawler = slot.fonte === "crawler" || slot.fonte === "receita_federal";
    var color = isLusha   ? "#22C55E"   // verde  — Lusha (pago)
              : isHunter  ? "#A78BFA"   // roxo   — Hunter (público)
              : isCrawler ? "#F59E0B"   // âmbar  — Crawler/QSA (público)
              : (hasEmail || hasPhone) ? "#60A5FA" // azul — manual c/ contato
              : "#9B9BB4";             // cinza — manual sem contato
    var badge = isLusha ? "✓ " : isHunter ? "🌐 " : isCrawler ? "🕷 " : "";
    var fonteLabel = isHunter ? "\nFonte: Hunter" : isLusha ? "\nFonte: Lusha"
                   : isCrawler ? "\nFonte: Crawler/Receita Federal (verificar)" : "";
    var title = slot.nome + (slot.cargo ? " · " + slot.cargo : "") +
                (slot.email ? "\n✉ "+slot.email : "") +
                (slot.telefone ? "\n📱 "+slot.telefone : "") + fonteLabel;
    return React.createElement("span", {
      style:{ fontSize:8, color:color, overflow:"hidden", textOverflow:"ellipsis",
              whiteSpace:"nowrap", display:"block" },
      title:title
    }, badge + slot.nome);
  }

  // ── action buttons for a row ───────────────────────────────────
  function actionButtons(row) {
    var rank      = row.lead.rank;
    var nome      = row.lead.nome;
    var faltantes = row.cob.faltantes;
    var slots     = row.cob.slots;
    var dominio   = row.dominio;

    var btns = [];

    // 🕷️ Crawler (Receita Federal QSA + website) — primeira escolha, grátis, sem limite
    if (faltantes.length > 0) {
      var entry2 = accs[curGrupo.id + "_" + rank];
      var cnpjLead = (row.lead.cnpj) || (entry2 && entry2.cnpj) || "";
      var temFonte = !!(dominio || cnpjLead);
      var cLoading = !!crawlerLoading[rank];
      if (temFonte) {
        btns.push(React.createElement("button", {
          key: "crawler",
          title: "Buscar decisores publicamente" + (cnpjLead ? " via Receita Federal (CNPJ:"+cnpjLead+")" : "") + (dominio ? " + site:" + dominio : ""),
          disabled: cLoading,
          onClick: function() { buscarCrawler(rank, row.lead); },
          style:{ fontSize:8, padding:"2px 6px", border:".5px solid #F59E0B44", borderRadius:3,
                  background:"rgba(245,158,11,.08)", color: cLoading ? "#555570" : "#F59E0B",
                  cursor: cLoading ? "default" : "pointer", fontFamily:MONO, fontWeight:600 }
        }, cLoading ? "🕷…" : "🕷 QSA+Web"));
      }
    }

    // 🌐 Hunter automático (domínio detectado + slots vazios)
    if (dominio && faltantes.length > 0) {
      var hLoading = !!hunterLoading[rank];
      btns.push(React.createElement("button", {
        key: "hunter",
        title: "Buscar e-mails em " + dominio + " via Hunter (fontes públicas)",
        disabled: hLoading,
        onClick: function() { buscarHunter(rank, row.lead); },
        style:{ fontSize:8, padding:"2px 6px", border:".5px solid #A78BFA44", borderRadius:3,
                background:"rgba(167,139,250,.08)", color: hLoading ? "#555570" : "#A78BFA",
                cursor: hLoading ? "default" : "pointer", fontFamily:MONO, fontWeight:600 }
      }, hLoading ? "🌐…" : "🌐 E-mail"));
    }

    // "+" for empty slots
    faltantes.forEach(function(slotName) {
      btns.push(React.createElement("button", {
        key: "add_"+slotName,
        title: "Adicionar "+SL[slotName]+" manualmente",
        onClick: function() {
          setModal({ rank:rank, slot:slotName });
          setForm({ nome:"", cargo:SL[slotName]||"", email:"", telefone:"", linkedin:"" });
        },
        style:{ fontSize:8, padding:"2px 5px", border:".5px solid #2D2D44", borderRadius:3,
                background:"transparent", color:"#9B9BB4", cursor:"pointer", fontFamily:MONO }
      }, "+"+slotName.slice(0,3).toUpperCase()));
    });

    // "🔍" Lusha — slots com nome mas sem email/telefone
    ["ceo","cmo","gerencia"].forEach(function(slotName) {
      var sl = slots[slotName];
      if (!sl || !sl.nome.trim()) return;
      if (sl.email && sl.telefone) return;
      var lk = rank + "_" + slotName;
      var loading = !!enrichLoading[lk];
      btns.push(React.createElement("button", {
        key: "enr_"+slotName,
        title: "Enriquecer "+SL[slotName]+" via Lusha (pago)",
        disabled: loading,
        onClick: function() { enrichSlot(rank, slotName, nome); },
        style:{ fontSize:8, padding:"2px 5px", border:".5px solid #2D2D44", borderRadius:3,
                background:"transparent", color: loading ? "#555570" : "#60A5FA",
                cursor: loading ? "default" : "pointer", fontFamily:MONO }
      }, loading ? "…" : "🔍"+slotName.slice(0,3).toUpperCase()));
    });

    return React.createElement("div", { style:{display:"flex",gap:2,flexWrap:"wrap"} }, btns);
  }

  // ── batch progress bar ─────────────────────────────────────────
  function progressBar(done, total) {
    var pct = total > 0 ? Math.round(100 * done / total) : 0;
    return React.createElement("div", { style:{marginTop:8} },
      React.createElement("div", { style:{fontSize:8,color:"#9B9BB4",marginBottom:3,fontFamily:MONO} },
        done + " / " + total + " (" + pct + "%)"),
      React.createElement("div", { style:{background:"#1A1A2E",borderRadius:4,height:6,overflow:"hidden"} },
        React.createElement("div", {
          style:{ height:"100%", width:pct+"%", background:"#60A5FA",
                  transition:"width .3s", borderRadius:4 }
        })
      )
    );
  }

  // ── render ─────────────────────────────────────────────────────
  return /*#__PURE__*/React.createElement("div", {
    style:{ flex:1, overflow:"auto", padding:"12px 16px", fontFamily:MONO }
  },

    /* — header — */
    React.createElement("div", {
      style:{ display:"flex", alignItems:"center", gap:8, marginBottom:12, flexWrap:"wrap" }
    },
      React.createElement("span", { style:{fontSize:11,fontWeight:700,color:"#E0E0FF",letterSpacing:1} },
        "🗺 COBERTURA DE DECISORES"),
      React.createElement("span", { style:chip("#9B9BB4") }, total+" no CRM"),
      React.createElement("span", { style:chip("#22C55E") }, completas+" completas"),
      React.createElement("span", { style:chip("#F59E0B") }, parciais+" parciais"),
      React.createElement("span", { style:chip("#EF4444") }, vazias+" vazias"),
      crawlaveis > 0 && React.createElement("span", { style:chip("#F59E0B") }, crawlaveis+" rastreáveis"),
      autoBuscaveis > 0 && React.createElement("span", { style:chip("#A78BFA") }, autoBuscaveis+" c/ domínio"),
      enrichable > 0 && React.createElement("span", { style:chip("#60A5FA") }, enrichable+" Lusha"),
      React.createElement("div", { style:{marginLeft:"auto", display:"flex", gap:6} },
        crawlaveis > 0 && React.createElement("button", {
          onClick: runCrawlerBatch,
          style: fBtn(true, { fontSize:9, borderColor:"#F59E0B66", color:"#F59E0B",
                              background:"rgba(245,158,11,.08)" }),
          title: "Buscar decisores via Receita Federal (CNPJ/QSA) e website — grátis, sem limites"
        }, "🕷 Crawler (CNPJ+Web)"),
        autoBuscaveis > 0 && React.createElement("button", {
          onClick: runHunterBatch,
          style: fBtn(true, { fontSize:9, borderColor:"#A78BFA66", color:"#A78BFA",
                              background:"rgba(167,139,250,.08)" }),
          title: "Buscar e-mails em todos os domínios via Hunter"
        }, "🌐 Hunter (e-mails)"),
        enrichable > 0 && React.createElement("button", {
          onClick: runBatch,
          style: fBtn(true, { fontSize:9 }),
          title: "Enriquecer via Lusha todos os slots com nome mas sem email/fone"
        }, "🔍 Lusha"),
        React.createElement("button", { onClick:exportCSV, style:fBtn(false,{fontSize:9}) },
          "⬇ CSV")
      )
    ),

    /* — filters — */
    React.createElement("div", {
      style:{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10, alignItems:"center" }
    },
      React.createElement("input", {
        placeholder:"Buscar empresa...", value:search,
        onChange:function(e){ setSearch(e.target.value); setPage(0); },
        style:{ background:"#141428", border:".5px solid #2D2D44", borderRadius:4,
                color:"#E0E0FF", padding:"4px 8px", fontSize:9, fontFamily:MONO,
                outline:"none", width:160 }
      }),
      React.createElement("button", {
        onClick:function(){ setSoGaps(function(v){ return !v; }); setPage(0); },
        style:fBtn(soGaps)
      }, soGaps ? "✓ Só gaps" : "Todos"),
      ["ceo","cmo","gerencia"].map(function(slot) {
        return React.createElement("button", {
          key:slot,
          onClick:function(){ setFiltSlot(filtSlot===slot?null:slot); setPage(0); },
          style:fBtn(filtSlot===slot)
        }, "Sem "+SL[slot]);
      }),
      React.createElement("select", {
        value:filtSetor,
        onChange:function(e){ setFiltSetor(e.target.value); setPage(0); },
        style:{ background:"#141428", border:".5px solid #2D2D44", borderRadius:4,
                color:"#9B9BB4", padding:"3px 6px", fontSize:9, fontFamily:MONO, cursor:"pointer" }
      },
        React.createElement("option", {value:""}, "Todos os setores"),
        setores.map(function(s){ return React.createElement("option",{key:s,value:s},s); })
      )
    ),

    /* — table header — */
    React.createElement("div", {
      style:Object.assign({},GRID,{borderBottom:"1px solid #2D2D44",marginBottom:2})
    },
      ["EMPRESA","SETOR","STATUS","CEO","CMO","GER. MKT","AÇÕES"].map(function(h) {
        return React.createElement("span",{key:h,style:{fontSize:8,color:"#555570",fontFamily:MONO}},h);
      })
    ),

    /* — rows — */
    pageRows.map(function(row) {
      return React.createElement("div", { key:row.lead.rank, style:GRID },
        React.createElement("span", {
          style:{ fontSize:9,color:"#E0E0FF",fontWeight:600,overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap" },
          title:row.lead.nome
        }, row.lead.nome),
        React.createElement("span", {style:CELL}, row.lead.setor||"—"),
        React.createElement("span", {style:chip(statusColor[row.cob.status])},
          statusLabel[row.cob.status]),
        slotCell(row.cob.slots.ceo),
        slotCell(row.cob.slots.cmo),
        slotCell(row.cob.slots.gerencia),
        actionButtons(row)
      );
    }),

    /* — empty state — */
    filtered.length === 0 && React.createElement("div", {
      style:{ textAlign:"center", padding:"40px 0", color:"#3d3d5c", fontSize:10 }
    }, soGaps
      ? "Todas as empresas têm cobertura completa neste grupo 🎉"
      : "Nenhuma empresa encontrada."),

    /* — pagination — */
    pages > 1 && React.createElement("div", {
      style:{ display:"flex",gap:8,justifyContent:"center",padding:"12px 0",alignItems:"center" }
    },
      React.createElement("button", {
        onClick:function(){ setPage(function(p){ return Math.max(0,p-1); }); },
        disabled:sp===0, style:Object.assign({},fBtn(false),{opacity:sp===0?0.4:1})
      }, "← Ant"),
      React.createElement("span", {style:{fontSize:9,color:"#9B9BB4"}},
        (sp+1)+" / "+pages+" · "+filtered.length+" empresas"),
      React.createElement("button", {
        onClick:function(){ setPage(function(p){ return Math.min(pages-1,p+1); }); },
        disabled:sp>=pages-1, style:Object.assign({},fBtn(false),{opacity:sp>=pages-1?0.4:1})
      }, "Próx →")
    ),

    /* ═══════════════════════════════════════════════════════════
       ADD-MANUAL MODAL
       ═════════════════════════════════════════════════════════== */
    modal && React.createElement("div", {
      style:{ position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:9000,
              display:"flex",alignItems:"center",justifyContent:"center" },
      onClick:function(e){ if(e.target===e.currentTarget) setModal(null); }
    },
      React.createElement("div", {
        style:{ background:"#1A1A2E",border:".5px solid #2D2D44",borderRadius:8,
                padding:24,minWidth:320,maxWidth:420,fontFamily:MONO }
      },
        React.createElement("div", {style:{fontSize:11,color:"#E0E0FF",fontWeight:700,marginBottom:16}},
          "Adicionar "+SL[modal.slot]),
        ["nome","cargo","email","telefone","linkedin"].map(function(field) {
          return React.createElement("div", {key:field,style:{marginBottom:8}},
            React.createElement("div", {style:{fontSize:8,color:"#555570",marginBottom:3}},
              field.toUpperCase()),
            React.createElement("input", {
              value:form[field],
              onChange:function(e){
                setForm(function(prev){ var n=Object.assign({},prev); n[field]=e.target.value; return n; });
              },
              placeholder:{ nome:"Nome completo", cargo:"Cargo exato",
                            email:"email@empresa.com", telefone:"(11) 9xxxx-xxxx",
                            linkedin:"linkedin.com/in/..." }[field]||"",
              style:INP
            })
          );
        }),
        React.createElement("div", {style:{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}},
          React.createElement("button", {onClick:function(){setModal(null);}, style:fBtn(false)},
            "Cancelar"),
          React.createElement("button", {
            onClick:saveSlot, disabled:!form.nome.trim(),
            style:Object.assign({},fBtn(true),{opacity:form.nome.trim()?1:0.4})
          }, "Salvar")
        )
      )
    ),

    /* ═══════════════════════════════════════════════════════════
       BATCH MODAL
       ═════════════════════════════════════════════════════════== */
    batchModal && React.createElement("div", {
      style:{ position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9100,
              display:"flex",alignItems:"center",justifyContent:"center" }
    },
      React.createElement("div", {
        style:{ background:"#1A1A2E",border:".5px solid #2D2D44",borderRadius:8,
                padding:24,minWidth:360,maxWidth:480,fontFamily:MONO }
      },
        React.createElement("div", {style:{fontSize:11,color:"#E0E0FF",fontWeight:700,marginBottom:4}},
          batchModal.running ? "🔍 Enriquecendo via Lusha…" : "🔍 Enriquecimento concluído"),

        /* progress bar */
        batchModal.total > 0 && progressBar(batchModal.done||0, batchModal.total),

        /* summary chips */
        React.createElement("div", {style:{display:"flex",gap:6,marginTop:10}},
          batchModal.total !== undefined && React.createElement("span", {style:chip("#9B9BB4")},
            (batchModal.total||0)+" slots"),
          batchModal.ok !== undefined && batchModal.ok > 0 && React.createElement("span", {style:chip("#22C55E")},
            "✓ "+batchModal.ok+" enriquecidos"),
          batchModal.falhas && batchModal.falhas.length > 0 && React.createElement("span", {style:chip("#EF4444")},
            "✗ "+batchModal.falhas.length+" falhas")
        ),

        /* failure log */
        batchModal.falhas && batchModal.falhas.length > 0 && React.createElement("div", {
          style:{ marginTop:10, maxHeight:150, overflowY:"auto",
                  background:"#0D0D1A", borderRadius:4, padding:"6px 8px" }
        },
          batchModal.falhas.map(function(f, i) {
            return React.createElement("div", {key:i, style:{fontSize:8,color:"#EF4444",marginBottom:2}},
              f.empresa + " · " + f.slot + " — " + f.erro);
          })
        ),

        /* special case: no enrichable slots */
        batchModal.total === 0 && !batchModal.running && React.createElement("div", {
          style:{fontSize:9,color:"#9B9BB4",marginTop:10}
        }, "Nenhum slot com nome e sem email/fone encontrado neste grupo."),

        /* close button (only when done) */
        React.createElement("div", {style:{marginTop:16,display:"flex",justifyContent:"flex-end"}},
          React.createElement("button", {
            onClick:function(){ setBatchModal(null); },
            disabled:!!batchModal.running,
            style:Object.assign({},fBtn(!batchModal.running),{opacity:batchModal.running?0.4:1})
          }, batchModal.running ? "Aguarde…" : "Fechar")
        )
      )
    ),

    /* ═══════════════════════════════════════════════════════════
       HUNTER BATCH MODAL
       ═════════════════════════════════════════════════════════== */
    hunterModal && React.createElement("div", {
      style:{ position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9100,
              display:"flex",alignItems:"center",justifyContent:"center" }
    },
      React.createElement("div", {
        style:{ background:"#1A1A2E",border:".5px solid #A78BFA44",borderRadius:8,
                padding:24,minWidth:360,maxWidth:480,fontFamily:MONO }
      },
        React.createElement("div", {style:{fontSize:11,color:"#E0E0FF",fontWeight:700,marginBottom:2}},
          hunterModal.running ? "🌐 Buscando via Hunter…" : "🌐 Busca concluída"),
        React.createElement("div", {style:{fontSize:8,color:"#9B9BB4",marginBottom:10}},
          "Fontes públicas · ~1 req/s · sem custo Lusha"),

        hunterModal.total > 0 && progressBar(hunterModal.done||0, hunterModal.total),

        React.createElement("div", {style:{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}},
          React.createElement("span", {style:chip("#9B9BB4")}, (hunterModal.total||0)+" domínios"),
          hunterModal.ok > 0 && React.createElement("span", {style:chip("#A78BFA")},
            "✓ "+hunterModal.ok+" com resultados"),
          hunterModal.semResult > 0 && React.createElement("span", {style:chip("#F59E0B")},
            hunterModal.semResult+" sem resultado"),
          hunterModal.falhas && hunterModal.falhas.length > 0 && React.createElement("span",
            {style:chip("#EF4444")}, "✗ "+hunterModal.falhas.length+" erros")
        ),

        hunterModal.total === 0 && !hunterModal.running && React.createElement("div", {
          style:{fontSize:9,color:"#9B9BB4",marginTop:10}
        }, "Nenhuma empresa com domínio detectável encontrada. Adicione o site via CSV ou edite a empresa."),

        React.createElement("div", {style:{marginTop:16,display:"flex",justifyContent:"flex-end"}},
          React.createElement("button", {
            onClick:function(){ setHunterModal(null); if(!hunterModal.running) refreshAccs(); },
            disabled:!!hunterModal.running,
            style:Object.assign({},fBtn(!hunterModal.running),{opacity:hunterModal.running?0.4:1})
          }, hunterModal.running ? "Aguarde…" : "Fechar e atualizar")
        )
      )
    ),

    /* ═══════════════════════════════════════════════════════════
       CRAWLER BATCH MODAL
       ═════════════════════════════════════════════════════════== */
    crawlerModal && React.createElement("div", {
      style:{ position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9100,
              display:"flex",alignItems:"center",justifyContent:"center" }
    },
      React.createElement("div", {
        style:{ background:"#1A1A2E",border:".5px solid #F59E0B44",borderRadius:8,
                padding:24,minWidth:360,maxWidth:480,fontFamily:MONO }
      },
        React.createElement("div", {style:{fontSize:11,color:"#E0E0FF",fontWeight:700,marginBottom:2}},
          crawlerModal.running ? "🕷 Rastreando fontes públicas…" : "🕷 Rastreamento concluído"),
        React.createElement("div", {style:{fontSize:8,color:"#9B9BB4",marginBottom:10}},
          "Receita Federal (CNPJ/QSA) + páginas de equipe dos sites · Grátis · Sem limite de créditos"),

        crawlerModal.total > 0 && progressBar(crawlerModal.done||0, crawlerModal.total),

        React.createElement("div", {style:{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}},
          React.createElement("span", {style:chip("#9B9BB4")}, (crawlerModal.total||0)+" empresas"),
          (crawlerModal.ok||0) > 0 && React.createElement("span", {style:chip("#F59E0B")},
            "✓ "+(crawlerModal.ok)+" com decisores"),
          (crawlerModal.semResult||0) > 0 && React.createElement("span", {style:chip("#555570")},
            (crawlerModal.semResult)+" sem resultado"),
          crawlerModal.falhas && crawlerModal.falhas.length > 0 && React.createElement("span",
            {style:chip("#EF4444")}, "✗ "+crawlerModal.falhas.length+" erros")
        ),

        crawlerModal.total === 0 && !crawlerModal.running && React.createElement("div", {
          style:{fontSize:9,color:"#9B9BB4",marginTop:10}
        }, "Nenhuma empresa com CNPJ ou website encontrada. Importe via CSV com a coluna 'cnpj' ou 'website'."),

        React.createElement("div", {style:{fontSize:8,color:"#F59E0B",marginTop:8,lineHeight:1.6}},
          "⚠ Dados da Receita Federal mostram sócios/administradores legais — confirme que são os decisores de marketing antes de usar no disparo."),

        React.createElement("div", {style:{marginTop:16,display:"flex",justifyContent:"flex-end"}},
          React.createElement("button", {
            onClick:function(){ setCrawlerModal(null); if(!crawlerModal.running) refreshAccs(); },
            disabled:!!crawlerModal.running,
            style:Object.assign({},fBtn(!crawlerModal.running),{opacity:crawlerModal.running?0.4:1})
          }, crawlerModal.running ? "Aguarde…" : "Fechar e atualizar")
        )
      )
    )

  ); // end root div
}; // end CoberturaView

// ═════════════════════════════════════════════════════════════════════════════
// RankingView — Fase 4
// Props: accs, curGrupo
// ═════════════════════════════════════════════════════════════════════════════
var RankingView = function RankingView(_ref) {
  var accs     = _ref.accs;
  var curGrupo = _ref.curGrupo;

  var PAGE = 50;
  var _p  = useState(0);    var page      = _p[0];  var setPage      = _p[1];
  var _sf = useState("");   var filtSetor = _sf[0]; var setFiltSetor = _sf[1];
  var _ff = useState("");   var filtFit   = _ff[0]; var setFiltFit   = _ff[1];
  var _ms = useState(0);    var minScore  = _ms[0]; var setMinScore  = _ms[1];
  var _so = useState("score"); var sortBy = _so[0]; var setSortBy    = _so[1];

  var leads = typeof PROSP !== "undefined" ? PROSP : [];
  var MONO  = "IBM Plex Mono,monospace";

  function chip(color) {
    return { display:"inline-flex", alignItems:"center", padding:"2px 7px", borderRadius:10,
             border:"1px solid "+color+"44", background:color+"18", color:color,
             fontSize:9, fontFamily:MONO, fontWeight:600 };
  }
  function fBtn(active, extra) {
    return Object.assign({ padding:"3px 8px",
      border:".5px solid "+(active?"#FF6B2B":"#2D2D44"), borderRadius:4,
      background:active?"rgba(255,107,43,.1)":"transparent",
      color:active?"#FF6B2B":"#9B9BB4", fontSize:9, cursor:"pointer", fontFamily:MONO }, extra||{});
  }

  // compute scores for all leads in current group with accs entries
  var rows = useMemo(function() {
    if (typeof getScorePrioridade !== "function") return [];
    var prefix = curGrupo.id + "_";
    return leads.map(function(lead) {
      if (!accs[prefix + lead.rank]) return null;
      var sd  = getScorePrioridade(curGrupo.id, lead.rank, lead, accs);
      var cob = typeof getCoberturaEmpresa === "function"
        ? getCoberturaEmpresa(curGrupo.id, lead.rank, accs)
        : { preenchidos:0, status:"vazia" };
      return { lead:lead, sd:sd, cob:cob };
    }).filter(Boolean);
  }, [accs, leads, curGrupo]);

  var setores = useMemo(function() {
    var s = {};
    rows.forEach(function(r){ if(r.lead.setor) s[r.lead.setor]=1; });
    return Object.keys(s).sort();
  }, [rows]);

  var filtered = useMemo(function() {
    var r = rows.filter(function(row) {
      if (filtSetor && row.lead.setor !== filtSetor) return false;
      if (filtFit   && row.sd.fitLevel !== filtFit) return false;
      if (row.sd.score < minScore) return false;
      return true;
    });
    if (sortBy === "score")    r.sort(function(a,b){ return b.sd.score - a.sd.score; });
    else if (sortBy === "rec") r.sort(function(a,b){ return b.sd.detalhes.recencia - a.sd.detalhes.recencia; });
    else if (sortBy === "fit") r.sort(function(a,b){ return b.sd.detalhes.fit - a.sd.detalhes.fit; });
    return r;
  }, [rows, filtSetor, filtFit, minScore, sortBy]);

  var pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  var sp = Math.min(page, pages - 1);
  var pageRows = filtered.slice(sp * PAGE, (sp + 1) * PAGE);

  function colHdr(label, key) {
    return React.createElement("span", {
      key:key, onClick:function(){ setSortBy(key); setPage(0); },
      style:{ fontSize:8, color:sortBy===key?"#FF6B2B":"#555570",
              fontFamily:MONO, cursor:"pointer", userSelect:"none" }
    }, label + (sortBy===key?" ↓":""));
  }

  return /*#__PURE__*/React.createElement("div", {
    style:{ flex:1, overflow:"auto", padding:"12px 16px", fontFamily:MONO }
  },

    /* header */
    React.createElement("div", {style:{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}},
      React.createElement("span", {style:{fontSize:11,fontWeight:700,color:"#E0E0FF",letterSpacing:1}},
        "📈 RANKING · "+curGrupo.name.toUpperCase()),
      React.createElement("span", {style:chip("#9B9BB4")}, rows.length+" empresas"),
      React.createElement("span", {style:chip("#FF6B2B")}, filtered.length+" filtradas")
    ),

    /* filters */
    React.createElement("div", {style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}},
      React.createElement("select", {
        value:filtSetor, onChange:function(e){ setFiltSetor(e.target.value); setPage(0); },
        style:{background:"#141428",border:".5px solid #2D2D44",borderRadius:4,color:"#9B9BB4",
               padding:"3px 6px",fontSize:9,fontFamily:MONO,cursor:"pointer"}
      },
        React.createElement("option",{value:""},"Todos os setores"),
        setores.map(function(s){ return React.createElement("option",{key:s,value:s},s); })
      ),
      ["","alto","medio","baixo"].map(function(f){
        return React.createElement("button",{key:f||"_",
          onClick:function(){ setFiltFit(f); setPage(0); }, style:fBtn(filtFit===f)
        }, f ? "Fit "+f : "Todos");
      }),
      React.createElement("select", {
        value:minScore, onChange:function(e){ setMinScore(Number(e.target.value)); setPage(0); },
        style:{background:"#141428",border:".5px solid #2D2D44",borderRadius:4,color:"#9B9BB4",
               padding:"3px 6px",fontSize:9,fontFamily:MONO,cursor:"pointer"}
      },
        [[0,"Score mín."],[30,"≥30"],[50,"≥50"],[70,"≥70"],[80,"≥80"]].map(function(o){
          return React.createElement("option",{key:o[0],value:o[0]},o[1]);
        })
      )
    ),

    /* table header */
    React.createElement("div", {
      style:{display:"grid",gridTemplateColumns:"28px 2fr 90px 60px 110px 70px 70px 55px",
             gap:6,padding:"5px 8px",borderBottom:"1px solid #2D2D44",marginBottom:2}
    },
      React.createElement("span",{style:{fontSize:8,color:"#555570"}},"#"),
      React.createElement("span",{style:{fontSize:8,color:"#555570"}},"EMPRESA"),
      React.createElement("span",{style:{fontSize:8,color:"#555570"}},"SETOR"),
      colHdr("SCORE","score"),
      React.createElement("span",{style:{fontSize:8,color:"#555570",userSelect:"none"}},"P · F · R · C"),
      colHdr("FIT","fit"),
      colHdr("RECÊNCIA","rec"),
      React.createElement("span",{style:{fontSize:8,color:"#555570"}},"COB.")
    ),

    /* rows */
    pageRows.map(function(row, i) {
      var pos = sp * PAGE + i + 1;
      var sd  = row.sd;
      var sColor = sd.score>=70?"#FF6B2B":sd.score>=50?"#F59E0B":"#60A5FA";
      var fColor = sd.fitLevel==="alto"?"#22C55E":sd.fitLevel==="medio"?"#F59E0B":"#9B9BB4";
      var cob = row.cob || {preenchidos:0,status:"vazia"};
      var cColor = cob.status==="completa"?"#22C55E":cob.status==="parcial"?"#F59E0B":"#EF4444";
      var tip = "Potencial: "+sd.detalhes.potencial+"\nFit: "+sd.detalhes.fit+
                "\nRecência: "+sd.detalhes.recencia+"\nCobertura: "+sd.detalhes.gap;

      return React.createElement("div", {
        key:row.lead.rank,
        style:{display:"grid",gridTemplateColumns:"28px 2fr 90px 60px 110px 70px 70px 55px",
               gap:6,padding:"5px 8px",borderBottom:".5px solid #1A1A2E",alignItems:"center"}
      },
        React.createElement("span",{style:{fontSize:8,color:"#555570"}},pos),
        React.createElement("span",{
          style:{fontSize:9,color:"#E0E0FF",fontWeight:600,overflow:"hidden",
                 textOverflow:"ellipsis",whiteSpace:"nowrap"},title:row.lead.nome
        },row.lead.nome),
        React.createElement("span",{style:{fontSize:8,color:"#9B9BB4",overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}},(row.lead.setor||"—")),
        /* score + bar */
        React.createElement("div",{},
          React.createElement("span",{style:{fontSize:11,color:sColor,fontWeight:700}},sd.score),
          React.createElement("div",{style:{height:3,background:"#1A1A2E",borderRadius:2,marginTop:2}},
            React.createElement("div",{style:{height:"100%",width:sd.score+"%",background:sColor,borderRadius:2}}))
        ),
        /* mini breakdown: P F R C */
        React.createElement("div",{style:{display:"flex",gap:1},title:tip},
          [["P",sd.detalhes.potencial,"#60A5FA"],["F",sd.detalhes.fit,"#22C55E"],
           ["R",sd.detalhes.recencia,"#F59E0B"],["C",sd.detalhes.gap,"#A78BFA"]].map(function(b){
            return React.createElement("div",{key:b[0],
              style:{width:24,height:16,borderRadius:2,background:b[2]+"22",
                     display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}},
              React.createElement("span",{style:{fontSize:5,color:b[2]+"aa"}},b[0]),
              React.createElement("span",{style:{fontSize:6,color:b[2],fontWeight:700}},b[1])
            );
          })
        ),
        React.createElement("span",{style:Object.assign({},chip(fColor),{fontSize:8})},sd.fitLevel),
        React.createElement("span",{style:{fontSize:8,color:sd.diasSemContato>30?"#EF4444":sd.diasSemContato>0?"#F59E0B":"#22C55E"}},
          sd.diasSemContato>0?sd.diasSemContato+"d":"hoje"),
        React.createElement("span",{style:Object.assign({},chip(cColor),{fontSize:8})},cob.preenchidos+"/3")
      );
    }),

    /* empty */
    filtered.length===0 && React.createElement("div",{
      style:{textAlign:"center",padding:"40px 0",color:"#3d3d5c",fontSize:10}
    },"Nenhuma empresa encontrada."),

    /* pagination */
    pages>1 && React.createElement("div",{
      style:{display:"flex",gap:8,justifyContent:"center",padding:"12px 0",alignItems:"center"}
    },
      React.createElement("button",{onClick:function(){setPage(function(p){return Math.max(0,p-1);});},
        disabled:sp===0,style:Object.assign({},fBtn(false),{opacity:sp===0?0.4:1})},"← Ant"),
      React.createElement("span",{style:{fontSize:9,color:"#9B9BB4"}},
        (sp+1)+" / "+pages+" · "+filtered.length+" empresas"),
      React.createElement("button",{onClick:function(){setPage(function(p){return Math.min(pages-1,p+1);});},
        disabled:sp>=pages-1,style:Object.assign({},fBtn(false),{opacity:sp>=pages-1?0.4:1})},"Próx →")
    )
  );
}; // end RankingView

// ═════════════════════════════════════════════════════════════════════════════
// ReguaMensalView — Fase 5
// Props: accs, curGrupo, onDispatch(decisor, empresa, setor, oferta)
// ═════════════════════════════════════════════════════════════════════════════
var ReguaMensalView = function ReguaMensalView(_ref) {
  var accs       = _ref.accs;
  var curGrupo   = _ref.curGrupo;
  var onDispatch = _ref.onDispatch;

  var PAGE = 30;
  var _p  = useState(0); var page = _p[0]; var setPage = _p[1];
  var _rt = useState(0); var tick = _rt[0]; var setTick = _rt[1]; // force re-render after registrarToque

  var leads = typeof PROSP !== "undefined" ? PROSP : [];
  var MONO  = "IBM Plex Mono,monospace";

  function chip(color) {
    return { display:"inline-flex", alignItems:"center", padding:"2px 7px", borderRadius:10,
             border:"1px solid "+color+"44", background:color+"18", color:color,
             fontSize:9, fontFamily:MONO, fontWeight:600 };
  }
  function fBtn(active, extra) {
    return Object.assign({ padding:"3px 8px",
      border:".5px solid "+(active?"#FF6B2B":"#2D2D44"), borderRadius:4,
      background:active?"rgba(255,107,43,.1)":"transparent",
      color:active?"#FF6B2B":"#9B9BB4", fontSize:9, cursor:"pointer", fontFamily:MONO }, extra||{});
  }

  /* vencidos: re-derive when accs or tick changes */
  var vencidos = useMemo(function() {
    if (typeof getDecisoresVencidos !== "function") return [];
    return getDecisoresVencidos(curGrupo.id, leads, undefined, accs);
  }, [accs, curGrupo, leads, tick]);

  /* progresso do mês atual */
  var mesAtual = useMemo(function() {
    try {
      var regua = JSON.parse(localStorage.getItem("gh_regua_v1")||"{}");
      var mesStr = new Date().toISOString().slice(0,7); // "YYYY-MM"
      var count = 0;
      Object.keys(regua).forEach(function(k){
        var e = regua[k];
        if (e.ultimoToqueEm && e.ultimoToqueEm.startsWith(mesStr)) count++;
      });
      return count;
    } catch(e) { return 0; }
  }, [tick]);

  var pages = Math.max(1, Math.ceil(vencidos.length / PAGE));
  var sp = Math.min(page, pages - 1);
  var pageRows = vencidos.slice(sp * PAGE, (sp + 1) * PAGE);
  var SL = typeof SLOT_LABELS !== "undefined" ? SLOT_LABELS : {ceo:"CEO",cmo:"CMO",gerencia:"Gerência"};
  var mesLabel = new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"});

  return /*#__PURE__*/React.createElement("div", {
    style:{ flex:1, overflow:"auto", padding:"12px 16px", fontFamily:MONO }
  },

    /* header */
    React.createElement("div", {style:{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}},
      React.createElement("span", {style:{fontSize:11,fontWeight:700,color:"#E0E0FF",letterSpacing:1}},
        "🗓 RÉGUA MENSAL"),
      React.createElement("span", {style:{fontSize:9,color:"#9B9BB4"}}, mesLabel),
      React.createElement("span", {style:chip("#EF4444")}, vencidos.length+" vencendo"),
      React.createElement("span", {style:chip("#22C55E")}, mesAtual+" contatados este mês")
    ),

    /* config hint */
    React.createElement("div", {style:{fontSize:8,color:"#3d3d5c",marginBottom:10}},
      "Intervalo: "+((typeof REGUA_CONFIG!=="undefined"?REGUA_CONFIG.intervalo:30))+"d  ·  " +
      "Prioridade: "+((typeof REGUA_CONFIG!=="undefined"?REGUA_CONFIG.prioSlots:["cmo","gerencia","ceo"]).map(function(s){ return SL[s]||s; }).join(" → "))
    ),

    /* table header */
    React.createElement("div", {
      style:{display:"grid",gridTemplateColumns:"2fr 45px 1.2fr 1.2fr 70px 90px",
             gap:6,padding:"5px 8px",borderBottom:"1px solid #2D2D44",marginBottom:2}
    },
      ["EMPRESA","SCORE","DECISOR","PRÓX. OFERTA","DIAS","AÇÃO"].map(function(h){
        return React.createElement("span",{key:h,style:{fontSize:8,color:"#555570",fontFamily:MONO}},h);
      })
    ),

    /* rows */
    pageRows.map(function(row) {
      var sColor = row.score>=70?"#FF6B2B":row.score>=50?"#F59E0B":"#60A5FA";
      var dColor = row.diasDesde>=60?"#EF4444":row.diasDesde>=30?"#F59E0B":"#22C55E";
      var of = row.proxOferta;

      return React.createElement("div", {
        key:row.lead.rank,
        style:{display:"grid",gridTemplateColumns:"2fr 45px 1.2fr 1.2fr 70px 90px",
               gap:6,padding:"5px 8px",borderBottom:".5px solid #1A1A2E",alignItems:"center"}
      },
        /* empresa */
        React.createElement("div",{},
          React.createElement("div",{style:{fontSize:9,color:"#E0E0FF",fontWeight:600,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},title:row.lead.nome},row.lead.nome),
          React.createElement("div",{style:{fontSize:7,color:"#555570"}},row.lead.setor||"")
        ),
        /* score */
        React.createElement("div",{},
          React.createElement("span",{style:{fontSize:10,color:sColor,fontWeight:700}},row.score),
          React.createElement("div",{style:{height:2,background:"#1A1A2E",borderRadius:1,marginTop:2}},
            React.createElement("div",{style:{height:"100%",width:row.score+"%",background:sColor,borderRadius:1}}))
        ),
        /* decisor */
        React.createElement("div",{},
          React.createElement("div",{style:{fontSize:8,color:"#E0E0FF",overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"}},row.decisor.nome),
          React.createElement("div",{style:{fontSize:7,color:"#555570"}},
            row.decisor.cargo||(SL[row.slotName]||row.slotName)||"")
        ),
        /* próxima oferta */
        of ? React.createElement("div",{title:of.grupo.name+" — "+of.angulo},
          React.createElement("div",{style:{fontSize:8,color:"#A78BFA",overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"}},of.grupo.name),
          React.createElement("div",{style:{fontSize:7,color:"#555570",overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"}},of.angulo)
        ) : React.createElement("span",{style:{fontSize:8,color:"#3d3d5c"}},"—"),
        /* dias */
        React.createElement("span",{style:chip(dColor)},
          row.diasDesde>=999?"nunca":row.diasDesde+"d"),
        /* disparar */
        React.createElement("button",{
          onClick:function(){
            if (of && typeof registrarToque==="function") {
              registrarToque(curGrupo.id,row.lead.rank,of.grupo.id,of.anguloIdx,row.decisor.nome);
              setTick(function(v){return v+1;});
            }
            if (onDispatch) onDispatch(row.decisor,row.lead.nome,row.lead.setor||"",of);
          },
          style:{fontSize:8,padding:"4px 8px",border:".5px solid #FF6B2B",borderRadius:4,
                 background:"rgba(255,107,43,.1)",color:"#FF6B2B",cursor:"pointer",fontFamily:MONO,
                 whiteSpace:"nowrap"}
        },"Disparar →")
      );
    }),

    /* empty */
    vencidos.length===0 && React.createElement("div",{
      style:{textAlign:"center",padding:"40px 0",color:"#3d3d5c",fontSize:10,lineHeight:1.7}
    },"Nenhuma empresa vencendo este mês 🎉\nTodos os decisores foram contatados recentemente."),

    /* pagination */
    pages>1 && React.createElement("div",{
      style:{display:"flex",gap:8,justifyContent:"center",padding:"12px 0",alignItems:"center"}
    },
      React.createElement("button",{onClick:function(){setPage(function(p){return Math.max(0,p-1);});},
        disabled:sp===0,style:Object.assign({},fBtn(false),{opacity:sp===0?0.4:1})},"← Ant"),
      React.createElement("span",{style:{fontSize:9,color:"#9B9BB4"}},
        (sp+1)+" / "+pages+" · "+vencidos.length+" empresas"),
      React.createElement("button",{onClick:function(){setPage(function(p){return Math.min(pages-1,p+1);});},
        disabled:sp>=pages-1,style:Object.assign({},fBtn(false),{opacity:sp>=pages-1?0.4:1})},"Próx →")
    )

  );
}; // end ReguaMensalView
