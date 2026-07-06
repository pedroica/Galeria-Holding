const {
  useState,
  useMemo,
  useEffect,
  useCallback
} = React;

// ─── E-mail 3 cliques: helpers ────────────────────────────────────────────────
function _bestAgForSetor(setor) {
  var s = (setor || '').toLowerCase();
  // §5 do PROMPT_MESTRE: setor → agência de melhor fit
  if (['cerveja'].some(function(x){ return s.includes(x); })) return 'galeria';
  if (['sorvete','franqueadora','lacteo','lacteos','alimento','comida indie'].some(function(x){ return s.includes(x); })) return 'mila';
  if (['luxo','internacional','saas','varejo nicho','lancamento','lançamento','b2b'].some(function(x){ return s.includes(x); })) return '404';
  if (['rebranding','genz','gen z','time enxuto','marca de grupo','comida'].some(function(x){ return s.includes(x); })) return 'cccaramelo';
  if (['educacao','educação','farma','automotivo','super app','games','grande varejo'].some(function(x){ return s.includes(x); })) return 'galeria';
  if (['fmcg','varejo moda','moda'].some(function(x){ return s.includes(x); })) return 'mila';
  return 'galeria_holding';
}
function _getAgTpl(agId, setor) {
  var TPLS = (typeof AGENCY_TEMPLATES !== 'undefined') ? AGENCY_TEMPLATES : {};
  var ag = TPLS[agId]; if (!ag) return null;
  var ps = ag.porSetor || {}, s = (setor || '').toLowerCase(), matched = null;
  Object.keys(ps).some(function(k){
    if (k.toLowerCase() === s || s.includes(k.toLowerCase()) || k.toLowerCase().includes(s)){
      matched = Object.assign({}, ps[k], { assinatura: ag.assinatura }); return true;
    }
  });
  return matched || Object.assign({}, ag.default || {}, { assinatura: ag.assinatura });
}
function _fillVars(str, vars) {
  return (str || '').replace(/\{nome\}/g, vars.nome||'').replace(/\{empresa\}/g, vars.empresa||'').replace(/\{site\}/g, vars.site||'');
}
var _POP_AGS = [
  { id:'galeria_holding', label:'Galeria Holding' },
  { id:'galeria',         label:'Galeria'         },
  { id:'mila',            label:'Milà'            },
  { id:'404',             label:'404'             },
  { id:'cccaramelo',      label:'Caramelo'        },
];

