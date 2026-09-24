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
  const [filtroToque, setFiltroToque] = useState("todos");
  const [selEmpresa, setSelEmpresa] = useState(null);
  const [contadoresSemana, setContadoresSemana] = useState({empresas:0,decisores:0,reunioes:0});
  const [reuniaoEmpIds, setReuniaoEmpIds] = useState(new Set());
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
  // ── Lusha enrichment ─────────────────────────────────────────────────────
  const [lushaOpen,         setLushaOpen]         = useState(false);
  const [lushaStep,         setLushaStep]         = useState('idle');
  const [lushaCandidates,   setLushaCandidates]   = useState([]);
  const [lushaSelected,     setLushaSelected]     = useState([]);
  const [lushaResults,      setLushaResults]      = useState([]);
  const [lushaCredits,      setLushaCredits]      = useState(null);
  const [lushaError,        setLushaError]        = useState('');
  const [empresaSupa,       setEmpresaSupa]       = useState(null);
  const [lushaFoundDomain,  setLushaFoundDomain]  = useState('');
  const [lushaManualDomain, setLushaManualDomain] = useState('');
  const [lushaDomain,       setLushaDomain]       = useState('');
  const [lushaChecked,      setLushaChecked]      = useState([]);
  const [supaEmpMap,        setSupaEmpMap]        = useState({});
  // ── Batch enrichment queue ────────────────────────────────────────────────
  const [selEmpresas,       setSelEmpresas]       = useState(new Set());
  const [batchOpen,         setBatchOpen]         = useState(false);
  const [batchProgress,     setBatchProgress]     = useState([]);
  const [batchRunning,      setBatchRunning]      = useState(false);
  // ── supaDecisores: fonte única — lê de crm_decisores (Supabase) ──────────
  const [supaDecisores,     setSupaDecisores]     = useState([]);
  const [supaDecLoading,    setSupaDecLoading]    = useState(false);

  // ── supaJwtFig: wrapper Supabase com timeout, 4xx log e 204 seguro ────────
  function supaJwtFig(path, opts) {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
    var h = Object.assign({'Content-Type':'application/json','Authorization':'Bearer '+jwt,'apikey':'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r'}, opts&&opts.headers);
    var ctrl = new AbortController();
    var tid = setTimeout(function(){ ctrl.abort(); }, 30000);
    return fetch('https://uetltlnjmobeiunxfsqi.supabase.co'+path, Object.assign({},opts,{headers:h,signal:ctrl.signal}))
      .then(function(r){
        clearTimeout(tid);
        if (r.status === 204 || r.headers.get('content-length') === '0') return null;
        if (r.status === 401) {
          console.warn('[supaJwtFig] JWT expirado (401):', path);
          return Promise.reject(new Error('Sessão expirada. Recarregue a página.'));
        }
        return r.json().then(function(data){
          if (r.status >= 400) {
            var msg = (data && data.message) || (data && data.error) || ('Erro '+r.status);
            console.warn('[supaJwtFig] Erro PostgREST', r.status, '—', msg, '— path:', path);
          }
          return data;
        });
      })
      .catch(function(e){
        clearTimeout(tid);
        if (e.name === 'AbortError') {
          console.warn('[supaJwtFig] Timeout 30s:', path);
          return Promise.reject(new Error('Timeout na requisição ao banco. Verifique sua conexão.'));
        }
        throw e;
      });
  }

  // ── logToSupabase: grava evento em crm_logs (fire-and-forget) ─────────────
  function logToSupabase(nivel, mensagem, contexto, empresa_id, decisor_id) {
    var row = { origem:'lusha', nivel:nivel, mensagem:mensagem, contexto:contexto||null, empresa_id:empresa_id||null, decisor_id:decisor_id||null };
    supaJwtFig('/rest/v1/crm_logs', { method:'POST', headers:{'Prefer':'return=minimal'}, body:JSON.stringify(row) })
      .catch(function(e){ console.warn('[crm_logs] falha ao gravar log:', e.message); });
  }

  // ── normE164: normaliza número para E.164 Brasil (+55XXXXXXXXXXX) ─────────
  function normE164(raw) {
    if (!raw) return null;
    var digits = String(raw).replace(/\D/g,'');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return '+'+digits;
    if (digits.length === 10 || digits.length === 11) return '+55'+digits;
    if (digits.length > 7) return '+55'+digits;
    return raw; // não conseguiu normalizar, mantém original
  }

  // ── lushaCargoPriority: prioridade de cargos para seleção de decisores ─────
  // retorna: 2=marketing, 1=CEO/founder, 0=outros, -1=excluir
  function lushaCargoPriority(title) {
    var t = (title || '').toLowerCase();
    if (/\b(cfo|chief financial|finan[cç]|juridic|legal|rh\b|recursos humanos|human resource|operac|operation|supply chain|logistic|contabilid|accounti|tax|tribut)\b/.test(t)) return -1;
    if (/\b(cmo|chief marketing|market|growth|performanc|digital|brand|social|content|comunic|m[ií]dia|media|crm|inbound|outbound|demand gen|acquisition|retention|awareness|campanha|campaign)\b/.test(t)) return 2;
    if (/\b(ceo|chief executive|coo|chief operating|president|founder|co-founder|cofound|proprietar|owner|managing director|diretor geral|diretor presidente)\b/.test(t)) return 1;
    return 0;
  }

  // Carrega crm_empresas paginado (1000/página) até esgotamento — sem limite fixo
  useEffect(function() {
    var PAGE = 1000;
    (async function() {
      var m = {};
      var offset = 0;
      while (true) {
        var rows = await supaJwtFig(
          '/rest/v1/crm_empresas?select=id,nome,website,dominio,enriquecido_em,ultimo_toque_em&limit='+PAGE+'&offset='+offset
        ).catch(function(){ return []; });
        if (!Array.isArray(rows) || rows.length === 0) break;
        rows.forEach(function(r) { if (r.nome) m[r.nome.toLowerCase().trim()] = r; });
        if (rows.length < PAGE) break;
        offset += PAGE;
      }
      console.log('[supaEmpMap] carregadas', Object.keys(m).length, 'empresas');
      setSupaEmpMap(m);
    })();
  }, []);

  // ── Carrega contadores semanais + empresas com reunião marcada ────────────
  useEffect(function() {
    (async function() {
      var now = new Date();
      var sp = new Date(now.toLocaleString('en-US', {timeZone:'America/Sao_Paulo'}));
      var day = sp.getDay();
      var diff = day === 0 ? -6 : 1 - day;
      var mon = new Date(sp); mon.setDate(sp.getDate() + diff); mon.setHours(0,0,0,0);
      var offset = now.getTime() - sp.getTime();
      var monISO = new Date(mon.getTime() + offset).toISOString();

      supaJwtFig('/rest/v1/crm_toques?select=empresa_id,decisor_id,resultado&criado_em=gte.'+monISO+'&limit=2000')
        .then(function(rows) {
          if (!Array.isArray(rows)) return;
          var empSet = new Set(), decSet = new Set(), reunioes = 0;
          var reuniaoEmps = new Set();
          rows.forEach(function(r) {
            if (r.empresa_id) empSet.add(r.empresa_id);
            if (r.decisor_id) decSet.add(r.decisor_id);
            if (r.resultado === 'reuniao_marcada') { reunioes++; if (r.empresa_id) reuniaoEmps.add(r.empresa_id); }
          });
          setContadoresSemana({empresas:empSet.size, decisores:decSet.size, reunioes:reunioes});
          setReuniaoEmpIds(reuniaoEmps);
        }).catch(function(){});
    })();
  }, []);

  // ── Carrega decisores do Supabase quando empresa é selecionada ────────────
  useEffect(function() {
    if (!selEmpresa) { setSupaDecisores([]); return; }
    var empId = selEmpresa.empresa_id || null;
    if (!empId && supaEmpMap) {
      var row = supaEmpMap[(selEmpresa.nome||'').toLowerCase().trim()];
      if (row) empId = row.id;
    }
    if (!empId) { setSupaDecisores([]); return; }
    setSupaDecLoading(true);
    supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&status=eq.ativo&select=id,nome,cargo,email,wa,wa2,wa3,wa4,linkedin_url,criado_em,ultimo_toque_em&order=criado_em.desc')
      .then(function(rows) {
        var list = Array.isArray(rows) ? rows : [];
        setSupaDecisores(list);
        setSupaDecLoading(false);
        // Sincroniza cache local (elimina dados fictícios do localStorage)
        var k = curGrupo.id + '_' + selEmpresa.rank;
        setAccs(function(prev) {
          var ex = (prev||{})[k] || {decisors:[],sugeridos:[],activities:[]};
          var synced = Object.assign({}, ex, { decisors: list.map(function(r){ return {nome:r.nome||'',cargo:r.cargo||'',email:r.email||'',wa:r.wa||'',wa2:r.wa2||'',wa3:r.wa3||'',wa4:r.wa4||'',linkedin:r.linkedin_url||'',addedAt:(r.criado_em||'').slice(0,10)}; }) });
          var newAccs = Object.assign({}, prev||{}, {[k]: synced});
          lsSet('gh_decisores_v3', newAccs);
          return newAccs;
        });
      })
      .catch(function() { setSupaDecLoading(false); });
  }, [selEmpresa, supaEmpMap]);

  // ── Migração única: localStorage → Supabase (roda uma vez) ───────────────
  useEffect(function() {
    if (!supaEmpMap || !Object.keys(supaEmpMap).length) return;
    if (localStorage.getItem('gh_migration_ls_v1')) return;
    (async function() {
      var lsRaw;
      try { lsRaw = JSON.parse(localStorage.getItem('gh_decisores_v3') || '{}'); } catch(e) { lsRaw = {}; }
      var totalMigrated = 0, totalSkipped = 0;
      var prosp = (typeof PROSP !== 'undefined') ? PROSP : [];
      for (var key of Object.keys(lsRaw)) {
        var entry = lsRaw[key];
        var decisors = (entry && entry.decisors) || [];
        if (!decisors.length) continue;
        // key = `{grupoId}_{rank}` — extrair rank (último segmento)
        var parts = key.split('_');
        var rank = parseInt(parts[parts.length - 1], 10);
        if (!rank) continue;
        var prosp_e = prosp.find(function(e){ return e.rank === rank; });
        if (!prosp_e) continue;
        var supaRow = supaEmpMap[(prosp_e.nome||'').toLowerCase().trim()];
        if (!supaRow || !supaRow.id) continue;
        var empId = supaRow.id;
        // Verifica se empresa já tem decisores no Supabase
        var existing = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&status=eq.ativo&select=id,email,linkedin_url&limit=100').catch(function(){ return []; });
        if (!Array.isArray(existing)) existing = [];
        if (existing.length > 0) { totalSkipped += decisors.length; continue; }
        // Migra decisores sem contato real
        var existEmails = existing.map(function(r){ return (r.email||'').toLowerCase(); }).filter(Boolean);
        var now = new Date().toISOString();
        for (var dec of decisors) {
          // Pular sem contato real (email, wa ou linkedin)
          var liUrl = dec.li || dec.linkedin || '';
          if (!dec.email && !dec.wa && !liUrl) { totalSkipped++; continue; }
          // Dedup por email
          if (dec.email && existEmails.includes(dec.email.toLowerCase())) { totalSkipped++; continue; }
          var row = { empresa_id:empId, nome:dec.nome||'', cargo:dec.cargo||null, email:dec.email||null, wa:normE164(dec.wa)||null, wa2:normE164(dec.wa2)||null, linkedin_url:liUrl||null, fonte:'migrado_localStorage', status:'ativo', temperatura:0, wa_verificado:false, criado_em:now, atualizado_em:now };
          var nc = await supaJwtFig('/rest/v1/crm_decisores', { method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(row) }).catch(function(){ return null; });
          var newId = Array.isArray(nc) ? (nc[0]&&nc[0].id) : (nc&&nc.id);
          if (newId) { totalMigrated++; existEmails.push((dec.email||'').toLowerCase()); }
        }
      }
      if (totalMigrated > 0 || totalSkipped > 0) {
        logToSupabase('info', 'migração localStorage→Supabase: '+totalMigrated+' migrados, '+totalSkipped+' pulados', {totalMigrated, totalSkipped});
      }
      console.log('[Migration] LS→Supabase: '+totalMigrated+' migrados, '+totalSkipped+' pulados');
      localStorage.setItem('gh_migration_ls_v1', '1');
    })();
  }, [supaEmpMap]);

  const doLushaSearch = async (domain) => {
    setLushaDomain(domain);
    setLushaStep('loading');
    console.log('[Lusha] busca decisores — domínio:', domain);
    var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
    var resp = await fetch('/api/enrich?provider=lusha-search&domain='+encodeURIComponent(domain), {
      headers: {'Authorization':'Bearer '+jwt}
    }).then(function(r){return r.json();}).catch(function(e){return {error:String(e)};});

    if (resp.error || !Array.isArray(resp.contacts)) {
      var msg = resp.error || 'Erro inesperado na busca Lusha.';
      console.log('[Lusha] busca decisores — erro:', msg);
      setLushaError(msg);
      setLushaStep('idle');
      return;
    }
    console.log('[Lusha] busca decisores — retornou', resp.contacts.length, 'candidatos (total Lusha:', resp.total, ')');
    // Ordenar por prioridade de cargo: marketing > CEO/founder > outros; excluir CFO/legal/RH/ops
    var ranked = resp.contacts.map(function(c){ return Object.assign({}, c, {_pri: lushaCargoPriority(c.title)}); });
    ranked = ranked.filter(function(c){ return c._pri >= 0; });
    ranked.sort(function(a,b){ return b._pri - a._pri; });
    console.log('[Lusha] prioridade cargos —', ranked.map(function(c){ return (c.title||'?')+':'+c._pri; }).join(', '));
    if (!ranked.length) {
      var noMsg = resp.message || 'Nenhum CEO/CMO/Marketing encontrado para o domínio "'+domain+'" no Lusha.';
      setLushaError(noMsg);
      setLushaStep('idle');
      return;
    }
    setLushaCandidates(ranked);
    setLushaCredits(resp.credits || null);
    setLushaStep('select');
  };

  const normDomain = function(d) {
    return (d||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*/,'').replace(/^www\./,'');
  };

  const startLusha = async () => {
    if (!selEmpresa) return;
    setLushaOpen(true);
    setLushaStep('loading');
    setLushaError('');
    setLushaCandidates([]);
    setLushaSelected([]);
    setLushaResults([]);
    setLushaFoundDomain('');
    setLushaManualDomain('');
    setLushaDomain('');
    setLushaChecked([]);

    var emp = null;
    if (selEmpresa.empresa_id) {
      // Fast path: id já conhecido via supaEmpMap — sem roundtrip extra
      emp = { id: selEmpresa.empresa_id, nome: selEmpresa.nome, website: selEmpresa.website || null, dominio: selEmpresa.dominio || null };
      console.log('[Lusha startLusha] empresa_id direto:', emp.id);
    } else {
      // Fallback 1: exact match por nome
      var empRows = await supaJwtFig('/rest/v1/crm_empresas?nome=eq.'+encodeURIComponent(selEmpresa.nome)+'&select=id,nome,website,dominio&limit=1');
      emp = (Array.isArray(empRows) && empRows[0]) || null;
      // Fallback 2: ilike (diferença de caixa/acento)
      if (!emp) {
        empRows = await supaJwtFig('/rest/v1/crm_empresas?nome=ilike.'+encodeURIComponent(selEmpresa.nome)+'&select=id,nome,website,dominio&limit=1');
        emp = (Array.isArray(empRows) && empRows[0]) || null;
      }
      console.log('[Lusha startLusha] fallback nome, found:', emp ? 'id='+emp.id : 'null — query: nome=ilike.'+selEmpresa.nome);
    }
    setEmpresaSupa(emp);

    var domain = '';
    if (emp && emp.website) domain = normDomain(emp.website);
    else if (emp && emp.dominio) domain = normDomain(emp.dominio);

    // ── Bloco 1: descoberta de domínio (independente do bloco 2 e 3) ───────────
    var lushaDiscoveredDomain = '';
    if (!domain) {
      setLushaStep('discovering');
      console.log('[Lusha] domínio — iniciando descoberta para:', selEmpresa.nome);
      var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
      var dr = await fetch('/api/enrich?provider=lusha-domain', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt},
        body: JSON.stringify({company: selEmpresa.nome, empresaId: (emp && emp.id) || ''})
      }).then(function(r){return r.json();}).catch(function(e){return {error:String(e)};});

      if (dr.error) {
        console.log('[Lusha] domínio — erro na descoberta:', dr.error);
        setLushaError(dr.error);
        setLushaStep('idle');
        return;
      }
      if (!dr.domain) {
        console.log('[Lusha] domínio — não encontrado, pedindo entrada manual');
        setLushaStep('ask-domain');
        return;
      }
      domain = normDomain(dr.domain);
      lushaDiscoveredDomain = domain;
      setLushaFoundDomain(domain + ' (via ' + dr.source + ')');
      console.log('[Lusha] domínio — encontrado:', domain, '(fonte:', dr.source+')');

      // Fallback: se empresa ainda não achada pelo nome, tenta pelo domínio descoberto
      if (!emp) {
        var domEnc = encodeURIComponent('%'+domain+'%');
        var dRows = await supaJwtFig('/rest/v1/crm_empresas?website=ilike.'+domEnc+'&select=id,nome,website,dominio&limit=1')
          .catch(function(){ return []; });
        emp = (Array.isArray(dRows) && dRows[0]) || null;
        console.log('[Lusha] domínio — fallback website=ilike.%'+domain+'%:', emp ? 'id='+emp.id : 'não encontrado');
        if (emp) setEmpresaSupa(emp);
      }
    }

    // ── Bloco 2: atualizar domínio no banco (falha aqui NUNCA bloqueia busca) ─
    if (emp && emp.id && lushaDiscoveredDomain) {
      var storedDomain = emp.website ? normDomain(emp.website) : '';
      if (storedDomain !== lushaDiscoveredDomain) {
        supaJwtFig('/rest/v1/crm_empresas?id=eq.'+emp.id, {
          method:'PATCH', headers:{'Prefer':'return=minimal'},
          body: JSON.stringify({website: 'https://'+lushaDiscoveredDomain})
        }).then(function(){
          console.log('[Lusha] domínio — website atualizado no banco:', lushaDiscoveredDomain);
        }).catch(function(e){
          console.log('[Lusha] domínio — falha ao atualizar website (ignorado):', e.message);
        });
        // fire-and-forget: não await, não bloqueia bloco 3
      }
    }

    // ── Bloco 3: busca de decisores ────────────────────────────────────────────
    await doLushaSearch(domain);
  };

  const revealLusha = async () => {
    if (!lushaSelected.length) return;
    setLushaStep('revealing');
    var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
    var resp = await fetch('/api/enrich?provider=lusha-reveal', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt},
      body: JSON.stringify({contacts: lushaSelected})
    }).then(function(r){return r.json();}).catch(function(e){return {error:String(e)};});

    if (resp.error) { setLushaError(resp.error); setLushaStep('select'); return; }
    if (resp.credits != null) setLushaCredits(resp.credits);
    var results = resp.results || [];
    setLushaResults(results);
    setLushaChecked(results.map(function(){ return true; })); // todos marcados por padrão
    setLushaStep('done');
  };

  const batchSaveToSupa = async () => {
    var emp = empresaSupa;
    var empId = emp && emp.id;
    var now = new Date().toISOString();
    var toSaveCount = lushaResults.filter(function(_, i){ return lushaChecked[i]; }).length;
    console.log('[Lusha] cadastro — iniciando, empresa_id:', empId||'(não encontrado)', '| decisores selecionados:', toSaveCount);

    // Se empresa ainda não existe no banco, criar agora
    if (!empId) {
      var domain = lushaDomain || '';
      var newEmpRow = {
        nome: selEmpresa.nome,
        setor: selEmpresa.setor || null,
        website: domain ? 'https://'+domain : null,
        dominio: domain || null,
        fonte: 'lusha',
        criado_em: now,
        atualizado_em: now
      };
      console.log('[Lusha batchSave] criando empresa no banco:', newEmpRow);
      var created = await supaJwtFig('/rest/v1/crm_empresas', {
        method:'POST', headers:{'Prefer':'return=representation'},
        body: JSON.stringify(newEmpRow)
      }).catch(function(){ return null; });
      created = Array.isArray(created) ? created[0] : created;
      if (!created || !created.id) {
        setLushaError('Não foi possível criar empresa no banco. Verifique conexão e tente novamente.');
        return;
      }
      empId = created.id;
      setEmpresaSupa(created);
      setSupaEmpMap(function(prev){ var m=Object.assign({},prev); m[selEmpresa.nome.toLowerCase().trim()]=created; return m; });
      console.log('[Lusha batchSave] empresa criada, id='+empId);
    }

    setLushaStep('saving');

    var toSave = lushaResults.filter(function(_, i){ return lushaChecked[i]; });
    var saveResults = [];

    for (var i = 0; i < toSave.length; i++) {
      var result = toSave[i];
      var nome = (result.firstName+' '+result.lastName).trim();
      var qParts = [];
      if (result.email) qParts.push('email.eq.'+encodeURIComponent(result.email));
      if (result.linkedin_url) qParts.push('linkedin_url.eq.'+encodeURIComponent(result.linkedin_url));
      var existRows = [];
      var deupQuery = '';
      try {
        if (qParts.length) {
          deupQuery = 'empresa_id=eq.'+empId+'&or=('+qParts.join(',')+')'
          existRows = await supaJwtFig('/rest/v1/crm_decisores?'+deupQuery+'&select=id&limit=1');
        }
        if (!existRows || !existRows.length) {
          deupQuery = 'empresa_id=eq.'+empId+'&nome=ilike.'+encodeURIComponent(nome);
          existRows = await supaJwtFig('/rest/v1/crm_decisores?'+deupQuery+'&select=id&limit=1');
        }
        console.log('[Lusha batchSave] dedup:', deupQuery, '→', existRows&&existRows.length ? existRows[0].id : 'none');

        if (existRows && existRows.length && existRows[0].id) {
          var decId = existRows[0].id;
          var patch = { cargo:result.title||'', email:result.email||null, wa:normE164(result.wa)||null, linkedin_url:result.linkedin_url||null, atualizado_em:now };
          await supaJwtFig('/rest/v1/crm_decisores?id=eq.'+decId, { method:'PATCH', headers:{'Prefer':'return=minimal'}, body:JSON.stringify(patch) });
          saveResults.push(Object.assign({}, result, {saveStatus:'atualizado', decisorId:decId}));
          logToSupabase('info', 'decisor atualizado: '+nome, {cargo:result.title,email:result.email}, empId, decId);
        } else {
          var waE164 = normE164(result.wa) || null;
          var row = { empresa_id:empId, nome, cargo:result.title||'', email:result.email||null, wa:waE164, linkedin_url:result.linkedin_url||null, fonte:'lusha', status:'ativo', temperatura:0, wa_verificado:false, criado_em:now, atualizado_em:now };
          var created = await supaJwtFig('/rest/v1/crm_decisores', { method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(row) });
          var newDecId = (Array.isArray(created) && created[0] && created[0].id) || null;
          saveResults.push(Object.assign({}, result, {saveStatus:'criado', decisorId:newDecId, waE164}));
          logToSupabase('info', 'decisor criado: '+nome, {cargo:result.title,email:result.email,wa:waE164}, empId, newDecId);
          // Auto-elegível na Fila do dia
          if (newDecId && result.email) {
            supaJwtFig('/rest/v1/crm_fila', {
              method:'POST', headers:{'Prefer':'return=minimal'},
              body: JSON.stringify({ empresa_id:empId, decisor_id:newDecId, canal:'email', etapa_cadencia:1, etapa:'etapa1', status:'rascunho', gerado_em:now })
            }).catch(function(e){ console.warn('[crm_fila] erro ao inserir rascunho email:', e.message); });
          }
          if (newDecId && waE164) {
            supaJwtFig('/rest/v1/crm_fila', {
              method:'POST', headers:{'Prefer':'return=minimal'},
              body: JSON.stringify({ empresa_id:empId, decisor_id:newDecId, canal:'whatsapp', etapa_cadencia:1, etapa:'etapa1', status:'rascunho', gerado_em:now })
            }).catch(function(e){ console.warn('[crm_fila] erro ao inserir rascunho whatsapp:', e.message); });
          }
        }
      } catch(err) {
        saveResults.push(Object.assign({}, result, {saveStatus:'erro', saveMsg:String(err)}));
        logToSupabase('erro', 'erro ao salvar decisor: '+nome+' — '+String(err), {result}, empId);
      }
    }

    // Atualizar enriquecido_em na empresa
    await supaJwtFig('/rest/v1/crm_empresas?id=eq.'+empId, {
      method:'PATCH', headers:{'Prefer':'return=minimal'},
      body: JSON.stringify({enriquecido_em: now, atualizado_em: now})
    }).catch(function(){});

    // Recarregar decisores do Supabase → atualiza supaDecisores + accs cache
    var decRows = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&select=id,nome,cargo,email,wa,wa2,wa3,wa4,linkedin_url,criado_em&status=eq.ativo&order=criado_em.desc').catch(function(){ return []; });
    if (Array.isArray(decRows)) {
      setSupaDecisores(decRows);
      var k = curGrupo.id+'_'+selEmpresa.rank;
      setAccs(function(prev) {
        var ex = (prev||{})[k] || {decisors:[],sugeridos:[],activities:[]};
        var novoAcc = Object.assign({}, ex, { decisors: decRows.map(function(r){ return {nome:r.nome||'',cargo:r.cargo||'',email:r.email||'',wa:r.wa||'',wa2:r.wa2||'',wa3:r.wa3||'',wa4:r.wa4||'',linkedin:r.linkedin_url||'',addedAt:(r.criado_em||'').slice(0,10)}; }) });
        var newAccs = Object.assign({}, prev||{}, {[k]: novoAcc});
        lsSet('gh_decisores_v3', newAccs);
        return newAccs;
      });
    }

    var criados = saveResults.filter(function(r){ return r.saveStatus==='criado'; }).length;
    var atualizados = saveResults.filter(function(r){ return r.saveStatus==='atualizado'; }).length;
    var erros = saveResults.filter(function(r){ return r.saveStatus==='erro'; }).length;
    console.log('[Lusha] cadastro — concluído: criados='+criados+' atualizados='+atualizados+' erros='+erros);
    logToSupabase('info', 'enriquecimento concluído: criados='+criados+' atualizados='+atualizados+' erros='+erros, {empresa:selEmpresa.nome,criados,atualizados,erros}, empId);
    setLushaResults(saveResults);
    setLushaStep('saved');
  };

  // ── Enriquecimento em lote (fila, uma empresa por vez) ─────────────────────
  const startBatchLusha = async () => {
    if (selEmpresas.size === 0) return;
    var empList = filtradas.filter(function(e){ return selEmpresas.has(e.rank); });
    setBatchOpen(true);
    setBatchRunning(true);
    setBatchProgress(empList.map(function(e){ return {rank:e.rank, nome:e.nome, status:'aguardando'}; }));

    // Limite diário de revelações
    var cfgRow = await supaJwtFig('/rest/v1/crm_configuracoes?chave=eq.lusha_reveals_today&select=valor').catch(function(){ return []; });
    var cfg = (Array.isArray(cfgRow) && cfgRow[0] && cfgRow[0].valor) || {count:0,date:'1970-01-01'};
    var hoje = new Date().toISOString().slice(0,10);
    if (cfg.date !== hoje) cfg = {count:0, date:hoje};
    var limitRow = await supaJwtFig('/rest/v1/crm_configuracoes?chave=eq.lusha_daily_reveal_limit&select=valor').catch(function(){ return []; });
    var limit = (Array.isArray(limitRow) && limitRow[0] && Number(limitRow[0].valor)) || 60;
    var revealsUsed = cfg.count || 0;

    for (let idx = 0; idx < empList.length; idx++) {
      var emp = empList[idx];
      if (revealsUsed >= limit) {
        setBatchProgress(function(prev){
          var a = prev.slice(); a[idx] = Object.assign({}, a[idx], {status:'limite', msg:'Limite diário ('+limit+') atingido'});
          return a;
        });
        continue;
      }
      setBatchProgress(function(prev){ var a=prev.slice(); a[idx]=Object.assign({},a[idx],{status:'rodando'}); return a; });
      try {
        var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
        var supaRow = supaEmpMap[emp.nome.toLowerCase().trim()] || null;
        var domain = '';
        if (supaRow && supaRow.website) domain = normDomain(supaRow.website);
        else if (supaRow && supaRow.dominio) domain = normDomain(supaRow.dominio);
        if (!domain) {
          var dr = await fetch('/api/enrich?provider=lusha-domain', {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt},
            body: JSON.stringify({company:emp.nome, empresaId:(supaRow&&supaRow.id)||''})
          }).then(function(r){return r.json();}).catch(function(e){return {error:String(e)};});
          if (dr.domain) domain = normDomain(dr.domain);
        }
        if (!domain) {
          setBatchProgress(function(prev){ var a=prev.slice(); a[idx]=Object.assign({},a[idx],{status:'sem_dominio'}); return a; });
          continue;
        }
        // Busca de decisores — ordena por prioridade marketing, exclui CFO/legal/RH/ops
        var search = await fetch('/api/enrich?provider=lusha-search&domain='+encodeURIComponent(domain)+'&depts=marketing&max=5', {
          headers:{'Authorization':'Bearer '+jwt}
        }).then(function(r){return r.json();}).catch(function(e){return {error:String(e)};});
        var rawContacts = (search.contacts||[]).map(function(c){ return Object.assign({},c,{_pri:lushaCargoPriority(c.title)}); }).filter(function(c){ return c._pri>=0; });
        rawContacts.sort(function(a,b){ return b._pri-a._pri; });
        console.log('[Lusha batch] '+emp.nome+' — prioridade cargos:', rawContacts.map(function(c){ return (c.title||'?')+':'+c._pri; }).join(', ')||'nenhum');
        var contacts = rawContacts.slice(0,2);
        if (!contacts.length) {
          setBatchProgress(function(prev){ var a=prev.slice(); a[idx]=Object.assign({},a[idx],{status:'sem_contatos',domain:domain}); return a; });
          continue;
        }
        // Reveal (gasta créditos) — max 2
        var reveal = await fetch('/api/enrich?provider=lusha-reveal', {
          method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt},
          body: JSON.stringify({contacts:contacts})
        }).then(function(r){return r.json();}).catch(function(e){return {error:String(e)};});
        var results = reveal.results || [];
        revealsUsed += results.length;
        // Salvar no banco
        var empId = supaRow && supaRow.id;
        var now = new Date().toISOString();
        if (!empId) {
          var created = await supaJwtFig('/rest/v1/crm_empresas', {
            method:'POST', headers:{'Prefer':'return=representation'},
            body: JSON.stringify({nome:emp.nome, setor:emp.setor||null, website:'https://'+domain, dominio:domain, fonte:'lusha', criado_em:now, atualizado_em:now})
          }).catch(function(){ return null; });
          created = Array.isArray(created) ? created[0] : created;
          if (created && created.id) { empId = created.id; setSupaEmpMap(function(prev){ var m=Object.assign({},prev); m[emp.nome.toLowerCase().trim()]=created; return m; }); }
        }
        var criados = 0;
        if (empId) {
          for (var ri = 0; ri < results.length; ri++) {
            var r = results[ri];
            var nome2 = ((r.firstName||'')+' '+(r.lastName||'')).trim();
            var waE164b = normE164(r.wa)||null;
            // Dedup por email (e por nome como fallback)
            var existDec = [];
            if (r.email) existDec = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&email=eq.'+encodeURIComponent(r.email)+'&select=id&limit=1').catch(function(){ return []; });
            if (!existDec || !existDec.length) existDec = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&nome=ilike.'+encodeURIComponent(nome2)+'&select=id&limit=1').catch(function(){ return []; });
            if (existDec && existDec.length) { console.log('[Lusha batch] '+nome2+' já existe — pulado'); continue; }
            var row2 = { empresa_id:empId, nome:nome2, cargo:r.title||'', email:r.email||null, wa:waE164b, linkedin_url:r.linkedin_url||null, fonte:'lusha', status:'ativo', temperatura:0, wa_verificado:false, criado_em:now, atualizado_em:now };
            var nc = await supaJwtFig('/rest/v1/crm_decisores', { method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(row2) }).catch(function(){ return null; });
            var newId = (Array.isArray(nc)&&nc[0]&&nc[0].id)||null;
            if (newId) {
              criados++;
              if (r.email) supaJwtFig('/rest/v1/crm_fila',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({empresa_id:empId,decisor_id:newId,canal:'email',etapa_cadencia:1,etapa:'etapa1',status:'rascunho',gerado_em:now})}).catch(function(){});
              if (waE164b) supaJwtFig('/rest/v1/crm_fila',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({empresa_id:empId,decisor_id:newId,canal:'whatsapp',etapa_cadencia:1,etapa:'etapa1',status:'rascunho',gerado_em:now})}).catch(function(){});
            }
          }
          await supaJwtFig('/rest/v1/crm_empresas?id=eq.'+empId,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({enriquecido_em:now,atualizado_em:now})}).catch(function(){});
          logToSupabase('info','batch: '+criados+' decisores criados para '+emp.nome,{domain,criados},empId);
        }
        setBatchProgress(function(prev){ var a=prev.slice(); a[idx]=Object.assign({},a[idx],{status:'ok',criados:criados,domain:domain}); return a; });
        // Atualiza crm_configuracoes com contagem do dia
        supaJwtFig('/rest/v1/crm_configuracoes?chave=eq.lusha_reveals_today',{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({valor:JSON.stringify({count:revealsUsed,date:hoje}),atualizado_em:now})}).catch(function(){});
      } catch(err) {
        setBatchProgress(function(prev){ var a=prev.slice(); a[idx]=Object.assign({},a[idx],{status:'erro',msg:String(err)}); return a; });
        logToSupabase('erro','batch erro para '+emp.nome+': '+String(err),{empNome:emp.nome});
      }
    }
    setBatchRunning(false);
    setSelEmpresas(new Set());
  };

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
      // Filtros de toque
      var supaRow = supaEmpMap[(e.nome||'').toLowerCase().trim()];
      var utStr = supaRow && supaRow.ultimo_toque_em;
      var ut = utStr ? new Date(utStr) : null;
      var agora = Date.now();
      if (filtroToque === 'nunca' && ut) return false;
      if (filtroToque === 'esta_semana') {
        var now2 = new Date();
        var sp2 = new Date(now2.toLocaleString('en-US', {timeZone:'America/Sao_Paulo'}));
        var d2 = sp2.getDay(); var diff2 = d2===0?-6:1-d2;
        var mon2 = new Date(sp2); mon2.setDate(sp2.getDate()+diff2); mon2.setHours(0,0,0,0);
        var off2 = now2.getTime()-sp2.getTime();
        var monMs = mon2.getTime()+off2;
        if (!ut || ut.getTime() < monMs) return false;
      }
      if (filtroToque === 'sem_resposta_10') {
        if (!ut || (agora - ut.getTime()) < 10*86400000) return false;
      }
      if (filtroToque === 'reuniao_marcada') {
        var empId2 = supaRow && supaRow.id;
        if (!empId2 || !reuniaoEmpIds.has(empId2)) return false;
      }
      return true;
    }).sort((a, b) => b.score - a.score);
  }, [empresas, search, filtroSetor, filtroStatus, filtroToque, accs, supaEmpMap, reuniaoEmpIds]);

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
  const remover = async (empresa, dec, tipo) => {
    const k = curGrupo.id + "_" + empresa.rank;
    if (tipo === "verificado") {
      // Marcar inativo no Supabase (nunca delete)
      if (dec.id) {
        await supaJwtFig('/rest/v1/crm_decisores?id=eq.'+dec.id, {
          method:'PATCH', headers:{'Prefer':'return=minimal'},
          body: JSON.stringify({status:'inativo', atualizado_em: new Date().toISOString()})
        }).catch(function(e){ console.warn('[remover] erro ao inativar:', e.message); });
      }
      // Recarrega supaDecisores e sincroniza cache
      var empId = (selEmpresa && selEmpresa.empresa_id) || (supaEmpMap && supaEmpMap[(empresa.nome||'').toLowerCase().trim()] && supaEmpMap[(empresa.nome||'').toLowerCase().trim()].id) || null;
      if (empId) {
        var decRows = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&status=eq.ativo&select=id,nome,cargo,email,wa,wa2,wa3,wa4,linkedin_url,criado_em&order=criado_em.desc').catch(function(){ return []; });
        if (Array.isArray(decRows)) {
          setSupaDecisores(decRows);
          setAccs(function(prev) {
            var ex = (prev||{})[k] || {decisors:[],sugeridos:[],activities:[]};
            var novoAcc = Object.assign({}, ex, { decisors: decRows.map(function(r){ return {nome:r.nome||'',cargo:r.cargo||'',email:r.email||'',wa:r.wa||'',linkedin:r.linkedin_url||'',addedAt:(r.criado_em||'').slice(0,10)}; }) });
            var newAccs = Object.assign({}, prev||{}, {[k]: novoAcc});
            lsSet('gh_decisores_v3', newAccs);
            return newAccs;
          });
        }
      }
    } else {
      // Remove sugestão do localStorage
      const ex = (accs || {})[k] || { decisors:[], sugeridos:[], activities:[] };
      const novoAcc = { ...ex, sugeridos: (ex.sugeridos||[]).filter(d => normalizarNome(d.nome) !== normalizarNome(dec.nome)) };
      const newAccs = { ...(accs||{}), [k]: novoAcc };
      setAccs(newAccs);
      lsSet("gh_decisores_v3", newAccs);
    }
  };

  // ── painel direito: álbum de figurinhas ────────────────────────────────────
  const renderAlbum = () => {
    if (!selEmpresa) return null;
    const acc = getAcc(selEmpresa.rank);
    const verificados = supaDecisores; // fonte única: Supabase
    const sugeridos = acc.sugeridos || [];
    // Indicador de cobertura
    const cobEmail = verificados.filter(function(d){ return d.email; }).length;
    const cobCelular = verificados.filter(function(d){ return d.wa; }).length;
    const enriqEm = selEmpresa.enriquecido_em ? new Date(selEmpresa.enriquecido_em).toLocaleDateString('pt-BR') : null;
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
      empresaId: selEmpresa.empresa_id || (supaEmpMap && supaEmpMap[(selEmpresa.nome||'').toLowerCase().trim()] && supaEmpMap[(selEmpresa.nome||'').toLowerCase().trim()].id) || null,
      setor: selEmpresa.setor,
      clienteAtivo: selEmpresa.cliente_ativo || false,
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
        (async function() {
          var empId = (selEmpresa && selEmpresa.empresa_id) || null;
          if (!empId && supaEmpMap) {
            var sr = supaEmpMap[(selEmpresa.nome||'').toLowerCase().trim()];
            if (sr) empId = sr.id;
          }
          if (!empId) { alert('Empresa não encontrada no banco. Verifique a conexão e tente novamente.'); return; }
          var emailVal = fEmail.trim();
          var liVal = fLi.trim();
          // Dedup por email
          if (emailVal) {
            var exEmail = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&email=eq.'+encodeURIComponent(emailVal)+'&status=eq.ativo&select=id&limit=1').catch(function(){ return []; });
            if (Array.isArray(exEmail) && exEmail.length) { alert('Já existe um decisor com esse e-mail nesta empresa.'); return; }
          }
          // Dedup por LinkedIn
          if (liVal) {
            var exLi = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&linkedin_url=eq.'+encodeURIComponent(liVal)+'&status=eq.ativo&select=id&limit=1').catch(function(){ return []; });
            if (Array.isArray(exLi) && exLi.length) { alert('Já existe um decisor com esse LinkedIn nesta empresa.'); return; }
          }
          var now = new Date().toISOString();
          var row = { empresa_id:empId, nome:fNome.trim(), cargo:fCargo.trim()||null, email:emailVal||null, wa:normE164(fWa.trim())||null, wa2:normE164((fWa2||'').trim())||null, wa3:normE164((fWa3||'').trim())||null, linkedin_url:liVal||null, fonte:'manual', status:'ativo', temperatura:0, wa_verificado:false, criado_em:now, atualizado_em:now };
          var nc = await supaJwtFig('/rest/v1/crm_decisores', { method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(row) }).catch(function(e){ alert('Erro ao salvar: '+e.message); return null; });
          if (!nc) return;
          // Recarrega supaDecisores e sincroniza cache
          var k = curGrupo.id + '_' + selEmpresa.rank;
          var decRows = await supaJwtFig('/rest/v1/crm_decisores?empresa_id=eq.'+empId+'&status=eq.ativo&select=id,nome,cargo,email,wa,wa2,wa3,wa4,linkedin_url,criado_em&order=criado_em.desc').catch(function(){ return []; });
          if (Array.isArray(decRows)) {
            setSupaDecisores(decRows);
            setAccs(function(prev) {
              var ex = (prev||{})[k] || {decisors:[],sugeridos:[],activities:[]};
              var novoAcc = Object.assign({}, ex, { decisors: decRows.map(function(r){ return {nome:r.nome||'',cargo:r.cargo||'',email:r.email||'',wa:r.wa||'',linkedin:r.linkedin_url||'',addedAt:(r.criado_em||'').slice(0,10)}; }) });
              var newAccs = Object.assign({}, prev||{}, {[k]: novoAcc});
              lsSet('gh_decisores_v3', newAccs);
              return newAccs;
            });
          }
          setShowAdd(false);
          setFNome(""); setFCargo(""); setFEmail(""); setFWa(""); setFWa2(""); setFWa3(""); setFLi(""); setFIg(""); setFFb("");
        })();
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
    }, verificados.length > 0 ? `✓ ${verificados.length} verificado${verificados.length > 1 ? "s" : ""}` : "Sem verificados", sugeridos.length > 0 ? ` · ⟳ ${sugeridos.length} sugerido${sugeridos.length > 1 ? "s" : ""}` : ""),
    React.createElement("span", {style:{fontSize:9,color:"#555",fontFamily:"IBM Plex Mono,monospace",marginLeft:4}},
      cobEmail > 0 ? "✉ "+cobEmail : "",
      cobCelular > 0 ? "  📱 "+cobCelular : "",
      enriqEm ? "  · "+enriqEm : ""
    ))), /*#__PURE__*/React.createElement("button", {
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
    }, "+"), " Adicionar Decisor"),
    React.createElement("button", {
      onClick: startLusha,
      style: { padding:"8px 14px", borderRadius:7, border:"none", background:"#818CF8", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:6, marginLeft:8 }
    }, "🔍 Enriquecer via Lusha")),
    lushaOpen && React.createElement("div", {
      style: { position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" },
      onClick: function(e){ if(e.target===e.currentTarget){ setLushaOpen(false); setLushaStep('idle'); } }
    }, React.createElement("div", {
      style: { background:"#0d0d1a", border:"1px solid #2D2D44", borderRadius:12, padding:28, minWidth:340, maxWidth:560, width:"90%", maxHeight:"80vh", overflowY:"auto" }
    },
      React.createElement("div", {style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}},
        React.createElement("div", {style:{fontWeight:700,fontSize:15,color:"#818CF8"}}, "🔍 Enriquecer via Lusha — "+selEmpresa.nome),
        React.createElement("button", {onClick:function(){setLushaOpen(false);setLushaStep('idle');},style:{background:"none",border:"none",color:"#9B9BB4",fontSize:22,cursor:"pointer",lineHeight:1}}, "×")
      ),
      lushaError && React.createElement("div", {style:{background:"#2D1414",border:"1px solid #7f2020",borderRadius:8,padding:"10px 14px",marginBottom:16,color:"#FF6B6B",fontSize:12}}, lushaError),
      lushaFoundDomain && React.createElement("div", {style:{background:"#0f1a10",border:"1px solid #1a3a1a",borderRadius:8,padding:"8px 12px",marginBottom:12,color:"#34D399",fontSize:11,fontFamily:"IBM Plex Mono,monospace"}},
        "🌐 Domínio encontrado: "+lushaFoundDomain
      ),
      lushaStep==="discovering" && React.createElement("div", {style:{textAlign:"center",padding:"40px 0",color:"#818CF8",fontSize:13}}, "🔍 Descobrindo domínio de "+selEmpresa.nome+"…"),
      lushaStep==="ask-domain" && React.createElement("div", null,
        React.createElement("div", {style:{fontSize:12,color:"#9B9BB4",marginBottom:12}},
          "Não consegui descobrir o domínio de "+selEmpresa.nome+" automaticamente. Digite abaixo:"
        ),
        React.createElement("input", {
          type:"text", placeholder:"ex: ambev.com.br",
          value: lushaManualDomain,
          onChange: function(e){ setLushaManualDomain(e.target.value); },
          onKeyDown: function(e){ if(e.key==='Enter' && lushaManualDomain.trim()) doLushaSearch(lushaManualDomain.trim()); },
          style:{width:"100%",padding:"8px 12px",borderRadius:6,border:"1px solid #2D2D44",background:"#060606",color:"#F5F5F5",fontSize:12,fontFamily:"IBM Plex Mono,monospace",boxSizing:"border-box",marginBottom:12}
        }),
        React.createElement("div", {style:{display:"flex",gap:10}},
          React.createElement("button", {onClick:function(){setLushaOpen(false);setLushaStep('idle');},style:{padding:"9px 20px",borderRadius:7,border:"1px solid #2D2D44",background:"transparent",color:"#9B9BB4",fontSize:12,cursor:"pointer"}}, "Cancelar"),
          React.createElement("button", {
            onClick: function(){ if(lushaManualDomain.trim()) doLushaSearch(lushaManualDomain.trim()); },
            disabled: !lushaManualDomain.trim(),
            style:{padding:"9px 20px",borderRadius:7,border:"none",background:lushaManualDomain.trim()?"#818CF8":"#333",color:"#fff",fontSize:12,cursor:lushaManualDomain.trim()?"pointer":"default",fontWeight:700}
          }, "Buscar →")
        )
      ),
      lushaStep==="loading" && React.createElement("div", {style:{textAlign:"center",padding:"40px 0",color:"#818CF8",fontSize:13}}, "Buscando decisores no Lusha…"),
      lushaStep==="select" && React.createElement("div", null,
        React.createElement("div", {style:{fontSize:12,color:"#9B9BB4",marginBottom:4}},
          "Selecione até 5 para revelar e-mail e telefone (gasta créditos)."
        ),
        React.createElement("div", {style:{fontSize:10,color:"#555",marginBottom:12,fontFamily:"IBM Plex Mono,monospace"}},
          lushaCandidates.length+" encontrado"+(lushaCandidates.length===1?"":"s")+" — "+lushaSelected.length+"/5 selecionado"+(lushaSelected.length===1?"":"s")
        ),
        lushaCandidates.map(function(c,i){
          var sel = lushaSelected.some(function(s){return s.id===c.id;});
          return React.createElement("div", {
            key:c.id||i,
            onClick:function(){
              if(sel){ setLushaSelected(lushaSelected.filter(function(s){return s.id!==c.id;})); }
              else if(lushaSelected.length<5){ setLushaSelected(lushaSelected.concat([c])); }
            },
            style:{border:"1px solid "+(sel?"#818CF8":"#2D2D44"),background:sel?"#1a1a3a":"#111120",borderRadius:8,padding:"10px 14px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12}
          },
            React.createElement("div", {style:{width:18,height:18,borderRadius:4,border:"2px solid "+(sel?"#818CF8":"#444"),background:sel?"#818CF8":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff"}}, sel?"✓":""),
            React.createElement("div", {style:{flex:1}},
              React.createElement("div", {style:{fontWeight:600,fontSize:13,color:"#F5F5F5"}}, c.firstName+" "+c.lastName),
              c.title && React.createElement("div", {style:{fontSize:11,color:"#818CF8",marginTop:2}}, c.title),
              !c.title && React.createElement("div", {style:{fontSize:10,color:"#555",marginTop:3,fontFamily:"IBM Plex Mono,monospace"}}, "ID Lusha: "+c.id)
            )
          );
        }),
        React.createElement("div", {style:{display:"flex",gap:10,marginTop:18}},
          React.createElement("button", {onClick:function(){setLushaOpen(false);setLushaStep('idle');},style:{padding:"9px 20px",borderRadius:7,border:"1px solid #2D2D44",background:"transparent",color:"#9B9BB4",fontSize:12,cursor:"pointer"}}, "Cancelar"),
          React.createElement("button", {onClick:revealLusha,disabled:!lushaSelected.length,style:{padding:"9px 20px",borderRadius:7,border:"none",background:lushaSelected.length?"#818CF8":"#333",color:"#fff",fontSize:12,cursor:lushaSelected.length?"pointer":"default",fontWeight:700}},
            "Revelar "+lushaSelected.length+" selecionado"+(lushaSelected.length===1?"":"s")+" →"
          )
        )
      ),
      lushaStep==="revealing" && React.createElement("div", {style:{textAlign:"center",padding:"40px 0",color:"#818CF8",fontSize:13}}, "Revelando e salvando…"),
      lushaStep==="done" && React.createElement("div", null,
        React.createElement("div", {style:{fontSize:12,color:"#9B9BB4",marginBottom:4}},
          lushaResults.length+" decisor"+(lushaResults.length===1?"":"es")+" revelado"+(lushaResults.length===1?"":"s")+" — marque os que deseja cadastrar."
        ),
        lushaCredits != null && React.createElement("div", {style:{fontSize:10,color:lushaCredits<20?'#FF6B6B':'#555',marginBottom:12,fontFamily:"IBM Plex Mono,monospace"}},
          "Créditos restantes: "+lushaCredits+(lushaCredits<20?" ⚠":"")
        ),
        lushaResults.map(function(r,i){
          var checked = !!lushaChecked[i];
          return React.createElement("div", {
            key:i,
            onClick:function(){ setLushaChecked(function(prev){ var a=prev.slice(); a[i]=!a[i]; return a; }); },
            style:{border:"1px solid "+(checked?"#818CF8":"#2D2D44"),background:checked?"#1a1a3a":"#111120",borderRadius:8,padding:"10px 14px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"flex-start",gap:12}
          },
            React.createElement("div", {style:{width:18,height:18,borderRadius:4,border:"2px solid "+(checked?"#818CF8":"#444"),background:checked?"#818CF8":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",marginTop:2}}, checked?"✓":""),
            React.createElement("div", {style:{flex:1}},
              React.createElement("div", {style:{fontWeight:600,fontSize:13,color:"#F5F5F5"}}, r.firstName+" "+r.lastName),
              r.title && React.createElement("div", {style:{fontSize:11,color:"#818CF8",marginTop:2}}, r.title),
              React.createElement("div", {style:{fontSize:10,color:"#555",marginTop:4,display:"flex",flexDirection:"column",gap:2}},
                r.email && React.createElement("span", null, "✉ "+r.email+(r.emailType?' ('+r.emailType+')':'')),
                r.wa && React.createElement("span", null, "📱 "+r.wa),
                r.linkedin_url && React.createElement("span", null, "🔗 "+r.linkedin_url)
              ),
              r.error && React.createElement("div", {style:{fontSize:11,color:"#FF6B6B",marginTop:4}}, r.error)
            )
          );
        }),
        React.createElement("div", {style:{display:"flex",gap:10,marginTop:18}},
          React.createElement("button", {onClick:function(){setLushaOpen(false);setLushaStep('idle');},style:{padding:"9px 20px",borderRadius:7,border:"1px solid #2D2D44",background:"transparent",color:"#9B9BB4",fontSize:12,cursor:"pointer"}}, "Cancelar"),
          (function(){
            var n = lushaChecked.filter(Boolean).length;
            return React.createElement("button", {
              onClick: batchSaveToSupa,
              disabled: !n,
              style:{padding:"9px 20px",borderRadius:7,border:"none",background:n?"#818CF8":"#333",color:"#fff",fontSize:12,cursor:n?"pointer":"default",fontWeight:700}
            }, "Cadastrar selecionados ("+n+") →");
          })()
        )
      ),
      lushaStep==="saving" && React.createElement("div", {style:{textAlign:"center",padding:"40px 0",color:"#818CF8",fontSize:13}}, "Cadastrando decisores…"),
      lushaStep==="saved" && React.createElement("div", null,
        React.createElement("div", {style:{fontSize:13,color:"#34D399",marginBottom:14,fontWeight:600}},
          "✓ "+lushaResults.length+" decisor"+(lushaResults.length===1?"":"es")+" processado"+(lushaResults.length===1?"":"s")
        ),
        lushaResults.map(function(r,i){
          var statusColor = r.saveStatus==='criado'?"#34D399":r.saveStatus==='atualizado'?"#60A5FA":"#FF6B6B";
          var statusLabel = r.saveStatus==='criado'?"✓ criado":r.saveStatus==='atualizado'?"↻ atualizado":"✗ erro";
          return React.createElement("div", {
            key:i,
            style:{border:"1px solid #1a2a1a",background:"#0d150d",borderRadius:8,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}
          },
            React.createElement("div", {style:{flex:1}},
              React.createElement("div", {style:{fontWeight:600,fontSize:13,color:"#F5F5F5",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                React.createElement("span", null, r.firstName+" "+r.lastName),
                React.createElement("span", {style:{fontSize:11,color:statusColor,fontFamily:"IBM Plex Mono,monospace"}}, statusLabel)
              ),
              r.title && React.createElement("div", {style:{fontSize:11,color:"#818CF8",marginTop:2}}, r.title),
              r.saveMsg && React.createElement("div", {style:{fontSize:10,color:"#FF6B6B",marginTop:3}}, r.saveMsg)
            )
          );
        }),
        React.createElement("button", {
          onClick:function(){ setLushaOpen(false); setLushaStep('idle'); },
          style:{marginTop:16,padding:"9px 24px",borderRadius:7,border:"none",background:"#818CF8",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}
        }, "Concluir")
      )
    )),
    /*#__PURE__*/React.createElement("div", {
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
      style: {display:"flex",flexWrap:"wrap",gap:14,padding:"8px 0"}
    }, verificados.map((d, i) => {
      const acBase = curGrupo.color || "#6b64f3";
      const acRgb  = curGrupo.rgb  || "107,100,243";
      const phones = [d.wa,d.wa2,d.wa3,d.wa4].filter(Boolean);
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          width:190, minWidth:190,
          background:`linear-gradient(160deg,rgba(${acRgb},.22) 0%,#0d0d18 55%)`,
          border:`1px solid rgba(${acRgb},.28)`,
          borderRadius:15,
          boxShadow:`1px 5px 28px 0px rgba(${acRgb},.18)`,
          display:"flex", flexDirection:"column", alignItems:"center",
          paddingBottom:14, fontFamily:"IBM Plex Mono,monospace",
          position:"relative", overflow:"hidden"
        }
      },
      /*#__PURE__*/React.createElement("div", {style:{width:"60%",height:4,background:acBase,borderRadius:"0 0 10px 10px",marginBottom:16,boxShadow:`0 2px 8px rgba(${acRgb},.5)`}}),
      /*#__PURE__*/React.createElement("div", {style:{width:64,height:64,background:`rgba(${acRgb},.22)`,border:`1.5px solid rgba(${acRgb},.45)`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:acBase,letterSpacing:-1,marginBottom:10,boxShadow:`0 2px 12px rgba(${acRgb},.2)`}}, ini(d.nome)),
      /*#__PURE__*/React.createElement("div", {style:{textAlign:"center",paddingInline:10,marginBottom:2}},
        /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:"#F5F5F5",fontSize:13,lineHeight:1.25,letterSpacing:-.3,wordBreak:"break-word"}}, d.nome||"Sem nome")
      ),
      /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:`rgba(${acRgb},.75)`,fontWeight:500,textAlign:"center",paddingInline:8,marginBottom:10,lineHeight:1.3}},
        d.cargo||/*#__PURE__*/React.createElement("span",{style:{color:"#333",fontStyle:"italic"}},"sem cargo")
      ),
      /*#__PURE__*/React.createElement("div", {style:{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",paddingInline:8,marginBottom:10}},
        d.email&&/*#__PURE__*/React.createElement("span",{style:{fontSize:8,padding:"2px 7px",borderRadius:20,background:"rgba(255,255,255,.05)",color:"#666",border:"1px solid #222",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},title:d.email},"✉ ",d.email.split("@")[0]),
        !d.email&&/*#__PURE__*/React.createElement("span",{style:{fontSize:8,color:"#333",padding:"2px 7px",border:"1px solid #1a1a1a",borderRadius:20}},"sem email"),
        phones.map((p,pi)=>/*#__PURE__*/React.createElement("span",{key:pi,style:{fontSize:8,padding:"2px 7px",borderRadius:20,background:"rgba(37,211,102,.04)",color:"#25D366",border:"1px solid rgba(37,211,102,.15)"}},"💬 ",p))
      ),
      /*#__PURE__*/React.createElement("div", {style:{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center",paddingInline:8,marginBottom:8}},
        d.email&&/*#__PURE__*/React.createElement("a",{href:"https://mail.google.com/mail/?view=cm&to="+encodeURIComponent(d.email),target:"_blank",style:{padding:"5px 10px",borderRadius:7,background:`rgba(${acRgb},.18)`,border:`1px solid rgba(${acRgb},.28)`,color:acBase,fontSize:9,fontWeight:700,textDecoration:"none",cursor:"pointer"}},"✉ Email"),
        phones.map((p,pi)=>{var n=(p||"").replace(/[^0-9]/g,"");var num=n.startsWith("55")&&n.length>=12?n:"55"+n;return /*#__PURE__*/React.createElement("a",{key:pi,href:"https://wa.me/"+num,target:"_blank",style:{padding:"5px 10px",borderRadius:7,background:"rgba(37,211,102,.12)",border:"1px solid rgba(37,211,102,.22)",color:"#25D366",fontSize:9,fontWeight:700,textDecoration:"none",cursor:"pointer"}},"💬 WA"+(phones.length>1?" "+(pi+1):""));}),
        (d.linkedin_url||d.linkedin)&&/*#__PURE__*/React.createElement("a",{href:(d.linkedin_url||d.linkedin).startsWith("http")?(d.linkedin_url||d.linkedin):"https://"+(d.linkedin_url||d.linkedin),target:"_blank",style:{padding:"5px 10px",borderRadius:7,background:"rgba(10,102,194,.12)",border:"1px solid rgba(10,102,194,.22)",color:"#0A66C2",fontSize:9,fontWeight:700,textDecoration:"none",cursor:"pointer"}},"💼 LI")
      ),
      d.ultimo_toque_em&&/*#__PURE__*/React.createElement("div",{style:{fontSize:8,color:"#4B4B6A",fontFamily:"'IBM Plex Mono',monospace",textAlign:"center",paddingInline:8,marginBottom:4,marginTop:-4}},
        'Último toque: '+new Date(d.ultimo_toque_em).toLocaleDateString('pt-BR')
      ),
      /*#__PURE__*/React.createElement("div", {style:{display:"flex",gap:5,paddingInline:8,borderTop:"1px solid rgba(255,255,255,.04)",paddingTop:8,width:"100%",boxSizing:"border-box",justifyContent:"center"}},
        /*#__PURE__*/React.createElement("button",{onClick:()=>setAbordagemDec(d),style:{flex:2,padding:"5px 0",borderRadius:7,border:".5px solid rgba(255,107,43,.4)",background:"rgba(255,107,43,.1)",color:"#FF6B2B",cursor:"pointer",fontSize:9,fontWeight:700}},"📨 Abordar"),
        /*#__PURE__*/React.createElement("button",{onClick:()=>remover(selEmpresa,d,"verificado"),style:{padding:"5px 8px",borderRadius:7,border:".5px solid rgba(255,71,87,.2)",background:"rgba(255,71,87,.08)",color:"#FF4757",cursor:"pointer",fontSize:11}},"×")
      ));
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
    }, "+"), " Adicionar Decisor"),
    React.createElement("button", {
      onClick: startLusha,
      style: { padding:"12px 22px", borderRadius:8, border:"none", background:"#818CF8", color:"#fff", fontSize:13, cursor:"pointer", fontWeight:700, display:"inline-flex", alignItems:"center", gap:8, marginTop:10 }
    }, "🔍 Enriquecer via Lusha"))));
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
  }, emailPopover && React.createElement(EmailPopover, { empresa: emailPopover, accs: accs, setAccs: setAccs, curGrupoId: curGrupo.id, onClose: function(){ setEmailPopover(null); } }),
  batchOpen && React.createElement("div", {
    style: { position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.8)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }
  }, React.createElement("div", {
    style: { background:"#0d0d1a", border:"1px solid #2D2D44", borderRadius:12, padding:24, minWidth:360, maxWidth:520, width:"90%", maxHeight:"75vh", overflowY:"auto" }
  },
    React.createElement("div", {style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}},
      React.createElement("div", {style:{fontWeight:700,fontSize:14,color:"#818CF8"}}, "⚡ Enriquecimento em lote"),
      !batchRunning && React.createElement("button", {
        onClick: function(){ setBatchOpen(false); setBatchProgress([]); },
        style: { background:"none", border:"none", color:"#9B9BB4", fontSize:20, cursor:"pointer" }
      }, "×")
    ),
    batchRunning && React.createElement("div", {style:{fontSize:10,color:"#9B9BB4",fontFamily:"IBM Plex Mono,monospace",marginBottom:12}},
      "Processando... Não feche esta janela."
    ),
    React.createElement("div", {style:{display:"flex",flexDirection:"column",gap:6}},
      batchProgress.map(function(row, idx){
        var icon = row.status==='ok' ? "✅" : row.status==='erro' ? "❌" : row.status==='limite' ? "⛔" : row.status==='sem_dominio' ? "🔍" : row.status==='sem_contatos' ? "💤" : row.status==='rodando' ? "⏳" : "⬜";
        var label = row.status==='ok' ? (row.criados+" criados, domínio: "+(row.domain||'?'))
          : row.status==='erro' ? (row.msg||'erro')
          : row.status==='limite' ? "limite diário atingido"
          : row.status==='sem_dominio' ? "domínio não encontrado"
          : row.status==='sem_contatos' ? "sem contatos (domínio: "+(row.domain||'?')+")"
          : row.status==='rodando' ? "processando..."
          : "aguardando";
        return React.createElement("div", {key:idx, style:{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#111827",borderRadius:7,fontSize:11}},
          React.createElement("span", {style:{fontSize:13}}, icon),
          React.createElement("span", {style:{flex:1,fontWeight:500,color:"#F5F5F5",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}, row.nome),
          React.createElement("span", {style:{fontSize:9,color:"#555",fontFamily:"IBM Plex Mono,monospace",whiteSpace:"nowrap"}}, label)
        );
      })
    ),
    (function(){ var allDone = !batchRunning && batchProgress.length > 0 && batchProgress.every(function(row){ return row.status !== 'rodando' && row.status !== 'aguardando'; }); return allDone && React.createElement("button", { onClick: function(){ setBatchOpen(false); setBatchProgress([]); }, style: { marginTop:16, padding:"8px 24px", borderRadius:7, border:"none", background:"#818CF8", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:700, width:"100%" } }, "Fechar"); })()
  )),
  showAddEmp && /*#__PURE__*/React.createElement("div", {
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
  }, React.createElement("div", {style:{display:"flex",gap:16,marginBottom:10,padding:"8px 0",borderBottom:".5px solid #111"}},
    [
      {label:'Empresas tocadas', val:contadoresSemana.empresas, cor:'#60A5FA'},
      {label:'Decisores tocados', val:contadoresSemana.decisores, cor:'#818CF8'},
      {label:'Reuniões marcadas', val:contadoresSemana.reunioes, cor:'#34D399', meta:40},
    ].map(function(c){
      return React.createElement("div",{key:c.label,style:{display:'flex',flexDirection:'column',gap:2}},
        React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:18,fontWeight:700,color:c.cor}},
          c.val, c.meta ? React.createElement('span',{style:{fontSize:10,color:'#555',fontWeight:400}},' / '+c.meta) : null),
        React.createElement("span",{style:{fontFamily:'IBM Plex Mono,monospace',fontSize:8,color:'#555'}},c.label+' esta semana')
      );
    })
  ), /*#__PURE__*/React.createElement("div", {
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
    onClick: () => { setFiltroStatus(v); setSelEmpresas(new Set()); },
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
  }, l))), /*#__PURE__*/React.createElement("div", {style:{display:"flex",gap:4,flexWrap:"wrap"}},
    [
      ["todos","Todos toques"],
      ["nunca","Nunca abordada"],
      ["esta_semana","Esta semana"],
      ["sem_resposta_10","Sem resp. +10d"],
      ["reuniao_marcada","Reunião marcada"]
    ].map(function(pair){
      var v=pair[0], l=pair[1];
      return React.createElement("button",{key:v,onClick:function(){setFiltroToque(v);},style:{
        padding:"5px 10px",borderRadius:100,border:".5px solid",fontSize:9,fontFamily:"IBM Plex Mono,monospace",cursor:"pointer",
        borderColor:filtroToque===v?"#FBBF24":"#2D2D44",
        background:filtroToque===v?"rgba(251,191,36,.1)":"transparent",
        color:filtroToque===v?"#FBBF24":"#9B9BB4"
      }},l);
    })
  ), filtroStatus === 'sem' && React.createElement("button", {
      onClick: function(){ setSelEmpresas(function(prev){ return prev.size === filtradas.length ? new Set() : new Set(filtradas.map(function(x){ return x.rank; })); }); },
      style: { padding:"4px 10px", borderRadius:6, border:".5px solid #818CF8", background:"transparent", color:"#818CF8", fontSize:9, fontFamily:"IBM Plex Mono,monospace", cursor:"pointer", flexShrink:0 }
    }, selEmpresas.size === filtradas.length ? "✕ Limpar" : "☐ Todas"), filtroStatus === 'sem' && selEmpresas.size > 0 && React.createElement("button", {
      onClick: function(){ startBatchLusha(); },
      style: { padding:"5px 12px", borderRadius:6, border:"none", background:"#818CF8", color:"#fff", fontSize:10, fontFamily:"IBM Plex Mono,monospace", fontWeight:700, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }
    }, "⚡ Enriquecer "+selEmpresas.size+" selecionadas"))), /*#__PURE__*/React.createElement("div", {
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
      onClick: () => {
        var supaRow = supaEmpMap[e.nome.toLowerCase().trim()] || null;
        setSelEmpresa(Object.assign({}, e, supaRow ? {empresa_id: supaRow.id, website: supaRow.website, dominio: supaRow.dominio, enriquecido_em: supaRow.enriquecido_em, ultimo_toque_em: supaRow.ultimo_toque_em} : {}));
      },
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
    }, filtroStatus === 'sem' && React.createElement("input", {
      type: "checkbox",
      checked: selEmpresas.has(e.rank),
      onChange: function(ev){ ev.stopPropagation(); setSelEmpresas(function(prev){ var s=new Set(prev); s.has(e.rank)?s.delete(e.rank):s.add(e.rank); return s; }); },
      onClick: function(ev){ ev.stopPropagation(); },
      style: { width:14, height:14, accentColor:"#818CF8", cursor:"pointer", flexShrink:0 }
    }), /*#__PURE__*/React.createElement("div", {
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
    }, e.setor), (function(){
      var sr = supaEmpMap[(e.nome||'').toLowerCase().trim()];
      var ut = sr && sr.ultimo_toque_em;
      if (!ut) return React.createElement('div',{style:{fontSize:8,color:'#333',fontFamily:'IBM Plex Mono,monospace',marginTop:2}},'nunca abordada');
      var dias = Math.floor((Date.now()-new Date(ut).getTime())/86400000);
      var utStr = new Date(ut).toLocaleDateString('pt-BR');
      return React.createElement('div',{style:{fontSize:8,color:dias>10?'#EF9F27':'#4B4B6A',fontFamily:'IBM Plex Mono,monospace',marginTop:2}},
        'último toque: '+utStr+' ('+dias+'d)');
    })(), (e.website || e.site) && /*#__PURE__*/React.createElement("a", {
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

  // Carrega do Supabase na montagem (requer sessão após auth gate restaurado)
  React.useEffect(() => {
    if (typeof window.__kanbanLoadAll !== 'function') return;
    window.__kanbanLoadAll().then(function(supData) {
      if (!supData) return;
      var total = (supData.gaia || []).length + (supData.holding || []).length;
      if (total === 0) return;
      setData(supData);
      // Cache local para acesso offline
      try { localStorage.setItem(HP_STORAGE, JSON.stringify(supData)); } catch(e) {}
      // Também popula gh_kanban_v3 no formato legado (usado por block_diario.js)
      if (typeof window.__kanbanToLegacyFormat === 'function') {
        try {
          var legacy = window.__kanbanToLegacyFormat(supData);
          localStorage.setItem('gh_kanban_v3', JSON.stringify(legacy));
        } catch(e) {}
      }
    });
  }, []);

  const persist = (newData, changedCard, changedTab) => {
    setData(newData);
    hpSave(newData);
    // Sync para Supabase em background (requer sessão; silencioso se sem sessão)
    if (changedCard && changedTab && typeof window.__kanbanUpsertCard === 'function') {
      window.__kanbanUpsertCard(changedTab, changedCard);
    }
  };
  const updateRow = (id, changes) => {
    const updated = { ...rows.find(r => r.id === id), ...changes, updatedAt: new Date().toLocaleDateString('pt-BR') };
    const newRows = rows.map(r => r.id === id ? updated : r);
    persist({ ...data, [aba]: newRows }, updated, aba);
  };
  const deleteRow = id => {
    if (!window.confirm('Remover empresa do pipeline diário?')) return;
    persist({ ...data, [aba]: rows.filter(r => r.id !== id) });
  };
  const addRow = row => {
    const newCard = { ...row, id: hpId(), updatedAt: new Date().toLocaleDateString('pt-BR') };
    persist({ ...data, [aba]: [...rows, newCard] }, newCard, aba);
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
  }, "+ Adicionar"), /*#__PURE__*/React.createElement("button", {
    title: "Exportar backup do localStorage",
    onClick: () => {
      try {
        const dump = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) { try { dump[k] = JSON.parse(localStorage.getItem(k)); } catch { dump[k] = localStorage.getItem(k); } }
        }
        const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
        const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `galeria-holding-backup-${ts}.json`; a.click();
        URL.revokeObjectURL(url);
      } catch(e) { alert('Erro ao exportar: ' + e.message); }
    },
    style: {
      padding: '6px 12px',
      borderRadius: 8,
      border: '.5px solid #2D2D44',
      background: '#1A1A2E',
      color: '#9B9BB4',
      fontSize: 11,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer'
    }
  }, "📤 Backup")), /*#__PURE__*/React.createElement("div", {
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
