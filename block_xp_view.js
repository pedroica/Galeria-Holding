// block_xp_view.js — s1 (runBlock/eval)
// Widget flutuante de XP + Dashboard de missões diárias
// Usa React.useState/useEffect diretamente para evitar problemas de escopo com eval async

(function() {
  var GOAL = typeof GH_XP_DAILY_GOAL !== "undefined" ? GH_XP_DAILY_GOAL : 10;
  var MONO = "IBM Plex Mono,monospace";
  var Ce   = React.createElement;

  // ── Toast de meta batida ───────────────────────────────────────────────────
  var XpToast = function(props) {
    var streak = props.streak, bonus = props.bonus, onDone = props.onDone;
    var _v = React.useState(true); var visible = _v[0]; var setVisible = _v[1];

    React.useEffect(function() {
      var t = setTimeout(function() {
        setVisible(false);
        setTimeout(function() { onDone && onDone(); }, 400);
      }, 3500);
      return function() { clearTimeout(t); };
    }, []);

    return Ce("div", {
      style: {
        position:"fixed", bottom:90, right:16, zIndex:11000,
        background:"linear-gradient(135deg,#1a1a2e,#0d0d1a)",
        border:"1px solid rgba(34,197,94,.6)",
        borderRadius:12, padding:"14px 18px", fontFamily:MONO,
        boxShadow:"0 4px 24px rgba(34,197,94,.25)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition:"all .4s ease", minWidth:220, pointerEvents:"none"
      }
    },
      Ce("div", { style:{fontSize:16,marginBottom:4} }, "🎉 Meta batida!"),
      Ce("div", { style:{fontSize:9,color:"#22C55E",fontWeight:700} }, "+"+bonus+" XP bônus"),
      streak > 1 && Ce("div", { style:{fontSize:8,color:"#F59E0B",marginTop:4} },
        "🔥 "+streak+" dias seguidos — keep going!")
    );
  };

  // ── Anel de progresso SVG ─────────────────────────────────────────────────
  var ProgressRing = function(props) {
    var count = props.count, goal = props.goal;
    var R = 44, cx = 56, cy = 56;
    var CIRC = 2 * Math.PI * R;
    var color = count >= goal ? "#22C55E" : "#FF6B2B";

    return Ce("svg", { width:112, height:112, style:{overflow:"visible"} },
      Ce("circle", { cx:cx,cy:cy,r:R, fill:"none", stroke:"#1a1a2e", strokeWidth:9 }),
      Ce("circle", {
        cx:cx, cy:cy, r:R, fill:"none", stroke:color, strokeWidth:9,
        strokeDasharray: CIRC,
        strokeDashoffset: CIRC * (1 - Math.min(count/goal,1)),
        strokeLinecap:"round",
        transform:"rotate(-90 "+cx+" "+cy+")",
        style:{transition:"stroke-dashoffset .5s ease, stroke .3s"}
      }),
      Ce("text",{x:cx,y:cy-6, textAnchor:"middle",fill:color,fontSize:22,fontWeight:700,fontFamily:MONO}, count),
      Ce("text",{x:cx,y:cy+10,textAnchor:"middle",fill:"#555570",fontSize:10,fontFamily:MONO}, "/"+goal),
      Ce("text",{x:cx,y:cy+24,textAnchor:"middle",fill:count>=goal?"#22C55E":"#9B9BB4",fontSize:8,fontFamily:MONO},
        count >= goal ? "META ✓" : "hoje")
    );
  };

  // ── Mini calendário (últimos 14 dias) ─────────────────────────────────────
  var MiniCalendar = function(props) {
    var history = props.history || [], goal = props.goal;
    var today = new Date(), days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(today); d.setDate(today.getDate()-i);
      var ds = d.toISOString().slice(0,10);
      var h = history.find(function(x){ return x.date === ds; });
      days.push({ date:ds, count: h ? (h.count||0) : 0, xp: h ? (h.xp||0) : 0 });
    }
    return Ce("div", { style:{marginTop:16} },
      Ce("div",{style:{fontSize:8,color:"#555570",fontFamily:MONO,marginBottom:8,letterSpacing:1}}, "ÚLTIMOS 14 DIAS"),
      Ce("div",{style:{display:"flex",gap:3,flexWrap:"wrap"}},
        days.map(function(day) {
          var color = day.count===0 ? null : day.count>=goal ? "#22C55E" : "#F59E0B";
          return Ce("div",{
            key:day.date,
            title:day.date+": "+day.count+" decisores · "+day.xp+" XP",
            style:{
              width:19,height:19,borderRadius:4,
              background: color ? color+"22" : "#0d0d1a",
              border:"1px solid "+(color||"#2D2D44"),
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:7,color:color||"#555570",fontFamily:MONO,fontWeight:700,cursor:"default"
            }
          }, day.count===0 ? "" : day.count>=goal ? "✓" : String(day.count));
        })
      ),
      Ce("div",{style:{display:"flex",gap:10,marginTop:8}},
        [["#22C55E","meta"],["#F59E0B","parcial"],["#2D2D44","zero"]].map(function(p){
          return Ce("div",{key:p[1],style:{display:"flex",alignItems:"center",gap:3}},
            Ce("div",{style:{width:9,height:9,borderRadius:2,background:p[0]+"22",border:"1px solid "+p[0]}}),
            Ce("span",{style:{fontSize:7,color:"#555570",fontFamily:MONO}}, p[1])
          );
        })
      )
    );
  };

  // ── Dashboard modal ────────────────────────────────────────────────────────
  var XpDashboard = function(props) {
    var state = props.xpState || {}, onClose = props.onClose;
    var today  = state.today  || { count:0, xpEarned:0 };
    var xp     = state.xp    || 0;
    var streak = state.streak || 0;
    var lvInfo = typeof ghXpGetLevelInfo==="function" ? ghXpGetLevelInfo(xp)
               : { cur:{nome:"Prospector",icon:"🌱"}, next:{nome:"Caçador",min:100}, lvIndex:0, prev:{min:0} };
    var cur = lvInfo.cur, next = lvInfo.next, prevLv = lvInfo.prev||{min:0};
    var lvRange = next ? (next.min - prevLv.min) : 1;
    var lvPct   = next ? Math.round(((xp-prevLv.min)/lvRange)*100) : 100;

    var sources = [
      {src:"Manual", icon:"✏️", xp:5},
      {src:"Hunter", icon:"🌐", xp:6},
      {src:"CSV",    icon:"📥", xp:4},
      {src:"Lusha",  icon:"💎", xp:10},
      {src:"Crawler",icon:"🕷", xp:2},
    ];

    return Ce("div",{
      style:{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:10500,
             display:"flex",alignItems:"center",justifyContent:"center"},
      onClick:function(e){ if(e.target===e.currentTarget) onClose(); }
    },
      Ce("div",{
        style:{background:"#0d0d1a",border:".5px solid rgba(255,107,43,.3)",
               borderRadius:12,padding:"22px 20px",width:"min(400px,94vw)",
               maxHeight:"90vh",overflowY:"auto",fontFamily:MONO}
      },
        // Header
        Ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}},
          Ce("div",null,
            Ce("div",{style:{fontSize:14,fontWeight:700,color:"#E0E0FF"}}, "🏆 Missão Diária"),
            Ce("div",{style:{fontSize:8,color:"#555570",marginTop:2}},
              "meta: "+GOAL+" decisores/dia · mantenha sua base sempre enriquecida")
          ),
          Ce("button",{onClick:onClose,
            style:{background:"none",border:"none",color:"#555570",fontSize:18,cursor:"pointer",lineHeight:1}
          }, "✕")
        ),
        // Ring + streak
        Ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-around",marginBottom:14}},
          Ce(ProgressRing,{count:today.count,goal:GOAL}),
          Ce("div",{style:{textAlign:"center"}},
            Ce("div",{style:{fontSize:36,lineHeight:1}}, streak>0?"🔥":"💤"),
            Ce("div",{style:{fontSize:28,fontWeight:700,color:streak>0?"#F59E0B":"#555570",lineHeight:1.2}}, streak),
            Ce("div",{style:{fontSize:8,color:"#555570",marginTop:2}}, streak===1?"dia seguido":"dias seguidos"),
            streak>=3 && Ce("div",{style:{fontSize:7,color:"#F59E0B",marginTop:4}}, "+bônus de streak!")
          )
        ),
        // Level bar
        Ce("div",{style:{background:"#1a1a2e",borderRadius:8,padding:"12px 14px",marginBottom:12}},
          Ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
            Ce("span",{style:{fontSize:11,color:"#E0E0FF",fontWeight:700}}, cur.icon+" "+cur.nome),
            Ce("span",{style:{fontSize:9,color:"#FF6B2B"}}, xp+" XP")
          ),
          Ce("div",{style:{background:"#0d0d1a",borderRadius:4,height:6,overflow:"hidden"}},
            Ce("div",{style:{width:lvPct+"%",height:"100%",
              background:"linear-gradient(90deg,#FF6B2B,#F59E0B)",borderRadius:4,transition:"width .5s ease"}})
          ),
          next
            ? Ce("div",{style:{fontSize:7,color:"#555570",marginTop:5,textAlign:"right"}},
                "próx: "+next.icon+" "+next.nome+" em "+(next.min-xp)+" XP")
            : Ce("div",{style:{fontSize:7,color:"#F59E0B",marginTop:5,textAlign:"right"}}, "nível máximo atingido 🏆")
        ),
        today.xpEarned>0 && Ce("div",{style:{fontSize:9,color:"#22C55E",textAlign:"center",marginBottom:10}},
          "+"+today.xpEarned+" XP ganhos hoje"),
        // Calendar
        Ce(MiniCalendar,{history:state.history,goal:GOAL}),
        // XP guide
        Ce("div",{style:{marginTop:16}},
          Ce("div",{style:{fontSize:8,color:"#555570",marginBottom:8,letterSpacing:1}}, "COMO GANHAR XP"),
          Ce("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
            sources.map(function(s){
              return Ce("div",{key:s.src,
                style:{display:"flex",alignItems:"center",gap:5,background:"#1a1a2e",
                       border:".5px solid #2D2D44",borderRadius:6,padding:"4px 8px",fontSize:8,color:"#9B9BB4"}},
                s.icon+" "+s.src+" ", Ce("span",{style:{color:"#FF6B2B",fontWeight:700}}, "+"+s.xp)
              );
            }),
            Ce("div",{style:{display:"flex",alignItems:"center",gap:5,background:"#1a1a2e",
              border:".5px solid rgba(34,197,94,.4)",borderRadius:6,padding:"4px 8px",fontSize:8,color:"#22C55E"}},
              "🎯 Meta diária ", Ce("span",{style:{fontWeight:700}}, "+20")),
            Ce("div",{style:{display:"flex",alignItems:"center",gap:5,background:"#1a1a2e",
              border:".5px solid rgba(245,158,11,.4)",borderRadius:6,padding:"4px 8px",fontSize:8,color:"#F59E0B"}},
              "🔥 Streak ", Ce("span",{style:{fontWeight:700}}, "+5/dia"))
          )
        )
      )
    );
  };

  // ── Widget flutuante ───────────────────────────────────────────────────────
  var XpWidget = function() {
    var _s = React.useState(function() {
      return typeof ghXpState === "function" ? ghXpState() : { xp:0, streak:0, history:[] };
    });
    var xpState = _s[0]; var setXpState = _s[1];

    var _o = React.useState(false); var open  = _o[0]; var setOpen  = _o[1];
    var _t = React.useState(null);  var toast = _t[0]; var setToast = _t[1];

    React.useEffect(function() {
      function onUpdate(e) { setXpState(Object.assign({}, e.detail)); }
      function onGoal(e) {
        setToast(e.detail);
        setTimeout(function() { setToast(null); }, 4200);
      }
      window.addEventListener("gh:xp:update", onUpdate);
      window.addEventListener("gh:xp:goal",   onGoal);
      return function() {
        window.removeEventListener("gh:xp:update", onUpdate);
        window.removeEventListener("gh:xp:goal",   onGoal);
      };
    }, []);

    var today  = (xpState && xpState.today)  || { count:0 };
    var xp     = (xpState && xpState.xp)     || 0;
    var streak = (xpState && xpState.streak)  || 0;
    var lvInfo = typeof ghXpGetLevelInfo==="function" ? ghXpGetLevelInfo(xp) : {cur:{icon:"🌱",nome:"Prospector"}};
    var count  = today.count || 0;
    var done   = count >= GOAL;

    var segs = [];
    for (var i = 0; i < GOAL; i++) segs.push(i < count);

    return Ce("div", null,
      toast && Ce(XpToast, {streak:toast.streak, bonus:toast.bonus, onDone:function(){setToast(null);}}),
      open  && Ce(XpDashboard, {xpState:xpState, onClose:function(){setOpen(false);}}),

      // Badge flutuante
      Ce("div", {
        onClick: function(){ setOpen(true); },
        title: "Ver missão diária",
        style: {
          position:"fixed", bottom:16, right:16, zIndex:10000,
          background:"linear-gradient(135deg,#1a1a2e,#0d0d1a)",
          border:"1px solid "+(done?"rgba(34,197,94,.6)":"rgba(255,107,43,.45)"),
          borderRadius:10, padding:"8px 11px", cursor:"pointer",
          fontFamily:MONO, userSelect:"none",
          boxShadow: done ? "0 2px 16px rgba(34,197,94,.2)" : "0 2px 12px rgba(0,0,0,.5)",
          minWidth:116, transition:"border-color .3s, box-shadow .3s"
        }
      },
        Ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}},
          Ce("span",{style:{fontSize:8,color:"#FF6B2B",fontWeight:700,letterSpacing:.5}},
            lvInfo.cur.icon+" "+lvInfo.cur.nome),
          streak>0 && Ce("span",{style:{fontSize:8,color:"#F59E0B"}}, "🔥"+streak)
        ),
        Ce("div",{style:{display:"flex",gap:2,marginBottom:4}},
          segs.map(function(filled,i){
            return Ce("div",{key:i,style:{flex:1,height:4,borderRadius:2,
              background: filled ? (done?"#22C55E":"#FF6B2B") : "#2D2D44",
              transition:"background .2s"}});
          })
        ),
        Ce("div",{style:{fontSize:7,color:done?"#22C55E":"#9B9BB4",textAlign:"right"}},
          count+"/"+GOAL+" decisores hoje")
      )
    );
  };

  // Auto-mount
  var root = document.getElementById("xp-widget-root");
  if (root) {
    if (typeof ReactDOM.createRoot === "function") {
      ReactDOM.createRoot(root).render(Ce(XpWidget, null));
    } else {
      ReactDOM.render(Ce(XpWidget, null), root);
    }
  }

  window.XpWidget    = XpWidget;
  window.XpDashboard = XpDashboard;
})();
