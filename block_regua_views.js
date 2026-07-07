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

  // ── per-slot enrichment loading ────────────────────────────────
  // key = "rank_slotName"
  var _el = useState({});    var enrichLoading = _el[0]; var setEnrichLoading = _el[1];

  // ── batch modal ────────────────────────────────────────────────
  var _bm = useState(null);  var batchModal = _bm[0]; var setBatchModal = _bm[1];
  // abortRef allows stopping the batch (not really needed for Phase 3, but good UX)
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
      if (!accs[prefix + lead.rank]) return null;
      var cob = typeof getCoberturaEmpresa === "function"
        ? getCoberturaEmpresa(curGrupo.id, lead.rank)
        : { status:"vazia", faltantes:["ceo","cmo","gerencia"], preenchidos:0,
            slots:{ ceo:null, cmo:null, gerencia:null } };
      return { lead:lead, cob:cob };
    }).filter(Boolean);
  }, [accs, leads, curGrupo]);

  // ── summary ────────────────────────────────────────────────────
  var total     = allRows.length;
  var completas = allRows.filter(function(r){ return r.cob.status === "completa"; }).length;
  var parciais  = allRows.filter(function(r){ return r.cob.status === "parcial"; }).length;
  var vazias    = allRows.filter(function(r){ return r.cob.status === "vazia"; }).length;
  // count slots enrichable (have name, missing email or phone)
  var enrichable = allRows.reduce(function(acc, r) {
    return acc + ["ceo","cmo","gerencia"].filter(function(s) {
      var sl = r.cob.slots[s];
      return sl && sl.nome.trim() && (!sl.email || !sl.telefone);
    }).length;
  }, 0);

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
      alert("Erro: " + e);
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

  // ── save manual slot ───────────────────────────────────────────
  var saveSlot = useCallback(function() {
    if (!modal || !form.nome.trim()) return;
    if (typeof setDecisoresSlot !== "function") return;
    var entry = setDecisoresSlot(curGrupo.id, modal.rank, modal.slot, {
      nome:        form.nome.trim(),
      cargo:       form.cargo.trim(),
      email:       form.email.trim(),
      telefone:    form.telefone.trim(),
      linkedin:    form.linkedin.trim(),
      fonte:       "manual",
      status:      "verificado",
      atualizadoEm: new Date().toLocaleDateString("pt-BR"),
    });
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
  function slotCell(slot, rank, slotName, empresaNome) {
    if (!slot) return React.createElement("span", { style:{fontSize:8,color:"#3d3d5c"} }, "—");
    var hasEmail = !!slot.email;
    var hasPhone = !!slot.telefone;
    var enriched = slot.fonte === "lusha" || slot.status === "enriquecido";
    var color = enriched ? "#22C55E" : (hasEmail || hasPhone) ? "#60A5FA" : "#9B9BB4";
    var title = slot.nome + " · " + slot.cargo + (slot.email ? "\n✉ "+slot.email : "") + (slot.telefone ? "\n📱 "+slot.telefone : "");
    return React.createElement("span", {
      style:{ fontSize:8, color:color, overflow:"hidden", textOverflow:"ellipsis",
              whiteSpace:"nowrap", display:"block" },
      title:title
    }, (enriched ? "✓ " : "") + slot.nome);
  }

  // ── action buttons for a row ───────────────────────────────────
  function actionButtons(row) {
    var rank      = row.lead.rank;
    var nome      = row.lead.nome;
    var faltantes = row.cob.faltantes;
    var slots     = row.cob.slots;

    var btns = [];

    // "+" for empty slots
    faltantes.forEach(function(slotName) {
      btns.push(React.createElement("button", {
        key: "add_"+slotName,
        title: "Adicionar "+SL[slotName],
        onClick: function() {
          setModal({ rank:rank, slot:slotName });
          setForm({ nome:"", cargo:SL[slotName]||"", email:"", telefone:"", linkedin:"" });
        },
        style:{ fontSize:8, padding:"2px 5px", border:".5px solid #2D2D44", borderRadius:3,
                background:"transparent", color:"#9B9BB4", cursor:"pointer", fontFamily:MONO }
      }, "+"+slotName.slice(0,3).toUpperCase()));
    });

    // "🔍" for slots with name but missing email/phone
    ["ceo","cmo","gerencia"].forEach(function(slotName) {
      var sl = slots[slotName];
      if (!sl || !sl.nome.trim()) return;
      if (sl.email && sl.telefone) return; // already complete
      var lk = rank + "_" + slotName;
      var loading = !!enrichLoading[lk];
      btns.push(React.createElement("button", {
        key: "enr_"+slotName,
        title: "Enriquecer "+SL[slotName]+" via Lusha",
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
      enrichable > 0 && React.createElement("span", { style:chip("#60A5FA") }, enrichable+" enriquecíveis"),
      React.createElement("div", { style:{marginLeft:"auto", display:"flex", gap:6} },
        enrichable > 0 && React.createElement("button", {
          onClick: runBatch,
          style: fBtn(true, { fontSize:9 }),
          title: "Enriquecer via Lusha todos os slots com nome mas sem email/fone"
        }, "🔍 Enriquecer base"),
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
        slotCell(row.cob.slots.ceo,      row.lead.rank, "ceo",      row.lead.nome),
        slotCell(row.cob.slots.cmo,      row.lead.rank, "cmo",      row.lead.nome),
        slotCell(row.cob.slots.gerencia, row.lead.rank, "gerencia", row.lead.nome),
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
    )

  ); // end root div
}; // end CoberturaView
