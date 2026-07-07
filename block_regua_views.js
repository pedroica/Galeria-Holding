// block_regua_views.js — Fase 2: Cobertura de Decisores
// Carregado via runBlock (s1) após block_regua.js.
// Usa PROSP (global) e getCoberturaEmpresa/setDecisoresSlot (de block_regua.js).

const { useState, useMemo, useCallback } = React;

var CoberturaView = function CoberturaView(_ref) {
  var accs = _ref.accs;
  var setAccs = _ref.setAccs;
  var curGrupo = _ref.curGrupo;

  var PAGE = 50;
  var _s = useState("");   var search = _s[0]; var setSearch = _s[1];
  var _g = useState(true); var soGaps = _g[0]; var setSoGaps = _g[1];
  var _fs = useState(null); var filtSlot = _fs[0]; var setFiltSlot = _fs[1];
  var _ft = useState(""); var filtSetor = _ft[0]; var setFiltSetor = _ft[1];
  var _p = useState(0); var page = _p[0]; var setPage = _p[1];
  var _m = useState(null); var modal = _m[0]; var setModal = _m[1];
  var _f = useState({nome:"",cargo:"",email:"",telefone:"",linkedin:""});
  var form = _f[0]; var setForm = _f[1];

  var leads = typeof PROSP !== "undefined" ? PROSP : [];

  // ── rows: all companies in current group ───────────────────────
  var allRows = useMemo(function() {
    var prefix = curGrupo.id + "_";
    return leads.map(function(lead) {
      var entry = accs[prefix + lead.rank];
      if (!entry) return null;
      var cob = typeof getCoberturaEmpresa === "function"
        ? getCoberturaEmpresa(curGrupo.id, lead.rank)
        : { status: "vazia", faltantes: ["ceo","cmo","gerencia"], preenchidos: 0,
            slots: { ceo: null, cmo: null, gerencia: null } };
      return { lead: lead, cob: cob };
    }).filter(Boolean);
  }, [accs, leads, curGrupo]);

  // ── summary counts ─────────────────────────────────────────────
  var total = allRows.length;
  var completas = allRows.filter(function(r){ return r.cob.status === "completa"; }).length;
  var parciais  = allRows.filter(function(r){ return r.cob.status === "parcial"; }).length;
  var vazias    = allRows.filter(function(r){ return r.cob.status === "vazia"; }).length;

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
  var sp = Math.min(page, pages - 1);
  var pageRows = filtered.slice(sp * PAGE, (sp + 1) * PAGE);

  // ── slot label helper ──────────────────────────────────────────
  var SL = typeof SLOT_LABELS !== "undefined" ? SLOT_LABELS : { ceo:"CEO", cmo:"CMO", gerencia:"Gerência" };
  var statusColor = { completa: "#22C55E", parcial: "#F59E0B", vazia: "#EF4444" };
  var statusLabel = { completa: "Completa", parcial: "Parcial", vazia: "Vazia" };

  // ── export CSV ─────────────────────────────────────────────────
  var exportCSV = useCallback(function() {
    var header = "Empresa,Setor,Status,CEO,CMO,Gerência,Faltantes\n";
    var rows = filtered.map(function(r) {
      var slots = r.cob.slots;
      var fat = r.cob.faltantes.map(function(f){ return {ceo:"CEO",cmo:"CMO",gerencia:"Gerência"}[f] || f; }).join("|");
      return [r.lead.nome, r.lead.setor||"", r.cob.status,
              slots.ceo ? slots.ceo.nome : "",
              slots.cmo ? slots.cmo.nome : "",
              slots.gerencia ? slots.gerencia.nome : "",
              fat].map(function(v){ return '"' + (v||"").replace(/"/g,'""') + '"'; }).join(",");
    });
    var blob = new Blob([header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "cobertura_" + curGrupo.id + ".csv";
    a.click(); URL.revokeObjectURL(url);
  }, [filtered, curGrupo]);

  // ── save slot ──────────────────────────────────────────────────
  var saveSlot = useCallback(function() {
    if (!modal || !form.nome.trim()) return;
    if (typeof setDecisoresSlot !== "function") return;
    var entry = setDecisoresSlot(curGrupo.id, modal.rank, modal.slot, {
      nome: form.nome.trim(),
      cargo: form.cargo.trim(),
      email: form.email.trim(),
      telefone: form.telefone.trim(),
      linkedin: form.linkedin.trim(),
      fonte: "manual",
      status: "verificado",
      atualizadoEm: new Date().toLocaleDateString("pt-BR"),
    });
    if (entry) {
      var k = curGrupo.id + "_" + modal.rank;
      setAccs(function(prev) {
        var next = Object.assign({}, prev);
        next[k] = entry;
        return next;
      });
    }
    setModal(null);
    setForm({nome:"",cargo:"",email:"",telefone:"",linkedin:""});
  }, [modal, form, curGrupo, setAccs]);

  // ── styles ─────────────────────────────────────────────────────
  var MONO = "IBM Plex Mono,monospace";
  function chip(color) {
    return { display:"inline-flex", alignItems:"center", padding:"2px 7px", borderRadius:10,
             border:"1px solid "+color+"44", background:color+"18", color:color,
             fontSize:9, fontFamily:MONO, fontWeight:600, flexShrink:0 };
  }
  function fBtn(active) {
    return { padding:"3px 8px", border:".5px solid "+(active?"#FF6B2B":"#2D2D44"), borderRadius:4,
             background:active?"rgba(255,107,43,.1)":"transparent",
             color:active?"#FF6B2B":"#9B9BB4", fontSize:9, cursor:"pointer", fontFamily:MONO };
  }
  var GRID = { display:"grid", gridTemplateColumns:"2fr 100px 72px 1fr 1fr 1fr 90px", gap:6,
               padding:"5px 8px", borderBottom:".5px solid #1A1A2E", alignItems:"center" };
  var CELL = { fontSize:9, color:"#9B9BB4", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" };
  var INP = { width:"100%", background:"#0D0D1A", border:".5px solid #2D2D44", borderRadius:4,
              color:"#E0E0FF", padding:"5px 8px", fontSize:9, fontFamily:MONO, outline:"none",
              boxSizing:"border-box" };

  // ── render ─────────────────────────────────────────────────────
  return /*#__PURE__*/React.createElement("div", {
    style: { flex:1, overflow:"auto", padding:"12px 16px", fontFamily:MONO }
  },

    /* — header — */
    React.createElement("div", { style:{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"} },
      React.createElement("span", { style:{fontSize:11,fontWeight:700,color:"#E0E0FF",letterSpacing:1} },
        "🗺 COBERTURA DE DECISORES"),
      React.createElement("span", { style:chip("#9B9BB4") }, total + " no CRM"),
      React.createElement("span", { style:chip("#22C55E") }, completas + " completas"),
      React.createElement("span", { style:chip("#F59E0B") }, parciais + " parciais"),
      React.createElement("span", { style:chip("#EF4444") }, vazias + " vazias"),
      React.createElement("div", { style:{marginLeft:"auto"} },
        React.createElement("button", { onClick:exportCSV, style:fBtn(false) }, "⬇ CSV")
      )
    ),

    /* — filters — */
    React.createElement("div", { style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"} },
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
          onClick:function(){ setFiltSlot(filtSlot === slot ? null : slot); setPage(0); },
          style:fBtn(filtSlot === slot)
        }, "Sem " + SL[slot]);
      }),
      React.createElement("select", {
        value:filtSetor,
        onChange:function(e){ setFiltSetor(e.target.value); setPage(0); },
        style:{ background:"#141428", border:".5px solid #2D2D44", borderRadius:4,
                color:"#9B9BB4", padding:"3px 6px", fontSize:9, fontFamily:MONO, cursor:"pointer" }
      },
        React.createElement("option", { value:"" }, "Todos os setores"),
        setores.map(function(s){ return React.createElement("option", { key:s, value:s }, s); })
      )
    ),

    /* — table header — */
    React.createElement("div", { style:Object.assign({},GRID,{borderBottom:"1px solid #2D2D44",marginBottom:2}) },
      ["EMPRESA","SETOR","STATUS","CEO","CMO","GER. MKT","AÇÕES"].map(function(h) {
        return React.createElement("span", { key:h, style:{fontSize:8,color:"#555570",fontFamily:MONO} }, h);
      })
    ),

    /* — rows — */
    pageRows.map(function(_ref2) {
      var lead = _ref2.lead; var cob = _ref2.cob;
      return React.createElement("div", { key:lead.rank, style:GRID },
        React.createElement("span", {
          style:{ fontSize:9, color:"#E0E0FF", fontWeight:600, overflow:"hidden",
                  textOverflow:"ellipsis", whiteSpace:"nowrap" },
          title:lead.nome
        }, lead.nome),
        React.createElement("span", { style:CELL }, lead.setor || "—"),
        React.createElement("span", { style:chip(statusColor[cob.status]) }, statusLabel[cob.status]),
        // CEO
        cob.slots.ceo
          ? React.createElement("span", { style:{ fontSize:8, color:"#60A5FA", overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap" }, title:cob.slots.ceo.nome+" · "+cob.slots.ceo.cargo },
              cob.slots.ceo.nome)
          : React.createElement("span", { style:{fontSize:8,color:"#3d3d5c"} }, "—"),
        // CMO
        cob.slots.cmo
          ? React.createElement("span", { style:{ fontSize:8, color:"#60A5FA", overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap" }, title:cob.slots.cmo.nome+" · "+cob.slots.cmo.cargo },
              cob.slots.cmo.nome)
          : React.createElement("span", { style:{fontSize:8,color:"#3d3d5c"} }, "—"),
        // Gerência
        cob.slots.gerencia
          ? React.createElement("span", { style:{ fontSize:8, color:"#60A5FA", overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap" }, title:cob.slots.gerencia.nome+" · "+cob.slots.gerencia.cargo },
              cob.slots.gerencia.nome)
          : React.createElement("span", { style:{fontSize:8,color:"#3d3d5c"} }, "—"),
        // Actions: + button for each missing slot
        React.createElement("div", { style:{display:"flex",gap:2,flexWrap:"wrap"} },
          cob.faltantes.map(function(slot) {
            return React.createElement("button", {
              key:slot,
              title:"Adicionar "+SL[slot],
              onClick:function() {
                setModal({ rank:lead.rank, slot:slot });
                setForm({ nome:"", cargo:SL[slot]||"", email:"", telefone:"", linkedin:"" });
              },
              style:{ fontSize:8, padding:"2px 5px", border:".5px solid #2D2D44", borderRadius:3,
                      background:"transparent", color:"#9B9BB4", cursor:"pointer", fontFamily:MONO }
            }, "+"+slot.slice(0,3).toUpperCase());
          })
        )
      );
    }),

    /* — empty state — */
    filtered.length === 0 && React.createElement("div", {
      style:{ textAlign:"center", padding:"40px 0", color:"#3d3d5c", fontSize:10 }
    }, soGaps ? "Todas as empresas têm cobertura completa neste grupo 🎉" : "Nenhuma empresa encontrada."),

    /* — pagination — */
    pages > 1 && React.createElement("div", {
      style:{ display:"flex", gap:8, justifyContent:"center", padding:"12px 0", alignItems:"center" }
    },
      React.createElement("button", {
        onClick:function(){ setPage(function(p){ return Math.max(0,p-1); }); },
        disabled:sp===0, style:Object.assign({},fBtn(false),{ opacity:sp===0?0.4:1 })
      }, "← Ant"),
      React.createElement("span", { style:{fontSize:9,color:"#9B9BB4"} },
        (sp+1) + " / " + pages + " · " + filtered.length + " empresas"
      ),
      React.createElement("button", {
        onClick:function(){ setPage(function(p){ return Math.min(pages-1,p+1); }); },
        disabled:sp>=pages-1, style:Object.assign({},fBtn(false),{ opacity:sp>=pages-1?0.4:1 })
      }, "Próx →")
    ),

    /* — add-manual modal — */
    modal && React.createElement("div", {
      style:{ position:"fixed", inset:0, background:"rgba(0,0,0,.82)", zIndex:9000,
              display:"flex", alignItems:"center", justifyContent:"center" },
      onClick:function(e){ if(e.target===e.currentTarget) setModal(null); }
    },
      React.createElement("div", {
        style:{ background:"#1A1A2E", border:".5px solid #2D2D44", borderRadius:8,
                padding:24, minWidth:320, maxWidth:420, fontFamily:MONO }
      },
        React.createElement("div", { style:{fontSize:11,color:"#E0E0FF",fontWeight:700,marginBottom:16} },
          "Adicionar " + SL[modal.slot]
        ),
        ["nome","cargo","email","telefone","linkedin"].map(function(field) {
          return React.createElement("div", { key:field, style:{marginBottom:8} },
            React.createElement("div", { style:{fontSize:8,color:"#555570",marginBottom:3} }, field.toUpperCase()),
            React.createElement("input", {
              value:form[field],
              onChange:function(e){ setForm(function(prev){ var n=Object.assign({},prev); n[field]=e.target.value; return n; }); },
              placeholder:{ nome:"Nome completo", cargo:"Cargo exato", email:"email@empresa.com",
                            telefone:"(11) 9xxxx-xxxx", linkedin:"linkedin.com/in/..." }[field]||"",
              style:INP
            })
          );
        }),
        React.createElement("div", { style:{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"} },
          React.createElement("button", {
            onClick:function(){ setModal(null); }, style:fBtn(false)
          }, "Cancelar"),
          React.createElement("button", {
            onClick:saveSlot, disabled:!form.nome.trim(),
            style:Object.assign({},fBtn(true),{ opacity:form.nome.trim()?1:0.4 })
          }, "Salvar")
        )
      )
    )

  ); // end root div
}; // end CoberturaView
