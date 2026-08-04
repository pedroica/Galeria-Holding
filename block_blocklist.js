/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULO 0 — Aba "Blocklist" (clientes atuais da Holding)
   Isolado, prefixo CSS .bl-. Fonte de dados:
     · Supabase (window.GH_SUPA) quando configurado  → fonte da verdade
     · localStorage 'gh_blocklist_v1'                 → cache offline / MVP
   O matching autoritativo roda no worker (agent/src/lib/blocklist.ts, testado).
   Aqui é CRUD + um testador de conveniência que espelha as MESMAS regras.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const h = React.createElement;
  const { useState, useEffect, useMemo } = React;
  const LS_KEY = "gh_blocklist_v1";

  // Seed espelha agent/src/data/blocklist.seed.ts (16 clientes atuais).
  const SEED = [
    { id: "google", canonicalName: "Google", aliases: ["google","alphabet","youtube","waze"], domains: ["google.com","google.com.br","abc.xyz","youtube.com","waze.com"], economicGroup: "Alphabet", note: "Cliente — Google (Galeria)." },
    { id: "itau", canonicalName: "Itaú", aliases: ["itau","itau unibanco","banco itau","itau bba","itaucard"], domains: ["itau.com.br","itau-unibanco.com.br","itaubba.com","rede.com.br"], economicGroup: "Itaú Unibanco", note: "Cliente — Itaú." },
    { id: "mcdonalds", canonicalName: "McDonald's", aliases: ["mcdonald","mcdonalds","mcdonald s","mc donalds","arcos dorados"], domains: ["mcdonalds.com","mcdonalds.com.br","arcosdorados.com"], economicGroup: "Arcos Dorados", note: "Cliente — McDonald's." },
    { id: "flutter", canonicalName: "Flutter", aliases: ["flutter","betnacional","betfair","sportingbet","pokerstars","paddy power"], domains: ["flutter.com","betnacional.com","betnacional.bet.br","betfair.com","sportingbet.com"], economicGroup: "Flutter Entertainment", note: "Cliente — Flutter/Betnacional." },
    { id: "havaianas", canonicalName: "Havaianas", aliases: ["havaianas","alpargatas","dupe","osklen"], domains: ["havaianas.com","havaianas.com.br","alpargatas.com.br","osklen.com.br"], economicGroup: "Alpargatas", note: "Cliente — Havaianas." },
    { id: "bauducco", canonicalName: "Bauducco", aliases: ["bauducco","pandurata","visconti"], domains: ["bauducco.com.br","pandurata.com.br"], economicGroup: "Pandurata", note: "Cliente — Bauducco." },
    { id: "italac", canonicalName: "Italac", aliases: ["italac","laticinios bela vista","goias verde"], domains: ["italac.com.br","belavista.ind.br","goiasverde.com.br"], economicGroup: "Laticínios Bela Vista", note: "Cliente — Italac." },
    { id: "tres-coracoes", canonicalName: "3 Corações", aliases: ["3 coracoes","tres coracoes","cafe 3 coracoes","cafe tres coracoes"], domains: ["3coracoes.com.br","trescoracoes.com.br"], economicGroup: "Grupo 3 Corações", note: "Cliente — 3 Corações." },
    { id: "track-field", canonicalName: "Track & Field", aliases: ["track field","track and field","tf sports","tf"], domains: ["trackfield.com.br","tfsports.com.br"], economicGroup: "Track & Field", note: "Cliente — Track & Field." },
    { id: "hinode", canonicalName: "Hinode / Magá", aliases: ["hinode","grupo hinode","maga"], domains: ["hinode.com.br","grupohinode.com.br"], economicGroup: "Grupo Hinode", note: "Cliente — Hinode/Magá." },
    { id: "dominos", canonicalName: "Domino's", aliases: ["dominos","dominos pizza"], domains: ["dominos.com.br","dominospizza.com.br"], economicGroup: "Domino's", note: "Cliente — Domino's." },
    { id: "stellantis", canonicalName: "Stellantis / Peugeot", aliases: ["stellantis","peugeot","fiat","jeep","citroen","ram","dodge","chrysler"], domains: ["stellantis.com","peugeot.com.br","fiat.com.br","jeep.com.br","citroen.com.br","ram.com.br"], economicGroup: "Stellantis", note: "Cliente — Stellantis/Peugeot." },
    { id: "natura", canonicalName: "Natura", aliases: ["natura","natura co","avon","the body shop","aesop"], domains: ["natura.com.br","naturaeco.com","avon.com.br"], economicGroup: "Natura & Co", note: "Cliente — Natura." },
    { id: "noventa-e-nove", canonicalName: "99", aliases: ["99","99 tecnologia","99app","99 pop","99 taxis","didi"], domains: ["99app.com","99taxis.com","didiglobal.com"], economicGroup: "DiDi", note: "Cliente — 99." },
    { id: "vivara", canonicalName: "Vivara", aliases: ["vivara","life by vivara"], domains: ["vivara.com.br"], economicGroup: "Vivara", note: "Cliente — Vivara." },
    { id: "reckitt", canonicalName: "Reckitt", aliases: ["reckitt","reckitt benckiser","vanish","veet","durex","lysol","sbp","gaviscon"], domains: ["reckitt.com","rb.com"], economicGroup: "Reckitt", note: "Cliente — Reckitt." },
  ];

  // ── Matching espelhado (mesmas regras do worker) ─────────────────────────
  const STOP = new Set(["de","da","do","das","dos","e","the","s","a","ltda","sa","eireli","me","epp","mei"]);
  function stripAcc(s){ return (s||"").normalize("NFD").replace(/[̀-ͯ]/g,""); }
  function normName(s){ return stripAcc((s||"").toLowerCase()).replace(/&/g," e ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
  function toks(s){ return normName(s).split(" ").filter(function(t){return t && !STOP.has(t);}); }
  function normDom(s){ let d=(s||"").trim().toLowerCase(); if(!d) return ""; if(d.includes("@")) d=d.split("@").pop(); d=d.replace(/^https?:\/\//,"").replace(/^www\./,""); return d.split("/")[0].split("?")[0].split("#")[0].split(":")[0].trim(); }
  function domMatch(dom,blk){ const d=normDom(dom), b=normDom(blk); if(!d||!b) return false; return d===b || d.endsWith("."+b); }
  function shortNum(t){ return t.length<=2 || /^\d+$/.test(t); }
  function tokContain(nameT, aliasT){
    if(!aliasT.length) return false;
    if(aliasT.length===1 && shortNum(aliasT[0])) return nameT.length===1 && nameT[0]===aliasT[0];
    for(let i=0;i+aliasT.length<=nameT.length;i++){ let ok=true; for(let j=0;j<aliasT.length;j++){ if(nameT[i+j]!==aliasT[j]){ok=false;break;} } if(ok) return true; }
    return false;
  }
  function checkBlock(entries, input){
    const cands=[]; if(input.domain) cands.push(input.domain); if(input.email) cands.push(input.email);
    const nameT = input.name ? toks(input.name) : [];
    for(const e of entries){
      if(e.active===false) continue;
      for(const c of cands){ for(const bd of (e.domains||[])){ if(domMatch(c,bd)) return {blocked:true, entryName:e.canonicalName, reason:"domain", matched:bd}; } }
      if(nameT.length){
        const names=[e.canonicalName].concat(e.aliases||[]); if(e.economicGroup) names.push(e.economicGroup);
        for(const nm of names){ const at=toks(nm); if(at.length && tokContain(nameT, at)){ return {blocked:true, entryName:e.canonicalName, reason:"name", matched:at.join(" ")}; } }
      }
    }
    return {blocked:false};
  }

  // ── Storage (Supabase se configurado; senão localStorage) ────────────────
  function loadLocal(){
    try{ const raw=localStorage.getItem(LS_KEY); if(raw) return JSON.parse(raw); }catch(e){}
    localStorage.setItem(LS_KEY, JSON.stringify(SEED));
    return SEED.slice();
  }
  function saveLocal(list){ try{ localStorage.setItem(LS_KEY, JSON.stringify(list)); }catch(e){} }
  const supaOn = typeof window!=="undefined" && !!window.GH_SUPA;

  // ── Componente ───────────────────────────────────────────────────────────
  function BlocklistView(){
    const [list, setList] = useState(loadLocal);
    const [q, setQ] = useState("");
    const [adding, setAdding] = useState(false);
    const [testIn, setTestIn] = useState("");
    const [form, setForm] = useState({ canonicalName:"", domains:"", aliases:"", economicGroup:"", note:"" });

    useEffect(function(){ saveLocal(list); /* Supabase sync entra na fase de wiring */ }, [list]);

    const filtered = useMemo(function(){
      const term = normName(q);
      if(!term) return list;
      return list.filter(function(e){
        return normName(e.canonicalName).includes(term)
          || (e.domains||[]).some(function(d){return d.includes(q.toLowerCase());})
          || (e.aliases||[]).some(function(a){return normName(a).includes(term);});
      });
    }, [list, q]);

    const testResult = useMemo(function(){
      if(!testIn.trim()) return null;
      const isEmail = testIn.includes("@");
      return checkBlock(list, isEmail ? { email:testIn } : { name:testIn, domain: testIn.includes(".")?testIn:undefined });
    }, [list, testIn]);

    function addEntry(){
      const name = form.canonicalName.trim();
      if(!name) return;
      const entry = {
        id: normName(name).replace(/\s+/g,"-") || ("bl-"+list.length),
        canonicalName: name,
        domains: form.domains.split(",").map(function(s){return s.trim().toLowerCase();}).filter(Boolean),
        aliases: form.aliases.split(",").map(function(s){return s.trim();}).filter(Boolean),
        economicGroup: form.economicGroup.trim() || undefined,
        note: form.note.trim() || undefined,
        source: "manual",
      };
      setList([entry].concat(list));
      setForm({ canonicalName:"", domains:"", aliases:"", economicGroup:"", note:"" });
      setAdding(false);
    }
    function removeEntry(id){ setList(list.filter(function(e){return e.id!==id;})); }

    return h("div", { className:"bl-wrap", style:{maxWidth:960, margin:"0 auto"} },
      // Header
      h("div", { style:{display:"flex",alignItems:"center",gap:12,marginBottom:6,flexWrap:"wrap"} },
        h("div", { style:{fontSize:20,fontWeight:600,color:"#F5F5F5",letterSpacing:"-.3px"} }, "🚫 Blocklist"),
        h("span", { style:{fontSize:11,fontFamily:"IBM Plex Mono,monospace",color:"#9B9BB4"} }, list.length + " empresas"),
        h("span", { title:"Fonte de dados atual",
          style:{marginLeft:"auto",fontSize:9,fontFamily:"IBM Plex Mono,monospace",padding:"3px 9px",borderRadius:100,
            background: supaOn?"rgba(29,158,117,.12)":"rgba(239,159,39,.1)", color: supaOn?"#1D9E75":"#EF9F27",
            border:"1px solid "+(supaOn?"rgba(29,158,117,.3)":"rgba(239,159,39,.3)")} },
          supaOn ? "Supabase (sync)" : "localStorage (cache)")
      ),
      h("div", { style:{fontSize:11,color:"#9B9BB4",marginBottom:16,lineHeight:1.6} },
        "Empresas que JÁ são clientes de qualquer empresa da Holding. O agente ",
        h("b", null, "nunca"), " aborda essas empresas nem seus funcionários. Checagem por domínio, nome (com variações) e grupo econômico."),

      // Testador
      h("div", { style:{background:"#111827",border:".5px solid #2D2D44",borderRadius:10,padding:14,marginBottom:16} },
        h("div", { style:{fontSize:9,fontFamily:"IBM Plex Mono,monospace",color:"#9B9BB4",letterSpacing:1,textTransform:"uppercase",marginBottom:8} }, "Testar empresa / email"),
        h("div", { style:{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"} },
          h("input", { className:"gh-input", style:{flex:1,minWidth:200}, placeholder:"Ex: Itaú Unibanco  ·  cmo@natura.com.br  ·  Gerdau",
            value:testIn, onChange:function(e){setTestIn(e.target.value);} }),
          testResult && h("span", { style:{fontSize:11,fontFamily:"IBM Plex Mono,monospace",padding:"6px 12px",borderRadius:6,whiteSpace:"nowrap",
              background: testResult.blocked?"rgba(226,75,74,.12)":"rgba(29,158,117,.12)",
              color: testResult.blocked?"#E24B4A":"#1D9E75",
              border:"1px solid "+(testResult.blocked?"rgba(226,75,74,.3)":"rgba(29,158,117,.3)")} },
            testResult.blocked ? ("🔴 BLOQUEADA — "+testResult.entryName+" ("+testResult.reason+")") : "🟢 Liberada"))
      ),

      // Barra de ações
      h("div", { style:{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"} },
        h("input", { className:"gh-input", style:{flex:1,minWidth:180}, placeholder:"Buscar na blocklist…", value:q, onChange:function(e){setQ(e.target.value);} }),
        h("button", { className:"gh-btn-primary", onClick:function(){setAdding(!adding);} }, adding ? "Cancelar" : "+ Adicionar empresa")
      ),

      // Form de adicionar
      adding && h("div", { style:{background:"#1A1A2E",border:".5px solid #2D2D44",borderRadius:10,padding:16,marginBottom:14} },
        h("div", { style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10} },
          field("Nome *", form.canonicalName, function(v){setForm(Object.assign({},form,{canonicalName:v}));}, "Ex: Ambev"),
          field("Grupo econômico", form.economicGroup, function(v){setForm(Object.assign({},form,{economicGroup:v}));}, "Ex: AB InBev"),
          field("Domínios (vírgula)", form.domains, function(v){setForm(Object.assign({},form,{domains:v}));}, "ambev.com.br, ambev.com"),
          field("Aliases (vírgula)", form.aliases, function(v){setForm(Object.assign({},form,{aliases:v}));}, "ambev, brahma, skol")
        ),
        h("div", { style:{marginTop:10} }, field("Nota", form.note, function(v){setForm(Object.assign({},form,{note:v}));}, "Por que está bloqueada")),
        h("div", { style:{display:"flex",justifyContent:"flex-end",marginTop:12} },
          h("button", { className:"gh-btn-primary", onClick:addEntry }, "Salvar na blocklist"))
      ),

      // Lista
      h("div", null, filtered.map(function(e){
        return h("div", { key:e.id, style:{display:"flex",gap:12,alignItems:"flex-start",background:"#1A1A2E",border:".5px solid #2D2D44",borderRadius:10,padding:"12px 14px",marginBottom:8} },
          h("div", { style:{flex:1,minWidth:0} },
            h("div", { style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"} },
              h("span", { style:{fontSize:13,fontWeight:600,color:"#F5F5F5"} }, e.canonicalName),
              e.economicGroup && h("span", { style:{fontSize:8,fontFamily:"IBM Plex Mono,monospace",padding:"1px 7px",borderRadius:100,background:"rgba(255,107,43,.1)",color:"#FF6B2B",border:"1px solid rgba(255,107,43,.25)"} }, e.economicGroup)),
            h("div", { style:{fontSize:9,fontFamily:"IBM Plex Mono,monospace",color:"#9B9BB4",marginTop:5,lineHeight:1.6} },
              (e.domains&&e.domains.length? ("🌐 "+e.domains.join(", ")) : "sem domínio"),
              (e.aliases&&e.aliases.length? ("   ·   alias: "+e.aliases.join(", ")) : "")),
            e.note && h("div", { style:{fontSize:9,color:"#555",marginTop:3,fontStyle:"italic"} }, e.note)
          ),
          h("button", { onClick:function(){removeEntry(e.id);}, title:"Remover da blocklist",
            style:{background:"rgba(226,75,74,.1)",color:"#E24B4A",border:".5px solid rgba(226,75,74,.3)",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:12,flexShrink:0} }, "🗑")
        );
      })),
      filtered.length===0 && h("div", { style:{textAlign:"center",color:"#555",fontSize:11,padding:24,fontFamily:"IBM Plex Mono,monospace"} }, "Nenhuma empresa encontrada.")
    );

    function field(label, value, onChange, ph){
      return h("div", { style:{display:"flex",flexDirection:"column",gap:4} },
        h("label", { className:"gh-label" }, label),
        h("input", { className:"gh-input", value:value, placeholder:ph||"", onChange:function(e){onChange(e.target.value);} }));
    }
  }

  // expõe global para o block3.js referenciar no switch de views
  window.BlocklistView = BlocklistView;
  // expõe o matcher pra outros blocos (ex: migração de empresas na aba Agente)
  window.GH_BL = {
    list: loadLocal,
    norm: normName,
    check: function (input) { return checkBlock(loadLocal(), input); },
  };
})();