function EmailPopover({ empresa, accs, setAccs, curGrupoId, onClose }) {
  var MC = (typeof MICROCOPY !== 'undefined') ? MICROCOPY : { titulo:function(e){return'✉️ E-mail pra '+e;}, setorDetectado:function(s){return'Setor: '+s;}, agenciaLabel:'Agência', agenciaHint:'sugerida pelo fit do setor', badgeMelhorFit:'★ melhor fit', decisores:function(n){return n+' decisores com e-mail';}, semDecisor:'Nenhum decisor com e-mail.', conflito:function(m,a){return'⚠️ '+m;}, conflitoTrocar:'Trocar de agência', conflitoSeguir:'Seguir mesmo assim', gerarBtn:function(n){return'Gerar e abrir e-mails';}, gerando:'Gerando com CR.IA…', sucessoMulti:function(n){return'✅ '+n+' e-mails abertos.';}, sucessoUm:function(n){return'✅ E-mail aberto pro '+n+'.';}, statusOk:function(n){return'✓ '+n+' — aberto';}, statusPulado:function(n){return'— '+n+' (sem e-mail, pulado)';} };
  var TPLS = (typeof AGENCY_TEMPLATES !== 'undefined') ? AGENCY_TEMPLATES : {};
  var [selAg, setSelAg] = useState(function(){ return _bestAgForSetor(empresa.setor); });
  var [results, setResults] = useState([]);
  var [done, setDone] = useState(false);
  var [loading, setLoading] = useState(false);
  var [conflictOverride, setConflictOverride] = useState(false);

  var dbKey = curGrupoId + '_' + empresa.rank;
  var acc = (accs||{})[dbKey] || { decisors:[], sugeridos:[], activities:[] };
  var withEmail = (acc.decisors||[]).filter(function(d){ return d.email && d.email.includes('@'); });
  var site = empresa.website || empresa.site || (withEmail.length > 0 ? (withEmail[0].email.split('@')[1]||'') : '');
  var bestAg = _bestAgForSetor(empresa.setor);

  var conflicts = (typeof checkRestrictions === 'function') ? checkRestrictions({ nome: empresa.nome, setor: empresa.setor }, selAg) : [];
  var activeConflict = conflicts.filter(function(c){ return !c.expiresAt || new Date(c.expiresAt) > new Date(); });
  var blocked = activeConflict.length > 0 && !conflictOverride;

  var changeAg = function(id) { setSelAg(id); setConflictOverride(false); };

  var trocarAgencia = function() {
    var next = _POP_AGS.find(function(a) {
      if (a.id === selAg) return false;
      var c = (typeof checkRestrictions === 'function') ? checkRestrictions({ nome: empresa.nome, setor: empresa.setor }, a.id) : [];
      return !c.filter(function(x){ return !x.expiresAt || new Date(x.expiresAt) > new Date(); }).length;
    });
    changeAg(next ? next.id : 'galeria_holding');
  };

  var gerar = async function() {
    var tpl = _getAgTpl(selAg, empresa.setor);
    if (!tpl || withEmail.length === 0) return;
    setLoading(true);
    var hasKey = (typeof getClaudeKey === 'function') && getClaudeKey();
    var grupoObj = (typeof GRUPO !== 'undefined') ? GRUPO.find(function(g){ return g.id === selAg; }) : null;
    var hist = (acc.activities||[]).slice(-3).map(function(a){ return a.date+': '+a.note; }).join('; ');
    var res = [];
    for (var i = 0; i < withEmail.length; i++) {
      var d = withEmail[i];
      var pn = (d.nome||'').split(' ')[0];
      var vars = { nome: pn, empresa: empresa.nome, site: site };
      var assunto, corpo;
      if (hasKey && grupoObj && typeof gerarEmail === 'function') {
        try {
          var gen = await gerarEmail(pn, empresa.nome, empresa.setor||'', grupoObj, tpl.assunto, 'direto e consultivo', hist||'');
          assunto = gen.assunto || _fillVars(tpl.assunto, vars);
          corpo = gen.corpo || (_fillVars(tpl.corpo, vars) + '\n\n' + (tpl.assinatura||''));
        } catch(err) {
          assunto = _fillVars(tpl.assunto, vars);
          corpo = _fillVars(tpl.corpo, vars) + '\n\n' + (tpl.assinatura||'');
        }
      } else {
        assunto = _fillVars(tpl.assunto, vars);
        corpo = _fillVars(tpl.corpo, vars) + '\n\n' + (tpl.assinatura||'');
      }
      try {
        window.open('mailto:' + encodeURIComponent(d.email) + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(corpo), '_blank');
        res.push({ nome: d.nome, ok: true });
      } catch(err) { res.push({ nome: d.nome, ok: false }); }
    }
    var prev = lsGet('gh_decisores_v3', {});
    var curAcc = prev[dbKey] || { decisors:[], sugeridos:[], activities:[] };
    var agNome = (TPLS[selAg]||{}).nome || selAg;
    var newActs = res.filter(function(r){ return r.ok; }).map(function(r){ return { type:'email_enviado', typeLabel:'✉ Email', decisor:r.nome, note:'E-mail gerado — agência '+agNome, date:new Date().toLocaleDateString('pt-BR'), isoDate:new Date().toISOString(), synced:false }; });
    var updatedAcc = Object.assign({}, curAcc, { activities:(curAcc.activities||[]).concat(newActs) });
    var updated = Object.assign({}, prev, { [dbKey]: updatedAcc });
    setAccs(updated); lsSet('gh_decisores_v3', updated);
    setLoading(false); setResults(res); setDone(true);
  };

  var btnAg = function(ag) {
    var sel = selAg === ag.id, best = ag.id === bestAg;
    return React.createElement('button', { key: ag.id, onClick: function(){ changeAg(ag.id); }, style: { padding:'6px 12px', borderRadius:20, border:'.5px solid', borderColor:sel?'#FF6B2B':'#2D2D44', background:sel?'rgba(255,107,43,.15)':'transparent', color:sel?'#FF6B2B':'#9B9BB4', fontSize:11, cursor:'pointer', fontWeight:sel?700:400, display:'inline-flex', alignItems:'center', gap:4 } },
      ag.label, best && React.createElement('span', { style:{ fontSize:9, color:'#EF9F27' } }, ' '+MC.badgeMelhorFit));
  };

  return React.createElement('div', { style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }, onClick: onClose },
    React.createElement('div', { style:{ background:'#111827', border:'.5px solid #2D2D44', borderRadius:14, width:'100%', maxWidth:460, padding:24, display:'flex', flexDirection:'column', gap:14 }, onClick:function(ev){ ev.stopPropagation(); } },
      // cabeçalho
      React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' } },
        React.createElement('div', null,
          React.createElement('div', { style:{ fontSize:15, fontWeight:700, color:'#F5F5F5' } }, MC.titulo(empresa.nome)),
          React.createElement('div', { style:{ fontSize:10, color:'#9B9BB4', fontFamily:'IBM Plex Mono,monospace', marginTop:4 } },
            MC.setorDetectado(empresa.setor||'sem setor'),
            site && React.createElement('span', { style:{ marginLeft:8, color:'#60A5FA' } }, '🔗 '+site)
          )
        ),
        React.createElement('button', { onClick:onClose, style:{ background:'none', border:'none', color:'#9B9BB4', fontSize:20, cursor:'pointer', lineHeight:1, padding:'0 4px' } }, '×')
      ),
      // seletor de agência
      !done && !loading && React.createElement('div', null,
        React.createElement('div', { style:{ fontSize:9, color:'#9B9BB4', fontFamily:'IBM Plex Mono,monospace', marginBottom:8, textTransform:'uppercase', letterSpacing:.5 } }, MC.agenciaLabel+' · '+MC.agenciaHint),
        React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:6 } }, _POP_AGS.map(btnAg))
      ),
      // conflito — bloqueia com trocar / seguir
      !done && !loading && blocked && React.createElement('div', { style:{ background:'rgba(239,159,39,.12)', border:'.5px solid #EF9F27', borderRadius:8, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 } },
        React.createElement('div', { style:{ fontSize:11, color:'#EF9F27' } }, MC.conflito(activeConflict[0].reason, (TPLS[selAg]||{}).nome||selAg)),
        React.createElement('div', { style:{ display:'flex', gap:8 } },
          React.createElement('button', { onClick: trocarAgencia, style:{ flex:1, padding:'7px 0', borderRadius:7, border:'.5px solid #EF9F27', background:'transparent', color:'#EF9F27', fontSize:11, fontWeight:600, cursor:'pointer' } }, MC.conflitoTrocar),
          React.createElement('button', { onClick: function(){ setConflictOverride(true); }, style:{ flex:1, padding:'7px 0', borderRadius:7, border:'.5px solid #555', background:'transparent', color:'#9B9BB4', fontSize:11, cursor:'pointer' } }, MC.conflitoSeguir)
        )
      ),
      // aviso leve quando conflito já foi aceito (seguir mesmo assim)
      !done && !loading && !blocked && activeConflict.length > 0 && React.createElement('div', { style:{ fontSize:10, color:'#EF9F27', opacity:.7, fontStyle:'italic' } }, '⚠️ '+MC.conflito(activeConflict[0].reason, (TPLS[selAg]||{}).nome||selAg)),
      // loading
      loading && React.createElement('div', { style:{ textAlign:'center', padding:'16px 0', fontSize:13, color:'#9B9BB4', fontStyle:'italic' } }, MC.gerando),
      // count + botão gerar (só aparece se não bloqueado por conflito)
      !done && !loading && !blocked && React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 } },
        withEmail.length === 0
          ? React.createElement('div', { style:{ fontSize:12, color:'#EF9F27', fontStyle:'italic' } }, MC.semDecisor)
          : React.createElement(React.Fragment, null,
              React.createElement('div', { style:{ fontSize:12, color:'#9B9BB4' } }, MC.decisores(withEmail.length)),
              React.createElement('button', { onClick:gerar, style:{ padding:'10px 20px', borderRadius:8, border:'none', background:'#FF6B2B', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' } }, MC.gerarBtn(withEmail.length))
            )
      ),
      // resultado pós-geração
      done && React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:8 } },
        React.createElement('div', { style:{ fontSize:13, color:'#1D9E75', fontWeight:600 } },
          results.filter(function(r){ return r.ok; }).length === 1
            ? MC.sucessoUm((results.find(function(r){ return r.ok; })||{}).nome||'')
            : MC.sucessoMulti(results.filter(function(r){ return r.ok; }).length)
        ),
        results.map(function(r){ return React.createElement('div', { key:r.nome, style:{ fontSize:11, color:r.ok?'#9B9BB4':'#555', fontFamily:'IBM Plex Mono,monospace' } }, r.ok ? MC.statusOk(r.nome) : MC.statusPulado(r.nome)); }),
        React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end', marginTop:4 } },
          React.createElement('button', { onClick:onClose, style:{ padding:'8px 20px', borderRadius:8, border:'.5px solid #2D2D44', background:'transparent', color:'#9B9BB4', fontSize:12, cursor:'pointer' } }, 'Fechar')
        )
      )
    )
  );
}

