// block_diario.js — s1 (runBlock/eval)
// Diário de Atividades: FUP pipeline + Enriquecimento + Abordagens do dia

(function() {
  var Ce = React.createElement;
  var MONO = "IBM Plex Mono,monospace";

  // Colunas FUP por tab do kanban
  var GAIA_FUP = {
    poc:        { label:"POC/Piloto",        color:"#60A5FA", pri:3 },
    reuniao:    { label:"Reunião",           color:"#A78BFA", pri:1 },
    proposta:   { label:"Proposta",          color:"#FBBF24", pri:2 },
    aguardando: { label:"Aguardando Retorno",color:"#9CA3AF", pri:4 },
  };
  var HOLDING_FUP = {
    primreuniao:  { label:"1ª Reunião",       color:"#60A5FA", pri:1 },
    contatodir:   { label:"Contato Direto",   color:"#34D399", pri:2 },
    negocdiret:   { label:"Negoc. Direta",    color:"#FBBF24", pri:3 },
    concorrencia: { label:"Concorrência",     color:"#FB923C", pri:4 },
    negociacao:   { label:"Negociação",       color:"#F87171", pri:5 },
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  function todayKey() { return new Date().toISOString().slice(0,10); }

  function getDiarioState() {
    try { return JSON.parse(localStorage.getItem("gh_diario_v1")||"{}"); } catch(e){ return {}; }
  }
  function saveDiarioState(s) {
    try { localStorage.setItem("gh_diario_v1", JSON.stringify(s)); } catch(e){}
  }
  function markFup(cardId) {
    var s = getDiarioState();
    var d = todayKey();
    if (!s[d]) s[d] = { fups:[], enrichCt:0 };
    if (!s[d].fups.includes(cardId)) {
      s[d].fups.push(cardId);
      saveDiarioState(s);
    }
  }
  function isFupDone(cardId) {
    var s = getDiarioState();
    var today = s[todayKey()];
    return today && today.fups.includes(cardId);
  }

  function dayName() {
    var dias = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
    return dias[new Date().getDay()];
  }
  function isMonday() { return new Date().getDay() === 1; }

  // Lê o kanban do localStorage
  function getKbState() {
    try { return JSON.parse(localStorage.getItem("gh_kanban_v3")||"{}"); } catch(e){ return {}; }
  }

  // Retorna cards de FUP de um tab do kanban
  function getFupCards(tab, colMap) {
    if (!tab || !tab.cards) return [];
    return tab.cards
      .filter(function(c){ return colMap[c.col]; })
      .map(function(c){ return Object.assign({}, c, { colInfo: colMap[c.col] }); })
      .sort(function(a,b){ return a.colInfo.pri - b.colInfo.pri; });
  }

  // Top-10 empresas para enriquecer decisores (slots vazios com maior score)
  function getEnrichTargets(curGrupo, accs) {
    var leads = typeof PROSP !== "undefined" ? PROSP : [];
    var prefix = curGrupo.id + "_";
    var targets = [];

    leads.forEach(function(lead) {
      var key = prefix + lead.rank;
      var entry = accs[key];
      var dec = entry ? (entry.decisores || {}) : {};
      var missing = [];
      if (!dec.ceo      || !dec.ceo.nome)      missing.push("CEO");
      if (!dec.cmo      || !dec.cmo.nome)      missing.push("CMO");
      if (!dec.gerencia || !dec.gerencia.nome)  missing.push("GER");
      if (missing.length === 0) return; // completo

      var score = 0;
      if (typeof getScorePrioridade === "function") {
        try { score = getScorePrioridade(curGrupo.id, lead.rank, lead, accs); } catch(e){}
      }
      targets.push({ lead: lead, missing: missing, score: score, entry: entry });
    });

    targets.sort(function(a,b){ return b.score - a.score; });
    return targets.slice(0, 10);
  }

  // Abordagens do Bom Dia (gh_bomdias_v1)
  function getBomDiaItems(curGrupo) {
    try {
      var raw = localStorage.getItem("gh_bomdias_v1");
      if (!raw) return [];
      var bd = JSON.parse(raw);
      if (!bd.data) return [];
      var d = todayKey();
      if (bd.data.date !== d) return [];
      return (bd.data.items || []).filter(function(it){ return it.grupoId === curGrupo.id; }).slice(0,10);
    } catch(e){ return []; }
  }

  // ── FUP Section ────────────────────────────────────────────────────────────
  var FupSection = function(props) {
    var _tab = React.useState("gaia"); var activeTab = _tab[0]; var setActiveTab = _tab[1];
    var _tick = React.useState(0); var setTick = _tick[1];

    function refresh() { setTick(function(t){ return t+1; }); }

    var kbState = getKbState();
    var tabs = kbState.tabs || [];
    var gaiaTab    = tabs.find(function(t){ return t.id === "gaia"; });
    var holdingTab = tabs.find(function(t){ return t.id === "holding"; });
    var gaiaCards    = getFupCards(gaiaTab,    GAIA_FUP);
    var holdingCards = getFupCards(holdingTab, HOLDING_FUP);

    var cards = activeTab === "gaia" ? gaiaCards : holdingCards;
    var total = gaiaCards.length + holdingCards.length;

    function handleFup(cardId) {
      markFup(cardId);
      if (typeof ghXpAward === "function") ghXpAward(1, "fup");
      refresh();
    }

    return Ce("div", null,
      // Sub-tabs
      Ce("div",{style:{display:"flex",gap:6,marginBottom:10}},
        [["gaia","⚡ GAIA ("+gaiaCards.length+")"],["holding","🏢 Holding ("+holdingCards.length+")"]].map(function(p){
          var active = activeTab===p[0];
          return Ce("button",{key:p[0],onClick:function(){ setActiveTab(p[0]); },
            style:{padding:"4px 10px",borderRadius:6,fontFamily:MONO,fontSize:8,cursor:"pointer",
              border:".5px solid "+(active?"#FF6B2B":"#2D2D44"),
              background:active?"rgba(255,107,43,.12)":"transparent",
              color:active?"#FF6B2B":"#9B9BB4"}}, p[1]);
        })
      ),

      cards.length === 0
        ? Ce("div",{style:{fontSize:9,color:"#555570",fontFamily:MONO,padding:"12px 0"}},
            "Nenhuma oportunidade aberta em "+activeTab+" — ótimo sinal! 🎉")
        : Ce("div",{style:{display:"flex",flexDirection:"column",gap:4}},
            cards.map(function(card) {
              var done = isFupDone(card.id);
              var nome = card.empresa || card.nome || card.name || "—";
              return Ce("div",{key:card.id,
                style:{background: done?"#0d1a0d":"#1a1a2e",
                  border:".5px solid "+(done?"rgba(34,197,94,.3)":"#2D2D44"),
                  borderRadius:8,padding:"9px 12px",
                  display:"flex",alignItems:"center",gap:8,
                  opacity: done ? 0.65 : 1, transition:"all .2s"}},
                // Stage badge
                Ce("span",{style:{display:"inline-block",padding:"2px 7px",borderRadius:10,
                  fontSize:7,fontWeight:700,fontFamily:MONO,
                  background:card.colInfo.color+"22",color:card.colInfo.color,
                  border:"1px solid "+card.colInfo.color+"44",
                  whiteSpace:"nowrap",flexShrink:0}}, card.colInfo.label),
                // Company + note
                Ce("div",{style:{flex:1,minWidth:0}},
                  Ce("div",{style:{fontSize:10,fontWeight:700,color:"#E0E0FF",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}, nome),
                  card.note && Ce("div",{style:{fontSize:7,color:"#555570",fontFamily:MONO,marginTop:1,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}, card.note)
                ),
                // Value
                card.value > 0 && Ce("span",{style:{fontSize:8,color:"#22C55E",fontFamily:MONO,flexShrink:0}},
                  "R$"+Math.round(card.value/1000)+"k"),
                // FUP button
                Ce("button",{
                  onClick:function(){ if(!done) handleFup(card.id); },
                  disabled: done,
                  style:{padding:"4px 10px",borderRadius:6,fontFamily:MONO,fontSize:8,cursor:done?"default":"pointer",
                    border:".5px solid "+(done?"rgba(34,197,94,.4)":"rgba(255,107,43,.4)"),
                    background:done?"rgba(34,197,94,.08)":"rgba(255,107,43,.1)",
                    color:done?"#22C55E":"#FF6B2B",flexShrink:0,whiteSpace:"nowrap"}},
                  done ? "✓ FUP ok" : "✓ FUP"
                )
              );
            })
          )
    );
  };

  // ── Enrich Section ─────────────────────────────────────────────────────────
  var EnrichSection = function(props) {
    var curGrupo = props.curGrupo, accs = props.accs, onGoTo = props.onGoTo;
    var targets = React.useMemo(function(){ return getEnrichTargets(curGrupo, accs); }, [curGrupo, accs]);

    var hasWebsite = function(lead) {
      return !!(lead.website || lead.site);
    };
    var hasCnpj = function(lead) {
      return !!(lead.cnpj);
    };

    return targets.length === 0
      ? Ce("div",{style:{fontSize:9,color:"#555570",fontFamily:MONO,padding:"12px 0"}},
          "Todos os decisores estão preenchidos para este grupo! 🏆")
      : Ce("div",{style:{display:"flex",flexDirection:"column",gap:4}},
          targets.map(function(t, i) {
            return Ce("div",{key:t.lead.rank,
              style:{background:"#1a1a2e",border:".5px solid #2D2D44",borderRadius:8,
                padding:"8px 12px",display:"flex",alignItems:"center",gap:8}},
              // Rank
              Ce("span",{style:{fontSize:9,color:"#555570",fontFamily:MONO,flexShrink:0,width:18,textAlign:"right"}},
                (i+1)),
              // Company + sector
              Ce("div",{style:{flex:1,minWidth:0}},
                Ce("div",{style:{fontSize:10,fontWeight:700,color:"#E0E0FF",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}, t.lead.nome),
                Ce("div",{style:{fontSize:7,color:"#555570",fontFamily:MONO,marginTop:1}},
                  (t.lead.setor||"—")+(t.score>0?" · score "+t.score:""))
              ),
              // Missing slots
              Ce("div",{style:{display:"flex",gap:3,flexShrink:0}},
                t.missing.map(function(m){
                  return Ce("span",{key:m,style:{fontSize:7,padding:"1px 5px",borderRadius:4,
                    background:"rgba(239,68,68,.15)",color:"#F87171",fontFamily:MONO,fontWeight:700,
                    border:".5px solid rgba(239,68,68,.3)"}}, m);
                })
              ),
              // Action buttons
              Ce("div",{style:{display:"flex",gap:4,flexShrink:0}},
                (hasCnpj(t.lead)||hasWebsite(t.lead)) && Ce("button",{
                  onClick:function(){
                    if(typeof buscarDecisoresCrawler==="function")
                      buscarDecisoresCrawler(curGrupo.id,t.lead.rank,t.lead);
                  },
                  title:"🕷 QSA+Web",
                  style:{padding:"3px 6px",borderRadius:4,fontSize:8,cursor:"pointer",fontFamily:MONO,
                    border:".5px solid rgba(245,158,11,.4)",background:"rgba(245,158,11,.08)",color:"#F59E0B"}
                }, "🕷"),
                hasWebsite(t.lead) && Ce("button",{
                  onClick:function(){
                    if(typeof buscarDecisoresHunter==="function")
                      buscarDecisoresHunter(curGrupo.id,t.lead.rank,t.lead);
                  },
                  title:"🌐 E-mail Hunter",
                  style:{padding:"3px 6px",borderRadius:4,fontSize:8,cursor:"pointer",fontFamily:MONO,
                    border:".5px solid rgba(167,139,250,.4)",background:"rgba(167,139,250,.08)",color:"#A78BFA"}
                }, "🌐"),
                Ce("button",{
                  onClick:function(){ onGoTo("cobertura"); },
                  title:"Abrir Cobertura",
                  style:{padding:"3px 6px",borderRadius:4,fontSize:8,cursor:"pointer",fontFamily:MONO,
                    border:".5px solid #2D2D44",background:"transparent",color:"#9B9BB4"}
                }, "✏️")
              )
            );
          })
        );
  };

  // ── BomDia compact section ─────────────────────────────────────────────────
  var AbordagensSection = function(props) {
    var curGrupo = props.curGrupo, onGoTo = props.onGoTo;
    var items = getBomDiaItems(curGrupo);

    var canalIcon = { wa:"💬", email:"✉", li:"🔗" };

    var waOk   = items.filter(function(i){ return i.enviado && i.enviado.wa;    }).length;
    var emailOk= items.filter(function(i){ return i.enviado && i.enviado.email; }).length;
    var liOk   = items.filter(function(i){ return i.enviado && i.enviado.li;    }).length;

    if (items.length === 0) {
      return Ce("div",null,
        Ce("div",{style:{fontSize:9,color:"#555570",fontFamily:MONO,marginBottom:10}},
          "Nenhuma seleção para hoje ainda."),
        Ce("button",{
          onClick:function(){ onGoTo("bomdias"); },
          style:{padding:"6px 14px",borderRadius:6,fontFamily:MONO,fontSize:9,cursor:"pointer",
            border:".5px solid rgba(255,107,43,.4)",background:"rgba(255,107,43,.1)",color:"#FF6B2B"}
        }, "☀️ Abrir Bom Dia e gerar seleção")
      );
    }

    return Ce("div",null,
      // Progress chips
      Ce("div",{style:{display:"flex",gap:6,marginBottom:10}},
        Ce("span",{style:{fontSize:8,fontFamily:MONO,padding:"2px 8px",borderRadius:10,
          border:"1px solid rgba(34,197,94,.4)",color:"#22C55E",background:"rgba(34,197,94,.08)"}},
          "💬 "+waOk+"/"+items.length+" WA"),
        Ce("span",{style:{fontSize:8,fontFamily:MONO,padding:"2px 8px",borderRadius:10,
          border:"1px solid rgba(167,139,250,.4)",color:"#A78BFA",background:"rgba(167,139,250,.08)"}},
          "✉ "+emailOk+"/"+items.length+" Email"),
        Ce("span",{style:{fontSize:8,fontFamily:MONO,padding:"2px 8px",borderRadius:10,
          border:"1px solid rgba(96,165,250,.4)",color:"#60A5FA",background:"rgba(96,165,250,.08)"}},
          "🔗 "+liOk+"/"+items.length+" LI"),
        Ce("button",{
          onClick:function(){ onGoTo("bomdias"); },
          style:{marginLeft:"auto",padding:"2px 8px",borderRadius:6,fontFamily:MONO,fontSize:8,cursor:"pointer",
            border:".5px solid rgba(255,107,43,.4)",background:"rgba(255,107,43,.1)",color:"#FF6B2B"}
        }, "☀️ Ver Bom Dia →")
      ),
      // Compact list
      Ce("div",{style:{display:"flex",flexDirection:"column",gap:3}},
        items.map(function(item, i) {
          var env = item.enviado || {};
          var allDone = env.wa && env.email && env.li;
          return Ce("div",{key:item.rank||i,
            style:{background:"#1a1a2e",border:".5px solid "+(allDone?"rgba(34,197,94,.3)":"#2D2D44"),
              borderRadius:7,padding:"7px 12px",display:"flex",alignItems:"center",gap:8}},
            Ce("span",{style:{width:16,fontSize:8,color:"#555570",fontFamily:MONO,flexShrink:0}},i+1),
            Ce("div",{style:{flex:1,minWidth:0}},
              Ce("div",{style:{fontSize:9,fontWeight:700,color:"#E0E0FF",
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},
                (item.decisorNome||"—")+" · "+(item.empresa||"—")),
              item.ofertaLabel && Ce("div",{style:{fontSize:7,color:"#555570",fontFamily:MONO,marginTop:1}},
                curGrupo.nome+" · "+item.ofertaLabel)
            ),
            // Canal status dots
            Ce("div",{style:{display:"flex",gap:4,flexShrink:0}},
              ["wa","email","li"].map(function(canal) {
                return Ce("span",{key:canal,style:{fontSize:9,opacity: env[canal]?1:.25}},
                  canalIcon[canal]);
              })
            )
          );
        })
      )
    );
  };

  // ── DiarioView ─────────────────────────────────────────────────────────────
  var DiarioView = function(props) {
    var accs = props.accs, curGrupo = props.curGrupo, setView = props.setView;

    // Refreshes when user clicks FUP button
    var _tick = React.useState(0); var tick = _tick[0]; var setTick = _tick[1];

    var kbState = getKbState();
    var tabs = kbState.tabs || [];
    var gaiaTab    = tabs.find(function(t){ return t.id==="gaia"; });
    var holdingTab = tabs.find(function(t){ return t.id==="holding"; });
    var totalFup = getFupCards(gaiaTab,GAIA_FUP).length + getFupCards(holdingTab,HOLDING_FUP).length;

    var diarioToday = (getDiarioState()[todayKey()]||{});
    var fupDone = (diarioToday.fups||[]).length;

    var monday = isMonday();

    // Formatted date
    var now = new Date();
    var meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    var dataFmt = dayName()+", "+now.getDate()+" de "+meses[now.getMonth()];

    function Section(icon, title, badge, children) {
      return Ce("div",{style:{marginBottom:20}},
        Ce("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10,
          paddingBottom:8,borderBottom:".5px solid #2D2D44"}},
          Ce("span",{style:{fontSize:13}}, icon),
          Ce("div",{style:{fontFamily:MONO,fontSize:10,fontWeight:700,color:"#E0E0FF",letterSpacing:.5}}, title),
          badge && Ce("span",{style:{fontSize:7,padding:"1px 7px",borderRadius:10,
            background:"rgba(255,107,43,.15)",color:"#FF6B2B",fontFamily:MONO,fontWeight:700,
            border:".5px solid rgba(255,107,43,.3)"}}, badge)
        ),
        children
      );
    }

    return Ce("div",{
      style:{flex:1,overflowY:"auto",padding:"16px 12px",maxWidth:620,margin:"0 auto"}
    },
      // Header
      Ce("div",{style:{marginBottom:18}},
        Ce("div",{style:{display:"flex",alignItems:"baseline",justifyContent:"space-between"}},
          Ce("div",{style:{fontSize:14,fontWeight:800,color:"#E0E0FF",letterSpacing:-.5}},
            "📓 Diário de Atividades"),
          Ce("div",{style:{fontSize:8,color:"#555570",fontFamily:MONO}}, dataFmt)
        ),
        monday && Ce("div",{style:{marginTop:8,padding:"6px 12px",borderRadius:6,
          background:"rgba(167,139,250,.1)",border:".5px solid rgba(167,139,250,.3)",
          fontSize:8,color:"#A78BFA",fontFamily:MONO}},
          "⚡ Segunda-feira — dia de FUP geral em todas as oportunidades abertas")
      ),

      // Summary chips
      Ce("div",{style:{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}},
        Ce("div",{style:{padding:"4px 10px",borderRadius:8,fontFamily:MONO,fontSize:8,
          background:"#1a1a2e",border:".5px solid #2D2D44",color:"#9B9BB4"}},
          "📋 FUP "+fupDone+"/"+totalFup),
        Ce("div",{style:{padding:"4px 10px",borderRadius:8,fontFamily:MONO,fontSize:8,
          background:"#1a1a2e",border:".5px solid #2D2D44",color:"#9B9BB4"}},
          "🔍 10 alvos p/ enriquecer"),
        Ce("div",{style:{padding:"4px 10px",borderRadius:8,fontFamily:MONO,fontSize:8,
          background:"#1a1a2e",border:".5px solid #2D2D44",color:"#9B9BB4"}},
          "☀️ 10 abordagens"),
        Ce("div",{
          onClick:function(){ if(typeof ghXpState==="function") { var s=ghXpState(); alert("XP hoje: "+(s.today&&s.today.xpEarned||0)+" · Total: "+(s.xp||0)+" · Streak: "+(s.streak||0)+"d"); } },
          style:{padding:"4px 10px",borderRadius:8,fontFamily:MONO,fontSize:8,cursor:"pointer",
            background:"rgba(255,107,43,.08)",border:".5px solid rgba(255,107,43,.3)",color:"#FF6B2B"}},
          "⚡ XP")
      ),

      // SECTION 1: FUP
      Section("📋","FUP — Pipeline Aberto","GAIA + HOLDING",
        Ce(FupSection, { key:tick })
      ),

      // SECTION 2: Enriquecer
      Section("🔍","Decisores a Buscar","TOP 10 GAPS · "+(curGrupo.nome||curGrupo.id||"").toUpperCase(),
        Ce(EnrichSection, {
          curGrupo: curGrupo,
          accs: accs,
          onGoTo: function(v){ if(setView) setView(v); }
        })
      ),

      // SECTION 3: Bom Dia
      Section("☀️","Abordagens do Dia","10 CONTATOS",
        Ce(AbordagensSection, {
          curGrupo: curGrupo,
          onGoTo: function(v){ if(setView) setView(v); }
        })
      )
    );
  };

  window.DiarioView = DiarioView;
})();