function EmpresasView({
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
  const [abordagemDec, setAbordagemDec] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newEmpNome, setNewEmpNome] = useState("");
  const [newEmpSetor, setNewEmpSetor] = useState("E-commerce");
  const [newEmpSetorc, setNewEmpSetorc] = useState("");
  const [newEmpCidade, setNewEmpCidade] = useState("");
  const [newEmpSite, setNewEmpSite] = useState("");
  const [newEmpErr, setNewEmpErr] = useState("");
  const [emailPopover, setEmailPopover] = useState(null);
  const [fNome, setFNome] = useState("");
  const [fCargo, setFCargo] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fWa, setFWa] = useState("");
  const [fLi, setFLi] = useState("");
  const [fWa2, setFWa2] = useState("");
  const [fWa3, setFWa3] = useState("");
  const [fIg, setFIg] = useState("");
  const [fFb, setFFb] = useState("");

  // ── dados ──────────────────────────────────────────────────────────────────
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

  // ── enriquecer ─────────────────────────────────────────────────────────────
  const enriquecer = async empresa => {
    if (!getClaudeKey()) {
      alert("⚠ Configure a Claude API Key em ⚙ Configurações.");
      return;
    }
    setEnrichLoading(p => ({
      ...p,
      [empresa.rank]: true
    }));
    const prompt = `Encontre os principais executivos de marketing e área comercial da empresa ${empresa.nome} no Brasil.
Para cada pessoa retorne APENAS um JSON array com objetos: nome, cargo, linkedin (string ou null).
Foco: CMO, VP Marketing, Diretor de Marketing, Diretor de Performance, Brand Manager, Diretor Comercial, Head Comercial.
Mínimo 5 pessoas. SOMENTE o JSON, sem texto adicional.`;
    const txt = await claudeSearch(prompt, 2000);
    const lista = parseJSON(txt);
    if (lista && Array.isArray(lista) && lista.length > 0) {
      const k = curGrupo.id + "_" + empresa.rank;
      const ex = (accs || {})[k] || {
        decisors: [],
        sugeridos: [],
        activities: []
      };
      const jaVer = (ex.decisors || []).map(d => normalizarNome(d.nome));
      const jaSug = (ex.sugeridos || []).map(d => normalizarNome(d.nome));
      const novos = lista.filter(s => !jaVer.includes(normalizarNome(s.nome)) && !jaSug.includes(normalizarNome(s.nome))).map(s => ({
        ...s,
        aiSuggested: true,
        addedAt: new Date().toLocaleDateString("pt-BR")
      }));
      const novoAcc = {
        ...ex,
        sugeridos: [...(ex.sugeridos || []), ...novos]
      };
      const newAccs = {
        ...(accs || {}),
        [k]: novoAcc
      };
      setAccs(newAccs);
      lsSet("gh_decisores_v3", newAccs);
    } else {
      alert("Não foi possível buscar. Verifique sua API key.");
    }
    setEnrichLoading(p => ({
      ...p,
      [empresa.rank]: false
    }));
  };
  const confirmar = (empresa, sug) => {
    const k = curGrupo.id + "_" + empresa.rank;
    const ex = (accs || {})[k] || {
      decisors: [],
      sugeridos: [],
      activities: []
    };
    const novoAcc = {
      ...ex,
      decisors: [...(ex.decisors || []), {
        ...sug,
        confirmedAt: new Date().toLocaleDateString("pt-BR")
      }],
      sugeridos: (ex.sugeridos || []).filter(s => normalizarNome(s.nome) !== normalizarNome(sug.nome))
    };
    const newAccs = {
      ...(accs || {}),
      [k]: novoAcc
    };
    setAccs(newAccs);
    lsSet("gh_decisores_v3", newAccs);
  };
  const remover = (empresa, dec, tipo) => {
    const k = curGrupo.id + "_" + empresa.rank;
    const ex = (accs || {})[k] || {
      decisors: [],
      sugeridos: [],
      activities: []
    };
    const novoAcc = tipo === "verificado" ? {
      ...ex,
      decisors: (ex.decisors || []).filter(d => normalizarNome(d.nome) !== normalizarNome(dec.nome))
    } : {
      ...ex,
      sugeridos: (ex.sugeridos || []).filter(d => normalizarNome(d.nome) !== normalizarNome(dec.nome))
    };
    const newAccs = {
      ...(accs || {}),
      [k]: novoAcc
    };
    setAccs(newAccs);
    lsSet("gh_decisores_v3", newAccs);
  };

  // ── painel direito: álbum de figurinhas ────────────────────────────────────
  const renderAlbum = () => {
    if (!selEmpresa) return null;
    const acc = getAcc(selEmpresa.rank);
    const verificados = acc.decisors || [];
    const sugeridos = acc.sugeridos || [];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "#0D0D0D"
      }
    }, abordagemDec && /*#__PURE__*/React.createElement(AbordagemModal, {
      decisor: abordagemDec,
      empresa: selEmpresa.nome,
      setor: selEmpresa.setor,
      onClose: () => setAbordagemDec(null),
      onKanbanAdd: onKanbanAdd
    }), showAdd && /*#__PURE__*/React.createElement("div", {
      style: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.88)",
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
        borderRadius: 14,
        width: "100%",
        maxWidth: 420,
        padding: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 700,
        color: "#F5F5F5",
        marginBottom: 18
      }
    }, "+ Novo Decisor — ", selEmpresa.nome), [["Nome *", "text", fNome, setFNome, "Ex: Ana Souza", "#F5F5F5"], ["Cargo", "text", fCargo, setFCargo, "CMO, Dir. Marketing...", "#F5F5F5"], ["Email", "email", fEmail, setFEmail, "email@empresa.com", "#60A5FA"], ["WhatsApp 1", "text", fWa, setFWa, "5511999999999", "#25D366"], ["WhatsApp 2", "text", fWa2, setFWa2, "5511999999999", "#25D366"], ["WhatsApp 3", "text", fWa3, setFWa3, "5511999999999", "#25D366"], ["LinkedIn", "text", fLi, setFLi, "linkedin.com/in/...", "#A78BFA"], ["Instagram", "text", fIg, setFIg, "@usuario", "#E1306C"], ["Facebook", "text", fFb, setFFb, "facebook.com/...", "#1877F2"]].map(([label, type, val, setter, ph, col]) => /*#__PURE__*/React.createElement("div", {
      key: label,
      style: {
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace",
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: .5
      }
    }, label), /*#__PURE__*/React.createElement("input", {
      type: type,
      value: val,
      onChange: e => setter(e.target.value),
      placeholder: ph,
      style: {
        width: "100%",
        background: "#0D0D0D",
        border: ".5px solid #2D2D44",
        borderRadius: 8,
        padding: "9px 12px",
        color: col,
        fontSize: 12,
        outline: "none",
        boxSizing: "border-box",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        justifyContent: "flex-end",
        marginTop: 4
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setShowAdd(false);
        setFNome("");
        setFCargo("");
        setFEmail("");
        setFWa("");
        setFLi("");
      },
      style: {
        padding: "9px 18px",
        borderRadius: 8,
        border: ".5px solid #2D2D44",
        background: "transparent",
        color: "#9B9BB4",
        fontSize: 12,
        cursor: "pointer"
      }
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        if (!fNome.trim()) return;
        const k = curGrupo.id + "_" + selEmpresa.rank;
        const ex = (accs || {})[k] || {
          decisors: [],
          sugeridos: [],
          activities: []
        };
        const novo = {
          nome: fNome.trim(),
          cargo: fCargo.trim(),
          email: fEmail.trim(),
          wa: fWa.trim(),
          wa2: (fWa2 || "").trim(),
          li: fLi.trim(),
          ig: (fIg || "").trim(),
          fb: (fFb || "").trim(),
          addedAt: new Date().toLocaleDateString("pt-BR")
        };
        const newAccs = {
          ...(accs || {}),
          [k]: {
            ...ex,
            decisors: [...(ex.decisors || []), novo]
          }
        };
        setAccs(newAccs);
        lsSet("gh_decisores_v3", newAccs);
        setShowAdd(false);
        setFNome("");
        setFCargo("");
        setFEmail("");
        setFWa("");
        setFLi("");
      },
      style: {
        padding: "9px 22px",
        borderRadius: 8,
        border: "none",
        background: "#FF6B2B",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer"
      }
    }, "Salvar")))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px 20px",
        borderBottom: ".5px solid #2D2D44",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setSelEmpresa(null),
      style: {
        padding: "5px 12px",
        borderRadius: 6,
        border: ".5px solid #2D2D44",
        background: "transparent",
        color: "#9B9BB4",
        fontSize: 11,
        cursor: "pointer",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }, "← Voltar"), /*#__PURE__*/React.createElement("div", {
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
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginTop: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        padding: "2px 8px",
        borderRadius: 100,
        background: "#1A1A2E",
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace",
        border: ".5px solid #2D2D44"
      }
    }, selEmpresa.setor), /*#__PURE__*/React.createElement("div", {
      className: "score-badge " + scoreCls(selEmpresa.score || 0),
      style: {
        width: 28,
        height: 28,
        fontSize: 10
      }
    }, selEmpresa.score || 0), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: "#555",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }, verificados.length > 0 ? `✓ ${verificados.length} verificado${verificados.length > 1 ? "s" : ""}` : "Sem verificados", sugeridos.length > 0 ? ` · ⟳ ${sugeridos.length} sugerido${sugeridos.length > 1 ? "s" : ""}` : ""))), /*#__PURE__*/React.createElement("button", {
      onClick: () => setShowAdd(true),
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
        padding: "20px"
      }
    }, verificados.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 28
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontFamily: "IBM Plex Mono,monospace",
        color: "#1D9E75",
        letterSpacing: 1,
        textTransform: "uppercase",
        fontWeight: 700
      }
    }, "✓ Verificados (", verificados.length, ")"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: .5,
        background: "#2D2D44"
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "fig-grid"
    }, verificados.map((d, i) => {
      const g = getGrad(d.nome);
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        className: "fig2-card verified"
      }, /*#__PURE__*/React.createElement("span", {
        className: "fig2-badge v",
        style: {
          margin: "8px 10px 0",
          display: "block"
        }
      }, "✓ Verificado"), /*#__PURE__*/React.createElement("div", {
        className: "fig2-avatar",
        style: {
          background: `linear-gradient(135deg,${g[0]},${g[1]})`
        }
      }, ini(d.nome)), /*#__PURE__*/React.createElement("div", {
        className: "fig2-body"
      }, /*#__PURE__*/React.createElement("div", {
        className: "fig2-name"
      }, d.nome), /*#__PURE__*/React.createElement("div", {
        className: "fig2-cargo"
      }, d.cargo), d.email && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          fontFamily: "IBM Plex Mono,monospace",
          color: "#60A5FA",
          marginTop: 4
        }
      }, "✉ ", d.email), d.wa && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          fontFamily: "IBM Plex Mono,monospace",
          color: "#25D366",
          marginTop: 2
        }
      }, "💬 ", d.wa)), /*#__PURE__*/React.createElement("div", {
        className: "fig2-actions",
        style: {
          flexWrap: "wrap",
          gap: 4
        }
      }, d.wa && /*#__PURE__*/React.createElement("a", {
        href: "https://wa.me/" + (() => {
          var n = (d.wa || "").replace(/[^0-9]/g, "");
          return n.startsWith("55") && n.length >= 12 ? n : "55" + n;
        })(),
        target: "_blank",
        style: {
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "6px 0",
          borderRadius: 6,
          border: "none",
          background: "#25D366",
          color: "#fff",
          fontSize: 9,
          fontWeight: 700,
          textDecoration: "none",
          cursor: "pointer",
          minWidth: 40
        }
      }, "💬 WA"), d.email && /*#__PURE__*/React.createElement("a", {
        href: "https://mail.google.com/mail/?view=cm&to=" + encodeURIComponent(d.email),
        target: "_blank",
        style: {
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "6px 0",
          borderRadius: 6,
          border: "none",
          background: "#EA4335",
          color: "#fff",
          fontSize: 9,
          fontWeight: 700,
          textDecoration: "none",
          cursor: "pointer",
          minWidth: 40
        }
      }, "✉️ Email"), d.linkedin && /*#__PURE__*/React.createElement("a", {
        href: d.linkedin.startsWith("http") ? d.linkedin : "https://" + d.linkedin,
        target: "_blank",
        style: {
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "6px 0",
          borderRadius: 6,
          border: "none",
          background: "#0A66C2",
          color: "#fff",
          fontSize: 9,
          fontWeight: 700,
          textDecoration: "none",
          cursor: "pointer",
          minWidth: 40
        }
      }, "💼 LI"), /*#__PURE__*/React.createElement("button", {
        style: {
          flex: 2,
          padding: "6px 0",
          borderRadius: 6,
          border: ".5px solid rgba(255,107,43,.4)",
          background: "rgba(255,107,43,.1)",
          color: "#FF6B2B",
          cursor: "pointer",
          fontSize: 9,
          fontWeight: 700
        },
        onClick: () => setAbordagemDec(d)
      }, "📨 Abordar"), /*#__PURE__*/React.createElement("button", {
        style: {
          background: "none",
          border: "none",
          color: "#555",
          cursor: "pointer",
          fontSize: 14,
          padding: "0 4px"
        },
        onClick: () => remover(selEmpresa, d, "verificado")
      }, "×")));
    }))), sugeridos.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 28
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontFamily: "IBM Plex Mono,monospace",
        color: "#9B9BB4",
        letterSpacing: 1,
        textTransform: "uppercase",
        fontWeight: 700
      }
    }, "⟳ Sugeridos pela IA (", sugeridos.length, ")"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: .5,
        background: "#2D2D44"
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "fig-grid"
    }, sugeridos.map((d, i) => {
      const g = getGrad(d.nome);
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        className: "fig2-card suggested"
      }, /*#__PURE__*/React.createElement("span", {
        className: "fig2-badge s",
        style: {
          margin: "8px 10px 0",
          display: "block"
        }
      }, "⟳ Sugerido"), /*#__PURE__*/React.createElement("div", {
        className: "fig2-avatar",
        style: {
          background: `linear-gradient(135deg,${g[0]}55,${g[1]}33)`,
          opacity: .8
        }
      }, ini(d.nome)), /*#__PURE__*/React.createElement("div", {
        className: "fig2-body"
      }, /*#__PURE__*/React.createElement("div", {
        className: "fig2-name",
        style: {
          opacity: .75
        }
      }, d.nome), /*#__PURE__*/React.createElement("div", {
        className: "fig2-cargo"
      }, d.cargo)), /*#__PURE__*/React.createElement("div", {
        className: "fig2-actions"
      }, /*#__PURE__*/React.createElement("button", {
        className: "gh-btn-primary",
        style: {
          flex: 1,
          padding: "5px 0",
          fontSize: 9
        },
        onClick: () => confirmar(selEmpresa, d)
      }, "✓ Confirmar"), /*#__PURE__*/React.createElement("button", {
        className: "gh-btn-secondary",
        style: {
          fontSize: 9,
          padding: "4px 8px"
        },
        onClick: () => setAbordagemDec(d)
      }, "✉"), d.linkedin && /*#__PURE__*/React.createElement("button", {
        className: "gh-btn-secondary",
        style: {
          fontSize: 9,
          padding: "4px 8px"
        },
        onClick: () => window.open(d.linkedin, "_blank")
      }, "in"), /*#__PURE__*/React.createElement("button", {
        style: {
          background: "none",
          border: "none",
          color: "#E24B4A",
          cursor: "pointer",
          fontSize: 14,
          padding: "0 4px"
        },
        onClick: () => remover(selEmpresa, d, "sugerido")
      }, "×")));
    }))), verificados.length === 0 && sugeridos.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: 80,
        color: "#9B9BB4",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 48,
        marginBottom: 16
      }
    }, "👤"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        marginBottom: 8,
        color: "#F5F5F5"
      }
    }, "Nenhum decisor ainda"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        marginBottom: 20,
        color: "#555"
      }
    }, "Adicione manualmente os decisores desta empresa"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setShowAdd(true),
      style: {
        padding: "12px 28px",
        borderRadius: 8,
        border: "none",
        background: "#FF6B2B",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 18
      }
    }, "+"), " Adicionar Decisor"))));
  };

  // ── lista de empresas ──────────────────────────────────────────────────────
  if (selEmpresa) return renderAlbum();
  const salvarNovaEmp = () => {
    if (!newEmpNome.trim()) {
      setNewEmpErr("Nome obrigatório.");
      return;
    }
    const finalSetor = newEmpSetor === "Outros" && newEmpSetorc.trim() ? newEmpSetorc.trim() : newEmpSetor;
    const rank = Math.max(9000, ...(typeof PROSP !== "undefined" ? PROSP : []).map(e => e.rank || 0)) + 1;
    const novaEmp = {
      rank,
      nome: newEmpNome.trim().toUpperCase(),
      setor: finalSetor,
      site: newEmpSite.trim(),
      cidade: newEmpCidade.trim(),
      custom: true
    };
    // Inject into PROSP and customLeads via window handler
    if (window.__addCustomEmpresa) window.__addCustomEmpresa(novaEmp);
    setShowAddEmp(false);
    setNewEmpNome("");
    setNewEmpSetor("E-commerce");
    setNewEmpSetorc("");
    setNewEmpCidade("");
    setNewEmpSite("");
    setNewEmpErr("");
    // Select the new company
    setTimeout(() => setSelEmpresa(novaEmp), 100);
  };
  const inp2 = {
    background: "#0D0D0D",
    border: ".5px solid #2D2D44",
    borderRadius: 8,
    padding: "9px 12px",
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
  }, emailPopover && React.createElement(EmailPopover, { empresa: emailPopover, accs: accs, setAccs: setAccs, curGrupoId: curGrupo.id, onClose: function(){ setEmailPopover(null); } }), showAddEmp && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.88)",
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
      borderRadius: 14,
      width: "100%",
      maxWidth: 480,
      padding: 24
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
      fontSize: 15,
      fontWeight: 700,
      color: "#F5F5F5"
    }
  }, "+ Nova Empresa"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#555",
      fontFamily: "IBM Plex Mono,monospace",
      marginTop: 3
    }
  }, "Disponível em todas as abas do grupo")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAddEmp(false),
    style: {
      background: "none",
      border: "none",
      color: "#555",
      cursor: "pointer",
      fontSize: 22
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
      ...inp2,
      fontSize: 14,
      fontWeight: 700,
      textTransform: "uppercase"
    },
    placeholder: "Ex: PETRONAS LUBRIFICANTES",
    value: newEmpNome,
    onChange: e => {
      setNewEmpNome(e.target.value);
      setNewEmpErr("");
    },
    onKeyDown: e => e.key === "Enter" && salvarNovaEmp(),
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
      ...inp2,
      cursor: "pointer"
    },
    value: newEmpSetor,
    onChange: e => setNewEmpSetor(e.target.value)
  }, (typeof SETORES_LIST !== "undefined" ? SETORES_LIST : []).map(s => /*#__PURE__*/React.createElement("option", {
    key: s
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
    style: inp2,
    placeholder: "São Paulo, SP",
    value: newEmpCidade,
    onChange: e => setNewEmpCidade(e.target.value)
  }))), newEmpSetor === "Outros" && /*#__PURE__*/React.createElement("div", {
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
    style: inp2,
    placeholder: "Digite o setor...",
    value: newEmpSetorc,
    onChange: e => setNewEmpSetorc(e.target.value)
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
    style: inp2,
    placeholder: "www.empresa.com.br",
    value: newEmpSite,
    onChange: e => setNewEmpSite(e.target.value)
  })), newEmpErr && /*#__PURE__*/React.createElement("div", {
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
  }, newEmpErr), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAddEmp(false),
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
    onClick: salvarNovaEmp,
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
  }, "✓ Adicionar empresa")))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 20px",
      borderBottom: ".5px solid #2D2D44",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "#F5F5F5",
      marginRight: 4
    }
  }, "🎴 Empresas"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555",
      marginRight: 8
    }
  }, filtradas.length, " de ", empresas.length, " · ", curGrupo.name), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAddEmp(true),
    style: {
      padding: "5px 14px",
      borderRadius: 6,
      border: "none",
      background: "#FF6B2B",
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1
    }
  }, "+"), " Nova Empresa"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Buscar empresa...",
    style: {
      background: "#1A1A2E",
      border: ".5px solid #2D2D44",
      borderRadius: 6,
      padding: "6px 12px",
      color: "#F5F5F5",
      fontSize: 11,
      fontFamily: "IBM Plex Mono,monospace",
      outline: "none",
      width: 180
    }
  }), /*#__PURE__*/React.createElement("select", {
    value: filtroSetor,
    onChange: e => setFiltroSetor(e.target.value),
    style: {
      background: "#1A1A2E",
      border: ".5px solid #2D2D44",
      borderRadius: 6,
      padding: "6px 10px",
      color: "#9B9BB4",
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      outline: "none",
      cursor: "pointer",
      maxWidth: 180
    }
  }, setores.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      flexWrap: "wrap"
    }
  }, [["todos", "Todos"], ["sem", "Sem decisores"], ["parcial", "1-4 ver."], ["completo", "5+ ver."]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
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
      padding: "12px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, filtradas.slice(0, 300).map(e => {
    const acc = getAcc(e.rank);
    const nVer = (acc.decisors || []).length;
    const nSug = (acc.sugeridos || []).length;
    const pct = Math.min(100, nVer / 5 * 100);
    const g = getGrad(e.nome);
    const sc = e.score;
    const borderC = nVer >= 5 ? "#1D9E75" : nVer > 0 ? "#EF9F27" : "#2D2D44";
    return /*#__PURE__*/React.createElement("div", {
      key: e.rank,
      onClick: () => setSelEmpresa(e),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "#111827",
        border: `.5px solid ${borderC}`,
        borderRadius: 10,
        cursor: "pointer",
        transition: "all .15s"
      },
      onMouseOver: e => e.currentTarget.style.borderColor = "#FF6B2B",
      onMouseOut: ev => ev.currentTarget.style.borderColor = borderC
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: 8,
        background: `linear-gradient(135deg,${g[0]},${g[1]})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
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
        fontSize: 13,
        fontWeight: 500,
        color: "#F5F5F5",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, e.nome), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#555",
        fontFamily: "IBM Plex Mono,monospace",
        marginTop: 2
      }
    }, e.setor), (e.website || e.site) && /*#__PURE__*/React.createElement("a", {
      href: ("https://" + (e.website || e.site)).replace("https://https://", "https://"),
      target: "_blank",
      rel: "noopener noreferrer",
      onClick: function(ev){ ev.stopPropagation(); },
      style: { fontSize: 9, color: "#60A5FA", fontFamily: "IBM Plex Mono,monospace", display: "block", marginTop: 2, textDecoration: "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }
    }, (typeof MICROCOPY !== 'undefined' ? MICROCOPY.siteLink(e.website || e.site) : ("🔗 " + (e.website || e.site))))), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 80,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: "#555",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }, nVer > 0 ? `✓${nVer}` : "", nSug > 0 ? ` ⟳${nSug}` : "", nVer === 0 && nSug === 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#E24B4A"
      }
    }, "sem dados")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: "#555",
        fontFamily: "IBM Plex Mono,monospace"
      }
    }, pct.toFixed(0), "%")), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "#2D2D44",
        borderRadius: 2,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: pct + "%",
        background: nVer >= 5 ? "#1D9E75" : nVer > 0 ? "#EF9F27" : "#E24B4A",
        borderRadius: 2,
        transition: "width .3s"
      }
    }))), /*#__PURE__*/React.createElement("button", {
      title: typeof MICROCOPY !== 'undefined' ? MICROCOPY.btnEmail : "Gerar e-mail pro decisor",
      onClick: function(ev){ ev.stopPropagation(); setEmailPopover(e); },
      style: { padding: "5px 8px", borderRadius: 6, border: ".5px solid #2D2D44", background: "transparent", color: "#9B9BB4", fontSize: 14, cursor: "pointer", flexShrink: 0 }
    }, "✉️"), /*#__PURE__*/React.createElement("div", {
      className: "score-badge " + scoreCls(sc),
      style: {
        width: 30,
        height: 30,
        fontSize: 10,
        flexShrink: 0
      }
    }, sc), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#2D2D44",
        fontSize: 16,
        flexShrink: 0
      }
    }, "›"));
  }))));
}

// ═══════════════════════════════════════════════════════════════
// KANBAN DIÁRIO — Hot Pipeline GAIA + Holding
// Estilo planilha: linhas = empresas, colunas = etapas
// Storage: gh_hotpipeline_v1
// ═══════════════════════════════════════════════════════════════

var HP_STORAGE = 'gh_hotpipeline_v1';
var HP_ETAPAS = [{
  id: 'contato',
  label: '1º Contato',
  color: '#60A5FA',
  short: 'Contato'
}, {
  id: 'reuniao',
  label: '1ª Reunião',
  color: '#A78BFA',
  short: 'Reunião'
}, {
  id: 'proposta',
  label: 'Proposta',
  color: '#fbbf24',
  short: 'Proposta'
}, {
  id: 'negociacao',
  label: 'Negociação',
  color: '#fb923c',
  short: 'Negoc.'
}, {
  id: 'fechamento',
  label: 'Fechamento',
  color: '#34D399',
  short: 'Fechado'
}];
var HP_STATUS = [{
  id: 'ok',
  label: '✓ Ok',
  color: '#34D399',
  bg: 'rgba(52,211,153,.12)'
}, {
  id: 'atencao',
  label: '⚠ Atenção',
  color: '#fbbf24',
  bg: 'rgba(251,191,36,.12)'
}, {
  id: 'risco',
  label: '🔴 Risco',
  color: '#f87171',
  bg: 'rgba(248,113,113,.12)'
}, {
  id: '',
  label: '—',
  color: '#2D2D44',
  bg: 'transparent'
}];
var HP_EMPRESA_GALERIA = ['GAIA', 'Galeria', 'Milà', 'Catalyst', '404', 'ccCaramelo', 'Vitrine', 'A.gente', 'GUX'];
function hpLoad() {
  try {
    return JSON.parse(localStorage.getItem(HP_STORAGE) || 'null') || {
      gaia: [],
      holding: []
    };
  } catch {
    return {
      gaia: [],
      holding: []
    };
  }
}
function hpSave(data) {
  try {
    localStorage.setItem(HP_STORAGE, JSON.stringify(data));
  } catch {}
}
function hpId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ── Seed inicial com dados do KB_DEFAULT_TABS ──────────────────
function hpSeedFromKanban() {
  const saved = hpLoad();
  // Só faz seed se ainda não tem dados
  if (saved.gaia.length > 0 || saved.holding.length > 0) return saved;
  const kbRaw = (() => {
    try {
      return JSON.parse(localStorage.getItem('gh_kanban_v3') || 'null');
    } catch {
      return null;
    }
  })();
  const kbTabs = kbRaw && kbRaw.tabs ? kbRaw.tabs : typeof KB_DEFAULT_TABS !== 'undefined' ? KB_DEFAULT_TABS : [];
  const gaiaTab = kbTabs.find(t => t.id === 'gaia');
  const holdingTab = kbTabs.find(t => t.id === 'holding');

  // Mapeia colunas do kanban → etapa do HP
  const gaiaColMap = {
    poc: 'contato',
    reuniao: 'reuniao',
    proposta: 'reuniao',
    aguardando: 'proposta'
  };
  const holdingColMap = {
    contatodir: 'contato',
    primreuniao: 'reuniao',
    negocdiret: 'proposta',
    negociacao: 'negociacao',
    concorrencia: 'proposta'
  };
  const gaiaCards = (gaiaTab?.cards || []).filter(c => gaiaColMap[c.col]).map(c => ({
    id: hpId(),
    nome: c.name,
    empresa_galeria: '',
    produto: c.product || 'CR.IA',
    etapa: gaiaColMap[c.col],
    valor: c.value || 0,
    status: '',
    responsavel: '',
    nota: c.note || '',
    updatedAt: new Date().toLocaleDateString('pt-BR')
  }));
  const holdingCards = (holdingTab?.cards || []).filter(c => holdingColMap[c.col]).map(c => ({
    id: hpId(),
    nome: c.name,
    empresa_galeria: c.galeria || '',
    produto: '',
    etapa: holdingColMap[c.col],
    valor: c.value || 0,
    status: '',
    responsavel: '',
    nota: c.note || '',
    updatedAt: new Date().toLocaleDateString('pt-BR')
  }));
  const seeded = {
    gaia: gaiaCards,
    holding: holdingCards
  };
  hpSave(seeded);
  return seeded;
}

// ── Componente principal ───────────────────────────────────────
function KanbanDiario() {
  const [aba, setAba] = React.useState('gaia');
  const [data, setData] = React.useState(() => hpSeedFromKanban());
  const [editId, setEditId] = React.useState(null); // id do card em edição inline
  const [addOpen, setAddOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [filtroEtapa, setFiltroEtapa] = React.useState('todas');
  const [filtroEmp, setFiltroEmp] = React.useState('Todos');
  const isGaia = aba === 'gaia';
  const rows = data[aba] || [];
  const persist = newData => {
    setData(newData);
    hpSave(newData);
  };
  const updateRow = (id, changes) => {
    const newRows = rows.map(r => r.id === id ? {
      ...r,
      ...changes,
      updatedAt: new Date().toLocaleDateString('pt-BR')
    } : r);
    persist({
      ...data,
      [aba]: newRows
    });
  };
  const deleteRow = id => {
    if (!window.confirm('Remover empresa do pipeline diário?')) return;
    persist({
      ...data,
      [aba]: rows.filter(r => r.id !== id)
    });
  };
  const addRow = row => {
    persist({
      ...data,
      [aba]: [...rows, {
        ...row,
        id: hpId(),
        updatedAt: new Date().toLocaleDateString('pt-BR')
      }]
    });
    setAddOpen(false);
  };

  // filtros
  const filtered = React.useMemo(() => rows.filter(r => {
    if (search && !r.nome.toLowerCase().includes(search.toLowerCase())) return false;
    if (filtroEtapa !== 'todas' && r.etapa !== filtroEtapa) return false;
    if (!isGaia && filtroEmp !== 'Todos' && r.empresa_galeria !== filtroEmp) return false;
    return true;
  }), [rows, search, filtroEtapa, filtroEmp, isGaia]);

  // KPIs
  const kpis = React.useMemo(() => {
    const ativas = rows.filter(r => r.etapa !== 'fechamento');
    const fechadas = rows.filter(r => r.etapa === 'fechamento');
    const pipeline = ativas.reduce((s, r) => s + (+r.valor || 0), 0);
    const risco = rows.filter(r => r.status === 'risco').length;
    const atencao = rows.filter(r => r.status === 'atencao').length;
    return {
      total: rows.length,
      pipeline,
      fechadas: fechadas.length,
      risco,
      atencao
    };
  }, [rows]);
  const etapaCount = etId => rows.filter(r => r.etapa === etId).length;
  const cellStyle = (row, etId) => {
    const isActive = row.etapa === etId;
    const et = HP_ETAPAS.find(e => e.id === etId);
    return {
      width: 110,
      minWidth: 110,
      padding: '0 8px',
      textAlign: 'center',
      cursor: 'pointer',
      background: isActive ? `${et.color}18` : 'transparent',
      borderRight: '.5px solid #1e2433',
      transition: 'background .12s'
    };
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
      alignItems: 'center',
      gap: 0,
      padding: '8px 20px 0',
      borderBottom: '.5px solid #2D2D44',
      flexShrink: 0,
      background: '#0D0D0D'
    }
  }, [['gaia', '⚡ GAIA', '#A78BFA'], ['holding', '🏢 Holding', '#FF6B2B']].map(([id, label, color]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => {
      setAba(id);
      setSearch('');
      setFiltroEtapa('todas');
      setFiltroEmp('Todos');
    },
    style: {
      padding: '8px 20px',
      border: 'none',
      borderBottom: aba === id ? `2px solid ${color}` : '2px solid transparent',
      background: 'transparent',
      color: aba === id ? color : '#555',
      fontSize: 12,
      fontWeight: aba === id ? 700 : 400,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer',
      transition: 'all .15s'
    }
  }, label, /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8,
      fontSize: 9,
      background: aba === id ? `${color}22` : '#1A1A2E',
      color: aba === id ? color : '#555',
      padding: '1px 7px',
      borderRadius: 100,
      fontWeight: 400
    }
  }, (data[id] || []).length)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '10px 20px',
      borderBottom: '.5px solid #2D2D44',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, [['Hot Pipeline', kbFmtVal(kpis.pipeline) || 'R$ 0', '#FF6B2B', true], ['Em Andamento', kpis.total - kpis.fechadas, '#60A5FA', false], ['Fechamentos', kpis.fechadas, '#34D399', false], ['Em Risco', kpis.risco, '#f87171', false], ['Atenção', kpis.atencao, '#fbbf24', false]].map(([label, val, color, big]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      background: '#111827',
      border: `.5px solid ${color}22`,
      borderRadius: 8,
      padding: '8px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: big ? 18 : 20,
      fontWeight: 700,
      fontFamily: 'IBM Plex Mono,monospace',
      color,
      lineHeight: 1
    }
  }, val), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      color: '#555',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: .5,
      marginTop: 3
    }
  }, label))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, HP_ETAPAS.map(et => /*#__PURE__*/React.createElement("div", {
    key: et.id,
    onClick: () => setFiltroEtapa(filtroEtapa === et.id ? 'todas' : et.id),
    style: {
      padding: '4px 10px',
      borderRadius: 100,
      background: filtroEtapa === et.id ? `${et.color}18` : '#1A1A2E',
      border: `.5px solid ${filtroEtapa === et.id ? et.color : '#2D2D44'}`,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: filtroEtapa === et.id ? et.color : '#555'
    }
  }, et.short), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      fontFamily: 'IBM Plex Mono,monospace',
      color: et.color
    }
  }, etapaCount(et.id)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '8px 20px',
      flexShrink: 0,
      alignItems: 'center',
      flexWrap: 'wrap',
      borderBottom: '.5px solid #1e2433'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Buscar empresa...",
    style: {
      background: '#1A1A2E',
      border: '.5px solid #2D2D44',
      borderRadius: 6,
      padding: '6px 11px',
      color: '#F5F5F5',
      fontSize: 11,
      fontFamily: 'IBM Plex Mono,monospace',
      outline: 'none',
      width: 180
    }
  }), !isGaia && /*#__PURE__*/React.createElement("select", {
    value: filtroEmp,
    onChange: e => setFiltroEmp(e.target.value),
    style: {
      background: '#1A1A2E',
      border: '.5px solid #2D2D44',
      borderRadius: 6,
      padding: '6px 10px',
      color: '#9B9BB4',
      fontSize: 10,
      fontFamily: 'IBM Plex Mono,monospace',
      outline: 'none',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), HP_EMPRESA_GALERIA.map(e => /*#__PURE__*/React.createElement("option", {
    key: e
  }, e))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: '#555',
      fontFamily: 'IBM Plex Mono,monospace',
      marginRight: 'auto'
    }
  }, filtered.length, " empresa", filtered.length !== 1 ? 's' : '', " · ", new Date().toLocaleDateString('pt-BR')), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAddOpen(true),
    style: {
      padding: '6px 16px',
      borderRadius: 8,
      border: 'none',
      background: '#FF6B2B',
      color: '#fff',
      fontSize: 11,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer',
      fontWeight: 700
    }
  }, "+ Adicionar")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 11,
      minWidth: 800
    }
  }, /*#__PURE__*/React.createElement("thead", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: '#0D0D0D'
    }
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 200,
      padding: '9px 16px',
      textAlign: 'left',
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: '#555',
      textTransform: 'uppercase',
      letterSpacing: 1,
      borderBottom: '.5px solid #2D2D44',
      borderRight: '.5px solid #1e2433'
    }
  }, "Empresa"), !isGaia && /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90,
      padding: '9px 8px',
      textAlign: 'center',
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: '#555',
      textTransform: 'uppercase',
      letterSpacing: 1,
      borderBottom: '.5px solid #2D2D44',
      borderRight: '.5px solid #1e2433'
    }
  }, "Galeria"), isGaia && /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90,
      padding: '9px 8px',
      textAlign: 'center',
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: '#555',
      textTransform: 'uppercase',
      letterSpacing: 1,
      borderBottom: '.5px solid #2D2D44',
      borderRight: '.5px solid #1e2433'
    }
  }, "Produto"), HP_ETAPAS.map(et => /*#__PURE__*/React.createElement("th", {
    key: et.id,
    style: {
      width: 110,
      padding: '9px 8px',
      textAlign: 'center',
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: et.color,
      textTransform: 'uppercase',
      letterSpacing: .8,
      borderBottom: '.5px solid #2D2D44',
      borderRight: '.5px solid #1e2433',
      background: `${et.color}06`
    }
  }, et.short, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      marginTop: 1
    }
  }, etapaCount(et.id)))), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 80,
      padding: '9px 8px',
      textAlign: 'center',
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: '#555',
      textTransform: 'uppercase',
      letterSpacing: 1,
      borderBottom: '.5px solid #2D2D44',
      borderRight: '.5px solid #1e2433'
    }
  }, "Valor"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 80,
      padding: '9px 8px',
      textAlign: 'center',
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: '#555',
      textTransform: 'uppercase',
      letterSpacing: 1,
      borderBottom: '.5px solid #2D2D44',
      borderRight: '.5px solid #1e2433'
    }
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    style: {
      minWidth: 160,
      padding: '9px 12px',
      textAlign: 'left',
      fontSize: 8,
      fontFamily: 'IBM Plex Mono,monospace',
      color: '#555',
      textTransform: 'uppercase',
      letterSpacing: 1,
      borderBottom: '.5px solid #2D2D44'
    }
  }, "Nota / Próxima ação"))), /*#__PURE__*/React.createElement("tbody", null, filtered.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 10,
    style: {
      textAlign: 'center',
      padding: 60,
      color: '#444',
      fontFamily: 'IBM Plex Mono,monospace',
      fontSize: 11
    }
  }, "Nenhuma empresa no pipeline. Clique em \"+ Adicionar\".")), filtered.map((row, idx) => {
    const isEditing = editId === row.id;
    const statusObj = HP_STATUS.find(s => s.id === row.status) || HP_STATUS[3];
    const rowBg = idx % 2 === 0 ? '#0D0D0D' : '#0f1118';
    return /*#__PURE__*/React.createElement("tr", {
      key: row.id,
      style: {
        background: rowBg,
        transition: 'background .1s'
      },
      onMouseOver: e => e.currentTarget.style.background = '#13192a',
      onMouseOut: e => e.currentTarget.style.background = rowBg
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '0 16px',
        borderBottom: '.5px solid #111827',
        borderRight: '.5px solid #1e2433',
        height: 44
      }
    }, isEditing ? /*#__PURE__*/React.createElement("input", {
      autoFocus: true,
      value: row.nome,
      onChange: e => updateRow(row.id, {
        nome: e.target.value
      }),
      onBlur: () => setEditId(null),
      style: {
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: '#F5F5F5',
        fontSize: 12,
        fontWeight: 500,
        width: '100%',
        fontFamily: 'Inter,sans-serif'
      }
    }) : /*#__PURE__*/React.createElement("div", {
      onClick: () => setEditId(row.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'text'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 24,
        height: 24,
        borderRadius: 5,
        background: `linear-gradient(135deg,${getGrad(row.nome)[0]},${getGrad(row.nome)[1]})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0
      }
    }, ini(row.nome)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 500,
        color: '#F5F5F5',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, row.nome))), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '0 8px',
        borderBottom: '.5px solid #111827',
        borderRight: '.5px solid #1e2433',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("select", {
      value: isGaia ? row.produto || '' : row.empresa_galeria || '',
      onChange: e => updateRow(row.id, isGaia ? {
        produto: e.target.value
      } : {
        empresa_galeria: e.target.value
      }),
      style: {
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontSize: 9,
        fontFamily: 'IBM Plex Mono,monospace',
        color: isGaia ? row.produto === 'CR.IA' ? '#A78BFA' : '#34D399' : '#FF6B2B',
        cursor: 'pointer',
        textAlign: 'center',
        width: '100%'
      }
    }, isGaia ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("option", {
      value: "CR.IA"
    }, "CR.IA"), /*#__PURE__*/React.createElement("option", {
      value: "BrandSync"
    }, "BrandSync")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "—"), HP_EMPRESA_GALERIA.map(e => /*#__PURE__*/React.createElement("option", {
      key: e
    }, e))))), HP_ETAPAS.map(et => {
      const isActive = row.etapa === et.id;
      return /*#__PURE__*/React.createElement("td", {
        key: et.id,
        onClick: () => updateRow(row.id, {
          etapa: et.id
        }),
        style: {
          ...cellStyle(row, et.id),
          borderBottom: '.5px solid #111827',
          height: 44,
          position: 'relative'
        }
      }, isActive && /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: et.color,
          boxShadow: `0 0 6px ${et.color}`
        }
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          fontFamily: 'IBM Plex Mono,monospace',
          color: et.color,
          fontWeight: 700
        }
      }, "AQUI")));
    }), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '0 8px',
        borderBottom: '.5px solid #111827',
        borderRight: '.5px solid #1e2433',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "number",
      value: row.valor || '',
      placeholder: "0",
      onChange: e => updateRow(row.id, {
        valor: parseInt(e.target.value) || 0
      }),
      style: {
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontSize: 10,
        fontFamily: 'IBM Plex Mono,monospace',
        color: '#34D399',
        textAlign: 'center',
        width: '100%',
        cursor: 'text'
      }
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '0 8px',
        borderBottom: '.5px solid #111827',
        borderRight: '.5px solid #1e2433',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("select", {
      value: row.status || '',
      onChange: e => updateRow(row.id, {
        status: e.target.value
      }),
      style: {
        background: statusObj.bg,
        border: `.5px solid ${statusObj.color}44`,
        borderRadius: 100,
        padding: '2px 6px',
        fontSize: 9,
        fontFamily: 'IBM Plex Mono,monospace',
        color: statusObj.color,
        cursor: 'pointer',
        outline: 'none',
        textAlign: 'center',
        width: '100%'
      }
    }, HP_STATUS.map(s => /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.label)))), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '0 12px',
        borderBottom: '.5px solid #111827'
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: row.nota || '',
      placeholder: "Próxima ação, contexto...",
      onChange: e => updateRow(row.id, {
        nota: e.target.value
      }),
      style: {
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontSize: 10,
        fontFamily: 'IBM Plex Mono,monospace',
        color: '#9B9BB4',
        width: '100%',
        cursor: 'text'
      }
    })));
  }))), filtered.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px',
      borderTop: '.5px solid #2D2D44',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      background: '#0D0D0D',
      fontSize: 10,
      fontFamily: 'IBM Plex Mono,monospace',
      color: '#555',
      position: 'sticky',
      bottom: 0
    }
  }, /*#__PURE__*/React.createElement("span", null, filtered.length, " empresa", filtered.length !== 1 ? 's' : ''), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#FF6B2B',
      fontWeight: 700
    }
  }, "Pipeline: ", kbFmtVal(filtered.reduce((s, r) => s + (+r.valor || 0), 0)) || 'R$ 0'), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#34D399'
    }
  }, "Fechamentos: ", kbFmtVal(filtered.filter(r => r.etapa === 'fechamento').reduce((s, r) => s + (+r.valor || 0), 0)) || '—'), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: '#2D2D44'
    }
  }, "Atualizado: ", filtered[0]?.updatedAt || '—'))), addOpen && /*#__PURE__*/React.createElement(HpAddModal, {
    isGaia: isGaia,
    onSave: addRow,
    onClose: () => setAddOpen(false)
  }));
}
function HpAddModal({
  isGaia,
  onSave,
  onClose
}) {
  const [f, setF] = React.useState({
    nome: '',
    produto: 'CR.IA',
    empresa_galeria: '',
    etapa: 'contato',
    valor: '',
    status: '',
    nota: '',
    responsavel: ''
  });
  const up = (k, v) => setF(p => ({
    ...p,
    [k]: v
  }));
  const handle = () => {
    if (!f.nome.trim()) return;
    onSave({
      ...f,
      valor: parseInt(f.valor) || 0
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.88)',
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
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: '#F5F5F5',
      marginBottom: 18
    }
  }, "+ Adicionar ao Pipeline"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
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
  }, "Empresa *"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: f.nome,
    onChange: e => up('nome', e.target.value),
    onKeyDown: e => e.key === 'Enter' && handle(),
    placeholder: "Nome do cliente",
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 13,
      outline: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
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
  }, isGaia ? 'Produto' : 'Empresa Galeria'), /*#__PURE__*/React.createElement("select", {
    value: isGaia ? f.produto : f.empresa_galeria,
    onChange: e => up(isGaia ? 'produto' : 'empresa_galeria', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      outline: 'none',
      cursor: 'pointer'
    }
  }, isGaia ? [['CR.IA', 'CR.IA'], ['BrandSync', 'BrandSync']].map(([v, l]) => /*#__PURE__*/React.createElement("option", {
    key: v,
    value: v
  }, l)) : [['', '—'], ...HP_EMPRESA_GALERIA.map(e => [e, e])].map(([v, l]) => /*#__PURE__*/React.createElement("option", {
    key: v,
    value: v
  }, l)))), /*#__PURE__*/React.createElement("div", {
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
  }, "Etapa"), /*#__PURE__*/React.createElement("select", {
    value: f.etapa,
    onChange: e => up('etapa', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      outline: 'none',
      cursor: 'pointer'
    }
  }, HP_ETAPAS.map(et => /*#__PURE__*/React.createElement("option", {
    key: et.id,
    value: et.id
  }, et.label))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
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
  }, "Valor estimado (R$)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "0",
    value: f.valor,
    onChange: e => up('valor', e.target.value),
    placeholder: "0",
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#34D399',
      fontSize: 12,
      fontFamily: 'IBM Plex Mono,monospace',
      outline: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
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
  }, "Status"), /*#__PURE__*/React.createElement("select", {
    value: f.status,
    onChange: e => up('status', e.target.value),
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      outline: 'none',
      cursor: 'pointer'
    }
  }, HP_STATUS.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, s.label))))), /*#__PURE__*/React.createElement("div", {
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
  }, "Nota / Próxima ação"), /*#__PURE__*/React.createElement("textarea", {
    value: f.nota,
    onChange: e => up('nota', e.target.value),
    rows: 2,
    placeholder: "Contexto, próximos passos...",
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: '9px 12px',
      color: '#F5F5F5',
      fontSize: 12,
      fontFamily: 'IBM Plex Mono,monospace',
      outline: 'none',
      resize: 'none',
      lineHeight: 1.6
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end',
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("button", {
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
  }, "Adicionar"))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
