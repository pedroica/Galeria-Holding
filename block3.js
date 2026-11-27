const {
  useState,
  useMemo,
  useEffect,
  useCallback
} = React;

// Detecta retorno do OAuth Graph (callback tratado no servidor, redireciona com ?graph_connected=1)
(function() {
  try {
    var p = new URLSearchParams(window.location.search);
    if (p.get('graph_connected') === '1') {
      localStorage.setItem('gh_graph_connected', '1');
      history.replaceState({}, '', window.location.pathname);
    }
    if (p.get('graph_admin_ok') === '1') {
      localStorage.setItem('gh_graph_admin_ok', '1');
    }
    if (p.get('graph_error')) {
      localStorage.setItem('gh_graph_error', p.get('graph_error'));
      history.replaceState({}, '', window.location.pathname);
    }
    // Retorno do Google (Gmail): mesmo esquema, vai para a aba SDR.
    if (p.get('gmail_connected') === '1') { localStorage.setItem('gh_gmail_ok', '1'); history.replaceState({}, '', window.location.pathname); }
    if (p.get('gmail_error')) { localStorage.setItem('gh_gmail_error', p.get('gmail_error')); history.replaceState({}, '', window.location.pathname); }
  } catch(e) {}
})();

window.__addToKanbanV2 = null;
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
// sharedGet/Set e personalGet/Set agora vêm de gh-store.js (carregado antes)

// ── Bloco 1: GerarFilaModal ──────────────────────────────────────────────────
var AGENCIAS_GERAR = [
  {id:'3409ab82-f0cd-4d95-b6e2-398995425411', nome:'Galeria Holding', slug:'holding'},
  {id:'960142b5-a688-41f8-8719-d516eeb843c6', nome:'Galeria', slug:'galeria'},
  {id:'14a057af-31c6-4606-8236-4c97d8067335', nome:'404', slug:'404'},
  {id:'e8d734ba-b3e9-425b-942e-b8b56c98f56b', nome:'Caramelo', slug:'cccaramelo'},
  {id:'74886b76-2650-41e1-8d46-3c742681fadd', nome:'Catalyst', slug:'catalyst'},
  {id:'b0473d79-afd9-404e-8784-04b4556a5a2c', nome:'Milà', slug:'mila'},
  {id:'a8aecdac-1001-4643-bcd4-e818307b6d92', nome:'GaIA', slug:'gaia'},
];
// ── Bloco 2: TemplatesView ────────────────────────────────────────────────────
function TemplatesView() {
  var _templates = useState([]); var templates = _templates[0]; var setTemplates = _templates[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _agFiltro = useState(AGENCIAS_GERAR[0].id); var agFiltro = _agFiltro[0]; var setAgFiltro = _agFiltro[1];
  var _editId = useState(null); var editId = _editId[0]; var setEditId = _editId[1];
  var _editCorpo = useState(''); var editCorpo = _editCorpo[0]; var setEditCorpo = _editCorpo[1];
  var _editAssunto = useState(''); var editAssunto = _editAssunto[0]; var setEditAssunto = _editAssunto[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _prevEmp = useState(null); var prevEmp = _prevEmp[0]; var setPrevEmp = _prevEmp[1];
  var _prevDec = useState(null); var prevDec = _prevDec[0]; var setPrevDec = _prevDec[1];
  var mono = 'IBM Plex Mono,monospace';
  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:mono};

  useEffect(function() {
    supaFetch('/rest/v1/crm_templates?tipo=eq.prospeccao&order=agencia_id.asc,canal.asc,etapa.asc').then(function(d) {
      setTemplates(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
    supaFetch('/rest/v1/crm_empresas?apagado_em=is.null&select=id,nome,setor&order=nome.asc&limit=1').then(function(d) {
      if (Array.isArray(d) && d.length > 0) {
        setPrevEmp(d[0]);
        supaFetch('/rest/v1/crm_decisores?empresa_id=eq.'+d[0].id+'&status=eq.ativo&apagado_em=is.null&limit=1').then(function(ds) {
          if (Array.isArray(ds) && ds.length > 0) setPrevDec(ds[0]);
        });
      }
    });
  }, []);

  function wc(txt) { return (txt||'').trim().split(/\s+/).filter(function(w){return w.length>0;}).length; }

  function prevText(corpo) {
    if (!prevEmp) return corpo;
    var pn = prevDec ? (prevDec.nome||'').split(' ')[0] : '{primeiro_nome}';
    var cargo = prevDec ? (prevDec.cargo||'{cargo}') : '{cargo}';
    var ag = AGENCIAS_GERAR.find(function(a){return a.id===agFiltro;});
    var setor = setorGerar(prevEmp);
    return corpo
      .replace(/{primeiro_nome}/g,pn).replace(/{empresa}/g,prevEmp.nome||'')
      .replace(/{cargo}/g,cargo).replace(/{setor}/g,setor)
      .replace(/{agencia}/g,ag?ag.nome:'Galeria Holding');
  }

  function startEdit(t) { setEditId(t.id); setEditCorpo(t.corpo); setEditAssunto(t.assunto||''); }
  function cancelEdit() { setEditId(null); }
  function saveEdit() {
    setSaving(true);
    var jwt = (window.__supaSession&&window.__supaSession.access_token)||SUPA_ANON;
    fetch(SUPA_URL+'/rest/v1/crm_templates?id=eq.'+editId, {
      method:'PATCH',
      headers:{'apikey':SUPA_ANON,'Authorization':'Bearer '+jwt,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({corpo:editCorpo,assunto:editAssunto||null,atualizado_em:new Date().toISOString()})
    }).then(function() {
      setTemplates(function(prev){return prev.map(function(t){return t.id===editId?Object.assign({},t,{corpo:editCorpo,assunto:editAssunto||null}):t;});});
      setSaving(false); setEditId(null);
    }).catch(function(){setSaving(false);});
  }
  function toggleAtivo(t) {
    var jwt = (window.__supaSession&&window.__supaSession.access_token)||SUPA_ANON;
    fetch(SUPA_URL+'/rest/v1/crm_templates?id=eq.'+t.id, {
      method:'PATCH',
      headers:{'apikey':SUPA_ANON,'Authorization':'Bearer '+jwt,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({ativo:!t.ativo,atualizado_em:new Date().toISOString()})
    }).then(function() {
      setTemplates(function(prev){return prev.map(function(tt){return tt.id===t.id?Object.assign({},tt,{ativo:!tt.ativo}):tt;});});
    });
  }

  var tplsFiltrados = templates.filter(function(t){return t.agencia_id===agFiltro;});
  var canais = ['email','whatsapp','linkedin','ligacao'];
  var canaisLbl = {email:'Email',whatsapp:'WhatsApp',linkedin:'LinkedIn',ligacao:'Ligação'};
  var WORD_LIMITS = {'email:1':90,'email:2':50,'whatsapp:1':60,'whatsapp:2':60};
  var CHAR_LIMITS = {'linkedin:1':280};

  if (loading) return React.createElement("div",{style:{padding:24,color:'#555',fontFamily:mono,fontSize:11}},'Carregando templates…');

  return React.createElement("div",{style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',padding:'16px 20px',gap:10}},
    React.createElement("div",{style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',flexShrink:0}},
      AGENCIAS_GERAR.map(function(ag) {
        var active = ag.id===agFiltro;
        return React.createElement("button",{key:ag.id,onClick:function(){setAgFiltro(ag.id);setEditId(null);},
          style:{padding:'4px 10px',borderRadius:6,border:'.5px solid '+(active?'#FF6B2B44':'#1A1A2E'),background:active?'#FF6B2B22':'transparent',color:active?'#FF6B2B':'#555',fontSize:10,fontFamily:mono,cursor:'pointer'}
        },ag.nome);
      })
    ),
    prevEmp && React.createElement("div",{style:{fontSize:9,color:'#555',fontFamily:mono,flexShrink:0}},
      'Preview: '+prevEmp.nome+(prevDec?' · '+prevDec.nome:'')+(prevEmp.setor?' · '+prevEmp.setor:'')
    ),
    React.createElement("div",{style:{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:14}},
      canais.map(function(canal) {
        var tplsC = tplsFiltrados.filter(function(t){return t.canal===canal;}).sort(function(a,b){return parseInt(a.etapa,10)-parseInt(b.etapa,10);});
        if (!tplsC.length) return null;
        return React.createElement("div",{key:canal},
          React.createElement("div",{style:{fontFamily:mono,fontSize:9,color:'#818CF8',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:8}},canaisLbl[canal]||canal),
          tplsC.map(function(t) {
            var isEdit = editId===t.id;
            var limW = WORD_LIMITS[canal+':'+t.etapa];
            var limC = CHAR_LIMITS[canal+':'+t.etapa];
            var corpo = isEdit ? editCorpo : t.corpo;
            var overLim = limW ? wc(corpo)>limW : (limC ? corpo.length>limC : false);
            return React.createElement("div",{key:t.id,style:{background:'#0D0D1A',border:'.5px solid '+(isEdit?'#818CF8':'#1A1A2E'),borderRadius:8,padding:'12px 14px',marginBottom:6,opacity:t.ativo?1:0.5}},
              React.createElement("div",{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
                React.createElement("div",{style:{display:'flex',alignItems:'center',gap:8}},
                  React.createElement("span",{style:{fontSize:11,fontWeight:600,color:'#F5F5F5',fontFamily:mono}},'Etapa '+t.etapa),
                  !t.ativo && React.createElement("span",{style:{fontSize:9,color:'#F87171',fontFamily:mono}},'desativado')
                ),
                !isEdit && React.createElement("div",{style:{display:'flex',gap:8}},
                  React.createElement("button",{onClick:function(){startEdit(t);},style:{fontSize:9,color:'#60A5FA',background:'none',border:'none',cursor:'pointer',fontFamily:mono}},'editar'),
                  React.createElement("button",{onClick:function(){toggleAtivo(t);},style:{fontSize:9,color:t.ativo?'#F87171':'#34D399',background:'none',border:'none',cursor:'pointer',fontFamily:mono}},t.ativo?'desativar':'ativar')
                )
              ),
              !isEdit && canal==='email' && t.assunto && React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',fontFamily:mono,marginBottom:6,paddingBottom:6,borderBottom:'.5px solid #1A1A2E'}},'Assunto: '+t.assunto),
              isEdit && React.createElement("div",{style:{display:'flex',flexDirection:'column',gap:8}},
                canal==='email' && React.createElement("div",null,
                  React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Assunto'),
                  React.createElement("input",{style:inp,value:editAssunto,onChange:function(e){var v=e.target.value;setEditAssunto(v);}})
                ),
                React.createElement("div",null,
                  React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Corpo'),
                  React.createElement("textarea",{style:Object.assign({},inp,{height:120,resize:'vertical',lineHeight:1.5}),value:editCorpo,onChange:function(e){var v=e.target.value;setEditCorpo(v);}})
                ),
                React.createElement("div",{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
                  React.createElement("div",{style:{display:'flex',gap:8}},
                    React.createElement("button",{onClick:saveEdit,disabled:saving||overLim,style:{padding:'4px 12px',borderRadius:5,border:'none',background:overLim?'#444':'#FF6B2B',color:'#fff',fontSize:10,fontFamily:mono,cursor:overLim?'not-allowed':'pointer'}},saving?'…':'Salvar'),
                    React.createElement("button",{onClick:cancelEdit,style:{padding:'4px 10px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:10,fontFamily:mono,cursor:'pointer'}},'Cancelar')
                  ),
                  React.createElement("span",{style:{fontSize:9,fontFamily:mono,color:overLim?'#F87171':'#555'}},
                    limC ? (editCorpo.length+'/'+limC+' chars') : (limW ? (wc(editCorpo)+'/'+limW+' palavras') : (wc(editCorpo)+' palavras'))
                  )
                )
              ),
              !isEdit && React.createElement("div",null,
                React.createElement("pre",{style:{fontSize:10,color:'#9B9BB4',margin:0,whiteSpace:'pre-wrap',fontFamily:mono,lineHeight:1.5,maxHeight:90,overflow:'hidden'}},
                  prevText(t.corpo).slice(0,280)+(prevText(t.corpo).length>280?'…':'')
                ),
                React.createElement("div",{style:{fontSize:9,fontFamily:mono,color:overLim?'#F87171':'#555',marginTop:4}},
                  limC ? (t.corpo.length+'/'+limC+' chars') : (limW ? (wc(t.corpo)+'/'+limW+' palavras') : (wc(t.corpo)+' palavras'))
                )
              )
            );
          })
        );
      })
    )
  );
}

// Template fixo até o Bloco 2 (crm_templates) existir — agora usado como fallback quando tabela vazia
var TEMPLATE_GERAR = {
  email: {
    etapa1: { assunto:'{empresa} + Galeria Holding — 20 minutos', corpo:'Oi {primeiro_nome},\n\nVi o trabalho de {empresa} e queria entender como funciona o marketing de vocês.\n\nTeria 20 minutos para uma conversa rápida?\n\nAbraço,' },
    etapa2: { assunto:'{empresa} — retorno', corpo:'Oi {primeiro_nome},\n\nFicou pendente minha mensagem da semana passada. Ainda faz sentido batermos um papo de 20 minutos sobre o marketing de {empresa}?\n\nAbraço,' }
  },
  whatsapp: {
    etapa1: { corpo:'Oi {primeiro_nome}, sou Pedro Ica, sócio da Galeria Holding. Vi o trabalho de {empresa} e queria entender melhor o marketing de vocês. Teria 20 minutos?\n\nAbraço,' },
    etapa2: { corpo:'Oi {primeiro_nome}, ficou pendente minha mensagem anterior sobre {empresa}. Ainda faz sentido batermos um papo de 20 minutos?\n\nAbraço,' }
  }
};
function cargoPriGerar(cargo, categoria) {
  if (categoria && categoria !== 'outro' && categoria !== null) {
    if (['cmo','diretor_marketing','gerente_marketing','growth','digital','performance','content','branding','social','comunicacao'].indexOf(categoria) >= 0) return 2;
    if (['ceo','founder','presidente'].indexOf(categoria) >= 0) return 1;
    if (['cfo','juridico','rh','financeiro','operacoes','logistica'].indexOf(categoria) >= 0) return -1;
    return 0;
  }
  var t = (cargo||'').toLowerCase();
  if (/\b(cfo|chief financial|finan[cç]|juridic|legal|rh\b|recursos humanos|human resource|operac|supply chain|logistic|contabilid|accounti|tax|tribut)\b/.test(t)) return -1;
  if (/\b(cmo|chief marketing|market|growth|performanc|digital|brand|social|content|comunic|m[ií]dia|media|crm|inbound|outbound|demand gen|acquisition|campanha)\b/.test(t)) return 2;
  if (/\b(ceo|chief executive|president|founder|co-founder|proprietar|owner|managing director|diretor geral|diretor presidente)\b/.test(t)) return 1;
  return 0;
}
function setorGerar(emp) {
  var raw = (emp.setor||'').trim();
  if (!raw) return 'marketing';
  if (raw === raw.toUpperCase() && raw.length <= 5) return 'marketing';
  if (raw.length <= 2) return 'marketing';
  return raw.toLowerCase();
}
function substGerar(texto, dec, empNome, agNome, setor) {
  var pn = (dec.nome||'').split(' ')[0];
  return texto
    .replace(/{primeiro_nome}/g,pn)
    .replace(/{empresa}/g,empNome||'')
    .replace(/{cargo}/g,dec.cargo||'')
    .replace(/{agencia}/g,agNome||'Galeria Holding')
    .replace(/{setor}/g,setor||'marketing');
}

function GerarFilaModal(props) {
  var onClose = props.onClose; var onFilaGerada = props.onFilaGerada;
  var mono = "'IBM Plex Mono',monospace"; var s = {fontFamily:mono};
  function sj(path, opts) {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON;
    var hdrs = Object.assign({'apikey':SUPA_ANON,'Authorization':'Bearer '+jwt,'Content-Type':'application/json'}, opts&&opts.headers);
    return fetch(SUPA_URL+path, Object.assign({},opts,{headers:hdrs})).then(function(r){var ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():null;});
  }
  var _N = useState(25); var N = _N[0]; var setN = _N[1];
  var _agId = useState(AGENCIAS_GERAR[0].id); var agId = _agId[0]; var setAgId = _agId[1];
  var _distribuir = useState(false); var distribuir = _distribuir[0]; var setDistribuir = _distribuir[1];
  var _afu = useState(false); var apenasFollowUp = _afu[0]; var setApenasFollowUp = _afu[1];
  var _gerando = useState(false); var gerando = _gerando[0]; var setGerando = _gerando[1];
  var _resultado = useState(null); var resultado = _resultado[0]; var setResultado = _resultado[1];
  var _prog = useState(''); var prog = _prog[0]; var setProg = _prog[1];
  var _tplMap = useState(null); var tplMap = _tplMap[0]; var setTplMap = _tplMap[1];

  useEffect(function() {
    sj('/rest/v1/crm_templates?tipo=eq.prospeccao&ativo=eq.true&select=id,agencia_id,canal,etapa,assunto,corpo').then(function(d) {
      var m = {};
      if (Array.isArray(d)) d.forEach(function(t) { m[t.agencia_id+':'+t.canal+':'+t.etapa] = t; });
      setTplMap(m);
    }).catch(function() { setTplMap({}); });
  }, []);

  async function gerar() {
    setGerando(true); setResultado(null);
    var rejeicoes = {}; var criados = {}; var nCriados = 0;
    try {
      setProg('Carregando carteira de clientes…');
      var carteira = await sj('/rest/v1/crm_carteira_clientes?select=empresa_id&limit=2000');
      var carteiraIds = new Set(Array.isArray(carteira)?carteira.map(function(r){return r.empresa_id;}):[]);

      setProg('Carregando fila da semana…');
      var semAtras = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
      var filaSem = await sj('/rest/v1/crm_fila?status=in.(rascunho,aprovado)&gerado_em=gte.'+semAtras+'&select=empresa_id,decisor_id&limit=3000');
      var empNaFila = {}; var decNaFila = new Set();
      if (Array.isArray(filaSem)) filaSem.forEach(function(r){ empNaFila[r.empresa_id]=(empNaFila[r.empresa_id]||0)+1; if(r.decisor_id) decNaFila.add(r.decisor_id); });

      setProg('Verificando pipeline ativo…');
      var opAtivas = await sj('/rest/v1/crm_oportunidades?apagado_em=is.null&estagio=in.('+['Primeira reunião','Contato direto','Negociando direto','Concorrências','Negociação'].map(encodeURIComponent).join(',')+')'+'&select=empresa_id&limit=2000');
      var empsNoPipeline = new Set(Array.isArray(opAtivas) ? opAtivas.filter(function(o){return o.empresa_id;}).map(function(o){return o.empresa_id;}) : []);

      setProg('Carregando decisores…');
      var decs = await sj('/rest/v1/crm_decisores?status=eq.ativo&apagado_em=is.null&email=not.is.null&select=id,nome,cargo,cargo_categoria,email,wa,empresa_id,ultimo_toque_em,respondeu&limit=3000');
      if (!Array.isArray(decs)) throw new Error('Falha ao carregar decisores: '+((decs&&decs.message)||'erro'));

      setProg('Carregando empresas…');
      var empIds = Array.from(new Set(decs.map(function(d){return d.empresa_id;}).filter(Boolean)));
      var empMap = {};
      for (var i=0; i<empIds.length; i+=500) {
        var chunk = empIds.slice(i,i+500);
        var rr = await sj('/rest/v1/crm_empresas?id=in.('+chunk.join(',')+')'+'&select=id,nome,setor&limit=500');
        if (Array.isArray(rr)) rr.forEach(function(e){empMap[e.id]=e;});
      }

      setProg('Selecionando candidatos…');
      var porEmp = {};
      decs.forEach(function(d) {
        var pri = cargoPriGerar(d.cargo, d.cargo_categoria);
        if (pri <= 0) { if(pri<0) rejeicoes['cargo_excluido']=(rejeicoes['cargo_excluido']||0)+1; return; }
        if (!porEmp[d.empresa_id]) porEmp[d.empresa_id]=[];
        porEmp[d.empresa_id].push(Object.assign({},d,{_pri:pri}));
      });

      var candidatos = [];
      Object.keys(porEmp).forEach(function(empId) {
        var emp = empMap[empId]; if (!emp) return;
        if (carteiraIds.has(empId)) { rejeicoes['cliente_carteira']=(rejeicoes['cliente_carteira']||0)+1; return; }
        if (empsNoPipeline.has(empId)) { rejeicoes['no_pipeline_ativo']=(rejeicoes['no_pipeline_ativo']||0)+1; return; }
        if ((empNaFila[empId]||0)>=2) { rejeicoes['ja_2_na_fila']=(rejeicoes['ja_2_na_fila']||0)+1; return; }
        var list = porEmp[empId];
        var hasMarketing = list.some(function(d){return d._pri===2;});
        var eligible = list.filter(function(d){return hasMarketing?d._pri===2:d._pri===1;}).filter(function(d){return !decNaFila.has(d.id);});
        if (!eligible.length) { rejeicoes['decisor_ja_na_fila']=(rejeicoes['decisor_ja_na_fila']||0)+1; return; }
        var lastToque = eligible.reduce(function(mx,d){return (d.ultimo_toque_em&&d.ultimo_toque_em>mx)?d.ultimo_toque_em:mx;}, '');
        var dias = lastToque ? Math.floor((Date.now()-new Date(lastToque))/86400000) : 999;
        if (dias < 5) { rejeicoes['tocada_recente']=(rejeicoes['tocada_recente']||0)+1; return; }
        var etapa;
        if (dias >= 5 && dias < 10) {
          if (eligible.some(function(d){return d.respondeu;})) { rejeicoes['respondeu_aguardando']=(rejeicoes['respondeu_aguardando']||0)+1; return; }
          etapa = 'etapa2';
        } else { etapa = 'etapa1'; }
        if (apenasFollowUp && etapa !== 'etapa2') return;
        var slots = Math.min(2-(empNaFila[empId]||0), eligible.length);
        eligible.sort(function(a,b){return b._pri-a._pri;});
        candidatos.push({empId:empId,emp:emp,decs:eligible.slice(0,slots),etapa:etapa,dias:dias});
      });
      candidatos.sort(function(a,b){return b.dias-a.dias;});

      // Selecionar até N empresas e atribuir agência
      var agLista = distribuir ? AGENCIAS_GERAR : [AGENCIAS_GERAR.find(function(a){return a.id===agId;})||AGENCIAS_GERAR[0]];
      if (distribuir && N < agLista.length*3) {
        setResultado({erro:'N mínimo para distribuição é '+(agLista.length*3)+' (3 por agência × '+agLista.length+' agências).'});
        setGerando(false); return;
      }
      var agIdx = 0; var empCount = 0;
      var rows = [];
      var now = new Date().toISOString();
      for (var ci=0; ci<candidatos.length && empCount<N; ci++) {
        var cand = candidatos[ci];
        var ag = agLista[agIdx % agLista.length]; if (distribuir) agIdx++;
        empCount++;
        cand.decs.forEach(function(dec) {
          var empNome = cand.emp.nome||'';
          var et = cand.etapa;
          var etNm = et === 'etapa2' ? '2' : '1';
          var setorV = setorGerar(cand.emp);
          var tm = tplMap || {};
          // email (sempre)
          var tplE = tm[ag.id+':email:'+etNm] || null;
          var emailBase = tplE || TEMPLATE_GERAR.email[et] || TEMPLATE_GERAR.email.etapa1;
          rows.push({empresa_id:cand.empId, decisor_id:dec.id, agencia_id:ag.id, agencia_slug:ag.slug, canal:'email', etapa:et, assunto:substGerar(emailBase.assunto||'',dec,empNome,ag.nome,setorV), corpo:substGerar(emailBase.corpo||'',dec,empNome,ag.nome,setorV), status:'rascunho', gerado_em:now, template_id:tplE?tplE.id:null});
          // whatsapp (se tiver wa)
          if (dec.wa) {
            var tplW = tm[ag.id+':whatsapp:'+etNm] || null;
            var waBase = tplW || TEMPLATE_GERAR.whatsapp[et] || TEMPLATE_GERAR.whatsapp.etapa1;
            rows.push({empresa_id:cand.empId, decisor_id:dec.id, agencia_id:ag.id, agencia_slug:ag.slug, canal:'whatsapp', etapa:et, assunto:null, corpo:substGerar(waBase.corpo||'',dec,empNome,ag.nome,setorV), status:'rascunho', gerado_em:now, template_id:tplW?tplW.id:null});
          }
          if (!criados[ag.nome]) criados[ag.nome]={etapa1:0,etapa2:0};
          criados[ag.nome][et]=(criados[ag.nome][et]||0)+1;
          nCriados++;
        });
      }

      // INSERT em lotes de 50
      setProg('Gravando '+rows.length+' itens na fila…');
      var totalGravados = 0;
      for (var j=0; j<rows.length; j+=50) {
        var batch = rows.slice(j,j+50);
        var res = await sj('/rest/v1/crm_fila', {method:'POST', headers:{'Prefer':'return=minimal'}, body:JSON.stringify(batch)});
        if (res && res.message) throw new Error('Erro ao inserir: '+res.message);
        totalGravados += batch.length;
      }
      var rejLista = Object.keys(rejeicoes).map(function(k){return rejeicoes[k]+' '+k;}).join(', ');
      setResultado({ok:true, itens:totalGravados, criados:criados, rejeicoes:rejLista, nEmpresas:empCount});
      if (onFilaGerada) onFilaGerada();
    } catch(e) {
      setResultado({erro:e.message});
    }
    setGerando(false);
  }

  return React.createElement("div",{style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}},
    React.createElement("div",{style:{background:'#0d0d1a',border:'.5px solid #2D2D44',borderRadius:12,padding:'24px 28px',width:440,maxHeight:'80vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,.5)'}},
      React.createElement("div",{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}},
        React.createElement("span",{style:{...s,fontSize:13,fontWeight:700,color:'#818CF8'}}, "⚡ Gerar nova fila"),
        !gerando && React.createElement("button",{onClick:onClose,style:{background:'none',border:'none',color:'#9B9BB4',fontSize:18,cursor:'pointer'}},"×")
      ),
      !resultado && React.createElement("div",{style:{display:'flex',flexDirection:'column',gap:14}},
        React.createElement("label",{style:{...s,fontSize:10,color:'#9B9BB4'}},
          "Empresas (N)",
          React.createElement("input",{type:'number',min:1,max:200,value:N,onChange:function(e){setN(parseInt(e.target.value)||25);},style:{display:'block',width:'100%',marginTop:4,background:'#111827',border:'.5px solid #2D2D44',borderRadius:5,padding:'5px 8px',color:'#F5F5F5',fontSize:11,fontFamily:mono}})
        ),
        React.createElement("label",{style:{...s,fontSize:10,color:'#9B9BB4'}},
          "Agência",
          React.createElement("select",{value:distribuir?'__dist__':agId,onChange:function(e){if(e.target.value==='__dist__'){setDistribuir(true);}else{setDistribuir(false);setAgId(e.target.value);}},style:{display:'block',width:'100%',marginTop:4,background:'#111827',border:'.5px solid #2D2D44',borderRadius:5,padding:'5px 8px',color:'#F5F5F5',fontSize:11,fontFamily:mono}},
            AGENCIAS_GERAR.map(function(ag){return React.createElement("option",{key:ag.id,value:ag.id},ag.nome);}),
            React.createElement("option",{value:'__dist__'},"↔ Distribuir entre agências (mín 3 cada)")
          )
        ),
        React.createElement("label",{style:{...s,fontSize:10,color:'#9B9BB4',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}},
          React.createElement("input",{type:'checkbox',checked:apenasFollowUp,onChange:function(e){setApenasFollowUp(e.target.checked);},style:{accentColor:'#FBBF24',cursor:'pointer'}}),
          React.createElement("span",null,"Apenas 2ª tentativa",
            React.createElement("span",{style:{color:'#555',marginLeft:6}},"(não responderam há 5–10 dias)")
          )
        ),
        React.createElement("div",{style:{...s,fontSize:9,color:'#555',borderTop:'.5px solid #1A1A2E',paddingTop:10}},
          apenasFollowUp
            ? "Modo follow-up: gera somente para quem foi tocado há 5–10 dias e não respondeu"
            : "Critérios: cargo marketing > CEO • não clientes • sem toque >10d (etapa1) ou 5-10d sem resposta (etapa2) • máx 2 por empresa/semana"
        ),
        gerando
          ? React.createElement("div",{style:{...s,fontSize:10,color:'#60A5FA',padding:'8px 0'}},prog)
          : React.createElement("button",{onClick:gerar,style:{...s,fontSize:11,fontWeight:700,padding:'8px 0',borderRadius:7,border:'none',background:apenasFollowUp?'#92400E':'#4F46E5',color:'#fff',cursor:'pointer',width:'100%'}},apenasFollowUp?"↻ Gerar follow-ups":"Gerar fila")
      ),
      resultado && resultado.erro && React.createElement("div",{style:{...s,fontSize:10,color:'#F87171',padding:'8px 0'}},
        "❌ ",resultado.erro,
        React.createElement("br",null),
        React.createElement("button",{onClick:function(){setResultado(null);},style:{...s,fontSize:9,marginTop:8,padding:'4px 12px',border:'.5px solid #2D2D44',borderRadius:5,background:'transparent',color:'#9B9BB4',cursor:'pointer'}},"Tentar novamente")
      ),
      resultado && resultado.ok && React.createElement("div",{style:{display:'flex',flexDirection:'column',gap:8}},
        React.createElement("div",{style:{...s,fontSize:11,color:'#34D399',fontWeight:700}},"✅ "+resultado.itens+" itens criados ("+resultado.nEmpresas+" empresas)"),
        React.createElement("div",{style:{...s,fontSize:9,color:'#9B9BB4',whiteSpace:'pre-wrap'}},
          Object.keys(resultado.criados).map(function(ag){ var c=resultado.criados[ag]; return ag+': '+(c.etapa1||0)+' etapa1 + '+(c.etapa2||0)+' etapa2'; }).join('\n')
        ),
        resultado.rejeicoes && React.createElement("div",{style:{...s,fontSize:9,color:'#555',borderTop:'.5px solid #1A1A2E',paddingTop:8}},
          "Descartados: "+resultado.rejeicoes
        ),
        React.createElement("button",{onClick:onClose,style:{...s,fontSize:10,marginTop:4,padding:'6px 0',borderRadius:6,border:'.5px solid #818CF8',background:'transparent',color:'#818CF8',cursor:'pointer',width:'100%'}},"Fechar")
      )
    )
  );
}

// D5/D6 — AprovacaoHoje: abas Email/WA/LinkedIn, edição inline, aprovar em lote,
// registrar resposta e reunião
function AprovacaoHoje() {
  var mono = "'IBM Plex Mono',monospace";
  var s = {fontFamily:mono};
  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:4,padding:'5px 8px',color:'#F5F5F5',fontSize:10,outline:'none',boxSizing:'border-box',fontFamily:mono,resize:'vertical'};
  var CANAL_CLR = {email:'#60A5FA',whatsapp:'#34D399',linkedin:'#818CF8'};

  var _fila = useState(null); var fila = _fila[0]; var setFila = _fila[1];
  var _aba = useState('email'); var aba = _aba[0]; var setAba = _aba[1];
  var _sel = useState(function(){return new Set();}); var sel = _sel[0]; var setSel = _sel[1];
  var _edit = useState({}); var editando = _edit[0]; var setEditando = _edit[1];
  var _busy = useState({}); var busy = _busy[0]; var setBusy = _busy[1];
  var _undo = useState(null); var undoItem = _undo[0]; var setUndoItem = _undo[1];
  var _erroQuery = useState(null); var erroQuery = _erroQuery[0]; var setErroQuery = _erroQuery[1];
  // E4-M3: auto-refresh a cada 60s
  var _tick = useState(0); var tick = _tick[0]; var setTick = _tick[1];
  // E4-M5: índice focado para keyboard nav
  var _focused = useState(0); var focused = _focused[0]; var setFocused = _focused[1];
  // Bloco 1: paginação em blocos de 10
  var _bloco = useState(0); var bloco = _bloco[0]; var setBloco = _bloco[1];
  var _contadores = useState({hoje:0,semana:0}); var contadores = _contadores[0]; var setContadores = _contadores[1];
  var _dbCounts = useState({email:0,whatsapp:0,linkedin:0}); var dbCounts = _dbCounts[0]; var setDbCounts = _dbCounts[1];
  var _showGerarFila = useState(false); var showGerarFila = _showGerarFila[0]; var setShowGerarFila = _showGerarFila[1];
  var _pm = useState({}); var pipelineMap = _pm[0]; var setPipelineMap = _pm[1];
  var _fu = useState(null); var followUps = _fu[0]; var setFollowUps = _fu[1];
  var _exp = useState(function(){return new Set();}); var expandedBodies = _exp[0]; var setExpandedBodies = _exp[1];
  var _respL = useState({}); var respondendoMap = _respL[0]; var setRespondendoMap = _respL[1];

  function supaJwt(path, opts) {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON;
    var hdrs = Object.assign({'apikey':SUPA_ANON,'Authorization':'Bearer '+jwt,'Content-Type':'application/json'}, opts&&opts.headers);
    return fetch(SUPA_URL+path, Object.assign({},opts,{headers:hdrs})).then(function(r){var ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():null;});
  }

  var BLOCO_SZ = 10;
  var SEL_FILA = '&select=*,crm_empresas!empresa_id(id,nome,setor),crm_decisores!decisor_id(id,nome,cargo,email,wa,linkedin_url,temperatura,respondeu),crm_agencias!agencia_id(id,nome)';

  function canalQ(c) {
    return c === 'linkedin'
      ? 'canal=in.(linkedin,linkedin_convite,linkedin_mensagem)'
      : 'canal=eq.' + c;
  }
  function load(canalArg, blocoArg) {
    var c = canalArg !== undefined ? canalArg : aba;
    var b = blocoArg !== undefined ? blocoArg : bloco;
    var offset = b * BLOCO_SZ;
    supaJwt('/rest/v1/crm_fila?status=eq.rascunho&' + canalQ(c) +
      '&order=gerado_em.asc&limit=' + BLOCO_SZ + '&offset=' + offset + SEL_FILA
    ).then(function(d){
      if (Array.isArray(d)) {
        setFila(d); setErroQuery(null);
        var eIds = d.map(function(x){return x.empresa_id;}).filter(Boolean);
        if (eIds.length) {
          supaJwt('/rest/v1/crm_oportunidades?apagado_em=is.null&estagio=in.('+['Primeira reunião','Contato direto','Negociando direto','Concorrências','Negociação'].map(encodeURIComponent).join(',')+')'+'&empresa_id=in.('+eIds.join(',')+')'+'&select=empresa_id,estagio&limit=500')
            .then(function(ops){ var pm={}; if(Array.isArray(ops)) ops.forEach(function(o){if(o.empresa_id)pm[o.empresa_id]=o.estagio;}); setPipelineMap(pm); })
            .catch(function(){});
        } else { setPipelineMap({}); }
      }
      else { setFila([]); setErroQuery('Erro ao carregar fila: ' + ((d&&d.message)||JSON.stringify(d))); }
    }).catch(function(e){ setFila([]); setErroQuery('Erro de rede: ' + e.message); });
  }
  function loadContadores() {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON;
    var hdrs = {apikey:SUPA_ANON, Authorization:'Bearer '+jwt, Prefer:'count=exact'};
    function countC(q) {
      return fetch(SUPA_URL+'/rest/v1/crm_fila?status=eq.rascunho&'+q+'&select=id',
        {method:'HEAD', headers:hdrs})
        .then(function(r){var cr=r.headers.get('content-range');return cr?(parseInt(cr.split('/')[1],10)||0):0;})
        .catch(function(){return 0;});
    }
    var agora = new Date();
    var hojeStr = agora.toISOString().slice(0,10);
    var semAtras = new Date(agora-7*86400000).toISOString().slice(0,10);
    Promise.all([
      countC('canal=eq.email'),
      countC('canal=eq.whatsapp'),
      countC('canal=in.(linkedin,linkedin_convite,linkedin_mensagem)'),
      supaJwt('/rest/v1/crm_fila?status=eq.enviado&enviado_em=gte.'+hojeStr+'T00%3A00%3A00&select=id&limit=500').catch(function(){return [];}),
      supaJwt('/rest/v1/crm_fila?status=eq.enviado&enviado_em=gte.'+semAtras+'T00%3A00%3A00&select=id&limit=1000').catch(function(){return [];})
    ]).then(function(res){
      setDbCounts({email:res[0], whatsapp:res[1], linkedin:res[2]});
      setContadores({hoje:Array.isArray(res[3])?res[3].length:0, semana:Array.isArray(res[4])?res[4].length:0});
    });
  }
  function loadFollowUps() {
    var desde = new Date(Date.now()-12*86400000).toISOString();
    var ate = new Date(Date.now()-5*86400000).toISOString();
    supaJwt('/rest/v1/crm_fila?status=eq.enviado&etapa=eq.etapa1&enviado_em=gte.'+desde+'&enviado_em=lte.'+ate+'&select=decisor_id,crm_decisores!decisor_id(respondeu)&limit=500')
      .then(function(d){
        if (!Array.isArray(d)) return;
        var nao = d.filter(function(x){return !(x.crm_decisores&&x.crm_decisores.respondeu);});
        setFollowUps(nao.length);
      }).catch(function(){});
  }
  useEffect(function(){ load(aba, bloco); loadContadores(); loadFollowUps(); }, [tick]);
  // reset bloco e recarrega itens ao trocar aba
  useEffect(function(){ setBloco(0); load(aba, 0); }, [aba]);
  // E4-M3: auto-refresh
  useEffect(function() {
    var t = setInterval(function(){ setTick(function(n){return n+1;}); }, 60000);
    return function(){ clearInterval(t); };
  }, []);


  function aprovar(id) {
    var item = (fila||[]).find(function(x){return x.id===id;});
    var ed = editando[id];
    var payload = {status:'aprovado', aprovado_em:new Date().toISOString()};
    if (ed) { payload.assunto=ed.assunto; payload.corpo=ed.corpo; }
    setBusy(function(p){return Object.assign({},p,{[id]:'aprovar'});});
    supaJwt('/rest/v1/crm_fila?id=eq.'+id, {method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify(payload)})
      .then(function(){
        setFila(function(p){return p.filter(function(x){return x.id!==id;});});
        setSel(function(p){var s=new Set(p);s.delete(id);return s;});
        setEditando(function(p){var e=Object.assign({},p);delete e[id];return e;});
        setBusy(function(p){var b=Object.assign({},p);delete b[id];return b;});
      })
      .catch(function(){setBusy(function(p){var b=Object.assign({},p);delete b[id];return b;});});
  }
  function pular(id) {
    setBusy(function(p){return Object.assign({},p,{[id]:'pular'});});
    supaJwt('/rest/v1/crm_fila?id=eq.'+id, {method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'pulado'})})
      .then(function(){
        setFila(function(p){return p.filter(function(x){return x.id!==id;});});
        setSel(function(p){var s=new Set(p);s.delete(id);return s;});
        setBusy(function(p){var b=Object.assign({},p);delete b[id];return b;});
      })
      .catch(function(){setBusy(function(p){var b=Object.assign({},p);delete b[id];return b;});});
  }
  function aprovarLote() {
    var ids = Array.from(sel);
    if (!ids.length) return;
    var now = new Date().toISOString();
    var semEd = ids.filter(function(id){return !editando[id];});
    var comEd = ids.filter(function(id){return !!editando[id];});
    if (semEd.length) {
      setBusy(function(p){var b=Object.assign({},p);semEd.forEach(function(id){b[id]='aprovar';});return b;});
      supaJwt('/rest/v1/crm_fila?id=in.('+semEd.join(',')+')',{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'aprovado',aprovado_em:now})})
        .then(function(){
          setFila(function(p){return p.filter(function(x){return !semEd.includes(x.id);});});
          setSel(function(p){var s=new Set(p);semEd.forEach(function(id){s.delete(id);});return s;});
          setBusy(function(p){var b=Object.assign({},p);semEd.forEach(function(id){delete b[id];});return b;});
        })
        .catch(function(){setBusy(function(p){var b=Object.assign({},p);semEd.forEach(function(id){delete b[id];});return b;});});
    }
    comEd.forEach(function(id){aprovar(id);});
  }
  function pularPipeline() {
    var ids = (fila||[]).filter(function(x){return !!pipelineMap[x.empresa_id];}).map(function(x){return x.id;});
    if (!ids.length) return;
    if (!window.confirm('Pular '+ids.length+' itens de empresas em negociação?')) return;
    ids.forEach(function(id){pular(id);});
  }

  // E4-M2: pausar decisor por 7 dias
  function pausar7(item) {
    var pausaAte = new Date(); pausaAte.setDate(pausaAte.getDate() + 7);
    var decisorId = item.decisor_id;
    setBusy(function(p){return Object.assign({},p,{[item.id]:'pausar'});});
    Promise.all([
      supaJwt('/rest/v1/crm_decisores?id=eq.'+decisorId,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({pausa_ate_em:pausaAte.toISOString()})}),
      supaJwt('/rest/v1/crm_fila?id=eq.'+item.id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'pulado'})})
    ]).then(function(){
      setFila(function(p){return p.filter(function(x){return x.id!==item.id;});});
      setBusy(function(p){var b=Object.assign({},p);delete b[item.id];return b;});
    }).catch(function(){
      setBusy(function(p){var b=Object.assign({},p);delete b[item.id];return b;});
    });
  }

  // E4-M5: keyboard nav
  useEffect(function() {
    function onKey(e) {
      if (!fila || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      var items = fila||[];
      if (e.key === 'j') setFocused(function(f){return Math.min(f+1,items.length-1);});
      if (e.key === 'k') setFocused(function(f){return Math.max(f-1,0);});
      if (e.key === 'Enter' && items[focused]) aprovar(items[focused].id);
    }
    window.addEventListener('keydown',onKey);
    return function(){window.removeEventListener('keydown',onKey);};
  }, [fila, aba, focused]);

  function abrirEmail(item) {
    var ed = editando[item.id];
    var assunto = (ed?ed.assunto:item.assunto)||'';
    var corpo = (ed?ed.corpo:item.corpo)||'';
    var email = (item.crm_decisores&&item.crm_decisores.email)||'';
    window.open('mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(assunto)+'&body='+encodeURIComponent(corpo));
  }

  function abrirWA(item) {
    var ed = editando[item.id];
    var corpo = (ed?ed.corpo:item.corpo)||'';
    var wa = (item.crm_decisores&&item.crm_decisores.wa)||'';
    var num = wa.replace(/\D/g,'');
    window.open('https://wa.me/'+num+'?text='+encodeURIComponent(corpo));
    // Marca enviado; permite desfazer por 8s
    supaJwt('/rest/v1/crm_fila?id=eq.'+item.id, {method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'enviado',enviado_em:new Date().toISOString()})});
    setFila(function(p){return p.filter(function(x){return x.id!==item.id;});});
    setUndoItem(item);
    var timer = setTimeout(function(){setUndoItem(null);}, 8000);
    item._undoTimer = timer;
  }
  function desfazerWA() {
    if (!undoItem) return;
    clearTimeout(undoItem._undoTimer);
    supaJwt('/rest/v1/crm_fila?id=eq.'+undoItem.id, {method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'rascunho',enviado_em:null})});
    setFila(function(p){return [undoItem].concat(p);});
    setUndoItem(null);
  }

  function abrirLinkedIn(item) {
    var ed = editando[item.id];
    var nota = (ed?ed.corpo:item.corpo)||'';
    var li = (item.crm_decisores&&item.crm_decisores.linkedin_url)||'';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(nota).catch(function(){});
    }
    if (li) window.open(li,'_blank');
    else { window.prompt('Copie o texto abaixo e cole na mensagem do LinkedIn:',nota); }
  }

  // D6 — registrar resposta
  function registrarResposta(item) {
    var d = item.crm_decisores||{};
    if (!d.id) return;
    var temp = (d.temperatura||0)+1;
    setRespondendoMap(function(p){return Object.assign({},p,{[item.id]:true});});
    supaJwt('/rest/v1/crm_decisores?id=eq.'+d.id, {method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({respondeu:true,temperatura:temp})})
      .then(function(){ setTimeout(function(){setRespondendoMap(function(p){var b=Object.assign({},p);delete b[item.id];return b;});}, 2000); })
      .catch(function(){setRespondendoMap(function(p){var b=Object.assign({},p);delete b[item.id];return b;});});
    // Criar card no kanban se não existir
    var agSlug = item.agencia_slug || '';
    supaJwt('/rest/v1/crm_kanban?empresa_id=eq.'+(item.empresa_id||'')+'&agencia_id=eq.'+agSlug+'&select=id&limit=1')
      .then(function(rows){
        if (Array.isArray(rows)&&rows.length===0) {
          var emp=item.crm_empresas||{}; var ag=item.crm_agencias||{};
          supaJwt('/rest/v1/crm_kanban',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
            tab:agSlug||'holding',col:'contato',nome:emp.nome||'',
            empresa_id:item.empresa_id,agencia_id:agSlug,responsavel:ag.nome||''
          })});
        }
      });
    setFila(function(p){return p.map(function(x){
      if(x.id!==item.id) return x;
      return Object.assign({},x,{crm_decisores:Object.assign({},x.crm_decisores,{respondeu:true,temperatura:temp})});
    });});
  }

  // D6 — registrar reunião
  function registrarReuniao(item) {
    var d = item.crm_decisores||{};
    var ag = item.crm_agencias||{};
    var agora = new Date().toISOString();
    supaJwt('/rest/v1/crm_decisores?id=eq.'+d.id, {method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({reuniao_marcada_em:agora,agencia_prospectando:item.agencia_id,temperatura:(d.temperatura||0)+2})});
    var agSlug2 = item.agencia_slug || '';
    // Toque de reunião: é o que a meta semanal (crm_reunioes_v) conta. Antes só ia para o
    // crm_kanban legado e, se a empresa já tinha oportunidade aberta, a reunião não contava.
    supaJwt('/rest/v1/crm_toques', {method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
      decisor_id: d.id || null, empresa_id: item.empresa_id || null, canal: 'reuniao', direcao: 'recebido',
      resultado: 'reuniao_marcada', fonte: 'manual', data: agora, agencia_id: item.agencia_id || agSlug2 || null,
      resumo: 'Reunião marcada (Fila)' + ((item.crm_empresas||{}).nome ? ' — ' + item.crm_empresas.nome : '')
    })}).catch(function(){});
    supaJwt('/rest/v1/crm_kanban?empresa_id=eq.'+(item.empresa_id||'')+'&agencia_id=eq.'+agSlug2+'&select=id&limit=1')
      .then(function(rows){
        if (Array.isArray(rows)&&rows.length>0) {
          supaJwt('/rest/v1/crm_kanban?id=eq.'+rows[0].id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({col:'reuniao',atualizado_em:agora})});
        } else {
          var emp=item.crm_empresas||{};
          supaJwt('/rest/v1/crm_kanban',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
            tab:agSlug2||'holding',col:'reuniao',nome:emp.nome||'',
            empresa_id:item.empresa_id,agencia_id:agSlug2,responsavel:ag.nome||''
          })});
        }
      });
    // Bloco 7: criar oportunidade em crm_oportunidades quando reunião marcada
    (function() {
      var SUPA_B = 'https://uetltlnjmobeiunxfsqi.supabase.co';
      var ANON_B = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
      var jwt_b = (window.__supaSession && window.__supaSession.access_token) || ANON_B;
      var empId = item.empresa_id;
      var agId  = item.agencia_id;
      if (!empId) return;
      // Verificar se já existe oportunidade aberta nos últimos 30 dias para empresa+agência
      var desde30 = new Date(Date.now() - 30*86400000).toISOString();
      fetch(SUPA_B + '/rest/v1/crm_oportunidades?empresa_id=eq.' + empId + '&agencia_id=eq.' + agId + '&aberta_em=gte.' + desde30 + '&select=id&limit=1', {
        headers: { apikey: ANON_B, Authorization: 'Bearer ' + jwt_b }
      }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows) {
        if (Array.isArray(rows) && rows.length > 0) return; // já existe
        var emp = item.crm_empresas || {};
        var agNome = (item.crm_agencias || {}).nome || '';
        var body = JSON.stringify({
          empresa_id: empId, agencia_id: agId || null,
          titulo: (emp.nome || 'Empresa') + ' — ' + agNome,
          estagio: 'Primeira reunião', origem: 'fila',
          aberta_em: agora, criado_em: agora, atualizado_em: agora
        });
        fetch(SUPA_B + '/rest/v1/crm_oportunidades', {
          method: 'POST', headers: { apikey: ANON_B, Authorization: 'Bearer ' + jwt_b, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body
        }).then(function(r){ return r.ok ? r.json() : null; }).then(function(rows) {
          var nova = Array.isArray(rows) && rows[0] ? rows[0] : null;
          if (!nova) return;
          fetch(SUPA_B + '/rest/v1/crm_oportunidade_eventos', {
            method: 'POST', headers: { apikey: ANON_B, Authorization: 'Bearer ' + jwt_b, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ oportunidade_id: nova.id, tipo: 'criada', para: 'Primeira reunião', texto: 'Criada automaticamente via Fila — reunião marcada' })
          });
        });
      });
    })();
    setFila(function(p){return p.map(function(x){return x.id===item.id?Object.assign({},x,{_reuniao:true}):x;});});
  }

  if (fila===null) return React.createElement("div",{style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",...s,fontSize:10,color:"#2D2D44"}},"Carregando fila...");

  var itensAba = fila||[];
  var totalFila = (dbCounts.email||0)+(dbCounts.whatsapp||0)+(dbCounts.linkedin||0);
  var restantes = Math.max(0, (dbCounts[aba]||0) - (bloco+1)*BLOCO_SZ);
  var canalAbas = [{k:'email',label:'Email',cor:'#60A5FA'},{k:'whatsapp',label:'WhatsApp',cor:'#34D399'},{k:'linkedin',label:'LinkedIn',cor:'#818CF8'}];

  return React.createElement("div",{style:{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}},
    // Undo WA banner
    undoItem && React.createElement("div",{style:{background:"rgba(52,211,153,.1)",borderBottom:".5px solid rgba(52,211,153,.2)",padding:"6px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}},
      React.createElement("span",{style:{...s,fontSize:9,color:"#34D399",flex:1}},"WA aberto para "+(undoItem.crm_empresas&&undoItem.crm_empresas.nome||'')+" — marcado como enviado"),
      React.createElement("button",{onClick:desfazerWA,style:{...s,fontSize:9,padding:"2px 10px",borderRadius:4,border:".5px solid rgba(52,211,153,.4)",background:"transparent",color:"#34D399",cursor:"pointer"}},"⟲ Não enviei")
    ),
    // Banner follow-ups sem resposta
    followUps > 0 && React.createElement("div",{style:{background:"rgba(251,191,36,.05)",borderBottom:".5px solid rgba(251,191,36,.18)",padding:"6px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}},
      React.createElement("span",{style:{...s,fontSize:9,color:"#FBBF24",flex:1}},"↻ "+followUps+" não responderam da semana passada"),
      React.createElement("button",{onClick:function(){setShowGerarFila(true);},style:{...s,fontSize:9,padding:"2px 10px",borderRadius:4,border:".5px solid rgba(251,191,36,.4)",background:"rgba(251,191,36,.08)",color:"#FBBF24",cursor:"pointer"}},"Gerar 2ª tentativa")
    ),
    // Erro de query visível
    erroQuery && React.createElement("div",{style:{background:"rgba(239,68,68,.08)",borderBottom:".5px solid rgba(239,68,68,.25)",padding:"6px 20px",flexShrink:0}},
      React.createElement("span",{style:{...s,fontSize:9,color:"#F87171"}},"⚠ "+erroQuery)
    ),
    // Gerar nova fila modal
    showGerarFila && React.createElement(GerarFilaModal, {onClose:function(){setShowGerarFila(false);}, onFilaGerada:function(){setShowGerarFila(false);setTick(function(n){return n+1;});}}),
    // Header
    React.createElement("div",{style:{padding:"11px 20px 0",borderBottom:".5px solid #2D2D44",flexShrink:0}},
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:500,color:"#F5F5F5",letterSpacing:"-.3px"}},"Aprovar hoje"),
        React.createElement("span",{style:{...s,fontSize:9,padding:"1px 7px",borderRadius:100,background:"rgba(255,107,43,.1)",color:"#FF6B2B",border:".5px solid rgba(255,107,43,.25)"}},totalFila),
        // contadores de enviados
        React.createElement("span",{style:{...s,fontSize:8,color:"#34D399",padding:"1px 6px",borderRadius:100,background:"rgba(52,211,153,.08)",border:".5px solid rgba(52,211,153,.2)"}},
          "hoje: "+contadores.hoje
        ),
        React.createElement("span",{style:{...s,fontSize:8,color:"#60A5FA",padding:"1px 6px",borderRadius:100,background:"rgba(96,165,250,.08)",border:".5px solid rgba(96,165,250,.2)"}},
          "semana: "+contadores.semana
        ),
        // E4-M4: custo total acumulado (rascunhos pendentes)
        fila && fila.length > 0 && React.createElement("span",{style:{...s,fontSize:8,color:"#555",marginLeft:4}},
          "USD " + fila.reduce(function(a,x){return a+(Number(x.custo_usd)||0);},0).toFixed(4)
        ),
        sel.size>0 && React.createElement("button",{onClick:aprovarLote,style:{marginLeft:"auto",...s,fontSize:9,padding:"3px 12px",borderRadius:4,border:"none",background:"#22543D",color:"#68D391",cursor:"pointer"}},"✓ Aprovar "+sel.size+" selecionados"),
        (function(){var nPipeline=(fila||[]).filter(function(x){return !!pipelineMap[x.empresa_id];}).length; return nPipeline>0 && React.createElement("button",{onClick:pularPipeline,style:{marginLeft:sel.size>0?4:"auto",...s,fontSize:9,padding:"3px 12px",borderRadius:4,border:".5px solid rgba(251,191,36,.4)",background:"rgba(251,191,36,.08)",color:"#FBBF24",cursor:"pointer"}},"⚡ Pular "+nPipeline+" em negociação");})(),
        React.createElement("button",{onClick:function(){setShowGerarFila(true);},style:{marginLeft:(sel.size>0||Object.keys(pipelineMap).length>0)?4:"auto",...s,fontSize:9,padding:"3px 12px",borderRadius:4,border:".5px solid rgba(129,140,248,.4)",background:"rgba(129,140,248,.08)",color:"#818CF8",cursor:"pointer",fontWeight:700}},"⚡ Gerar nova fila"),
        React.createElement("button",{onClick:load,style:{...s,fontSize:8,padding:"2px 8px",borderRadius:4,border:".5px solid #2D2D44",background:"transparent",color:"#555",cursor:"pointer"}},"↺"),
        React.createElement("span",{style:{...s,fontSize:8,color:"#444",marginLeft:4}},"J/K · Enter")
      ),
      React.createElement("div",{style:{display:"flex",gap:0}},
        canalAbas.map(function(ab){
          var cnt=dbCounts[ab.k]||0;
          var ativo=aba===ab.k;
          return React.createElement("button",{key:ab.k,onClick:function(){setAba(ab.k);},style:{...s,fontSize:9,padding:"5px 14px",border:"none",background:"transparent",color:ativo?ab.cor:"#555",borderBottom:ativo?"1.5px solid "+ab.cor:".5px solid transparent",cursor:"pointer",letterSpacing:".3px"}},ab.label+(cnt?" ("+cnt+")":""));
        })
      )
    ),
    // Cards
    React.createElement("div",{style:{flex:1,overflowY:"auto",padding:"10px 20px"}},
      itensAba.length===0
        ? React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",padding:"60px 0",gap:8,opacity:.3}},
            React.createElement("div",{style:{fontSize:28}},"✅"),
            React.createElement("div",{style:{...s,fontSize:10,color:"#F5F5F5"}},"Nada para aprovar nesta aba")
          )
        : itensAba.map(function(item){
            var d=item.crm_decisores||{};
            var emp=item.crm_empresas||{};
            var ag=item.crm_agencias||{};
            var ed=editando[item.id];
            var isSel=sel.has(item.id);
            var isBusy=!!busy[item.id];
            return React.createElement("div",{key:item.id,style:{
              background:isSel?"rgba(96,165,250,.04)":"#1A1A2E",
              border:".5px solid "+(isSel?"rgba(96,165,250,.25)":"#2D2D44"),
              borderRadius:8,padding:"10px 12px",marginBottom:7
            }},
              // Linha 1: checkbox + agência + empresa + canal + temperatura + estrelas (E4-M1)
              React.createElement("div",{style:{display:"flex",alignItems:"center",gap:7,marginBottom:5}},
                React.createElement("input",{type:"checkbox",checked:isSel,onChange:function(e){setSel(function(p){var s2=new Set(p);e.target.checked?s2.add(item.id):s2.delete(item.id);return s2;});},style:{accentColor:"#60A5FA",cursor:"pointer",flexShrink:0}}),
                ag.nome && React.createElement("span",{style:{...s,fontSize:8,padding:"1px 6px",borderRadius:100,background:"rgba(167,139,250,.1)",color:"#A78BFA",border:".5px solid rgba(167,139,250,.2)"}},ag.nome),
                React.createElement("span",{style:{...s,fontSize:11,fontWeight:600,color:"#F5F5F5",flex:1}},(emp.nome||'')),
                // E4-M1: estrelas extraídas de contexto_para_aprovacao (formato "Empresa · Decisor · Cargo · 4★")
                (function() { var m = (item.contexto_para_aprovacao||'').match(/(\d)★/); return m ? React.createElement("span",{style:{...s,fontSize:9,color:'#FBBF24',letterSpacing:1}},Array(parseInt(m[1])+1).join('★')) : null; })(),
                item.etapa==='etapa2' && React.createElement("span",{style:{...s,fontSize:7,padding:"1px 6px",borderRadius:100,background:"rgba(251,191,36,.1)",color:"#F59E0B",border:".5px solid rgba(245,158,11,.3)"}},"↻ 2ª tentativa"),
                item._reuniao && React.createElement("span",{style:{...s,fontSize:8,color:"#34D399"}},"📅 reunião registrada"),
                d.temperatura!=null && React.createElement("span",{style:{...s,fontSize:8,color:"#FF6B2B"}},"🔥"+String(d.temperatura)),
                pipelineMap[item.empresa_id] && React.createElement("span",{style:{...s,fontSize:8,padding:"1px 7px",borderRadius:100,background:"rgba(251,191,36,.12)",color:"#FBBF24",border:".5px solid rgba(251,191,36,.35)"}},"⚡ "+pipelineMap[item.empresa_id]),
                React.createElement("span",{style:{...s,fontSize:8,padding:"1px 7px",borderRadius:100,background:"rgba(96,165,250,.08)",color:CANAL_CLR[aba]||"#9B9BB4",border:".5px solid rgba(96,165,250,.12)"}},(item.canal||'').replace(/_/g,' '))
              ),
              // Decisor
              d.nome && React.createElement("div",{style:{...s,fontSize:9,color:"#FF6B2B",marginBottom:5}},
                d.nome+(d.cargo?" · "+d.cargo:"")+
                (d.respondeu?" ✓ respondeu":"")
              ),
              // Assunto (só email)
              aba==='email' && React.createElement("div",{style:{marginBottom:4}},
                ed
                  ? React.createElement("input",{value:ed.assunto,placeholder:"Assunto",onChange:function(e){setEditando(function(p){return Object.assign({},p,{[item.id]:Object.assign({},p[item.id],{assunto:e.target.value})});});},style:Object.assign({},inp,{marginBottom:0})})
                  : React.createElement("div",{style:{...s,fontSize:9,color:item.assunto?"#9B9BB4":"#555",marginBottom:2,fontStyle:item.assunto?"normal":"italic"}},"Assunto: "+(item.assunto||'(vazio)'))
              ),
              // Corpo
              React.createElement("div",{style:{marginBottom:8}},
                ed
                  ? React.createElement("textarea",{value:ed.corpo,rows:4,onChange:function(e){setEditando(function(p){return Object.assign({},p,{[item.id]:Object.assign({},p[item.id],{corpo:e.target.value})});});},style:inp})
                  : React.createElement("div",null,
                      React.createElement("div",{style:{...s,fontSize:10,color:"#C5C5D8",lineHeight:1.65,borderLeft:"2px solid #2D2D44",paddingLeft:8,whiteSpace:"pre-wrap"}},
                        expandedBodies.has(item.id)?(item.corpo||''):(item.corpo||'').slice(0,500)+((item.corpo||'').length>500&&!expandedBodies.has(item.id)?'…':'')
                      ),
                      (item.corpo||'').length>500 && React.createElement("button",{
                        onClick:function(){setExpandedBodies(function(p){var s2=new Set(p);s2.has(item.id)?s2.delete(item.id):s2.add(item.id);return s2;});},
                        style:{...s,fontSize:8,color:"#60A5FA",background:"transparent",border:"none",cursor:"pointer",padding:"2px 0",display:"block",marginTop:2}
                      },expandedBodies.has(item.id)?"▲ Ver menos":"▼ Ver mais (+"+(((item.corpo||'').length-500)/1|0)+" chars)")
                    )
              ),
              // Ações
              React.createElement("div",{style:{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}},
                // Editar
                React.createElement("button",{onClick:function(){
                  if(ed){setEditando(function(p){var e=Object.assign({},p);delete e[item.id];return e;});}
                  else{setEditando(function(p){return Object.assign({},p,{[item.id]:{assunto:item.assunto||'',corpo:item.corpo||''}});});}
                },style:{...s,fontSize:8,padding:"3px 8px",borderRadius:4,border:".5px solid #2D2D44",background:"transparent",color:ed?"#68D391":"#9B9BB4",cursor:"pointer"}},ed?"✓ Salvar edição":"✎ Editar"),
                // Enviar por canal
                aba==='email' && React.createElement("button",{onClick:function(){abrirEmail(item);},style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:"none",background:"rgba(96,165,250,.12)",color:"#60A5FA",cursor:"pointer"}},"✉ Abrir rascunho"),
                aba==='whatsapp' && React.createElement("button",{onClick:function(){abrirWA(item);},style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:"none",background:"rgba(52,211,153,.12)",color:"#34D399",cursor:"pointer"}},"↗ Abrir WA"),
                aba==='linkedin' && React.createElement("button",{onClick:function(){abrirLinkedIn(item);},style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:"none",background:"rgba(129,140,248,.12)",color:"#818CF8",cursor:"pointer"}},"⇗ LinkedIn + copiar"),
                // Aprovar
                React.createElement("button",{onClick:function(){aprovar(item.id);},disabled:isBusy,style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:"none",background:"#22543D",color:"#68D391",cursor:isBusy?"wait":"pointer",opacity:isBusy?.6:1}},busy[item.id]==='aprovar'?"Aprovando…":"✓ Aprovar"),
                // Pular
                React.createElement("button",{onClick:function(){pular(item.id);},disabled:isBusy,style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:".5px solid #2D2D44",background:"transparent",color:"#555",cursor:isBusy?"wait":"pointer"}},busy[item.id]==='pular'?"Pulando…":"↷ Pular"),
                // E4-M2: pausar 7 dias
                React.createElement("button",{onClick:function(){pausar7(item);},disabled:isBusy,style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:".5px solid rgba(251,191,36,.2)",background:"transparent",color:"#78716C",cursor:isBusy?"wait":"pointer"}},busy[item.id]==='pausar'?"Pausando…":"⏸ 7d"),
                // D6 — Respondeu
                React.createElement("button",{onClick:function(){registrarResposta(item);},disabled:!!respondendoMap[item.id],style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:".5px solid rgba(251,191,36,.25)",background:"rgba(251,191,36,.05)",color:"#FBBF24",cursor:"pointer"}},respondendoMap[item.id]?"✓ Salvo":"↩ Respondeu"),
                // D6 — Reunião
                React.createElement("button",{onClick:function(){registrarReuniao(item);},style:{...s,fontSize:8,padding:"3px 9px",borderRadius:4,border:".5px solid rgba(52,211,153,.25)",background:"rgba(52,211,153,.05)",color:"#34D399",cursor:"pointer"}},"📅 Reunião")
              )
            );
          }),
      // Navegação de blocos
      (dbCounts[aba]||0) > BLOCO_SZ && React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"12px 0 4px",borderTop:".5px solid #1A1A2E",marginTop:4}},
        bloco>0 && React.createElement("button",{onClick:function(){var b=bloco-1;setBloco(b);load(aba,b);},style:{...s,fontSize:9,padding:"4px 14px",borderRadius:5,border:".5px solid #2D2D44",background:"transparent",color:"#9B9BB4",cursor:"pointer"}},"← Bloco anterior"),
        React.createElement("span",{style:{...s,fontSize:9,color:"#555",flex:1,textAlign:"center"}},
          "Bloco "+(bloco+1)+" / "+Math.ceil((dbCounts[aba]||0)/BLOCO_SZ)+" · "+(dbCounts[aba]||0)+" itens no total"
        ),
        restantes>0 && React.createElement("button",{onClick:function(){var b=bloco+1;setBloco(b);load(aba,b);},style:{...s,fontSize:9,padding:"4px 14px",borderRadius:5,border:".5px solid rgba(129,140,248,.4)",background:"rgba(129,140,248,.08)",color:"#818CF8",cursor:"pointer",fontWeight:700}},"Próximo bloco ("+restantes+" restantes) →")
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILA DO DIA — disparo de prospecções aprovadas via Outlook / WA / LinkedIn
// ─────────────────────────────────────────────────────────────────────────────
// ─── Histórico de Toques ─────────────────────────────────────────────────────
function HistoricoView() {
  var mono = 'IBM Plex Mono,monospace';
  var SUPA = 'https://uetltlnjmobeiunxfsqi.supabase.co';
  var ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
  function sjH(path, opts) {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || ANON;
    var h = Object.assign({'apikey':ANON,'Authorization':'Bearer '+jwt,'Content-Type':'application/json'}, opts&&opts.headers);
    return fetch(SUPA+path, Object.assign({},opts,{headers:h})).then(function(r){return r.status===204?null:r.json();});
  }

  var _toques = useState(null); var toques = _toques[0]; var setToques = _toques[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _search = useState(''); var search = _search[0]; var setSearch = _search[1];
  var _filtCanal = useState(''); var filtCanal = _filtCanal[0]; var setFiltCanal = _filtCanal[1];
  var _filtAgencia = useState(''); var filtAgencia = _filtAgencia[0]; var setFiltAgencia = _filtAgencia[1];
  var _filtResultado = useState(''); var filtResultado = _filtResultado[0]; var setFiltResultado = _filtResultado[1];
  var _filtPeriodo = useState('30'); var filtPeriodo = _filtPeriodo[0]; var setFiltPeriodo = _filtPeriodo[1];

  var AG_MAP = useMemo(function(){
    var m = {};
    var ags = (typeof AGENCIAS_GERAR !== 'undefined') ? AGENCIAS_GERAR : [];
    ags.forEach(function(a){ m[a.id] = a.nome||a.label||a.id; });
    return m;
  }, []);

  function spDateStr(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function loadToques() {
    setLoading(true);
    var days = parseInt(filtPeriodo)||30;
    var since = new Date(Date.now() - days*86400000).toISOString();
    sjH('/rest/v1/crm_toques?select=id,criado_em,data,canal,agencia_id,etapa,resultado,nota,origem,decisor_id,empresa_id,crm_decisores!decisor_id(nome,cargo),crm_empresas!empresa_id(nome)'
      +'&data=gte.'+since+'&order=data.desc&limit=500')
      .then(function(rows){ setToques(Array.isArray(rows)?rows:[]); setLoading(false); })
      .catch(function(){ setToques([]); setLoading(false); });
  }

  useEffect(function(){ loadToques(); }, [filtPeriodo]);

  var filtered = useMemo(function(){
    if (!toques) return [];
    var q = (search||'').toLowerCase();
    return toques.filter(function(t){
      var empNome = (t.crm_empresas&&t.crm_empresas.nome)||'';
      var decNome = (t.crm_decisores&&t.crm_decisores.nome)||'';
      if (q && !empNome.toLowerCase().includes(q) && !decNome.toLowerCase().includes(q)) return false;
      if (filtCanal && t.canal !== filtCanal) return false;
      if (filtAgencia && t.agencia_id !== filtAgencia) return false;
      if (filtResultado && t.resultado !== filtResultado) return false;
      return true;
    });
  }, [toques, search, filtCanal, filtAgencia, filtResultado]);

  function exportCSV() {
    var headers = ['Data/Hora SP','Empresa','Decisor','Cargo','Canal','Agência','Etapa','Resultado','Nota','Origem'];
    var rows = filtered.map(function(t){
      return [
        spDateStr(t.data||t.criado_em),
        (t.crm_empresas&&t.crm_empresas.nome)||'',
        (t.crm_decisores&&t.crm_decisores.nome)||'',
        (t.crm_decisores&&t.crm_decisores.cargo)||'',
        t.canal||'',
        AG_MAP[t.agencia_id]||t.agencia_id||'',
        t.etapa||'',
        t.resultado||'',
        (t.nota||'').replace(/"/g,"'"),
        t.origem||''
      ].map(function(v){ return '"'+String(v||'').replace(/"/g,"'")+'"'; }).join(',');
    });
    var csv = [headers.join(',')].concat(rows).join('\n');
    var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download='historico_toques.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  var agIds = useMemo(function(){
    var seen = {};
    (toques||[]).forEach(function(t){ if (t.agencia_id) seen[t.agencia_id]=1; });
    return Object.keys(seen);
  }, [toques]);

  var selStyle = {fontFamily:mono,fontSize:9,background:'#0f1623',border:'.5px solid #2D2D44',color:'#9B9BB4',padding:'4px 8px',borderRadius:3,outline:'none'};

  return React.createElement('div', {style:{padding:'14px 20px',display:'flex',flexDirection:'column',gap:10,height:'100%',overflowY:'auto'}},
    // Cabeçalho + filtros
    React.createElement('div', {style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
      React.createElement('span', {style:{fontFamily:mono,fontSize:11,fontWeight:600,color:'#FBBF24'}},'📋 Histórico de Toques'),
      React.createElement('button', {onClick:loadToques,style:{fontFamily:mono,fontSize:8,padding:'2px 8px',border:'.5px solid #2D2D44',borderRadius:3,background:'transparent',color:'#555',cursor:'pointer'}},'↺'),
      React.createElement('button', {onClick:exportCSV,disabled:!filtered.length,style:{fontFamily:mono,fontSize:8,padding:'3px 10px',borderRadius:3,border:'.5px solid rgba(52,211,153,.3)',background:'rgba(52,211,153,.06)',color:'#34D399',cursor:'pointer',marginLeft:'auto'}},'⬇ CSV'),
      React.createElement('span', {style:{fontFamily:mono,fontSize:8,color:'#555'}},filtered.length+' registros')
    ),
    React.createElement('div', {style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
      React.createElement('input', {value:search,onChange:function(e){setSearch(e.target.value);},placeholder:'Buscar empresa ou decisor…',style:{fontFamily:mono,fontSize:9,background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:3,padding:'4px 10px',color:'#F5F5F5',outline:'none',width:200}}),
      React.createElement('select', {value:filtPeriodo,onChange:function(e){setFiltPeriodo(e.target.value);},style:selStyle},
        React.createElement('option',{value:'7'},'Últimos 7 dias'),
        React.createElement('option',{value:'30'},'Últimos 30 dias'),
        React.createElement('option',{value:'90'},'Últimos 90 dias'),
        React.createElement('option',{value:'365'},'Últimos 365 dias')
      ),
      React.createElement('select', {value:filtCanal,onChange:function(e){setFiltCanal(e.target.value);},style:selStyle},
        React.createElement('option',{value:''},'Todos canais'),
        ['email','whatsapp','linkedin','ligacao'].map(function(c){ return React.createElement('option',{key:c,value:c},c); })
      ),
      agIds.length>0&&React.createElement('select', {value:filtAgencia,onChange:function(e){setFiltAgencia(e.target.value);},style:selStyle},
        React.createElement('option',{value:''},'Todas agências'),
        agIds.map(function(id){ return React.createElement('option',{key:id,value:id},AG_MAP[id]||id); })
      ),
      React.createElement('select', {value:filtResultado,onChange:function(e){setFiltResultado(e.target.value);},style:selStyle},
        React.createElement('option',{value:''},'Todos resultados'),
        ['sem_resposta','enviado','atendeu','caixa_postal','nao_atendeu','reuniao_marcada','resposta'].map(function(r){ return React.createElement('option',{key:r,value:r},r); })
      )
    ),
    loading
      ? React.createElement('div',{style:{fontFamily:mono,fontSize:10,color:'#555',padding:'40px 0',textAlign:'center'}},'Carregando…')
      : filtered.length === 0
        ? React.createElement('div',{style:{fontFamily:mono,fontSize:10,color:'#555',padding:'40px 0',textAlign:'center'}},'Nenhum toque encontrado.')
        : React.createElement('div',{style:{overflowX:'auto'}},
            React.createElement('table',{style:{width:'100%',borderCollapse:'collapse',fontFamily:mono,fontSize:9}},
              React.createElement('thead',null,
                React.createElement('tr',{style:{borderBottom:'.5px solid #2D2D44'}},
                  ['Data/Hora SP','Empresa','Decisor','Canal','Agência','Etapa','Resultado','Nota'].map(function(h){
                    return React.createElement('th',{key:h,style:{padding:'5px 8px',textAlign:'left',color:'#555',fontWeight:500,whiteSpace:'nowrap'}},h);
                  })
                )
              ),
              React.createElement('tbody',null,
                filtered.map(function(t){
                  var res = t.resultado||'';
                  var resColor = res==='reuniao_marcada'?'#34D399':res==='atendeu'?'#60A5FA':res==='sem_resposta'?'#555':'#9B9BB4';
                  return React.createElement('tr',{key:t.id,style:{borderBottom:'.5px solid #111',transition:'background .1s'},
                    onMouseOver:function(e){e.currentTarget.style.background='rgba(255,255,255,.02)';},
                    onMouseOut:function(e){e.currentTarget.style.background='transparent';}},
                    React.createElement('td',{style:{padding:'5px 8px',color:'#9B9BB4',whiteSpace:'nowrap'}},spDateStr(t.data||t.criado_em)),
                    React.createElement('td',{style:{padding:'5px 8px',color:'#F5F5F5',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(t.crm_empresas&&t.crm_empresas.nome)||'—'),
                    React.createElement('td',{style:{padding:'5px 8px',color:'#FF6B2B',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(t.crm_decisores&&t.crm_decisores.nome)||'—'),
                    React.createElement('td',{style:{padding:'5px 8px',color:'#818CF8'}},t.canal||'—'),
                    React.createElement('td',{style:{padding:'5px 8px',color:'#A78BFA',whiteSpace:'nowrap'}},AG_MAP[t.agencia_id]||(t.agencia_id?t.agencia_id.slice(0,8)+'…':'—')),
                    React.createElement('td',{style:{padding:'5px 8px',color:'#555'}},t.etapa||'—'),
                    React.createElement('td',{style:{padding:'5px 8px',color:resColor,whiteSpace:'nowrap'}},res||'—'),
                    React.createElement('td',{style:{padding:'5px 8px',color:'#555',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},t.nota||'')
                  );
                })
              )
            )
          )
  );
}

// ── INTELIGÊNCIA COMERCIAL ─────────────────────────────────────────────────────
// Painel executivo: priorização (score), Gmail (fonte de verdade), aprendizado
// (memória comercial controlada pelo Pedro) e resultados. Métrica sem amostra
// mínima aparece como "sem amostra", nunca como número.
var INT_MIN_AMOSTRA = 10;
var INT_TIPOS_MEM = { preferencia: 'Preferência', restricao: 'Restrição', perfil: 'Perfil de comunicação', argumento_funciona: 'Argumento que funciona', argumento_nao_funciona: 'Argumento que não funciona', case_por_segmento: 'Case por segmento', aprendizado: 'Aprendizado' };
var INT_PADROES = { encurtou: 'encurtou o e-mail', alongou: 'acrescentou contexto', introducao: 'trocou a abertura', cta: 'trocou o pedido final (CTA)', adjetivos: 'cortou adjetivos', linguagem_artificial: 'tirou linguagem artificial', solucao: 'trocou a solução', reescrita: 'reescreveu quase tudo', assunto: 'trocou o assunto' };
function InteligenciaView(props) {
  var mono = "'IBM Plex Mono',monospace";
  var _d = React.useState(null); var d = _d[0]; var setD = _d[1];
  var _ed = React.useState(null); var ed = _ed[0]; var setEd = _ed[1];       // {id, texto}
  var _nv = React.useState({ tipo: 'preferencia', texto: '' }); var nova = _nv[0]; var setNova = _nv[1];
  var _m = React.useState(''); var msg = _m[0]; var setMsg = _m[1];
  var _ab = React.useState(null); var aberto = _ab[0]; var setAberto = _ab[1];
  function arr(x) { return Array.isArray(x) ? x : []; }
  function carregar() {
    var d7 = new Date(Date.now() - 7 * 86400e3).toISOString(), d30 = new Date(Date.now() - 30 * 86400e3).toISOString();
    Promise.all([
      supaFetch('/rest/v1/crm_sdr_estado?atualizado_em=gte.' + d7 + '&sombra=eq.false&score=not.is.null&select=id,etapa,status,score,solucao,score_detalhe,motivo,crm_decisores:decisor_id(nome,cargo),crm_empresas:empresa_id(nome,setor,setor_sugerido)&order=score.desc&limit=600'),
      supaFetch('/rest/v1/crm_agente_oportunidades_v?gerado_em=gte.' + d30 + '&canal=eq.email&select=id,draft_id,status,estado_envio,enviado_real_em,rascunho_erro,estado_decisao&limit=1000'),
      supaFetch('/rest/v1/crm_gmail_eventos?criado_em=gte.' + d30 + '&select=tipo,criado_em&limit=2000'),
      supaFetch('/rest/v1/crm_logs?criado_em=gte.' + d7 + '&nivel=eq.error&origem=in.(%22cron:sdr-respostas%22,%22cron:gmail-sync%22,%22cron:rascunhos-matinais%22,%22gmail-draft-update%22)&select=origem,mensagem,criado_em&order=criado_em.desc&limit=50'),
      supaFetch('/rest/v1/crm_configuracoes?chave=in.(gmail_history_id,gmail_reconciliado_em,sdr_inbox_cursor_gmail)&select=chave,valor'),
      supaFetch('/rest/v1/crm_aprendizado_eventos?criado_em=gte.' + new Date(Date.now() - 180 * 86400e3).toISOString() + '&select=tipo,diff,criado_em&limit=5000'),
      supaFetch('/rest/v1/crm_memoria_comercial?status=neq.descartado&select=*&order=status.asc,evidencias.desc&limit=300'),
      supaFetch('/rest/v1/crm_agente_desempenho_v?select=*&limit=500'),
      supaFetch('/rest/v1/crm_sdr_respostas?recebido_em=gte.' + d30 + '&tipo=neq.auto_resposta&select=tipo&limit=1000'),
      supaFetch('/rest/v1/crm_oportunidades?apagado_em=is.null&criado_em=gte.' + d30 + '&select=estagio,origem&limit=1000'),
      supaFetch('/rest/v1/crm_gmail_sugestoes?criado_em=gte.' + d30 + '&select=*,crm_empresas:empresa_id(nome)&order=criado_em.desc&limit=200'),
      supaFetch('/rest/v1/crm_gmail_status?ultima_mensagem_em=gte.' + d30 + '&select=*,crm_empresas:empresa_id(nome)&order=ultima_mensagem_em.desc&limit=60'),
      supaFetch('/rest/v1/crm_logs?origem=eq.cron:gmail-crm&order=criado_em.desc&limit=1&select=criado_em,contexto')
    ]).then(function (r) {
      var cfg = {}; arr(r[4]).forEach(function (x) { cfg[x.chave] = x.valor; });
      setD({ est: arr(r[0]), ops: arr(r[1]), gev: arr(r[2]), gerr: arr(r[3]), cfg: cfg, apr: arr(r[5]), mem: arr(r[6]), des: arr(r[7]), resp: arr(r[8]), opp: arr(r[9]), sug: arr(r[10]), gst: arr(r[11]), gcrm: arr(r[12])[0] || null });
    }).catch(function () { setD({ erro: true }); });
  }
  React.useEffect(function () { carregar(); }, []);
  function aviso(t) { setMsg(t); setTimeout(function () { setMsg(''); }, 5000); }
  function salvarMem(id, campos, txt) {
    var email = (window.__supaSession && window.__supaSession.user && window.__supaSession.user.email) || null;
    supaFetch('/rest/v1/crm_memoria_comercial?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(Object.assign({ atualizado_em: new Date().toISOString(), atualizado_por: email }, campos)) })
      .then(function (rows) { aviso(Array.isArray(rows) && rows.length ? txt : 'Não deu para salvar.'); setEd(null); carregar(); });
  }
  function criarMem() {
    if (!nova.texto.trim()) return;
    var email = (window.__supaSession && window.__supaSession.user && window.__supaSession.user.email) || null;
    supaFetch('/rest/v1/crm_memoria_comercial', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ tipo: nova.tipo, texto: nova.texto.trim(), fonte: 'manual', status: 'ativo', atualizado_por: email }) })
      .then(function (rows) { aviso(Array.isArray(rows) && rows.length ? 'Adicionado e ativo: entra nas próximas mensagens.' : 'Não deu para salvar.'); setNova({ tipo: nova.tipo, texto: '' }); carregar(); });
  }
  function decidirSug(id, acao) {
    supaFetch('/rest/v1/rpc/gmail_decidir_sugestao', { method: 'POST', body: JSON.stringify({ p_id: id, p_acao: acao }) }).then(function (r) {
      aviso(r && r.ok ? (acao === 'aceitar' ? 'Aplicado no pipeline (fica no histórico da oportunidade).' : acao === 'desfazer' ? 'Desfeito: o pipeline voltou ao estágio anterior.' : 'Sugestão descartada.') : 'Não deu: ' + ((r && (r.message || r.error)) || 'erro'));
      carregar();
    });
  }
  function recalcular() {
    supaFetch('/rest/v1/rpc/sdr_recalcular_aprendizado', { method: 'POST', body: '{}' }).then(function (r) {
      aviso(r && r.ok ? 'Recalculando: as propostas aparecem em até 1 minuto.' : 'Não deu: ' + ((r && (r.message || r.error)) || 'erro'));
      setTimeout(carregar, 15000);
    });
  }
  if (!d) return React.createElement("div", { style: { padding: 24, fontFamily: mono, fontSize: 10, color: '#555' } }, 'Carregando inteligência…');
  if (d.erro) return React.createElement("div", { style: { padding: 24, fontFamily: mono, fontSize: 10, color: '#E24B4A' } }, 'Não deu para carregar. Recarregue a página.');

  var box = { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 };
  var tit = function (t, sub) { return React.createElement("div", null, React.createElement("div", { style: { fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: '#F5F5F5', letterSpacing: '.5px' } }, t), sub && React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', marginTop: 2 } }, sub)); };
  var kpi = function (v, l, c, semAmostra) { return React.createElement("div", { style: { flex: 1, minWidth: 120 } },
    React.createElement("div", { style: { fontFamily: mono, fontSize: semAmostra ? 11 : 22, fontWeight: 700, color: semAmostra ? '#555' : (c || '#F5F5F5'), lineHeight: 1.2 } }, semAmostra ? 'sem amostra' : v),
    React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', marginTop: 3 } }, l + (semAmostra ? ' (' + semAmostra + ')' : ''))); };
  var linhaKpi = function (xs) { return React.createElement("div", { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } }, xs); };
  var btn = function (t, cor, fn) { return React.createElement("button", { onClick: fn, style: { fontFamily: mono, fontSize: 9, padding: '3px 9px', borderRadius: 4, border: '.5px solid ' + cor, background: 'transparent', color: cor, cursor: 'pointer' } }, t); };

  // INTELIGÊNCIA
  var est = d.est;
  var identificadas = est.filter(function (e) { return ['estrategia', 'redigido', 'rascunho', 'enviado', 'agendado'].indexOf(e.etapa) >= 0; });
  var scoreMedio = est.length ? Math.round(est.reduce(function (a, e) { return a + (e.score || 0); }, 0) / est.length) : null;
  var porSol = {}; est.forEach(function (e) { var k = (e.score_detalhe && e.score_detalhe.solucao_nome) || e.solucao || 'não definida'; porSol[k] = (porSol[k] || 0) + 1; });
  var top = est.filter(function (e) { return e.status === 'ativo' && e.etapa !== 'avaliado'; }).slice(0, 12);
  if (top.length < 6) top = est.slice(0, 12);

  // GMAIL
  var ops = d.ops;
  var criados = ops.filter(function (o) { return o.draft_id; }).length;
  var pendentes = ops.filter(function (o) { return o.draft_id && o.estado_envio === 'nao_enviado'; }).length;
  var confirmados = ops.filter(function (o) { return o.enviado_real_em; }).length;
  var autoDet = d.gev.filter(function (e) { return e.tipo === 'enviado'; }).length;
  var falhas = d.gerr.length + ops.filter(function (o) { return !o.draft_id && o.rascunho_erro; }).length;
  var ultSync = d.cfg.gmail_reconciliado_em || null;

  // APRENDIZADO
  var apr = d.apr;
  var semAlt = apr.filter(function (e) { return e.tipo === 'enviado_sem_alteracao'; }).length;
  var editados = apr.filter(function (e) { return e.tipo === 'editado' || e.tipo === 'enviado_com_alteracao'; });
  var revisados = semAlt + apr.filter(function (e) { return e.tipo === 'enviado_com_alteracao'; }).length;
  var padroes = {}; editados.forEach(function (e) { ((e.diff && e.diff.categorias) || []).forEach(function (c) { padroes[c] = (padroes[c] || 0) + 1; }); });
  var padroesOrd = Object.keys(padroes).sort(function (a, b) { return padroes[b] - padroes[a]; });
  // Evolução: % enviado sem alteração por mês (só meses com 5+ envios revisados).
  var porMes = {}; apr.forEach(function (e) { if (e.tipo !== 'enviado_sem_alteracao' && e.tipo !== 'enviado_com_alteracao') return; var m = String(e.criado_em).slice(0, 7); porMes[m] = porMes[m] || { s: 0, n: 0 }; porMes[m].n++; if (e.tipo === 'enviado_sem_alteracao') porMes[m].s++; });
  var meses = Object.keys(porMes).sort().filter(function (m) { return porMes[m].n >= 5; });
  var desOrd = d.des.filter(function (x) { return Number(x.enviados) >= INT_MIN_AMOSTRA; }).sort(function (a, b) { return (b.respostas_positivas / b.enviados) - (a.respostas_positivas / a.enviados); });
  var perfil = d.mem.find(function (m) { return m.tipo === 'perfil' && m.fonte === 'aprendizado'; });

  // RESULTADOS
  var totEnv = d.des.reduce(function (a, x) { return a + Number(x.enviados || 0); }, 0);
  var sum = function (k) { return d.des.reduce(function (a, x) { return a + Number(x[k] || 0); }, 0); };
  var amostraRes = totEnv < INT_MIN_AMOSTRA ? totEnv + ' de ' + INT_MIN_AMOSTRA + ' envios mínimos' : null;
  var respostas30 = d.resp.length;
  var oppAbertas = d.opp.filter(function (o) { return ['Perdido', 'Cliente ativo'].indexOf(o.estagio) < 0; }).length;
  var conv = d.opp.filter(function (o) { return o.estagio === 'Cliente ativo'; }).length;

  var memPorStatus = { proposto: [], ativo: [], desativado: [] };
  d.mem.forEach(function (m) { (memPorStatus[m.status] || (memPorStatus[m.status] = [])).push(m); });
  var memLinha = function (m) {
    var emEd = ed && ed.id === m.id;
    return React.createElement("div", { key: m.id, style: { borderBottom: '.5px solid #1A1A2E', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 } },
      React.createElement("div", { style: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } },
        React.createElement("span", { style: { fontFamily: mono, fontSize: 8, color: '#818CF8', border: '.5px solid #818CF8', borderRadius: 3, padding: '1px 5px' } }, INT_TIPOS_MEM[m.tipo] || m.tipo),
        React.createElement("span", { style: { fontFamily: mono, fontSize: 8, color: '#555' } }, (m.fonte === 'manual' ? 'escrito por você' : 'deduzido de ' + m.evidencias + ' evento(s)') + (m.escopo && (m.escopo.setor || m.escopo.solucao) ? ' · vale para ' + [m.escopo.solucao, m.escopo.setor].filter(Boolean).join(' / ') : ' · vale para tudo'))),
      emEd ? React.createElement("textarea", { value: ed.texto, rows: 3, onChange: function (e) { setEd({ id: m.id, texto: e.target.value }); }, style: { background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontSize: 12, padding: 6 } })
        : React.createElement("div", { style: { fontSize: 12, color: m.status === 'desativado' ? '#555' : '#F5F5F5' } }, m.texto),
      React.createElement("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        emEd ? [btn('Salvar', '#34D399', function () { salvarMem(m.id, { texto: ed.texto }, 'Texto corrigido.'); }), btn('Cancelar', '#555', function () { setEd(null); })]
          : [m.status !== 'ativo' && btn(m.status === 'proposto' ? 'Ativar (passa a valer)' : 'Reativar', '#34D399', function () { salvarMem(m.id, { status: 'ativo' }, 'Ativo: entra nas próximas mensagens.'); }),
             m.status === 'ativo' && btn('Desativar', '#FBBF24', function () { salvarMem(m.id, { status: 'desativado' }, 'Desativado: deixa de ser usado.'); }),
             btn('Corrigir', '#60A5FA', function () { setEd({ id: m.id, texto: m.texto }); }),
             btn(m.fonte === 'aprendizado' ? 'Descartar (resetar)' : 'Remover', '#E24B4A', function () { salvarMem(m.id, { status: 'descartado' }, 'Descartado (fica no histórico, fora do uso).'); }),
             m.evidencia_detalhe && btn(aberto === m.id ? 'ocultar evidência' : 'ver evidência', '#9B9BB4', function () { setAberto(aberto === m.id ? null : m.id); })]),
      aberto === m.id && React.createElement("pre", { style: { fontFamily: mono, fontSize: 9, color: '#9B9BB4', whiteSpace: 'pre-wrap', margin: 0 } }, JSON.stringify(m.evidencia_detalhe, null, 1).slice(0, 1200))
    );
  };

  return React.createElement("div", { style: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, background: '#060610', minHeight: '100%' } },
    React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement("div", { style: { fontFamily: mono, fontSize: 11, color: '#FF6B2B', letterSpacing: '.5px' } }, 'INTELIGÊNCIA COMERCIAL'),
      msg && React.createElement("span", { style: { fontFamily: mono, fontSize: 10, color: '#F5F5F5' } }, msg)),

    // 1. INTELIGÊNCIA
    React.createElement("div", { style: box },
      tit('Inteligência', 'Score de oportunidade 0-100 (últimos 7 dias). Passe o mouse no score para ver cada fator.'),
      linhaKpi([kpi(est.length, 'leads analisados'), kpi(identificadas.length, 'oportunidades identificadas (seguiram para mensagem)', '#34D399'),
        kpi(scoreMedio == null ? '—' : scoreMedio, 'score médio', '#FBBF24', est.length ? null : 'nenhum lead pontuado ainda')]),
      Object.keys(porSol).length > 0 && React.createElement("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        Object.keys(porSol).sort(function (a, b) { return porSol[b] - porSol[a]; }).map(function (k) {
          return React.createElement("span", { key: k, style: { fontFamily: mono, fontSize: 9, color: '#C9C9D6', background: '#1A1A2E', borderRadius: 10, padding: '3px 9px' } }, k + ': ' + porSol[k]); })),
      top.length > 0 && React.createElement("div", null,
        React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#9B9BB4', margin: '4px 0' } }, 'MELHORES OPORTUNIDADES'),
        top.map(function (e) {
          var sd = e.score_detalhe || {}; var g = sd.gatilho;
          return React.createElement("div", { key: e.id, style: { display: 'grid', gridTemplateColumns: '44px 1fr', gap: 8, padding: '7px 0', borderBottom: '.5px solid #1A1A2E' } },
            React.createElement("div", { title: (sd.fatores || []).map(function (f) { return f.fator + ': ' + f.pontos + '/' + f.max + ' — ' + f.motivo; }).join('\n'), style: { fontFamily: mono, fontSize: 18, fontWeight: 700, color: e.score >= 75 ? '#34D399' : e.score >= 55 ? '#FBBF24' : '#F5F5F5', cursor: 'help' } }, e.score),
            React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
              React.createElement("div", { style: { fontSize: 12, color: '#F5F5F5' } }, React.createElement("b", null, (e.crm_empresas && e.crm_empresas.nome) || '—'), ' · ' + ((e.crm_decisores && e.crm_decisores.nome) || '') + (e.crm_decisores && e.crm_decisores.cargo ? ', ' + e.crm_decisores.cargo : '')),
              React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#9B9BB4' } }, 'Solução: ' + (sd.solucao_nome || e.solucao || '—') + ' · Motivo: ' + (sd.motivo || '—')),
              g ? React.createElement("a", { href: g.url, target: '_blank', rel: 'noopener noreferrer', style: { fontFamily: mono, fontSize: 9, color: '#60A5FA', textDecoration: 'none' } }, 'Gatilho: ' + String(g.tipo).replace(/_/g, ' ') + ' — ' + String(g.fato || '').slice(0, 90) + ' (' + (g.fonte || 'fonte') + ', ' + String(g.data || 's/data').slice(0, 10) + ') →')
                : React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'Sem gatilho público com fonte'),
              React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#C9C9D6' } }, 'Próxima ação: ' + (sd.proxima_acao || '—') + ' · situação: ' + e.etapa + (e.status !== 'ativo' ? ' (' + e.status + ')' : ''))));
        }))
    ),

    // 2. GMAIL
    React.createElement("div", { style: box },
      tit('Gmail', 'Fonte de verdade dos envios. Sincroniza a cada 15 min (History API) e reconcilia tudo 1 vez por dia. Últimos 30 dias.'),
      linhaKpi([kpi(criados, 'rascunhos criados', '#60A5FA'), kpi(pendentes, 'rascunhos pendentes', '#FBBF24'), kpi(confirmados, 'enviados e confirmados pela API', '#34D399'),
        kpi(autoDet, 'envios identificados automaticamente', '#34D399'), kpi(falhas, 'falhas de sincronização/criação (7d)', falhas ? '#E24B4A' : '#555')]),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'Última reconciliação completa: ' + (ultSync ? new Date(ultSync).toLocaleString('pt-BR') : 'ainda não houve') + (d.gerr.length ? ' · última falha: ' + d.gerr[0].origem.replace('cron:', '') + ' — ' + String(d.gerr[0].mensagem).slice(0, 80) : ''))
    ),

    // 3. APRENDIZADO
    React.createElement("div", { style: box },
      React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 } },
        tit('Aprendizado', 'O agente aprende com suas decisões, edições e envios. Nada passa a valer sem você ativar.'),
        btn('Recalcular aprendizados', '#818CF8', recalcular)),
      linhaKpi([kpi(semAlt, 'enviados sem alteração', '#34D399', revisados < 5 ? revisados + ' envios revisados; mínimo 5' : null),
        kpi(editados.length, 'e-mails editados por você', '#FBBF24'),
        kpi(revisados ? Math.round(semAlt / revisados * 100) + '%' : '—', 'aprovados como o agente escreveu', '#34D399', revisados < 5 ? 'mínimo 5 envios' : null)]),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#C9C9D6' } }, React.createElement("b", null, 'Padrões das suas edições: '),
        editados.length < 5 ? 'sem amostra (' + editados.length + ' edições; mínimo 5)' : padroesOrd.slice(0, 5).map(function (c) { return (INT_PADROES[c] || c) + ' (' + padroes[c] + ')'; }).join(' · ')),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#C9C9D6' } }, React.createElement("b", null, 'Evolução da qualidade (% enviado sem alteração por mês): '),
        meses.length < 2 ? 'sem amostra (precisa de 2 meses com 5+ envios revisados)' : meses.map(function (m) { return m + ': ' + Math.round(porMes[m].s / porMes[m].n * 100) + '% (' + porMes[m].n + ')'; }).join(' · ')),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#C9C9D6' } }, React.createElement("b", null, 'Argumentos com melhor desempenho (correlação, não causa): '),
        desOrd.length ? desOrd.slice(0, 4).map(function (x) { return x.solucao + ' em ' + x.setor + ' para ' + x.nivel_cargo + ': ' + x.respostas_positivas + ' positivas / ' + x.enviados; }).join(' · ')
          : 'sem amostra (nenhuma combinação com ' + INT_MIN_AMOSTRA + '+ envios; e-mail sem resposta não prova que a abordagem é ruim)'),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#C9C9D6' } }, React.createElement("b", null, 'Perfil de comunicação: '),
        perfil ? perfil.texto + (perfil.status !== 'ativo' ? ' [proposto: ative abaixo para valer]' : '') : 'sem amostra (precisa de 10 e-mails enviados pelo Gmail com confirmação)'),
      // Memória comercial
      React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#9B9BB4', marginTop: 6 } }, 'MEMÓRIA COMERCIAL (o que entra nas próximas mensagens)'),
      memPorStatus.proposto.length > 0 && React.createElement("div", null, React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#FBBF24' } }, 'PROPOSTAS PARA VOCÊ REVISAR (' + memPorStatus.proposto.length + ')'), memPorStatus.proposto.map(memLinha)),
      React.createElement("div", null, React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#34D399' } }, 'ATIVAS (' + memPorStatus.ativo.length + ')'), memPorStatus.ativo.map(memLinha)),
      memPorStatus.desativado.length > 0 && React.createElement("div", null, React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'DESATIVADAS (' + memPorStatus.desativado.length + ')'), memPorStatus.desativado.map(memLinha)),
      React.createElement("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement("select", { value: nova.tipo, onChange: function (e) { setNova({ tipo: e.target.value, texto: nova.texto }); }, style: { background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontFamily: mono, fontSize: 10, padding: 4 } },
          ['preferencia', 'restricao', 'argumento_funciona', 'argumento_nao_funciona', 'case_por_segmento'].map(function (t) { return React.createElement("option", { key: t, value: t }, INT_TIPOS_MEM[t]); })),
        React.createElement("input", { value: nova.texto, placeholder: 'Ex.: Em franquias, abrir pelo problema de consistência entre lojas, não pela tecnologia.', onChange: function (e) { setNova({ tipo: nova.tipo, texto: e.target.value }); }, style: { flex: 1, minWidth: 240, background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontSize: 12, padding: 6 } }),
        btn('Adicionar', '#34D399', criarMem))
    ),

    // STATUS PELO GMAIL
    React.createElement("div", { style: box },
      tit('Status pelo Gmail', 'O CRM se completa lendo seus e-mails com contatos e empresas do CRM (e-mail pessoal é ignorado). Avanço claro no funil é aplicado sozinho, com desfazer; Perdido, Cliente ativo e Pausado são só sugestão.' +
        (d.gcrm ? ' Última leitura: ' + new Date(d.gcrm.criado_em).toLocaleString('pt-BR') + (d.gcrm.contexto && d.gcrm.contexto.modo === 'carga_inicial' ? ' (lendo os últimos 45 dias…)' : '') : ' Ainda não rodou.')),
      (function () {
        var pend = d.sug.filter(function (x) { return x.status === 'pendente'; });
        var aplic = d.sug.filter(function (x) { return x.status === 'aplicada'; });
        var linhaSug = function (x, botoes) {
          return React.createElement("div", { key: x.id, style: { borderBottom: '.5px solid #1A1A2E', padding: '7px 0', display: 'flex', flexDirection: 'column', gap: 3 } },
            React.createElement("div", { style: { fontSize: 12, color: '#F5F5F5' } }, React.createElement("b", null, (x.crm_empresas && x.crm_empresas.nome) || '—'), ' · ' + (x.estagio_de || 'nova oportunidade') + ' → ', React.createElement("b", { style: { color: x.estagio_para === 'Perdido' ? '#E24B4A' : '#34D399' } }, x.estagio_para)),
            React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#9B9BB4' } }, (x.resumo || '') + (x.evidencia ? ' — "' + x.evidencia + '"' : '') + ' · confiança ' + (x.confianca || '?')),
            React.createElement("div", { style: { display: 'flex', gap: 6 } }, botoes));
        };
        return React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#FBBF24' } }, 'SUGESTÕES PARA VOCÊ DECIDIR (' + pend.length + ')'),
          pend.length ? pend.map(function (x) { return linhaSug(x, [btn('Aceitar', '#34D399', function () { decidirSug(x.id, 'aceitar'); }), btn('Rejeitar', '#E24B4A', function () { decidirSug(x.id, 'rejeitar'); })]); })
            : React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'Nenhuma.'),
          React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#34D399', marginTop: 4 } }, 'ATUALIZADO SOZINHO NO PIPELINE (' + aplic.length + ')'),
          aplic.length ? aplic.slice(0, 15).map(function (x) { return linhaSug(x, [btn('Desfazer', '#FBBF24', function () { decidirSug(x.id, 'desfazer'); })]); })
            : React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'Nenhuma ainda.'),
          React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#9B9BB4', marginTop: 4 } }, 'CONVERSAS RECENTES (' + d.gst.length + ')'),
          d.gst.slice(0, 20).map(function (g) {
            var dias = Math.max(0, Math.floor((Date.now() - new Date(g.ultima_mensagem_em).getTime()) / 86400000));
            return React.createElement("div", { key: g.empresa_id, style: { display: 'grid', gridTemplateColumns: 'minmax(120px,180px) 1fr', gap: 8, padding: '5px 0', borderBottom: '.5px solid #1A1A2E', fontSize: 11 } },
              React.createElement("div", { style: { color: '#F5F5F5', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' } }, (g.crm_empresas && g.crm_empresas.nome) || '—'),
              React.createElement("div", { style: { color: '#C9C9D6' } }, (g.ultima_direcao === 'recebido' ? '✉ respondeu' : '✉ você escreveu') + ' há ' + dias + 'd' + (g.sinal && g.sinal !== 'sem_sinal' ? ' · ' + g.sinal.replace(/_/g, ' ') : '') + (g.resumo ? ' · ' + g.resumo : '') + (g.proximo_passo ? ' · próximo: ' + g.proximo_passo + (g.proximo_passo_em ? ' (' + String(g.proximo_passo_em).split('-').reverse().join('/') + ')' : '') : '')));
          }));
      })()
    ),

    // 4. RESULTADOS
    React.createElement("div", { style: box },
      tit('Resultados comerciais', 'Envios do agente e o que aconteceu depois (últimos 30 dias para respostas e oportunidades).'),
      linhaKpi([kpi(totEnv, 'e-mails do agente enviados'), kpi(respostas30, 'respostas de prospects (30d)', '#34D399'),
        kpi(sum('reunioes'), 'reuniões vindas dos envios', '#34D399', amostraRes), kpi(oppAbertas, 'oportunidades abertas (30d)', '#FBBF24'),
        kpi(conv, 'conversões em cliente (30d)', '#34D399')]),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'Taxas por abordagem só aparecem com ' + INT_MIN_AMOSTRA + '+ envios na mesma combinação. Sem resposta não é sinal de abordagem ruim.')
    )
  );
}

// Fila de oportunidades do agente (aba padrão da Fila). Três eixos separados,
// calculados no banco (view crm_agente_oportunidades_v): produção (rascunho no
// Gmail), decisão do Pedro (aprovar/rejeitar) e envio. Aprovar NÃO envia; rejeitar
// encerra a cadência daquela pessoa e não apaga nada (nem o rascunho no Gmail).
var FA_MOTIVOS = ['Não é o perfil', 'Momento errado', 'Conflito com cliente do grupo', 'Contato errado', 'Texto não serve', 'Outro'];
var FA_PROD = { rascunho_gmail: ['Rascunho no Gmail', '#60A5FA'], criando_rascunho: ['Criando no Gmail…', '#FBBF24'], erro_gmail: ['Erro no Gmail', '#E24B4A'], pronto_whatsapp: ['WhatsApp pronto', '#34D399'] };
var FA_DEC = { aguardando: ['Aguardando sua decisão', '#FBBF24'], aprovado: ['Aprovado', '#34D399'], rejeitado: ['Rejeitado', '#E24B4A'] };
var FA_ENV = { nao_enviado: ['Não enviado', '#555'], enviado: ['Enviado', '#34D399'], followup_agendado: ['Enviado · follow-up agendado', '#818CF8'], concluido: ['Concluído (respondeu)', '#34D399'], descartado: ['Descartado', '#555'] };
function FilaAgente() {
  var mono = "'IBM Plex Mono',monospace";
  var _l = React.useState(null); var lista = _l[0]; var setLista = _l[1];
  var _f = React.useState('aguardando'); var filtro = _f[0]; var setFiltro = _f[1];
  var _e = React.useState(null); var edit = _e[0]; var setEdit = _e[1];          // {id, assunto, corpo}
  var _r = React.useState(null); var rej = _r[0]; var setRej = _r[1];            // {id, motivo, obs}
  var _s = React.useState(null); var env = _s[0]; var setEnv = _s[1];            // {id, data, estimado}
  var _b = React.useState(null); var busy = _b[0]; var setBusy = _b[1];
  var _m = React.useState(''); var msg = _m[0]; var setMsg = _m[1];
  function carregar() {
    var desde = new Date(Date.now() - 30 * 86400e3).toISOString();
    supaFetch('/rest/v1/crm_agente_oportunidades_v?gerado_em=gte.' + desde + '&select=*&order=gerado_em.desc&limit=300')
      .then(function (r) { setLista(Array.isArray(r) ? r : []); }).catch(function () { setLista([]); });
  }
  React.useEffect(function () { carregar(); var t = setInterval(carregar, 60000); return function () { clearInterval(t); }; }, []);
  function aviso(t) { setMsg(t); setTimeout(function () { setMsg(''); }, 6000); }
  function decidir(id, decisao, motivo) {
    setBusy(id);
    supaFetch('/rest/v1/rpc/sdr_decidir', { method: 'POST', body: JSON.stringify({ p_fila_id: id, p_decisao: decisao, p_motivo: motivo || null }) })
      .then(function (r) {
        setBusy(null);
        if (r && r.ok) { aviso(decisao === 'aprovado' ? 'Aprovado. Nada foi enviado: o envio continua com você no Gmail.' : decisao === 'rejeitado' ? 'Rejeitado. Sem follow-ups automáticos para essa pessoa. O rascunho no Gmail continua lá.' : 'Decisão desfeita.'); setRej(null); carregar(); }
        else aviso('Não deu para registrar: ' + ((r && (r.message || r.error)) || 'erro'));
      });
  }
  function salvarEdicao() {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
    setBusy(edit.id);
    fetch('/api/enrich?provider=gmail-draft-update', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt }, body: JSON.stringify({ fila_id: edit.id, assunto: edit.assunto, corpo: edit.corpo }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        setBusy(null);
        if (x.ok) { aviso(x.j.gmail ? 'Rascunho atualizado no Gmail.' : 'Texto salvo. ' + (x.j.motivo || '')); setEdit(null); carregar(); }
        else aviso('O Gmail não aceitou a edição: ' + (x.j.error || 'erro') + '. Nada foi alterado.');
      }).catch(function () { setBusy(null); aviso('Falha de rede: nada foi alterado.'); });
  }
  function marcarEnviado() {
    var it = (lista || []).find(function (x) { return x.id === env.id; }); if (!it) return;
    var quando = new Date(env.data + 'T12:00:00-03:00').toISOString();
    setBusy(env.id);
    // Envio informado à mão = data ESTIMADA (sem confirmação da API). Nunca mexe
    // em item com data real confirmada; a sincronização do Gmail troca pela real se achar.
    supaFetch('/rest/v1/crm_fila?id=eq.' + it.id + '&status=in.(aprovado,rascunho)&enviado_real_em=is.null', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'enviado', enviado_em: quando, enviado_estimado: true, enviado_estimado_em: quando, enviado_obs: 'informado pelo Pedro' + (env.estimado ? ' (data aproximada)' : '') + ', sem confirmação da API do Gmail' }) })
      .then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) throw new Error('item já estava marcado');
        return supaFetch('/rest/v1/crm_toques', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ decisor_id: it.decisor_id, empresa_id: it.empresa_id, canal: it.canal === 'whatsapp' ? 'whatsapp' : 'email', direcao: 'enviado', assunto: (it.assunto || '').slice(0, 500), resumo: 'SDR: marcado como enviado pelo Pedro' + (env.estimado ? ' (data aproximada)' : ''), texto_enviado: (it.corpo || '').slice(0, 4000), data: quando, fonte: 'manual', resultado: 'enviado' }) })
          .then(function () { return supaFetch('/rest/v1/crm_decisores?id=eq.' + it.decisor_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ultimo_toque_em: quando }) }); });
      })
      .then(function () { setBusy(null); setEnv(null); aviso('Envio registrado. O follow-up é agendado em até 15 minutos.'); carregar(); })
      .catch(function (e) { setBusy(null); aviso('Não registrado: ' + e.message); });
  }

  if (!lista) return React.createElement('div', { style: { fontFamily: mono, fontSize: 10, color: '#555', padding: 20 } }, 'Carregando oportunidades…');
  var conta = function (fn) { return lista.filter(fn).length; };
  var FILTROS = [
    ['aguardando', 'Aguardando decisão', function (x) { return x.estado_decisao === 'aguardando' && x.estado_envio === 'nao_enviado'; }],
    ['aprovado', 'Aprovados', function (x) { return x.estado_decisao === 'aprovado'; }],
    ['rejeitado', 'Rejeitados', function (x) { return x.estado_decisao === 'rejeitado'; }],
    ['enviado', 'Enviados', function (x) { return ['enviado', 'followup_agendado', 'concluido'].indexOf(x.estado_envio) >= 0; }],
    ['todos', 'Todos (30 dias)', function () { return true; }]
  ];
  var fAtual = FILTROS.find(function (f) { return f[0] === filtro; }) || FILTROS[0];
  var itens = lista.filter(fAtual[2]);
  var chip = function (par, extra) { return React.createElement('span', { style: { fontFamily: mono, fontSize: 8, color: par[1], border: '.5px solid ' + par[1], borderRadius: 3, padding: '1px 6px', whiteSpace: 'nowrap' } }, par[0] + (extra || '')); };
  var btn = function (t, cor, fn, dis, tid) { return React.createElement('button', { onClick: fn, disabled: !!dis, 'data-testid': tid, style: { fontFamily: mono, fontSize: 9, padding: '4px 10px', borderRadius: 4, border: '.5px solid ' + cor, background: 'transparent', color: dis ? '#444' : cor, cursor: dis ? 'default' : 'pointer' } }, t); };
  var dt = function (iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };
  var inp = { width: '100%', background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontSize: 12, padding: 8, boxSizing: 'border-box', fontFamily: 'inherit' };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
      FILTROS.map(function (f) {
        var at = f[0] === filtro;
        return React.createElement('button', { key: f[0], onClick: function () { setFiltro(f[0]); }, style: { fontFamily: mono, fontSize: 9, padding: '4px 10px', borderRadius: 12, border: '.5px solid ' + (at ? '#FF6B2B' : '#2D2D44'), background: at ? 'rgba(255,107,43,.1)' : 'transparent', color: at ? '#FF6B2B' : '#9B9BB4', cursor: 'pointer' } }, f[1] + ' (' + conta(f[2]) + ')');
      }),
      React.createElement('span', { style: { marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: '#555' } }, 'Aprovar não envia. Você envia pelo Gmail.')
    ),
    msg && React.createElement('div', { style: { fontFamily: mono, fontSize: 10, color: '#F5F5F5', background: '#1A1A2E', borderRadius: 4, padding: '6px 10px' } }, msg),
    itens.length === 0 && React.createElement('div', { style: { fontFamily: mono, fontSize: 10, color: '#555', padding: '30px 0', textAlign: 'center' } }, 'Nada aqui. O agente produz de madrugada ou pelo botão "Produzir rascunhos agora" na tela Hoje.'),
    itens.map(function (x) {
      var emEdicao = edit && edit.id === x.id, emRej = rej && rej.id === x.id, emEnv = env && env.id === x.id;
      var enviado = ['enviado', 'followup_agendado', 'concluido'].indexOf(x.estado_envio) >= 0;
      var pri = x.prioridade === 'alta' ? ['prioridade alta', '#FF6B2B'] : x.prioridade === 'media' ? ['prioridade média', '#FBBF24'] : ['prioridade normal', '#555'];
      return React.createElement('div', { key: x.id, 'data-testid': 'oport-' + x.id, style: { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: x.estado_decisao === 'rejeitado' ? 0.6 : 1 } },
        React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } },
          React.createElement('span', { style: { fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: '#F5F5F5' } }, x.empresa || '—'),
          React.createElement('span', { style: { fontSize: 12, color: '#F5F5F5' } }, (x.contato || '—') + (x.cargo ? ' · ' + x.cargo : '')),
          React.createElement('span', { style: { fontFamily: mono, fontSize: 10, color: '#9B9BB4' } }, x.canal === 'email' ? (x.email || 'sem e-mail') : ('WhatsApp ' + (x.wa || ''))),
          React.createElement('span', { style: { marginLeft: 'auto' } }, chip(pri))
        ),
        React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          chip(FA_PROD[x.estado_producao] || [x.estado_producao, '#555'], x.estado_producao === 'erro_gmail' && x.rascunho_erro ? ': ' + String(x.rascunho_erro).slice(0, 60) : ''),
          chip(FA_DEC[x.estado_decisao] || [x.estado_decisao, '#555'], x.decisao_motivo ? ': ' + x.decisao_motivo : ''),
          chip(FA_ENV[x.estado_envio] || [x.estado_envio, '#555'], (enviado ? (x.enviado_real_em ? ' em ' + dt(x.enviado_real_em) + ' (confirmado no Gmail)' : x.enviado_estimado_em ? ' em ' + dt(x.enviado_estimado_em) + ' (estimado)' : x.enviado_em ? ' em ' + dt(x.enviado_em) : '') : '') + (x.followup_em ? ' · próximo ' + String(x.followup_em).split('-').reverse().join('/') : '')),
          x.editado_no_gmail_em && !enviado && chip(['Editado no Gmail', '#818CF8'], ' ' + dt(x.editado_no_gmail_em))
        ),
        (x.score != null || x.solucao) && React.createElement('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', fontFamily: mono, fontSize: 9, color: '#9B9BB4' } },
          x.score != null && React.createElement('span', { title: ((x.score_detalhe && x.score_detalhe.fatores) || []).map(function (f) { return f.fator + ': ' + f.pontos + '/' + f.max + ' — ' + f.motivo; }).join('\n') }, 'Score ', React.createElement('b', { style: { color: x.score >= 75 ? '#34D399' : x.score >= 55 ? '#FBBF24' : '#F5F5F5' } }, x.score), '/100 ⓘ'),
          (x.score_detalhe && x.score_detalhe.solucao_nome) && React.createElement('span', null, 'Solução: ', React.createElement('b', { style: { color: '#F5F5F5' } }, x.score_detalhe.solucao_nome)),
          (x.score_detalhe && x.score_detalhe.gatilho) && React.createElement('a', { href: x.score_detalhe.gatilho.url, target: '_blank', rel: 'noopener noreferrer', style: { color: '#60A5FA', textDecoration: 'none' } }, 'Gatilho: ' + String(x.score_detalhe.gatilho.tipo).replace(/_/g, ' ') + ' (' + (x.score_detalhe.gatilho.fonte || 'fonte') + ') →'),
          (x.score_detalhe && x.score_detalhe.proxima_acao) && React.createElement('span', null, 'Próxima ação: ' + x.score_detalhe.proxima_acao)
        ),
        x.motivo_abordagem && React.createElement('div', { style: { fontSize: 11, color: '#9B9BB4', lineHeight: 1.5 } }, React.createElement('b', { style: { color: '#C9C9D6' } }, 'Por que agora: '), String(x.motivo_abordagem).slice(0, 400)),
        !emEdicao && React.createElement('div', { style: { fontSize: 12, color: '#F5F5F5' } }, React.createElement('b', null, 'Assunto: '), x.assunto || (x.canal === 'email' ? '—' : '(WhatsApp)')),
        !emEdicao && React.createElement('details', null, React.createElement('summary', { style: { fontFamily: mono, fontSize: 9, color: '#60A5FA', cursor: 'pointer' } }, 'ver o texto'), React.createElement('div', { style: { whiteSpace: 'pre-wrap', fontSize: 12, color: '#C9C9D6', marginTop: 6, lineHeight: 1.55 } }, x.corpo || '')),
        emEdicao && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          x.canal === 'email' && React.createElement('input', { value: edit.assunto, onChange: function (e) { setEdit(Object.assign({}, edit, { assunto: e.target.value })); }, style: inp, 'data-testid': 'edit-assunto' }),
          React.createElement('textarea', { value: edit.corpo, rows: 9, onChange: function (e) { setEdit(Object.assign({}, edit, { corpo: e.target.value })); }, style: inp, 'data-testid': 'edit-corpo' }),
          React.createElement('div', { style: { display: 'flex', gap: 6 } },
            btn(busy === x.id ? 'Salvando…' : (x.draft_id ? 'Salvar e atualizar no Gmail' : 'Salvar'), '#34D399', salvarEdicao, busy === x.id, 'edit-salvar'),
            btn('Cancelar', '#555', function () { setEdit(null); }))
        ),
        emRej && React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
          React.createElement('select', { value: rej.motivo, onChange: function (e) { setRej(Object.assign({}, rej, { motivo: e.target.value })); }, style: Object.assign({}, inp, { width: 'auto' }), 'data-testid': 'rej-motivo' }, FA_MOTIVOS.map(function (m) { return React.createElement('option', { key: m, value: m }, m); })),
          React.createElement('input', { placeholder: 'detalhe (opcional)', value: rej.obs, onChange: function (e) { setRej(Object.assign({}, rej, { obs: e.target.value })); }, style: Object.assign({}, inp, { flex: 1, minWidth: 160 }) }),
          btn(busy === x.id ? '…' : 'Confirmar rejeição', '#E24B4A', function () { decidir(x.id, 'rejeitado', rej.motivo + (rej.obs ? ': ' + rej.obs : '')); }, busy === x.id, 'rej-confirmar'),
          btn('Cancelar', '#555', function () { setRej(null); })
        ),
        emEnv && React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontFamily: mono, fontSize: 10, color: '#9B9BB4' } },
          'Enviado em', React.createElement('input', { type: 'date', value: env.data, onChange: function (e) { setEnv(Object.assign({}, env, { data: e.target.value })); }, style: Object.assign({}, inp, { width: 'auto' }) }),
          React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: env.estimado, onChange: function (e) { setEnv(Object.assign({}, env, { estimado: e.target.checked })); } }), ' data aproximada'),
          btn(busy === x.id ? '…' : 'Registrar envio', '#34D399', marcarEnviado, busy === x.id),
          btn('Cancelar', '#555', function () { setEnv(null); })
        ),
        !emEdicao && !emRej && !emEnv && React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
          x.estado_decisao !== 'aprovado' && x.estado_decisao !== 'rejeitado' && btn(busy === x.id ? '…' : 'Aprovar', '#34D399', function () { decidir(x.id, 'aprovado'); }, busy === x.id, 'aprovar-' + x.id),
          x.estado_decisao !== 'rejeitado' && btn('Rejeitar', '#E24B4A', function () { setRej({ id: x.id, motivo: FA_MOTIVOS[0], obs: '' }); }, false, 'rejeitar-' + x.id),
          x.estado_decisao !== 'aguardando' && btn('Desfazer decisão', '#9B9BB4', function () { decidir(x.id, 'pendente'); }),
          !enviado && btn('Editar', '#60A5FA', function () { setEdit({ id: x.id, assunto: x.assunto || '', corpo: x.corpo || '' }); }, false, 'editar-' + x.id),
          x.draft_link && !enviado && React.createElement('a', { href: x.draft_link, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'abrir-gmail-' + x.id, style: { fontFamily: mono, fontSize: 9, padding: '4px 10px', borderRadius: 4, border: '.5px solid #60A5FA', color: '#60A5FA', textDecoration: 'none' } }, 'Abrir no Gmail →'),
          !enviado && btn('Marquei como enviado', '#9B9BB4', function () { setEnv({ id: x.id, data: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), estimado: false }); }),
          React.createElement('span', { style: { marginLeft: 'auto', fontFamily: mono, fontSize: 8, color: '#555' } }, 'produzido ' + dt(x.gerado_em) + (x.rascunho_criado_em ? ' · no Gmail ' + dt(x.rascunho_criado_em) : '') + (x.rascunho_atualizado_em ? ' · editado ' + dt(x.rascunho_atualizado_em) : ''))
        )
      );
    })
  );
}

function FilaDoDia() {
  const mono = "'IBM Plex Mono',monospace";
  const SUPA  = 'https://uetltlnjmobeiunxfsqi.supabase.co';
  const ANON  = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';

  function sj(path, opts) {
    const jwt = (window.__supaSession && window.__supaSession.access_token) || ANON;
    const h = Object.assign({'apikey':ANON,'Authorization':'Bearer '+jwt,'Content-Type':'application/json'}, opts&&opts.headers);
    return fetch(SUPA+path, Object.assign({},opts,{headers:h})).then(function(r){var ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():null;});
  }

  const [fila,       setFila]       = useState(null);
  const [tail,       setTail]       = useState([]);
  // A tela SDR pode pedir para abrir direto numa aba (ex.: WhatsApp em sequência).
  const [aba,        setAba]        = useState(function(){ try { var t = localStorage.getItem('gh_fila_tab'); if (t) { localStorage.removeItem('gh_fila_tab'); return t; } } catch (_) {} return 'agente'; });
  const [estrelas,   setEstrelas]   = useState({});
  const [metaDia,    setMetaDia]    = useState(50);
  const [envHoje,    setEnvHoje]    = useState(0);
  const [abertos,    setAbertos]    = useState(function(){
    try{return JSON.parse(localStorage.getItem('gh_fila_abertos')||'{}');}catch{return {};}
  });
  const [editando,   setEditando]   = useState({});
  const [saving,     setSaving]     = useState({});
  const [savedOk,    setSavedOk]    = useState({});
  const [busy,       setBusy]       = useState({});
  const [expanded,   setExpanded]   = useState({});
  const [puloOpen,   setPuloOpen]   = useState({});
  const [motPulo,    setMotPulo]    = useState({});
  const [focused,    setFocused]    = useState(0);
  const [filtAg,     setFiltAg]     = useState('');
  const [filtEt,     setFiltEt]     = useState('');
  const [outlookMode,setOutlookMode]= useState(localStorage.getItem('gh_fila_outlook')||'outlook');
  // Cópia do e-mail enviado (crm_configuracoes.email_copia, ex.: o endereço da Galeria)
  // e onde abrir por padrão (crm_configuracoes.email_abrir_em: outlook | gmail | mailto).
  const [copiaEmail, setCopiaEmail] = useState({ email: '', tipo: 'bcc' });
  useEffect(function(){
    sj('/rest/v1/crm_configuracoes?chave=in.(email_copia,email_copia_tipo,email_abrir_em)&select=chave,valor').then(function(rows){
      var m = {}; (Array.isArray(rows)?rows:[]).forEach(function(r){ m[r.chave] = r.valor; });
      setCopiaEmail({ email: typeof m.email_copia === 'string' ? m.email_copia : '', tipo: m.email_copia_tipo === 'cc' ? 'cc' : 'bcc' });
      if (!localStorage.getItem('gh_fila_outlook') && ['outlook','gmail','mailto'].indexOf(m.email_abrir_em) >= 0) setOutlookMode(m.email_abrir_em);
    }).catch(function(){});
  }, []);
  const [cfgOpen,    setCfgOpen]    = useState(false);
  const [notif,      setNotif]      = useState(null);
  const [tick,       setTick]       = useState(0);
  const [seqAtivo,   setSeqAtivo]   = useState(false);
  const [seqTrigger, setSeqTrigger] = useState(0);
  // Microsoft Graph
  const [graphStatus,  setGraphStatus]  = useState(null); // null | {connected,email}
  const [graphLoading, setGraphLoading] = useState(false);
  const [draftBusy,    setDraftBusy]    = useState({});   // {id: 'creating'|'ok'|'error'}
  const [sendMode,     setSendMode]     = useState(false);
  const [sending,      setSending]      = useState(false);
  const [stopSend,     setStopSend]     = useState(false);
  const [sendEnabled,  setSendEnabled]  = useState(function(){
    try{return localStorage.getItem('gh_graph_send_enabled')==='true';}catch{return false;}
  });

  function notify(msg, color) {
    setNotif({msg:msg, color:color||'#60A5FA'});
    setTimeout(function(){setNotif(null);}, 4000);
  }

  function hojeISO() {
    return new Date().toLocaleDateString('sv',{timeZone:'America/Sao_Paulo'});
  }

  function load() {
    var hoje = hojeISO();
    Promise.all([
      sj('/rest/v1/crm_fila?status=eq.aprovado'
        +'&select=*,crm_decisores!decisor_id(id,nome,cargo,email,wa,linkedin_url),crm_empresas!empresa_id(id,nome,setor)'
        +'&order=etapa_cadencia.desc,gerado_em.asc&limit=500'),
      sj('/rest/v1/crm_fila?status=in.(enviado,pulado)'
        +'&select=*,crm_decisores!decisor_id(id,nome,cargo,email,wa,linkedin_url),crm_empresas!empresa_id(id,nome,setor)'
        +'&order=enviado_em.desc.nullslast&limit=200'),
      sj('/rest/v1/crm_configuracoes?chave=eq.email_daily_max&select=valor&limit=1'),
    ]).then(function(results) {
      var aps = Array.isArray(results[0]) ? results[0] : [];
      var hs  = Array.isArray(results[1]) ? results[1] : [];
      var cfg = results[2];
      setFila(aps);
      setTail(hs);
      setMetaDia(cfg&&cfg[0]&&cfg[0].valor ? Number(cfg[0].valor) : 50);
      var hoje2 = hojeISO();
      setEnvHoje(hs.filter(function(x){return x.status==='enviado'&&x.enviado_em&&x.enviado_em.slice(0,10)===hoje2;}).length);
      var empIds = Array.from(new Set([].concat(aps,hs).map(function(x){return x.empresa_id;}).filter(Boolean)));
      if (empIds.length) {
        sj('/rest/v1/crm_empresa_agencia_estrelas?empresa_id=in.('+empIds.join(',')+')'
          +'&select=empresa_id,estrelas_calculadas,estrelas_manual')
          .then(function(rows) {
            var map = {};
            (rows||[]).forEach(function(r){
              var s = Math.max(Number(r.estrelas_manual)||0, Number(r.estrelas_calculadas)||0);
              if (!map[r.empresa_id]||s>map[r.empresa_id]) map[r.empresa_id]=s;
            });
            setEstrelas(map);
          });
      }
    });
  }

  useEffect(function(){
    load();
    // Na primeira montagem: checa status do Graph e processa retorno do OAuth
    if (tick===0) {
      checkGraphStatus();
      try {
        if (localStorage.getItem('gh_graph_connected')) {
          localStorage.removeItem('gh_graph_connected');
          setNotif({msg:'✅ Outlook conectado!', color:'#34D399'});
          setTimeout(function(){setNotif(null);},5000);
        }
        var graphErr = localStorage.getItem('gh_graph_error');
        if (graphErr) {
          localStorage.removeItem('gh_graph_error');
          setNotif({msg:'⚠ Erro ao conectar Outlook: '+graphErr, color:'#E24B4A'});
          setTimeout(function(){setNotif(null);},8000);
        }
      } catch(e) {}
    }
  }, [tick]);

  // ── Microsoft Graph helpers ───────────────────────────────────────────────
  function apiCall(path, opts) {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || ANON;
    var h = Object.assign({'Content-Type':'application/json','Authorization':'Bearer '+jwt}, opts&&opts.headers);
    return fetch(path, Object.assign({},opts,{headers:h})).then(function(r){return r.json();});
  }

  function checkGraphStatus() {
    apiCall('/api/enrich?provider=graph-status').then(function(d){
      setGraphStatus(d && d.connected ? d : {connected:false});
    }).catch(function(){setGraphStatus({connected:false});});
  }

  function connectOutlook() {
    setGraphLoading(true);
    apiCall('/api/enrich?provider=graph-init', {method:'POST',body:'{}'}).then(function(d){
      setGraphLoading(false);
      if (d && d.authUrl) {
        window.location.href = d.authUrl;
      } else {
        notify('⚠ Erro ao iniciar OAuth: '+(d&&d.error||'sem URL'), '#E24B4A');
      }
    }).catch(function(){setGraphLoading(false);notify('⚠ Erro de rede','#E24B4A');});
  }

  function disconnectOutlook() {
    apiCall('/api/enrich?provider=graph-disconnect', {method:'POST',body:'{}'}).then(function(){
      setGraphStatus({connected:false});
      notify('Outlook desconectado', '#9B9BB4');
    });
  }

  function createDrafts() {
    var emailItems = (fila||[]).filter(function(x){
      return x.canal==='email' && x.status==='aprovado' && !x.outlook_message_id;
    });
    if (!emailItems.length) { notify('Nenhum item email aprovado sem rascunho','#9B9BB4'); return; }
    var newBusy = {};
    emailItems.forEach(function(x){newBusy[x.id]='creating';});
    setDraftBusy(newBusy);
    var promises = emailItems.map(function(item){
      var d = item.crm_decisores||{};
      return apiCall('/api/enrich?provider=graph-draft', {
        method:'POST',
        body: JSON.stringify({
          fila_id:         item.id,
          assunto:         item.assunto||'',
          corpo:           item.corpo||'',
          decisor:         {email:d.email, nome:d.nome||''},
          etapa_cadencia:  item.etapa_cadencia,
          thread_ref:      item.thread_ref||''
        })
      }).then(function(resp){
        if (resp && (resp.outlook_message_id||resp.skipped)) {
          setDraftBusy(function(p){return Object.assign({},p,{[item.id]:'ok'});});
          setFila(function(prev){
            return (prev||[]).map(function(x){
              return x.id===item.id
                ? Object.assign({},x,{
                    outlook_message_id:resp.outlook_message_id||x.outlook_message_id,
                    rascunho_criado_em:resp.rascunho_criado_em||x.rascunho_criado_em,
                    outlook_draft_link:resp.outlook_draft_link||x.outlook_draft_link
                  })
                : x;
            });
          });
          if (resp.is_reply&&!resp.found_thread) notify('⚠ Thread não encontrada para '+item.assunto+'. Rascunho criado como nova mensagem.','#EF9F27');
        } else {
          setDraftBusy(function(p){return Object.assign({},p,{[item.id]:'error'});});
          var errMsg = resp&&resp.error||'Erro desconhecido';
          setFila(function(prev){return (prev||[]).map(function(x){return x.id===item.id?Object.assign({},x,{rascunho_erro:errMsg}):x;});});
        }
      }).catch(function(e){
        setDraftBusy(function(p){return Object.assign({},p,{[item.id]:'error'});});
      });
    });
    Promise.all(promises).then(function(){
      notify('Rascunhos criados! Verifique a pasta Rascunhos no Outlook.','#34D399');
    });
  }

  function syncDrafts() {
    var withDraft = (fila||[]).filter(function(x){return x.canal==='email'&&x.outlook_message_id&&x.status==='aprovado';});
    if (!withDraft.length) { notify('Nenhum rascunho para sincronizar','#9B9BB4'); return; }
    var ids = withDraft.map(function(x){return {fila_id:x.id, outlook_message_id:x.outlook_message_id};});
    apiCall('/api/enrich?provider=graph-sync', {method:'POST', body:JSON.stringify({ids:ids})}).then(function(d){
      if (!d||!d.synced) return;
      var enviados = d.synced.filter(function(s){return s.enviado;});
      if (enviados.length) {
        var now = new Date().toISOString();
        setFila(function(prev){
          return (prev||[]).filter(function(x){
            return !enviados.find(function(s){return s.fila_id===x.id;});
          });
        });
        setEnvHoje(function(n){return n+enviados.length;});
        notify('✓ '+enviados.length+' enviado(s) via Outlook sincronizados','#34D399');
      } else {
        notify('Nenhum rascunho enviado encontrado','#9B9BB4');
      }
    });
  }

  function sendApproved() {
    var toSend = (fila||[]).filter(function(x){
      return x.canal==='email' && x.status==='aprovado' && x.outlook_message_id;
    });
    if (!toSend.length) { notify('Nenhum rascunho pronto para enviar','#9B9BB4'); return; }
    setSending(true); setStopSend(false);
    var idx = 0;
    function next() {
      if (stopSend||idx>=toSend.length) { setSending(false); notify('Envio concluído: '+idx+' e-mails','#34D399'); return; }
      var item = toSend[idx];
      var d = item.crm_decisores||{};
      idx++;
      apiCall('/api/enrich?provider=graph-send', {
        method:'POST',
        body: JSON.stringify({
          fila_id:            item.id,
          outlook_message_id: item.outlook_message_id,
          decisor_id:         item.decisor_id,
          empresa_id:         item.empresa_id,
          canal:              item.canal,
          assunto:            item.assunto,
          contexto:           item.contexto_para_aprovacao
        })
      }).then(function(d){
        if (d && d.enviado) {
          setFila(function(prev){return (prev||[]).filter(function(x){return x.id!==item.id;});});
          setEnvHoje(function(n){return n+1;});
        }
        if (idx<toSend.length) {
          var delay = 60000 + Math.random()*60000; // 60–120s
          setTimeout(next, delay);
        } else {
          setSending(false);
          notify('Envio concluído: '+idx+' e-mails','#34D399');
        }
      }).catch(function(){
        if (idx<toSend.length) setTimeout(next, 5000);
        else { setSending(false); }
      });
    }
    next();
  }

  useEffect(function(){
    var t = setInterval(function(){setTick(function(n){return n+1;});},60000);
    return function(){clearInterval(t);};
  },[]);
  useEffect(function(){
    try{localStorage.setItem('gh_fila_abertos',JSON.stringify(abertos));}catch{}
  },[abertos]);

  // Modo sequência: após cada Enviei/Pular abre o próximo item automaticamente
  useEffect(function(){
    if (!seqAtivo || seqTrigger===0) return;
    var item = abaItems[focused];
    if (!item) {
      setSeqAtivo(false);
      setNotif({msg:'🎉 Sequência concluída!', color:'#34D399'});
      setTimeout(function(){setNotif(null);},4000);
      return;
    }
    var t = setTimeout(function(){abrirItem(item);},300);
    return function(){clearTimeout(t);};
  },[seqTrigger]);

  function gv(item, f) {
    return (editando[item.id]&&editando[item.id][f]!==undefined) ? editando[item.id][f] : (item[f]||'');
  }

  // Tira a assinatura em texto do fim ("Pedro Ica" e, se houver, a linha da
  // agência logo abaixo): a assinatura de verdade vem do Gmail/Outlook.
  function removerAssinatura(corpo) {
    var lines = (corpo||'').split('\n');
    for (var i = lines.length-1; i >= Math.max(0, lines.length-3); i--) {
      var t = lines[i].trim().replace(/^(abra[çc]o|abs|att)[,.]?\s*/i, '');
      if (/^pedro ica\b/i.test(t)) {
        var end = i;
        if (end>0 && /^(abra[çc]o|abs|att)[,.]?$/i.test(lines[end-1].trim())) end--;
        while (end>0 && !lines[end-1].trim()) end--;
        return lines.slice(0,end).join('\n');
      }
    }
    return corpo||'';
  }

  // Parâmetro de cópia (Cco por padrão: o destinatário não vê).
  function copiaParam(sep) {
    if (!copiaEmail.email) return '';
    return sep + copiaEmail.tipo + '=' + encodeURIComponent(copiaEmail.email);
  }
  function linkCurto(email, assunto) {
    if (outlookMode==='gmail') return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(email)+'&su='+encodeURIComponent(assunto)+copiaParam('&');
    if (outlookMode==='mailto') return 'mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(assunto)+copiaParam('&');
    return 'https://outlook.office.com/mail/deeplink/compose?to='+encodeURIComponent(email)+'&subject='+encodeURIComponent(assunto)+copiaParam('&');
  }
  function buildLink(email, assunto, corpo) {
    var subj = encodeURIComponent(assunto);
    if (outlookMode==='mailto') {
      var bodyEncMail = corpo.replace(/\r?\n/g,'%0D%0A');
      if (bodyEncMail.length > 1800) return null;
      return 'mailto:'+encodeURIComponent(email)+'?subject='+subj+'&body='+bodyEncMail+copiaParam('&');
    }
    var bodyEnc = encodeURIComponent(corpo);
    if (bodyEnc.length > 1800) return null;
    if (outlookMode==='gmail') return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(email)+'&su='+subj+'&body='+bodyEnc+copiaParam('&');
    // Outlook Web deeplink: encode body fully including newlines
    return 'https://outlook.office.com/mail/deeplink/compose?to='+encodeURIComponent(email)+'&subject='+subj+'&body='+bodyEnc+copiaParam('&');
  }

  function markAberto(item) {
    if (abertos[item.id]) return;
    var now = new Date().toISOString();
    setAbertos(function(p){return Object.assign({},p,{[item.id]:now});});
    sj('/rest/v1/crm_fila?id=eq.'+item.id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({aberto_em:now})});
  }

  function saveEdit(id, field, value) {
    setSaving(function(p){return Object.assign({},p,{[id]:true});});
    sj('/rest/v1/crm_fila?id=eq.'+id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({[field]:value})})
      .then(function(){
        setSaving(function(p){var n=Object.assign({},p);delete n[id];return n;});
        setSavedOk(function(p){return Object.assign({},p,{[id]:true});});
        setTimeout(function(){setSavedOk(function(p){var n=Object.assign({},p);delete n[id];return n;});},2000);
      }).catch(function(){setSaving(function(p){var n=Object.assign({},p);delete n[id];return n;});});
  }

  function abrirItem(item) {
    if (!item) return;
    var d = item.crm_decisores||{};
    var assunto = gv(item,'assunto');
    var corpo = removerAssinatura(gv(item,'corpo'));
    var etapaN = Number(item.etapa_cadencia)||1;

    if (aba==='email') {
      if (!d.email){notify('⚠ Sem e-mail para este decisor','#E24B4A');return;}
      if (etapaN>=2) {
        if (navigator.clipboard) navigator.clipboard.writeText(corpo);
        var ref = item.thread_ref||assunto||'';
        notify('📋 Corpo copiado! Localize a thread: '+ref.slice(0,80),'#818CF8');
        markAberto(item);
        return;
      }
      // Rascunho já criado no Gmail/Outlook: abre ele (texto, assinatura e cópia
      // prontos), em vez de montar um e-mail novo.
      if (item.outlook_draft_link) {
        markAberto(item);
        window.open(item.outlook_draft_link,'_blank','noopener,noreferrer');
        return;
      }
      var link = buildLink(d.email, assunto, corpo);
      markAberto(item);
      if (!link) {
        if (navigator.clipboard) navigator.clipboard.writeText(corpo);
        var shortLink = linkCurto(d.email, assunto);
        window.open(shortLink,'_blank','noopener,noreferrer');
        notify('📋 Corpo copiado — cole no e-mail.','#EF9F27');
      } else {
        window.open(link,'_blank','noopener,noreferrer');
      }
    } else if (aba==='whatsapp') {
      var raw = d.wa||'';
      var digits = raw.replace(/\D/g,'');
      if (!digits||digits.length<10){
        if (!raw) {
          notify('📵 Sem número WhatsApp para este contato — tente o canal Email ou LinkedIn','#FBBF24');
        } else {
          notify('⚠ Número WA inválido: '+raw+' — corrija na Base ou use outro canal','#E24B4A');
        }
        return;
      }
      // Normaliza: se já tem +55 (12-13 dígitos iniciando com 55), usa como está
      var phone = (digits.length>=12 && digits.slice(0,2)==='55') ? digits : '55'+digits;
      var waUrl = 'https://wa.me/'+phone+'?text='+encodeURIComponent(corpo);
      window.open(waUrl,'_blank','noopener,noreferrer');
      markAberto(item);
    } else if (aba==='linkedin') {
      if (navigator.clipboard) navigator.clipboard.writeText(corpo);
      notify('📋 Nota copiada — é só colar no LinkedIn.','#818CF8');
      if (d.linkedin_url) window.open(d.linkedin_url,'_blank','noopener,noreferrer');
      markAberto(item);
    }
  }

  function marcarEnviado(item) {
    if (!item) return;
    var now = new Date().toISOString();
    setBusy(function(p){return Object.assign({},p,{[item.id]:'enviado'});});
    sj('/rest/v1/crm_fila?id=eq.'+item.id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'enviado',enviado_em:now})})
      .then(function(){
        sj('/rest/v1/crm_toques',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
          decisor_id:item.decisor_id, empresa_id:item.empresa_id,
          agencia_id:item.agencia_id||null,
          canal:item.canal, direcao:'enviado',
          etapa:item.etapa||item.etapa_cadencia||null,
          template_id:item.template_id||null,
          texto_enviado:(item.corpo||'').slice(0,2000),
          assunto:(item.assunto||'').slice(0,500),
          resumo:(item.contexto_para_aprovacao||'').slice(0,500),
          data:now, fonte:'manual', resultado:'sem_resposta',
          origem:'fila', criado_em:now
        })});
        if (item.decisor_id) {
          sj('/rest/v1/crm_decisores?id=eq.'+item.decisor_id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({ultimo_toque_em:now})});
        }
        if (item.empresa_id) {
          sj('/rest/v1/crm_empresas?id=eq.'+item.empresa_id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({ultimo_toque_em:now})});
        }
        setFila(function(p){return (p||[]).filter(function(x){return x.id!==item.id;});});
        setTail(function(p){return [Object.assign({},item,{status:'enviado',enviado_em:now})].concat(p);});
        setBusy(function(p){var b=Object.assign({},p);delete b[item.id];return b;});
        setEnvHoje(function(n){return n+1;});
        if (seqAtivo) setSeqTrigger(function(n){return n+1;});
      });
  }

  function pularItem(item) {
    if (!item) return;
    var motivo = motPulo[item.id]||'';
    var _seqAtivo = seqAtivo;
    setBusy(function(p){return Object.assign({},p,{[item.id]:'pular'});});
    sj('/rest/v1/crm_fila?id=eq.'+item.id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'pulado',motivo_pulo:motivo||null})})
      .then(function(){
        setFila(function(p){return (p||[]).filter(function(x){return x.id!==item.id;});});
        setTail(function(p){return [Object.assign({},item,{status:'pulado'})].concat(p);});
        setBusy(function(p){var b=Object.assign({},p);delete b[item.id];return b;});
        setPuloOpen(function(p){var n=Object.assign({},p);delete n[item.id];return n;});
        if (_seqAtivo) setSeqTrigger(function(n){return n+1;});
      });
  }

  function desfazer(item) {
    if (!item) return;
    sj('/rest/v1/crm_fila?id=eq.'+item.id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'aprovado',enviado_em:null})})
      .then(function(){
        setTail(function(p){return p.filter(function(x){return x.id!==item.id;});});
        setFila(function(p){return [Object.assign({},item,{status:'aprovado',enviado_em:null})].concat(p||[]);});
        if (item.status==='enviado') setEnvHoje(function(n){return Math.max(0,n-1);});
      });
  }

  var abaItems = useMemo(function(){
    var canal = {email:'email',whatsapp:'whatsapp',linkedin:'linkedin'}[aba]||aba;
    var items = (fila||[]).filter(function(x){return x.canal===canal;});
    if (filtAg) items = items.filter(function(x){return x.agencia_slug===filtAg;});
    if (filtEt) items = items.filter(function(x){return x.etapa===filtEt;});
    return items.sort(function(a,b){
      var ea=Number(a.etapa_cadencia)||1, eb=Number(b.etapa_cadencia)||1;
      if (eb!==ea) return eb-ea;
      var sa=estrelas[a.empresa_id]||0, sb=estrelas[b.empresa_id]||0;
      if (sb!==sa) return sb-sa;
      return new Date(a.gerado_em)-new Date(b.gerado_em);
    });
  },[fila,aba,filtAg,filtEt,estrelas]);

  var tailItems = useMemo(function(){
    var canal = {email:'email',whatsapp:'whatsapp',linkedin:'linkedin'}[aba]||aba;
    return (tail||[]).filter(function(x){return x.canal===canal;});
  },[tail,aba]);

  var agencias = useMemo(function(){
    var seen={};
    return (fila||[]).filter(function(x){return x.agencia_slug&&!seen[x.agencia_slug]&&(seen[x.agencia_slug]=1);}).map(function(x){return x.agencia_slug;});
  },[fila]);

  var etapas = useMemo(function(){
    var seen={};
    return (fila||[]).filter(function(x){return x.etapa&&!seen[x.etapa]&&(seen[x.etapa]=1);}).map(function(x){return x.etapa;});
  },[fila]);

  useEffect(function(){
    function onKey(e) {
      var tag = document.activeElement.tagName;
      if (tag==='INPUT'||tag==='TEXTAREA') return;
      var items = abaItems;
      if (e.key==='ArrowDown'){e.preventDefault();setFocused(function(f){return Math.min(f+1,items.length-1);});return;}
      if (e.key==='ArrowUp'){e.preventDefault();setFocused(function(f){return Math.max(f-1,0);});return;}
      var item = items[focused];
      if (!item) return;
      if (e.key==='o'||e.key==='O') abrirItem(item);
      if ((e.key==='e'||e.key==='E')&&abertos[item.id]) marcarEnviado(item);
      if ((e.key==='p'||e.key==='P')&&abertos[item.id]) pularItem(item);
    }
    window.addEventListener('keydown',onKey);
    return function(){window.removeEventListener('keydown',onKey);};
  },[abaItems,focused,abertos,outlookMode,editando]);

  function stars(n){
    var s=''; for(var i=0;i<5;i++) s+=(i<n?'★':'☆'); return s;
  }

  function abrirLabel(item){
    var etapaN=Number(item.etapa_cadencia)||1;
    if (aba==='email' && item.outlook_draft_link) return /mail\.google\.com/.test(item.outlook_draft_link) ? '✉ Abrir rascunho no Gmail' : '✉ Abrir rascunho no Outlook';
    if (aba==='email') return etapaN>=2?'📋 Copiar + Localizar Thread':(outlookMode==='gmail'?'✉ Abrir no Gmail':outlookMode==='mailto'?'✉ Abrir no e-mail':'✉ Abrir no Outlook');
    if (aba==='whatsapp') return '💬 Abrir no WhatsApp';
    return '🔗 Copiar nota + Abrir LinkedIn';
  }

  var pct = Math.min(100,Math.round(envHoje/metaDia*100));

  if (fila===null) return React.createElement('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:mono,fontSize:10,color:'#2D2D44'}},'Carregando fila do dia...');

  return React.createElement('div',{style:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}},
    // Notificação
    notif&&React.createElement('div',{style:{background:'rgba(96,165,250,.07)',borderBottom:'.5px solid rgba(96,165,250,.15)',padding:'6px 20px',fontFamily:mono,fontSize:9,color:notif.color,flexShrink:0,display:'flex',alignItems:'center',gap:8}},
      notif.msg,
      React.createElement('button',{onClick:function(){setNotif(null);},style:{marginLeft:'auto',background:'transparent',border:'none',color:'#555',cursor:'pointer',fontSize:11}},'×')
    ),
    // Header
    React.createElement('div',{style:{padding:'10px 20px',borderBottom:'.5px solid #1A1A2E',flexShrink:0}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:6}},
        React.createElement('span',{style:{fontSize:13,fontWeight:500,color:'#F5F5F5',letterSpacing:'-.3px'}},'Fila do dia'),
        React.createElement('span',{style:{fontFamily:mono,fontSize:9,padding:'1px 7px',borderRadius:100,background:'rgba(52,211,153,.07)',color:'#34D399',border:'.5px solid rgba(52,211,153,.18)'}},envHoje+' / '+metaDia+' enviados'),
        abaItems.length>0&&React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:'#9B9BB4'}},abaItems.length+' aprovados nesta aba'),
        // Indicador e botão Outlook
        graphStatus&&graphStatus.connected
          ? React.createElement('div',{style:{display:'flex',alignItems:'center',gap:5}},
              React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:graphStatus.email==='pedro.ica@galeriaholding.co'?'#34D399':'#E24B4A'}},
                '● '+(graphStatus.email||'conectado')+(graphStatus.email!=='pedro.ica@galeriaholding.co'?'  ⚠ conta errada':'')),
              React.createElement('button',{onClick:disconnectOutlook,style:{fontFamily:mono,fontSize:7,padding:'1px 6px',borderRadius:3,border:'.5px solid #333',background:'transparent',color:'#555',cursor:'pointer'}},'desconectar')
            )
          : React.createElement('button',{
              disabled:graphLoading,
              onClick:connectOutlook,
              style:{fontFamily:mono,fontSize:8,padding:'2px 10px',borderRadius:3,border:'.5px solid rgba(96,165,250,.3)',background:'rgba(96,165,250,.06)',color:graphLoading?'#555':'#60A5FA',cursor:graphLoading?'default':'pointer'}
            }, graphLoading?'Conectando…':'⚡ Conectar Outlook'),
        React.createElement('button',{onClick:function(){setCfgOpen(function(s){return !s;});},style:{fontFamily:mono,fontSize:8,padding:'2px 8px',border:'.5px solid #2D2D44',borderRadius:3,background:cfgOpen?'rgba(255,107,43,.07)':'transparent',color:cfgOpen?'#FF6B2B':'#555',cursor:'pointer'}},'⚙ Config'),
        React.createElement('button',{onClick:load,style:{fontFamily:mono,fontSize:8,padding:'2px 8px',border:'.5px solid #2D2D44',borderRadius:3,background:'transparent',color:'#555',cursor:'pointer'}},'↺')
      ),
      // Ações em lote (apenas aba Email com Outlook conectado)
      aba==='email'&&graphStatus&&graphStatus.connected&&React.createElement('div',{style:{display:'flex',gap:5,alignItems:'center',padding:'5px 0',marginBottom:3,flexWrap:'wrap'}},
        React.createElement('button',{
          onClick:createDrafts,
          disabled:!(fila||[]).some(function(x){return x.canal==='email'&&!x.outlook_message_id;}),
          style:{fontFamily:mono,fontSize:8,padding:'3px 10px',borderRadius:3,
            border:'.5px solid rgba(96,165,250,.3)',background:'rgba(96,165,250,.06)',color:'#60A5FA',cursor:'pointer'}
        },'📥 Criar rascunhos do lote'),
        React.createElement('button',{
          onClick:syncDrafts,
          style:{fontFamily:mono,fontSize:8,padding:'3px 10px',borderRadius:3,
            border:'.5px solid #2D2D44',background:'transparent',color:'#555',cursor:'pointer'}
        },'⟳ Sincronizar enviados'),
        sendEnabled&&!sending&&React.createElement('button',{
          onClick:sendApproved,
          disabled:!(fila||[]).some(function(x){return x.canal==='email'&&x.outlook_message_id&&x.status==='aprovado';}),
          style:{fontFamily:mono,fontSize:8,padding:'3px 10px',borderRadius:3,
            border:'.5px solid rgba(52,211,153,.3)',background:'rgba(52,211,153,.06)',color:'#34D399',cursor:'pointer'}
        },'▶ Enviar aprovados'),
        sending&&React.createElement(React.Fragment,null,
          React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:'#34D399'}},'Enviando…'),
          React.createElement('button',{onClick:function(){setStopSend(true);},
            style:{fontFamily:mono,fontSize:8,padding:'3px 8px',borderRadius:3,border:'.5px solid rgba(226,75,74,.3)',background:'rgba(226,75,74,.05)',color:'#E24B4A',cursor:'pointer'}},'⏹ Parar')
        ),
        React.createElement('label',{style:{fontFamily:mono,fontSize:7,color:sendEnabled?'#EF9F27':'#333',cursor:'pointer',display:'flex',alignItems:'center',gap:3,marginLeft:'auto'}},
          React.createElement('input',{type:'checkbox',checked:sendEnabled,onChange:function(e){
            var v=e.target.checked;
            setSendEnabled(v);
            try{localStorage.setItem('gh_graph_send_enabled',v?'true':'false');}catch{}
          }}),
          'Envio automático habilitado'
        )
      ),
      // Barra de progresso
      React.createElement('div',{style:{height:3,background:'#1A1A2E',borderRadius:2,marginBottom:7}},
        React.createElement('div',{style:{height:3,width:pct+'%',background:pct>=100?'#1D9E75':'#FF6B2B',borderRadius:2,transition:'width .4s'}})
      ),
      // Filtros
      React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center',marginBottom:5,flexWrap:'wrap'}},
        agencias.length>1&&React.createElement('select',{value:filtAg,onChange:function(e){setFiltAg(e.target.value);},style:{fontFamily:mono,fontSize:9,background:'#0f1623',border:'.5px solid #2D2D44',color:'#9B9BB4',padding:'3px 8px',borderRadius:3,outline:'none'}},
          React.createElement('option',{value:''},'Todas agências'),
          agencias.map(function(a){return React.createElement('option',{key:a,value:a},a);})
        ),
        etapas.length>1&&React.createElement('select',{value:filtEt,onChange:function(e){setFiltEt(e.target.value);},style:{fontFamily:mono,fontSize:9,background:'#0f1623',border:'.5px solid #2D2D44',color:'#9B9BB4',padding:'3px 8px',borderRadius:3,outline:'none'}},
          React.createElement('option',{value:''},'Todas etapas'),
          etapas.map(function(t){return React.createElement('option',{key:t,value:t},t);})
        ),
        React.createElement('span',{style:{fontFamily:mono,fontSize:7,color:'#333',marginLeft:'auto'}},'↑/↓ nav · O abrir · E enviado · P pular')
      ),
      // Painel de config
      cfgOpen&&React.createElement('div',{style:{background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:4,padding:'8px 12px',marginBottom:5}},
        React.createElement('div',{style:{fontFamily:mono,fontSize:9,color:'#9B9BB4',marginBottom:6}},'Modo de abertura de e-mail:'),
        copiaEmail.email&&React.createElement('div',{style:{fontFamily:mono,fontSize:9,color:'#34D399',marginBottom:6}},'Todo e-mail aberto leva '+(copiaEmail.tipo==='cc'?'cópia (Cc)':'cópia oculta (Cco)')+' para '+copiaEmail.email+'.'),
        [['outlook','Outlook Web'],['gmail','Gmail (navegador)'],['mailto','cliente de e-mail local (mailto)']].map(function(pair){
          var m=pair[0],lbl=pair[1];
          return React.createElement('label',{key:m,style:{fontFamily:mono,fontSize:9,color:outlookMode===m?'#FF6B2B':'#555',cursor:'pointer',display:'flex',alignItems:'center',gap:6,marginBottom:4}},
            React.createElement('input',{type:'radio',name:'outlookMode',value:m,checked:outlookMode===m,onChange:function(){setOutlookMode(m);localStorage.setItem('gh_fila_outlook',m);}}),
            lbl
          );
        }),
        React.createElement('div',{style:{marginTop:10,paddingTop:8,borderTop:'.5px solid #1A1A2E'}}),
        React.createElement('div',{style:{fontFamily:mono,fontSize:9,color:'#9B9BB4',marginBottom:6}},'Envio automático via Graph:'),
        React.createElement('label',{style:{fontFamily:mono,fontSize:9,color:sendEnabled?'#EF9F27':'#555',cursor:'pointer',display:'flex',alignItems:'center',gap:6}},
          React.createElement('input',{type:'checkbox',checked:sendEnabled,onChange:function(e){
            var v=e.target.checked;
            setSendEnabled(v);
            try{localStorage.setItem('gh_graph_send_enabled',v?'true':'false');}catch{}
          }}),
          sendEnabled?'Habilitado — botão "Enviar aprovados" visível':'Desabilitado (padrão seguro)'
        )
      ),
      // Abas de canal + botão de sequência (WA/LinkedIn)
      React.createElement('div',{style:{display:'flex',gap:0,alignItems:'center',marginTop:2}},
        [['agente','Oportunidades','#FF6B2B'],['email','Email','#60A5FA'],['whatsapp','WhatsApp','#34D399'],['linkedin','LinkedIn','#818CF8'],['historico','Histórico','#FBBF24']].map(function(x){
          var k=x[0],lbl=x[1],cor=x[2];
          var cnt = (k!=='historico'&&k!=='agente') ? (fila||[]).filter(function(i){return i.canal===k;}).length : 0;
          var ativo = aba===k;
          return React.createElement('button',{key:k,onClick:function(){setAba(k);setFocused(0);setSeqAtivo(false);},
            style:{fontFamily:mono,fontSize:9,padding:'5px 14px',border:'none',background:'transparent',
              color:ativo?cor:'#555',borderBottom:ativo?'1.5px solid '+cor:'.5px solid transparent',cursor:'pointer',letterSpacing:'.3px'}},
            lbl+(cnt?' ('+cnt+')':'')
          );
        }),
        // Sequência disponível nas abas WA e LinkedIn
        (aba==='whatsapp'||aba==='linkedin')&&abaItems.length>0&&React.createElement('div',{style:{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}},
          seqAtivo&&React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:'#9B9BB4'}},
            (focused+1)+'/'+abaItems.length
          ),
          seqAtivo
            ? React.createElement('button',{onClick:function(){setSeqAtivo(false);},
                style:{fontFamily:mono,fontSize:8,padding:'3px 9px',borderRadius:3,border:'.5px solid rgba(226,75,74,.3)',background:'rgba(226,75,74,.05)',color:'#E24B4A',cursor:'pointer'}},'⏹ Parar')
            : React.createElement('button',{onClick:function(){
                setSeqAtivo(true);
                setFocused(0);
                var item = abaItems[0];
                if (item) setTimeout(function(){abrirItem(item);},100);
              },style:{fontFamily:mono,fontSize:8,padding:'3px 9px',borderRadius:3,
                border:'.5px solid rgba(52,211,153,.3)',background:'rgba(52,211,153,.07)',color:'#34D399',cursor:'pointer'}},'▶ Sequência')
        )
      )
    ),
    // Conteúdo
    React.createElement('div',{style:{flex:1,overflowY:'auto',padding:aba==='historico'?'0':'10px 20px'}},
      aba==='agente'
        ? React.createElement(FilaAgente, null)
        : aba==='historico'
        ? React.createElement(HistoricoView, null)
        : abaItems.length===0&&tailItems.length===0
          ? React.createElement('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',padding:'60px 0',gap:8,opacity:.3}},
              React.createElement('div',{style:{fontSize:28}},'✅'),
              React.createElement('div',{style:{fontFamily:mono,fontSize:10,color:'#F5F5F5'}},'Fila vazia para esta aba')
            )
          : React.createElement(React.Fragment,null,
              // Itens aprovados
            abaItems.map(function(item,idx){
              var d    = item.crm_decisores||{};
              var emp  = item.crm_empresas||{};
              var st   = estrelas[item.empresa_id]||0;
              var isF  = idx===focused;
              var isAb = !!abertos[item.id];
              var etN  = Number(item.etapa_cadencia)||1;
              var noEm = aba==='email'&&!d.email;
              var assunto = gv(item,'assunto');
              var corpo   = gv(item,'corpo');
              var isBusy  = !!busy[item.id];

              return React.createElement('div',{key:item.id,
                style:{background:isF?'rgba(96,165,250,.025)':'#0d0d1a',
                  border:'.5px solid '+(isF?'rgba(96,165,250,.22)':'#1A1A2E'),
                  borderRadius:6,padding:'10px 12px',marginBottom:6,cursor:'pointer',transition:'border .12s'},
                onClick:function(){setFocused(idx);}},

                // Linha 1: empresa + estrelas + agência + etapa
                React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6,marginBottom:4}},
                  React.createElement('span',{style:{fontFamily:mono,fontSize:11,fontWeight:600,color:'#F5F5F5',flex:1}},emp.nome||'—'),
                  st>0&&React.createElement('span',{style:{fontSize:9,color:'#FBBF24',letterSpacing:1}},stars(st)),
                  item.agencia_slug&&React.createElement('span',{style:{fontFamily:mono,fontSize:8,padding:'1px 6px',borderRadius:100,background:'rgba(167,139,250,.07)',color:'#A78BFA',border:'.5px solid rgba(167,139,250,.14)'}},item.agencia_slug),
                  item.etapa&&React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:'#555'}},item.etapa),
                  etN>=2&&React.createElement('span',{style:{fontFamily:mono,fontSize:7,padding:'1px 5px',borderRadius:2,background:'rgba(129,140,248,.08)',color:'#818CF8'}},'follow-up')
                ),

                // Linha 2: decisor + cargo + contato
                React.createElement('div',{style:{fontFamily:mono,fontSize:9,color:'#FF6B2B',marginBottom:4}},
                  d.nome||'—',
                  d.cargo?' · '+d.cargo:'',
                  aba==='email'&&d.email?React.createElement('span',{style:{color:'#555',marginLeft:4}},' <'+d.email+'>'):'',
                  aba==='whatsapp'&&d.wa?React.createElement('span',{style:{color:'#555',marginLeft:4}},' '+d.wa):'',
                  aba==='linkedin'&&d.linkedin_url?React.createElement('a',{href:d.linkedin_url,target:'_blank',onClick:function(e){e.stopPropagation();},style:{color:'#818CF8',marginLeft:4,fontFamily:mono,fontSize:8}},' ver perfil'):'',
                  noEm?React.createElement('span',{style:{color:'#E24B4A',marginLeft:4}},' ⚠ sem e-mail'):''
                ),

                // Linha 3: contexto (1 linha truncada)
                item.contexto_para_aprovacao&&React.createElement('div',{style:{fontFamily:mono,fontSize:8,color:'#444',marginBottom:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},item.contexto_para_aprovacao),

                // Linha 4: assunto (editável, apenas email)
                aba==='email'&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6,marginBottom:4}},
                  React.createElement('input',{value:assunto,placeholder:'Assunto',
                    onClick:function(e){e.stopPropagation();},
                    onChange:function(e){var v=e.target.value;setEditando(function(p){return Object.assign({},p,{[item.id]:Object.assign({},p[item.id]||{},{assunto:v})});});},
                    onBlur:function(){saveEdit(item.id,'assunto',assunto);},
                    style:{flex:1,fontFamily:mono,fontSize:9,background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:3,padding:'4px 7px',color:'#F5F5F5',outline:'none'}
                  }),
                  saving[item.id]?React.createElement('span',{style:{fontFamily:mono,fontSize:7,color:'#555'}},'↑ salvando'):
                  savedOk[item.id]?React.createElement('span',{style:{fontFamily:mono,fontSize:7,color:'#34D399'}},'✓ salvo'):null
                ),

                // Linha 5: corpo (colapsado / expandido + editável)
                React.createElement('div',{style:{marginBottom:7}},
                  !expanded[item.id]
                    ? React.createElement('div',{
                        style:{fontFamily:mono,fontSize:9,color:'#9B9BB4',borderLeft:'2px solid #1A1A2E',paddingLeft:8,cursor:'pointer',maxHeight:46,overflow:'hidden',lineHeight:1.6,whiteSpace:'pre-wrap'},
                        onClick:function(e){e.stopPropagation();setExpanded(function(p){return Object.assign({},p,{[item.id]:true});});}
                      },corpo.slice(0,220)+(corpo.length>220?' ▼':''))
                    : React.createElement('textarea',{value:corpo,rows:8,
                        onClick:function(e){e.stopPropagation();},
                        onChange:function(e){var v=e.target.value;setEditando(function(p){return Object.assign({},p,{[item.id]:Object.assign({},p[item.id]||{},{corpo:v})});});},
                        onBlur:function(){saveEdit(item.id,'corpo',corpo);},
                        style:{width:'100%',fontFamily:mono,fontSize:9,background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:3,padding:'6px 8px',color:'#C5C5D8',outline:'none',resize:'vertical',lineHeight:1.65,boxSizing:'border-box'}
                      })
                ),

                // Thread ref (follow-up aberto)
                etN>=2&&isAb&&React.createElement('div',{style:{fontFamily:mono,fontSize:8,color:'#818CF8',background:'rgba(129,140,248,.05)',border:'.5px solid rgba(129,140,248,.14)',borderRadius:3,padding:'5px 8px',marginBottom:6,display:'flex',alignItems:'center',gap:6}},
                  React.createElement('span',{style:{flex:1}},'Thread: '+(item.thread_ref||assunto||'').slice(0,100)),
                  React.createElement('button',{onClick:function(e){e.stopPropagation();if(navigator.clipboard)navigator.clipboard.writeText(item.thread_ref||assunto||'');notify('Thread copiada','#818CF8');},
                    style:{fontFamily:mono,fontSize:7,padding:'1px 6px',border:'.5px solid rgba(129,140,248,.3)',borderRadius:2,background:'transparent',color:'#818CF8',cursor:'pointer'}},'copiar')
                ),

                // Linha de ações
                React.createElement('div',{style:{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}},
                  !isAb&&React.createElement('button',{disabled:noEm,onClick:function(e){e.stopPropagation();abrirItem(item);},
                    style:{fontFamily:mono,fontSize:8,padding:'4px 10px',borderRadius:3,cursor:noEm?'not-allowed':'pointer',
                      background:noEm?'transparent':'rgba(96,165,250,.07)',color:noEm?'#333':'#60A5FA',
                      border:'.5px solid '+(noEm?'#1A1A2E':'rgba(96,165,250,.22)'),opacity:noEm?.4:1}},
                    abrirLabel(item)
                  ),
                  isAb&&!isBusy&&React.createElement(React.Fragment,null,
                    React.createElement('button',{onClick:function(e){e.stopPropagation();abrirItem(item);},
                      style:{fontFamily:mono,fontSize:7,padding:'3px 8px',borderRadius:3,border:'.5px solid #2D2D44',background:'transparent',color:'#555',cursor:'pointer'}},'↩ Reabrir'),
                    React.createElement('button',{onClick:function(e){e.stopPropagation();marcarEnviado(item);},
                      style:{fontFamily:mono,fontSize:8,padding:'4px 10px',borderRadius:3,border:'.5px solid rgba(52,211,153,.3)',background:'rgba(52,211,153,.07)',color:'#34D399',cursor:'pointer'}},'✓ Enviei'),
                    !puloOpen[item.id]
                      ? React.createElement('button',{onClick:function(e){e.stopPropagation();setPuloOpen(function(p){return Object.assign({},p,{[item.id]:true});});},
                          style:{fontFamily:mono,fontSize:8,padding:'4px 10px',borderRadius:3,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',cursor:'pointer'}},'Pular')
                      : React.createElement('div',{style:{display:'flex',gap:4,alignItems:'center'},onClick:function(e){e.stopPropagation();}},
                          React.createElement('input',{autoFocus:true,placeholder:'Motivo (opcional)',value:motPulo[item.id]||'',
                            onChange:function(e){var v=e.target.value;setMotPulo(function(p){return Object.assign({},p,{[item.id]:v});});},
                            style:{fontFamily:mono,fontSize:8,background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:3,padding:'3px 7px',color:'#9B9BB4',outline:'none',width:150}}),
                          React.createElement('button',{onClick:function(){pularItem(item);},
                            style:{fontFamily:mono,fontSize:8,padding:'3px 8px',borderRadius:3,border:'.5px solid rgba(226,75,74,.3)',background:'rgba(226,75,74,.05)',color:'#E24B4A',cursor:'pointer'}},'Confirmar'),
                          React.createElement('button',{onClick:function(){setPuloOpen(function(p){var n=Object.assign({},p);delete n[item.id];return n;});},
                            style:{fontFamily:mono,fontSize:8,padding:'3px 6px',borderRadius:3,border:'.5px solid #2D2D44',background:'transparent',color:'#555',cursor:'pointer'}},'×')
                        )
                  ),
                  busy[item.id]==='enviado'&&React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:'#34D399'}},'↑ Registrando…'),
                  busy[item.id]==='pular'&&React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:'#555'}},'↑ Pulando…'),
                  // Badge rascunho Graph
                  aba==='email'&&draftBusy[item.id]&&React.createElement('span',{style:{fontFamily:mono,fontSize:7,color:'#60A5FA'}},'📥 criando rascunho…'),
                  aba==='email'&&!draftBusy[item.id]&&item.rascunho_erro&&React.createElement('span',{
                    title:item.rascunho_erro,
                    style:{fontFamily:mono,fontSize:7,color:'#E24B4A',cursor:'help'}
                  },'⚠ erro rascunho'),
                  aba==='email'&&!draftBusy[item.id]&&item.outlook_message_id&&!item.rascunho_erro&&React.createElement(
                    item.outlook_draft_link?'a':'span',
                    Object.assign(
                      {style:{fontFamily:mono,fontSize:7,color:'#34D399',textDecoration:'none'}},
                      item.outlook_draft_link?{href:item.outlook_draft_link,target:'_blank',rel:'noopener noreferrer'}:{}
                    ),
                    '📧 rascunho pronto'+(item.outlook_draft_link?' ↗':'')
                  )
                )
              );
            }),
            // Cauda cinza: enviados + pulados de hoje
            tailItems.length>0&&React.createElement(React.Fragment,null,
              React.createElement('div',{style:{fontFamily:mono,fontSize:8,color:'#333',letterSpacing:1,textTransform:'uppercase',padding:'10px 0 4px',borderTop:'.5px solid #1A1A2E',marginTop:6}},
                'Enviados / Pulados hoje ('+tailItems.length+')'),
              tailItems.map(function(item){
                var d=item.crm_decisores||{};
                var emp=item.crm_empresas||{};
                return React.createElement('div',{key:item.id,
                  style:{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderBottom:'.5px solid #111',opacity:.42}},
                  React.createElement('span',{style:{fontFamily:mono,fontSize:8,padding:'1px 6px',borderRadius:100,
                    background:item.status==='enviado'?'rgba(52,211,153,.05)':'rgba(155,155,180,.04)',
                    color:item.status==='enviado'?'#34D399':'#9B9BB4',
                    border:'.5px solid '+(item.status==='enviado'?'rgba(52,211,153,.14)':'rgba(155,155,180,.08)')}},item.status),
                  React.createElement('span',{style:{fontFamily:mono,fontSize:9,color:'#9B9BB4',flex:1}},(emp.nome||'')+(d.nome?' · '+d.nome:'')),
                  item.agencia_slug&&React.createElement('span',{style:{fontFamily:mono,fontSize:8,color:'#333'}},item.agencia_slug),
                  React.createElement('button',{onClick:function(){desfazer(item);},
                    style:{fontFamily:mono,fontSize:7,padding:'1px 6px',borderRadius:2,border:'.5px solid #1A1A2E',background:'transparent',color:'#333',cursor:'pointer'}},'↩ Desfazer')
                );
              })
            )
          )
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
      fontFamily: "'IBM Plex Mono',monospace",
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
      fontFamily: "'IBM Plex Mono',monospace",
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
      fontFamily: "'IBM Plex Mono',monospace",
      cursor: "pointer"
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "'IBM Plex Mono',monospace",
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
      fontFamily: "'IBM Plex Mono',monospace",
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
      fontFamily: "'IBM Plex Mono',monospace"
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
      fontFamily: "'IBM Plex Mono',monospace",
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
function MagicLinkScreen() {
  const [email, setEmail] = useState("pedroica@gmail.com");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  // Detect session expiry: CRM data exists but no auth token
  const sessionExpired = !!localStorage.getItem('ghub_session_warn') ||
    (!localStorage.getItem('sb-uetltlnjmobeiunxfsqi-auth-token') &&
     (localStorage.getItem('ghub_accs') || localStorage.getItem('ghub_me_session')));
  useEffect(() => { if (sessionExpired) localStorage.removeItem('ghub_session_warn'); }, []);
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
      sessionExpired && /*#__PURE__*/React.createElement("div", { style: { ...s,fontSize:10,color:"#FBBF24",background:"rgba(251,191,36,.1)",border:".5px solid rgba(251,191,36,.3)",borderRadius:6,padding:"8px 12px",marginBottom:12,textAlign:"center" } }, "⚠ Sessão expirada — faça login novamente"),
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
  const [navSection, setNavSection] = useState('hoje'); // abre no painel do agente (Hoje)
  const [agenciaId, setAgenciaId] = useState('gaia');
  const [agenciaTab, setAgenciaTab] = useState('pipeline'); // pipeline|noticias|servicos|cases|credenciais|textos
  const ALL_AGENCIAS = [
    ...(typeof GRUPO !== 'undefined' ? GRUPO : []),
    {id:'atelie', name:'Ateliê', color:'#E879F9', rgb:'232,121,249'},
    {id:'frame', name:'Frame', color:'#38BDF8', rgb:'56,189,248'},
    {id:'studioga', name:'Studio GA', color:'#A3E635', rgb:'163,230,53'}
  ];
  const curAgencia = agenciaId === 'global' ? {id:'global', name:'Todos', color:'#888'} : (ALL_AGENCIAS.find(a => a.id === agenciaId) || ALL_AGENCIAS[0]);
  const [agenciaUuids, setAgenciaUuids] = useState({});
  useEffect(() => {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON;
    fetch(SUPA_URL + '/rest/v1/crm_agencias?select=id,slug', {
      headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + jwt }
    }).then(function(r) { return r.ok ? r.json() : []; }).then(function(rows) {
      if (!Array.isArray(rows)) return;
      var m = {};
      rows.forEach(function(row) { if (row.slug) m[row.slug] = row.id; });
      setAgenciaUuids(m);
    }).catch(function() {});
  }, []);
  // Menu enxuto (26/11): telas agrupadas em sub-abas. Destinos antigos continuam
  // valendo e caem na aba certa (botões da tela Hoje, retorno do OAuth etc.).
  const [subAba, setSubAba] = useState({ fila: 'enviar', inteligencia: 'inteligencia', pipeline: 'pipeline', admin: null, base: 'empresas' });
  const NAV_ALIAS = { aprovar: ['fila', 'aprovar'], sdr: ['fila', 'agente'], fila: ['fila', 'enviar'], atividade: ['inteligencia', 'atividade'],
    inteligencia: ['inteligencia', 'inteligencia'], base: ['base', 'empresas'], listas: ['base', 'listas'], captura: ['base', 'captura'], placar: ['base', 'placar'], holding: ['pipeline', 'pipeline'], pipeline: ['pipeline', 'pipeline'], blocklist: ['admin', 'blocklist'], templates: ['admin', 'templates'], copiloto: ['admin', 'copiloto'] };
  const SUBABAS = {
    fila: [['aprovar', 'Aprovar'], ['enviar', 'Enviar'], ['agente', 'Agente']],
    pipeline: [['pipeline', 'Pipeline'], ['metas', 'Metas semanais'], ['legado', 'Kanban legado']],
    inteligencia: [['inteligencia', 'Inteligência'], ['atividade', 'Atividade']],
    base: [['empresas', 'Empresas'], ['listas', 'Listas e blitz'], ['captura', 'Cadastro rápido'], ['placar', 'Placar']],
    admin: [['usuarios', 'Usuários', true], ['estilo', 'Meu jeito', true], ['templates', 'Templates'], ['blocklist', 'Blocklist'], ['copiloto', 'Copiloto']]
  };
  const navTo = (section, agId, tab) => {
    const al = NAV_ALIAS[section];
    if (al) { section = al[0]; setSubAba(prev => Object.assign({}, prev, { [al[0]]: al[1] })); }
    setNavSection(section);
    if (agId) { setAgenciaId(agId); setCurGrupo(GRUPO.find(g => g.id === agId) || GRUPO[0]); }
    if (tab) setAgenciaTab(tab);
  };
  const [alertaBadge, setAlertaBadge] = useState(() => lsGet("gh_alertas_v2", []).filter(a => !a.lido).length);
  const [cronAlerta, setCronAlerta] = useState(false);
  const [meuPapel, setMeuPapel] = useState('admin'); // default admin até verificar
  const [minhaAgenciaId, setMinhaAgenciaId] = useState(null);
  const subAtual = navSection === 'admin' ? (subAba.admin || (meuPapel === 'admin' ? 'usuarios' : 'templates')) : subAba[navSection];
  const VISTA = { fila: { aprovar: 'aprovar', agente: 'sdr', enviar: 'fila' }, pipeline: { pipeline: 'pipeline', metas: 'metas', legado: 'legado' },
    inteligencia: { inteligencia: 'inteligencia', atividade: 'atividade' }, base: { empresas: 'base', listas: 'listas', captura: 'captura', placar: 'placar' }, admin: { usuarios: 'admin', estilo: 'estilo', templates: 'templates', blocklist: 'blocklist', copiloto: 'copiloto' } };
  const vista = VISTA[navSection] ? (VISTA[navSection][subAtual] || navSection) : navSection;
  const [acessoNegado, setAcessoNegado] = useState(false);
  useEffect(() => {
    function handleAbordagemCopiloto(e) {
      const p = e.detail || {};
      navTo('base', p.agencia_id || null, null);
      if (p.empresa) setTimeout(() => window.dispatchEvent(new CustomEvent('crm:abrirAbordar', { detail: p })), 500);
    }
    window.addEventListener('copiloto:abordar', handleAbordagemCopiloto);
    return () => window.removeEventListener('copiloto:abordar', handleAbordagemCopiloto);
  }, []);
  useEffect(() => {
    function handleCrmNavigate(e) {
      const d = e.detail || {};
      if (!d.section) return;
      let agId = d.agId || null;
      if (!agId && d.agenciaUUID && agenciaUuids) {
        const entry = Object.entries(agenciaUuids).find(function(kv) { return kv[1] === d.agenciaUUID; });
        agId = entry ? entry[0] : null;
      }
      navTo(d.section, agId, d.tab || null);
    }
    window.addEventListener('crm-navigate', handleCrmNavigate);
    return () => window.removeEventListener('crm-navigate', handleCrmNavigate);
  }, [agenciaUuids]);
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
  // Auto-navega para Fila quando retorna do OAuth Microsoft
  useEffect(() => {
    try {
      if (localStorage.getItem('gh_graph_admin_ok') || localStorage.getItem('gh_gmail_ok') || localStorage.getItem('gh_gmail_error')) navTo('sdr', null, null);
      else if (localStorage.getItem('gh_graph_connected') || localStorage.getItem('gh_graph_error')) navTo('fila', null, null);
    } catch(e) {}
  }, []);
  // Alerta cron: verifica se crons rodaram no dia esperado
  useEffect(() => {
    if (!curUser) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const SUPA_A = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
    const jwt = window.__supaSession?.access_token || SUPA_A;
    fetch('https://uetltlnjmobeiunxfsqi.supabase.co/rest/v1/crm_logs?origem=like.cron:*&criado_em=gte=' + hoje + 'T00:00:00&order=criado_em.desc&limit=100', {
      headers: { apikey: SUPA_A, Authorization: 'Bearer ' + jwt }
    })
    .then(r => r.ok ? r.json() : [])
    .then(logs => {
      if (typeof window.checkCronAlertFromLogs === 'function') {
        setCronAlerta(window.checkCronAlertFromLogs(logs));
      }
    })
    .catch(() => {});
  }, [curUser]);
  // Bloco 7: verificar crm_usuarios e bloquear se não cadastrado
  useEffect(() => {
    if (!curUser) return;
    var email = curUser.email || '';
    if (!email) return;
    var SUPA_A2 = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
    var jwt2 = (window.__supaSession && window.__supaSession.access_token) || SUPA_A2;
    fetch('https://uetltlnjmobeiunxfsqi.supabase.co/rest/v1/crm_usuarios?email=eq.' + encodeURIComponent(email) + '&select=papel,agencia_id,ativo&limit=1', {
      headers: { apikey: SUPA_A2, Authorization: 'Bearer ' + jwt2 }
    }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows) {
      if (!Array.isArray(rows) || rows.length === 0) {
        // Email de admins hardcoded: nunca bloqueiam
        if (email === 'pedro.ica@galeriaholding.co' || email === 'pedroica@gmail.com') {
          setMeuPapel('admin'); setAcessoNegado(false); return;
        }
        setAcessoNegado(true); return;
      }
      var u = rows[0];
      if (!u.ativo) { setAcessoNegado(true); return; }
      setMeuPapel(u.papel || 'leitor');
      setMinhaAgenciaId(u.agencia_id || null);
      setAcessoNegado(false);
      // Atualizar ultimo_acesso_em via service key não disponível no frontend — apenas registra
    }).catch(function(){});
  }, [curUser]);
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
      fontFamily: "'IBM Plex Mono',monospace",
      fontSize: 12
    }
  }, "Carregando...");
  if (!curUser) { return /*#__PURE__*/React.createElement(MagicLinkScreen, null); }
  if (acessoNegado) { return React.createElement("div", {style:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#060606',fontFamily:'IBM Plex Mono,monospace'}}, React.createElement("div",{style:{fontSize:14,color:'#EF4444',marginBottom:12}},'Acesso negado'), React.createElement("div",{style:{fontSize:11,color:'#555',marginBottom:20}},'Este e-mail não está cadastrado no CRM. Peça ao administrador para liberar.'), React.createElement("button",{onClick:logout,style:{fontSize:10,padding:'6px 18px',background:'#1A1A2E',border:'1px solid #2D2D44',color:'#eee',borderRadius:6,cursor:'pointer'}},'Sair')); }
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
      fontFamily: "'IBM Plex Mono',monospace",
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
  }, "Dispensar")), cronAlerta && React.createElement("div", {
  style: { background: '#E24B4A', color: '#fff', padding: '6px 16px', fontSize: 10, fontFamily: 'IBM Plex Mono,monospace', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }
}, "⚠ Cron com falha ou atrasado. Verifique a tela Atividade."), /*#__PURE__*/React.createElement("div", {
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
  React.createElement("div", { className:"tb-nav", style:{ display:'flex', alignItems:'stretch', flex:1 } },
    [['hoje','Hoje'],['pipeline','Pipeline'],['fila','Fila'],['base','Base'],['inteligencia','Inteligência'],['agencia','Agências'],['admin','Admin']].map(([s, l]) =>
      React.createElement("div", {
        key: s,
        onClick: () => { const sub = { fila: 'enviar', inteligencia: 'inteligencia', pipeline: 'pipeline', base: 'empresas' }[s]; if (sub) setSubAba(prev => Object.assign({}, prev, { [s]: sub })); setNavSection(s); },
        style: { display:'flex', alignItems:'center', padding:'0 16px', borderRight:'.5px solid #2D2D44', borderBottom: navSection === s ? '2px solid #FF6B2B' : '2px solid transparent', cursor:'pointer', fontFamily:'IBM Plex Mono,monospace', fontSize:10, color: navSection === s ? '#FF6B2B' : '#9B9BB4', letterSpacing:'.5px', transition:'all .15s', whiteSpace:'nowrap', flexShrink:0 }
      }, l)
    )
  ),
  React.createElement("div", { className:"tb-right", style:{ gap:6 } },
    React.createElement(PausarTudoBtn, null),
    alertaBadge > 0 && React.createElement("span", { style:{ background:'#E24B4A', color:'#fff', borderRadius:'50%', width:16, height:16, fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } }, alertaBadge),
    React.createElement("button", { onClick:() => setToolsOpen(true), style:{ padding:'4px 8px', border:'.5px solid #2D2D44', borderRadius:4, background:'transparent', color:'#9B9BB4', fontSize:9, fontFamily:'IBM Plex Mono,monospace', cursor:'pointer' }, title:'Backup & APIs' }, "🛟"),
    React.createElement("button", { className:'cfgbtn', onClick:() => { setCfgPD(pdKey); setCfgClaude(getClaudeKey()); setCfgOpen(true); }, style:{ borderColor: getClaudeKey() ? '' : 'rgba(255,107,43,.5)', color: getClaudeKey() ? '' : '#FF6B2B' }, title: getClaudeKey() ? 'Configurações' : '⚠ Configure a Claude API Key' }, "⚙", !getClaudeKey() && " ⚠"),
    React.createElement("button", { className:'resbtn', onClick:() => setResOpen(true) }, "⚠"),
    React.createElement("button", { onClick:logout, style:{ padding:'4px 8px', border:'.5px solid #2D2D44', borderRadius:4, background:'transparent', color:'#555', fontSize:9, fontFamily:'IBM Plex Mono,monospace', cursor:'pointer' }, title:'Sair' }, curUser?.name?.split(" ")[0] || "Sair", " ↩")
  )), navSection === 'agencia' && React.createElement("div", { style:{ display:'flex', alignItems:'stretch', background:'#080810', borderBottom:'.5px solid #1A1A2E', paddingLeft: window.innerWidth < 768 ? 8 : 60, height:30, overflowX:'auto', WebkitOverflowScrolling:'touch', flexShrink:0 } },
    [{id:'global', name:'Todos', color:'#9B9BB4'}, ...ALL_AGENCIAS].map(a => React.createElement("div", { key:a.id, onClick:()=>navTo('agencia', a.id, null), style:{ display:'flex', alignItems:'center', padding:'0 12px', borderRight:'.5px solid #1A1A2E', borderBottom: agenciaId===a.id ? '2px solid '+a.color : '2px solid transparent', cursor:'pointer', fontFamily:'IBM Plex Mono,monospace', fontSize:9, color: agenciaId===a.id ? a.color : '#555', whiteSpace:'nowrap', flexShrink:0, transition:'all .15s' } }, a.name))
  ), navSection === 'agencia' && React.createElement("div", { style:{ display:'flex', alignItems:'stretch', background:'#080810', borderBottom:'.5px solid #1A1A2E', paddingLeft: window.innerWidth < 768 ? 8 : 60, height:26, overflowX:'auto', WebkitOverflowScrolling:'touch', flexShrink:0 } },
    [['pipeline','Pipeline'],['noticias','Notícias'],['servicos','Serviços'],['materiais','Materiais'],['enviar','Enviar pipeline']].map(([t,l]) =>
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
  }), SUBABAS[navSection] && React.createElement(BarraSubAbas, {
    abas: SUBABAS[navSection].filter(a => !a[2] || meuPapel === 'admin'),
    atual: subAtual, onChange: t => setSubAba(prev => Object.assign({}, prev, { [navSection]: t }))
  }), vista === 'hoje' ? React.createElement("div", { style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'} }, React.createElement(TelaHoje, { navTo: navTo, meuPapel: meuPapel })) : vista === 'inteligencia' ? React.createElement("div", { style:{flex:1,overflow:'auto',display:'flex',flexDirection:'column'} }, React.createElement(InteligenciaView, { navTo: navTo, meuPapel: meuPapel })) : vista === 'listas' ? (typeof ListasView !== 'undefined' ? React.createElement(ListasView, { navTo: navTo }) : null) : vista === 'captura' ? (typeof CapturaView !== 'undefined' ? React.createElement(CapturaView, { navTo: navTo }) : null) : vista === 'placar' ? (typeof PlacarBase !== 'undefined' ? React.createElement(PlacarBase, null) : null) : vista === 'metas' ? React.createElement("div", { style:{flex:1,overflow:'auto'} }, React.createElement(PainelMetas, { agencias: ALL_AGENCIAS })) : vista === 'legado' ? React.createElement("div", { style:{flex:1,overflow:'auto'} }, React.createElement(LegacyKanbanTab, null)) : vista === 'agencia' ? React.createElement(AgenciaHome, { agencia: curAgencia, tab: agenciaTab, navTo: navTo, agenciaUuids: agenciaUuids }) : vista === 'aprovar' ? React.createElement("div", { className:"panel", style:{flex:1,overflow:'auto'} }, React.createElement(AprovacaoHoje, null)) : vista === 'sdr' ? React.createElement("div", { className:"panel", style:{flex:1,overflow:'auto'} }, React.createElement(SdrView, { navTo: navTo })) : vista === 'fila' ? React.createElement("div", { style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'} }, React.createElement(FilaDoDia, null)) : vista === 'base' ? React.createElement("div", { className:"ws", style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'} }, React.createElement(EmpresasView, { accs: accs, setAccs: setAccs, curGrupo: curGrupo, alertas: lsGet("gh_alertas_v2", []), onKanbanAdd: () => {} })) : vista === 'blocklist' ? React.createElement("div", { className:"panel", style:{flex:1,overflow:'auto'} }, typeof BlocklistView !== 'undefined' ? React.createElement(BlocklistView, null) : React.createElement("div",{style:{padding:32,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:12}},'Blocklist carregando...')) : vista === 'templates' ? React.createElement("div", { className:"ws", style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'} }, React.createElement(TemplatesView, null)) : vista === 'copiloto' ? React.createElement("div", { style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'} }, typeof CopiloView !== 'undefined' ? React.createElement(CopiloView, null) : React.createElement("div",{style:{padding:32,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:12}},'Copiloto carregando...')) : vista === 'atividade' ? React.createElement("div", {style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}, typeof AtividadeView !== 'undefined' ? React.createElement(AtividadeView, null) : React.createElement("div",{style:{padding:32,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:12}},'Atividade carregando...')) : vista === 'pipeline' ? React.createElement("div", {style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}, typeof PipelineGlobalView !== 'undefined' ? React.createElement(PipelineGlobalView, {meuPapel:meuPapel, minhaAgenciaId:minhaAgenciaId}) : React.createElement("div",{style:{padding:32,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:12}},'Pipeline carregando...')) : vista === 'estilo' ? (meuPapel==='admin' ? React.createElement("div", {style:{flex:1,overflow:'auto'}}, typeof EstiloView !== 'undefined' ? React.createElement(EstiloView, null) : null) : null) : vista === 'admin' ? (meuPapel==='admin' ? React.createElement("div", {style:{flex:1,overflow:'auto',display:'flex',flexDirection:'column'}}, typeof AdminView !== 'undefined' ? React.createElement(AdminView, null) : React.createElement("div",{style:{padding:32,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:12}},'Admin carregando...')) : React.createElement("div",{style:{padding:32,color:'#EF4444',fontFamily:'IBM Plex Mono,monospace',fontSize:12}},'Acesso restrito a administradores.')) : null /* telas antigas (viewMode) removidas na limpeza de 26/11 */);
}


var SUPA_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
var SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
function supaFetch(path, opts) {
  var jwt = (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON;
  var hdrs = Object.assign({'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json'}, opts && opts.headers);
  return fetch(SUPA_URL + path, Object.assign({}, opts, {headers: hdrs})).then(function(r){var ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():null;});
}

// Bloco D (SDR) — botão de pânico. Sempre visível na barra do topo. Desliga o
// Piloto Automático na hora e devolve para rascunho os envios agendados que ainda
// não saíram (função sdr_pausar_tudo no banco). Vermelho quando o Piloto está ligado.
function PausarTudoBtn() {
  var _p = React.useState(null); var piloto = _p[0]; var setPiloto = _p[1];
  var _b = React.useState(false); var busy = _b[0]; var setBusy = _b[1];
  function ler() {
    supaFetch('/rest/v1/crm_configuracoes?chave=eq.sdr_piloto_automatico&select=valor').then(function (r) {
      setPiloto(Array.isArray(r) && r[0] ? (r[0].valor === true || r[0].valor === 'true') : false);
    }).catch(function () {});
  }
  React.useEffect(function () { ler(); var t = setInterval(ler, 60000); return function () { clearInterval(t); }; }, []);
  function pausar() {
    if (busy) return;
    if (!window.confirm('Pausar tudo? O Piloto Automático é desligado agora e os envios agendados que ainda não saíram voltam para rascunho.')) return;
    setBusy(true);
    supaFetch('/rest/v1/rpc/sdr_pausar_tudo', { method: 'POST', body: JSON.stringify({ origem: 'tela' }) }).then(function (r) {
      setBusy(false); setPiloto(false);
      window.alert(r && r.ok ? 'Pausado. ' + (r.agendados_cancelados || 0) + ' envio(s) agendado(s) cancelado(s). Nada sai até o Piloto ser religado.' : 'Não consegui confirmar a pausa. Tente de novo ou mande "pausar" no WhatsApp do copiloto.');
    }).catch(function () { setBusy(false); window.alert('Falha de rede. Mande "pausar" no WhatsApp do copiloto.'); });
  }
  var ligado = piloto === true;
  return React.createElement('button', {
    onClick: pausar, 'data-testid': 'pausar-tudo',
    title: ligado ? 'Piloto Automático LIGADO: clique para pausar tudo' : 'Piloto Automático desligado (nada sai sozinho). Clique para garantir a pausa.',
    style: { padding: '4px 8px', border: '.5px solid ' + (ligado ? '#E24B4A' : '#2D2D44'), borderRadius: 4, background: ligado ? 'rgba(226,75,74,.15)' : 'transparent', color: ligado ? '#E24B4A' : '#9B9BB4', fontSize: 9, fontFamily: 'IBM Plex Mono,monospace', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }
  }, busy ? '…' : (ligado ? '⏸ Pausar tudo · piloto ON' : '⏸ Pausar tudo'));
}

// SDR (Blocos E, F, G) — uma tela para o Pedro: respostas para ler, amostra do
// Modo Sombra (aprovar libera o botão de ligar o Piloto) e topo de funil
// (aceitar/descartar candidatos). Nada aqui envia mensagem.
// Fase 3 (SDR) — "Seu dia": o que ficou pronto de madrugada e botões simples.
// Nada aqui envia sozinho: "Enviar e-mails em lote" só roda com o clique e a
// confirmação do Pedro, espaçando 60 a 120 s entre e-mails (entregabilidade).
var SDR_TUTORIAL = [
  ['1. De madrugada', 'Enquanto você dorme, o SDR escolhe as pessoas certas, lê as notícias de cada empresa, o estrategista decide se vale abordar e com qual tese (a blitz de planejamento estratégico), escreve a mensagem e um revisor dá nota. Só passa quem tem nota 8 ou mais.'],
  ['2. Onde estão os rascunhos', 'E-mails: com o Gmail conectado, na sua pasta Rascunhos do Gmail, com a sua assinatura e cópia oculta para o e-mail da Galeria (botão "Abrir Rascunhos no Gmail"). Sem conectar, "Abrir e-mails prontos" abre cada um no Gmail já preenchido. WhatsApp: aba Fila → WhatsApp, com o texto pronto. "Preparar rascunhos agora" faz tudo isso a qualquer hora.'],
  ['3. Revisar e enviar', 'Leia, ajuste o que quiser e envie você mesmo. No WhatsApp use "▶ Sequência": abre uma conversa por vez já com o texto. Na Fila, atalhos: O abre, E marca como enviado, P pula. Escolha Gmail ou Outlook na engrenagem da Fila.'],
  ['4. Respostas e reuniões', 'Quem responde aparece em "Respostas para ler". Interesse vira oportunidade no Pipeline. Marque a reunião lá: é isso que mede a meta de 3 a 4 reuniões a cada 10 contatos.'],
  ['5. Pausar tudo', 'O botão vermelho "Pausar tudo" (no topo) para qualquer coisa na hora. O sistema nunca envia nada sozinho enquanto o Piloto estiver desligado.']
];
function SdrSeuDia(props) {
  var mono = "'IBM Plex Mono',monospace";
  var _s = React.useState(null); var s = _s[0]; var setS = _s[1];
  var _t = React.useState(function () { try { return !localStorage.getItem('gh_sdr_tutorial_visto'); } catch (_) { return false; } }); var tut = _t[0]; var setTut = _t[1];
  var _p = React.useState(0); var passo = _p[0]; var setPasso = _p[1];
  var _m = React.useState(''); var msg = _m[0]; var setMsg = _m[1];
  var _e = React.useState(null); var envio = _e[0]; var setEnvio = _e[1];
  var parar = React.useRef(false);
  function arr(x) { return Array.isArray(x) ? x : []; }
  function api(path, opts) {
    var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
    return fetch(path, Object.assign({}, opts, { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt } })).then(function (r) { return r.json(); });
  }
  function carregar() {
    var hoje = new Date(Date.now() - 20 * 3600e3).toISOString();
    Promise.all([
      supaFetch('/rest/v1/crm_fila?origem=eq.sdr&status=eq.aprovado&apagado_em=is.null&select=id,canal,outlook_message_id,decisor_id,empresa_id,assunto,contexto_para_aprovacao,crm_decisores(nome),crm_empresas(nome)&order=aprovado_em.desc&limit=200'),
      supaFetch('/rest/v1/crm_sdr_respostas?lida_pelo_pedro=eq.false&tipo=neq.auto_resposta&select=id&limit=100'),
      supaFetch('/rest/v1/crm_configuracoes?chave=in.(sdr_demanda_ate,sdr_modo_rascunho,sdr_relogio_ativo)&select=chave,valor'),
      api('/api/enrich?provider=graph-status').catch(function () { return { connected: false }; }),
      api('/api/enrich?provider=gmail-status').catch(function () { return { connected: false }; }),
      supaFetch('/rest/v1/crm_fila?origem=eq.sdr&status=eq.enviado&enviado_em=gte.' + hoje + '&select=id&limit=200')
    ]).then(function (r) {
      r = [r[0], r[1], r[2], r[3], r[5], r[4]];   // [fila, respostas, cfg, outlook, enviados, gmail]
      var fila = arr(r[0]); var cfg = {}; arr(r[2]).forEach(function (x) { cfg[x.chave] = x.valor; });
      setS({
        emails: fila.filter(function (x) { return x.canal === 'email'; }),
        prontos: fila.filter(function (x) { return x.canal === 'email' && x.outlook_message_id; }),
        wa: fila.filter(function (x) { return x.canal === 'whatsapp'; }),
        respostas: arr(r[1]).length, enviadosHoje: arr(r[4]).length, cfg: cfg, outlook: r[3] || { connected: false }, gmail: r[5] || { connected: false }
      });
    }).catch(function () { setS({ emails: [], prontos: [], wa: [], respostas: 0, enviadosHoje: 0, cfg: {}, outlook: { connected: false }, gmail: { connected: false } }); });
  }
  React.useEffect(carregar, []);
  function fecharTut() { try { localStorage.setItem('gh_sdr_tutorial_visto', '1'); } catch (_) {} setTut(false); setPasso(0); }
  function preparar() {
    setMsg('Preparando… o SDR leva de 10 a 30 minutos. Pode fechar a tela.');
    supaFetch('/rest/v1/rpc/sdr_preparar_agora', { method: 'POST', body: '{}' }).then(function (r) {
      if (r && r.ja_em_andamento) setMsg('Já está preparando (até ' + new Date(r.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ').');
      else if (r && r.ok) setMsg('Começou. Os rascunhos vão aparecendo no Outlook e na aba WhatsApp nos próximos minutos.');
      else setMsg('Não deu para iniciar: ' + ((r && (r.message || r.error)) || 'erro'));
      setTimeout(carregar, 4000);
    });
  }
  var _c = React.useState(false); var conectando = _c[0]; var setConectando = _c[1];
  React.useEffect(function () {
    try {
      var er = localStorage.getItem('gh_graph_error');
      if (er) { localStorage.removeItem('gh_graph_error'); setMsg('A Microsoft recusou a conexão: ' + er); }
      if (localStorage.getItem('gh_graph_admin_ok')) { localStorage.removeItem('gh_graph_admin_ok'); setMsg('Aprovado pelo administrador. Agora clique uma vez em "Conectar Outlook".'); }
      if (localStorage.getItem('gh_gmail_ok')) { localStorage.removeItem('gh_gmail_ok'); setMsg('Gmail conectado. Os próximos e-mails aparecem prontos na sua pasta Rascunhos do Gmail.'); }
      var ge = localStorage.getItem('gh_gmail_error');
      if (ge) { localStorage.removeItem('gh_gmail_error'); setMsg('O Google recusou a conexão: ' + ge); }
    } catch (_) {}
  }, []);
  function conectar() {
    if (conectando) return;
    setConectando(true); setMsg('Abrindo a Microsoft…');
    api('/api/enrich?provider=graph-init', { method: 'POST', body: '{}' }).then(function (d) {
      if (d && d.authUrl) window.location.href = d.authUrl;
      else { setConectando(false); setMsg('Não deu para abrir o login da Microsoft: ' + ((d && d.error) || 'erro')); }
    }).catch(function () { setConectando(false); setMsg('Erro de rede ao abrir a Microsoft. Tente de novo.'); });
  }
  var _cg = React.useState(false); var conectandoG = _cg[0]; var setConectandoG = _cg[1];
  function conectarGmail() {
    if (conectandoG) return;
    setConectandoG(true); setMsg('Abrindo o Google…');
    api('/api/enrich?provider=gmail-init', { method: 'POST', body: '{}' }).then(function (d) {
      if (d && d.authUrl) window.location.href = d.authUrl;
      else { setConectandoG(false); setMsg((d && d.error) || 'Não deu para abrir o login do Google.'); }
    }).catch(function () { setConectandoG(false); setMsg('Erro de rede ao abrir o Google. Tente de novo.'); });
  }
  function enviarLote() {
    var lista = (s && s.prontos) || [];
    if (!lista.length) { setMsg('Nenhum rascunho pronto no Outlook ainda.'); return; }
    if (!window.confirm('Enviar ' + lista.length + ' e-mail(s) agora, um a cada 1 a 2 minutos? Mantenha esta tela aberta. Você pode parar a qualquer momento.')) return;
    parar.current = false; var i = 0; setEnvio({ feitos: 0, total: lista.length });
    (function prox() {
      if (parar.current || i >= lista.length) { setEnvio(null); setMsg('Envio em lote: ' + i + ' e-mail(s) enviados.'); carregar(); return; }
      var it = lista[i++];
      api('/api/enrich?provider=' + (s.gmail && s.gmail.connected ? 'gmail-send' : 'graph-send'), { method: 'POST', body: JSON.stringify({ fila_id: it.id, outlook_message_id: it.outlook_message_id, decisor_id: it.decisor_id, empresa_id: it.empresa_id, canal: 'email', assunto: it.assunto, contexto: it.contexto_para_aprovacao }) })
        .catch(function () { return null; })
        .then(function () { setEnvio({ feitos: i, total: lista.length }); if (i < lista.length && !parar.current) setTimeout(prox, 60000 + Math.random() * 60000); else prox(); });
    })();
  }
  var card = { background: '#0d0d1a', border: '.5px solid #FF6B2B', borderRadius: 8, padding: 14, marginBottom: 14 };
  var grande = function (txt, onClick, cor, tid, dis) {
    return React.createElement('button', { 'data-testid': tid, onClick: onClick, disabled: !!dis, style: { fontFamily: mono, fontSize: 12, padding: '10px 14px', borderRadius: 6, border: '1px solid ' + (dis ? '#2D2D44' : cor), background: dis ? 'transparent' : cor + '22', color: dis ? '#555' : cor, cursor: dis ? 'not-allowed' : 'pointer', margin: '0 8px 8px 0' } }, txt);
  };
  var num = function (n, rot, cor) { return React.createElement('div', { style: { minWidth: 120 } }, React.createElement('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 26, color: cor } }, String(n)), React.createElement('div', { style: { fontSize: 10, color: '#9B9BB4' } }, rot)); };
  if (!s) return React.createElement('div', { style: card }, 'Carregando seu dia…');
  var demanda = s.cfg.sdr_demanda_ate && new Date(s.cfg.sdr_demanda_ate) > new Date();
  return React.createElement('div', { style: card, 'data-testid': 'sdr-seu-dia' },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 10 } },
      React.createElement('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 18, color: '#F5F5F5', flex: 1 } }, 'Seu dia'),
      React.createElement('button', { 'data-testid': 'sdr-tutorial-abrir', onClick: function () { setTut(true); }, title: 'Como usar', style: { fontFamily: mono, fontSize: 12, width: 26, height: 26, borderRadius: 13, border: '.5px solid #60A5FA', background: 'transparent', color: '#60A5FA', cursor: 'pointer' } }, '?')),
    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 12 } },
      s.gmail.connected ? num(s.prontos.length, 'e-mails nos seus Rascunhos do Gmail', '#60A5FA')
        : s.outlook.connected ? num(s.prontos.length, 'e-mails nos seus Rascunhos', '#60A5FA') : num(s.emails.length, 'e-mails prontos para abrir', '#60A5FA'),
      (s.gmail.connected || s.outlook.connected) && s.emails.length > s.prontos.length ? num(s.emails.length - s.prontos.length, 'e-mails virando rascunho', '#9B9BB4') : null,
      num(s.wa.length, 'WhatsApp prontos', '#34D399'),
      num(s.respostas, 'respostas para ler', '#FBBF24'),
      num(s.enviadosHoje, 'enviados hoje', '#818CF8')),
    s.gmail.connected && React.createElement('div', { 'data-testid': 'sdr-passos-gmail', style: { color: '#D0D0E0', marginBottom: 10, fontSize: 12, lineHeight: 1.7, borderLeft: '2px solid #34D399', paddingLeft: 10 } },
      React.createElement('div', { style: { color: '#34D399', fontSize: 11 } }, 'Gmail conectado' + (s.gmail.email ? ' (' + s.gmail.email + ')' : '') + '. Nada sai sem você.'),
      React.createElement('div', null, '1. Clique em "Abrir Rascunhos no Gmail".'),
      React.createElement('div', null, '2. Abra cada rascunho, leia e ajuste o que quiser (assinatura e cópia oculta para a Galeria já estão lá).'),
      React.createElement('div', null, '3. Clique em Enviar no próprio Gmail. Ou envie vários de uma vez aqui, em "Enviar e-mails em lote".')),
    s.gmail.connected && s.emails.length > s.prontos.length && React.createElement('div', { style: { color: '#FBBF24', fontSize: 11, marginBottom: 8 } }, (s.emails.length - s.prontos.length) + ' e-mail(s) aprovados ainda virando rascunho. Leva até 3 minutos; se não aparecer, clique em "Criar rascunhos agora".'),
    !s.gmail.connected && !s.outlook.connected && React.createElement('div', { style: { color: '#9B9BB4', marginBottom: 8, fontSize: 11 } }, 'Os e-mails abrem prontos (destinatário, assunto e texto) no Gmail, com cópia para o seu e-mail da Galeria. Conecte o Gmail para recebê-los já na pasta Rascunhos.'),
    React.createElement('div', null,
      grande(demanda ? 'Preparando rascunhos…' : (s.gmail.connected && s.emails.length > s.prontos.length ? 'Criar rascunhos agora' : 'Preparar rascunhos agora'), preparar, '#FF6B2B', 'sdr-preparar', demanda),
      s.gmail.connected
        ? grande('Abrir Rascunhos no Gmail', function () { window.open('https://mail.google.com/mail/' + (s.gmail.email ? '?authuser=' + encodeURIComponent(s.gmail.email) : 'u/0/') + '#drafts', '_blank'); }, '#60A5FA', 'sdr-abrir-gmail')
        : s.outlook.connected
        ? grande('Abrir Rascunhos no Outlook', function () { window.open('https://outlook.office.com/mail/drafts', '_blank'); }, '#60A5FA', 'sdr-abrir-outlook')
        : grande('Abrir e-mails prontos', function () { try { localStorage.setItem('gh_fila_tab', 'email'); } catch (_) {} props.navTo && props.navTo('fila'); }, '#60A5FA', 'sdr-abrir-emails', !s.emails.length),
      !s.gmail.connected && !s.outlook.connected && grande(conectandoG ? 'Abrindo o Google…' : 'Conectar Gmail', conectarGmail, '#FBBF24', 'sdr-conectar-gmail', conectandoG),
      grande('Abrir WhatsApp em sequência', function () { try { localStorage.setItem('gh_fila_tab', 'whatsapp'); } catch (_) {} props.navTo && props.navTo('fila'); }, '#34D399', 'sdr-whatsapp', !s.wa.length),
      !(s.outlook.connected || s.gmail.connected) ? null : envio
        ? grande('Parar envio (' + envio.feitos + '/' + envio.total + ')', function () { parar.current = true; }, '#E24B4A', 'sdr-parar-lote')
        : grande('Enviar e-mails em lote (' + s.prontos.length + ')', enviarLote, '#818CF8', 'sdr-enviar-lote', !s.prontos.length)),
    !s.outlook.connected && !s.gmail.connected && React.createElement('div', { style: { marginTop: 2 } },
      React.createElement('a', { href: '#', 'data-testid': 'sdr-conectar-outlook', onClick: function (e) { e.preventDefault(); conectar(); }, style: { color: '#555', fontSize: 10 } }, conectando ? 'Abrindo a Microsoft…' : 'Conectar Outlook (opcional: rascunhos na pasta e envio em lote)')),
    s.gmail.connected && React.createElement('div', { style: { marginTop: 2 } },
      React.createElement('a', { href: '#', 'data-testid': 'sdr-reconectar-google', onClick: function (e) { e.preventDefault(); conectarGmail(); }, style: { color: '#555', fontSize: 10 } }, conectandoG ? 'Abrindo o Google…' : 'Reconectar Google (libera a Agenda para o amigo no Telegram)')),
    msg && React.createElement('div', { style: { color: '#34D399', fontSize: 11, marginTop: 4 } }, msg),
    tut && React.createElement('div', { 'data-testid': 'sdr-tutorial', style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
      React.createElement('div', { style: { background: '#0d0d1a', border: '.5px solid #FF6B2B', borderRadius: 10, padding: 20, maxWidth: 480, width: '100%', fontFamily: mono } },
        React.createElement('div', { style: { fontSize: 10, color: '#9B9BB4', marginBottom: 6 } }, 'Como usar o SDR · passo ' + (passo + 1) + ' de ' + SDR_TUTORIAL.length),
        React.createElement('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 18, color: '#F5F5F5', marginBottom: 10 } }, SDR_TUTORIAL[passo][0]),
        React.createElement('div', { style: { fontSize: 12, color: '#D0D0E0', lineHeight: 1.6, marginBottom: 16 } }, SDR_TUTORIAL[passo][1]),
        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          passo > 0 && grande('Voltar', function () { setPasso(passo - 1); }, '#9B9BB4', 'sdr-tut-voltar'),
          React.createElement('span', { style: { flex: 1 } }),
          passo < SDR_TUTORIAL.length - 1
            ? grande('Próximo', function () { setPasso(passo + 1); }, '#FF6B2B', 'sdr-tut-proximo')
            : grande('Entendi', fecharTut, '#34D399', 'sdr-tut-fim')))));
}

function SdrView(props) {
  var mono = "'IBM Plex Mono',monospace";
  var _d = React.useState({ cfg: {}, resp: [], amostra: [], topo: [] }); var d = _d[0]; var setD = _d[1];
  var _l = React.useState(true); var loading = _l[0]; var setLoading = _l[1];
  var _msg = React.useState(''); var msg = _msg[0]; var setMsg = _msg[1];
  function arr(x) { return Array.isArray(x) ? x : []; }
  function carregar() {
    setLoading(true);
    Promise.all([
      supaFetch('/rest/v1/crm_configuracoes?chave=in.(sdr_piloto_automatico,sdr_relogio_ativo,sdr_amostra_aprovada,sdr_wa_template,sdr_modo_sombra,sdr_usd_brl)&select=chave,valor'),
      supaFetch('/rest/v1/crm_sdr_respostas?lida_pelo_pedro=eq.false&tipo=neq.auto_resposta&select=id,tipo,assunto,preview,recebido_em,remetente,acao,crm_decisores:decisor_id(nome,cargo),crm_empresas:empresa_id(nome)&order=recebido_em.desc&limit=50'),
      supaFetch('/rest/v1/crm_sdr_mensagens?sombra=eq.true&arquivada=eq.false&select=id,estado_id,escolhida,canal,assunto,corpo,nota_media,nota_aderencia,nota_especificidade,nota_naturalidade,nota_clareza,nota_risco,aprovado_autonomo,motivo_qc,sinal_url,sinal_tipo,case_titulo,angulo,custo_usd,custo_qc_usd,criado_em,crm_agencias:agencia_id(nome,slug),crm_empresas:empresa_id(nome),crm_decisores:decisor_id(nome,cargo),crm_dossies:dossie_id(sinais)&order=criado_em.desc&limit=1000'),
      supaFetch('/rest/v1/crm_sdr_topo?status=eq.novo&select=id,fonte,empresa_id,nome,dominio,agencia_slug,motivo,score,dados&order=score.desc&limit=100'),
      supaFetch('/rest/v1/crm_pedidos_internos?status=eq.rascunho&select=id,agencia_slug,destinatario_email,assunto,corpo&order=agencia_slug')
    ]).then(function (r) {
      var cfg = {}; arr(r[0]).forEach(function (x) { cfg[x.chave] = x.valor; });
      var todas = arr(r[2]);
      setD({ cfg: cfg, resp: arr(r[1]), todas: todas, amostra: SdrView.amostra(todas), placar: SdrView.placar(todas, Number(cfg.sdr_usd_brl) || 5.4), topo: arr(r[3]), pedidos: arr(r[4]) }); setLoading(false);
    }).catch(function () { setLoading(false); });
  }
  React.useEffect(carregar, []);
  var lig = function (v) { return v === true || v === 'true'; };
  var piloto = lig(d.cfg.sdr_piloto_automatico), relogio = lig(d.cfg.sdr_relogio_ativo);
  var amostraOk = d.cfg.sdr_amostra_aprovada && d.cfg.sdr_amostra_aprovada.em;
  var user = (window.__supaSession && window.__supaSession.user && window.__supaSession.user.email) || 'tela';

  function marcarLida(id) { supaFetch('/rest/v1/crm_sdr_respostas?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ lida_pelo_pedro: true }) }).then(carregar); }
  function aprovarAmostra() {
    if (d.amostra.length < 20 && !window.confirm('A amostra tem ' + d.amostra.length + ' mensagens (o combinado são 20). Aprovar mesmo assim?')) return;
    var v = { em: new Date().toISOString(), por: user, ids: d.amostra.map(function (m) { return m.id; }) };
    supaFetch('/rest/v1/crm_configuracoes?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ chave: 'sdr_amostra_aprovada', valor: v }) })
      .then(function () { setMsg('Amostra aprovada. O Piloto continua desligado até você ligar.'); carregar(); });
  }
  function ligarPiloto() {
    if (!window.confirm('Ligar o Piloto Automático? A partir da próxima janela (07h30 às 11h, dias úteis) mensagens com nota 8+ e risco baixo SAEM SOZINHAS, dentro do teto de aquecimento. O botão Pausar tudo desliga na hora.')) return;
    supaFetch('/rest/v1/crm_configuracoes?chave=eq.sdr_piloto_automatico', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ valor: true }) })
      .then(function () { setMsg('Piloto Automático LIGADO.'); carregar(); });
  }
  function pedidoEnviado(p) {
    supaFetch('/rest/v1/crm_pedidos_internos?id=eq.' + p.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'enviado', enviado_em: new Date().toISOString() }) }).then(carregar);
  }
  function copiar(t) { try { navigator.clipboard.writeText(t); setMsg('Texto copiado.'); } catch (_) { window.prompt('Copie o texto:', t); } }
  function decidirTopo(t, status) {
    var p = supaFetch('/rest/v1/crm_sdr_topo?id=eq.' + t.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: status, atualizado_em: new Date().toISOString() }) });
    if (status === 'aceito' && !t.empresa_id && t.nome) {
      // Lookalike aceito vira empresa na base; o enriquecimento diário acha os decisores.
      p = p.then(function () { return supaFetch('/rest/v1/crm_empresas', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ nome: t.nome, dominio: t.dominio, website: t.dominio ? 'https://' + t.dominio : null, fonte: 'lookalike' }) }); })
        .then(function (r) { var e = arr(r)[0]; if (e) return supaFetch('/rest/v1/crm_sdr_topo?id=eq.' + t.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ empresa_id: e.id }) }); });
    }
    p.then(carregar);
  }

  var card = { background: '#0d0d1a', border: '.5px solid #2D2D44', borderRadius: 8, padding: 14, marginBottom: 14 };
  var h = function (t) { return React.createElement('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 15, color: '#F5F5F5', marginBottom: 10 } }, t); };
  var pill = function (txt, cor) { return React.createElement('span', { style: { fontFamily: mono, fontSize: 9, padding: '2px 6px', borderRadius: 4, border: '.5px solid ' + cor, color: cor, marginRight: 6 } }, txt); };
  var btn = function (txt, onClick, cor, dis) { return React.createElement('button', { onClick: onClick, disabled: !!dis, style: { fontFamily: mono, fontSize: 10, padding: '5px 10px', borderRadius: 4, border: '.5px solid ' + (cor || '#2D2D44'), background: 'transparent', color: dis ? '#555' : (cor || '#9B9BB4'), cursor: dis ? 'not-allowed' : 'pointer', marginRight: 6 } }, txt); };
  var corTipo = { interesse: '#34D399', indicacao: '#60A5FA', nao_agora: '#FBBF24', opt_out: '#E24B4A', bounce: '#9B9BB4', indefinido: '#818CF8' };
  var corFonte = { cross_sell: '#34D399', sinal_compra: '#FF6B2B', lookalike: '#818CF8' };

  if (loading) return React.createElement('div', { style: { padding: 24, fontFamily: mono, color: '#9B9BB4', fontSize: 11 } }, 'Carregando SDR…');
  return React.createElement('div', { 'data-testid': 'sdr-view', style: { padding: '16px 20px', maxWidth: 1100, margin: '0 auto', fontFamily: mono, color: '#D0D0E0', fontSize: 11 } },
    React.createElement('div', { style: Object.assign({}, card, { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }) },
      pill('Relógio ' + (relogio ? 'ON (Modo Sombra)' : 'OFF'), relogio ? '#34D399' : '#9B9BB4'),
      pill('Piloto ' + (piloto ? 'ON: envia sozinho' : 'OFF: para no rascunho'), piloto ? '#E24B4A' : '#9B9BB4'),
      pill('Amostra ' + (amostraOk ? 'aprovada' : 'pendente'), amostraOk ? '#34D399' : '#FBBF24'),
      pill('WhatsApp ' + (d.cfg.sdr_wa_template && d.cfg.sdr_wa_template.nome ? 'modelo aprovado' : 'aguardando Meta'), '#60A5FA'),
      React.createElement('span', { style: { flex: 1 } }),
      !piloto && btn('Ligar Piloto Automático', ligarPiloto, '#E24B4A', !amostraOk),
      React.createElement(PausarTudoBtn, null)
    ),
    msg && React.createElement('div', { style: { color: '#34D399', marginBottom: 10 } }, msg),
    React.createElement(SdrSeuDia, { navTo: props && props.navTo }),

    React.createElement('div', { style: card }, h('Respostas para ler (' + d.resp.length + ')'),
      d.resp.length === 0 ? React.createElement('div', { style: { color: '#555' } }, 'Nenhuma resposta nova. Respostas nunca recebem retorno automático: são suas.') :
      d.resp.map(function (r) {
        return React.createElement('div', { key: r.id, style: { borderTop: '.5px solid #1A1A2E', padding: '8px 0' } },
          pill(r.tipo, corTipo[r.tipo] || '#9B9BB4'),
          React.createElement('b', null, (r.crm_decisores && r.crm_decisores.nome) || r.remetente), ' · ', (r.crm_empresas && r.crm_empresas.nome) || '', ' · ', new Date(r.recebido_em).toLocaleString('pt-BR'),
          React.createElement('div', { style: { color: '#9B9BB4', margin: '4px 0' } }, (r.preview || '').slice(0, 280)),
          r.acao && React.createElement('div', { style: { color: '#555', fontSize: 9 } }, 'feito: ' + r.acao),
          btn('Marcar como lida', function () { marcarLida(r.id); }));
      })),

    d.placar && d.placar.geradas > 0 && React.createElement('div', { style: card, 'data-testid': 'sdr-placar' }, h('Placar do Modo Sombra'),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 10 } },
        [['versões geradas', d.placar.geradas], ['leads avaliados', d.placar.leads], ['aprovados no QC', d.placar.aprovados], ['retidos', d.placar.retidos],
         ['reprovação', d.placar.taxaReprovacao + '%'], ['nota média', d.placar.notaMedia], ['custo por aprovada', 'R$ ' + d.placar.custoPorAprovadaBRL]].map(function (x) {
          return React.createElement('div', { key: x[0] }, React.createElement('div', { style: { fontSize: 18, color: '#F5F5F5', fontFamily: "'Syne',sans-serif" } }, String(x[1])), React.createElement('div', { style: { fontSize: 9, color: '#9B9BB4' } }, x[0]));
        })),
      React.createElement('div', { style: { color: '#9B9BB4', marginBottom: 4 } }, 'Motivos de retenção:'),
      d.placar.motivos.map(function (m) { return React.createElement('div', { key: m[0] }, '· ' + m[0] + ': ' + m[1]); }),
      React.createElement('div', { style: { color: '#9B9BB4', margin: '8px 0 4px' } }, 'Por empresa do grupo (leads · aprovados · nota média):'),
      d.placar.porAgencia.map(function (a) { return React.createElement('div', { key: a.nome }, '· ' + a.nome + ': ' + a.leads + ' · ' + a.aprovados + ' · ' + a.nota); })),

    React.createElement('div', { style: card }, h('Amostra do Modo Sombra (' + d.amostra.length + '/20)'),
      React.createElement('div', { style: { color: '#9B9BB4', marginBottom: 8 } }, 'As últimas mensagens escolhidas pelo SDR, com nota do controle de qualidade e a fonte do fato. Aprovar libera o botão de ligar o Piloto; não envia nada.'),
      d.amostra.length === 0 ? React.createElement('div', { style: { color: '#555' } }, 'Ainda não há mensagens. Elas aparecem depois das noites de Modo Sombra (relógio ligado, piloto desligado).') :
      d.amostra.map(function (m) {
        return React.createElement('div', { key: m.id, style: { borderTop: '.5px solid #1A1A2E', padding: '8px 0' } },
          pill('nota ' + (m.nota_media == null ? '?' : m.nota_media), m.aprovado_autonomo ? '#34D399' : '#FBBF24'), pill(m.canal, '#60A5FA'), pill(m.angulo || '', '#818CF8'),
          React.createElement('b', null, (m.crm_decisores && m.crm_decisores.nome) || ''), ' · ', (m.crm_empresas && m.crm_empresas.nome) || '',
          m.assunto && React.createElement('div', { style: { color: '#F5F5F5', marginTop: 4 } }, 'Assunto: ' + m.assunto),
          React.createElement('div', { style: { whiteSpace: 'pre-wrap', margin: '4px 0', color: '#D0D0E0' } }, m.corpo),
          (function () { var sg = ((m.crm_dossies && m.crm_dossies.sinais) || []).find(function (x) { return x.url === m.sinal_url; });
            return sg ? React.createElement('div', { style: { color: '#9B9BB4', fontSize: 10, borderLeft: '2px solid #2D2D44', paddingLeft: 8, margin: '4px 0' } }, 'Dossiê [' + sg.tipo + '] ' + (sg.fonte || '') + ' ' + (sg.data || '') + ': "' + String(sg.trecho || sg.fato || '').slice(0, 240) + '"') : null; })(),
          React.createElement('div', { style: { fontSize: 10, color: '#9B9BB4' } }, 'Agência: ' + ((m.crm_agencias && m.crm_agencias.nome) || '?') + ' · Case: ' + (m.case_titulo || 'nenhum (sem número)') +
            (m.nota_media == null ? '' : ' · notas A' + m.nota_aderencia + ' E' + m.nota_especificidade + ' N' + m.nota_naturalidade + ' C' + m.nota_clareza + ' risco ' + m.nota_risco)),
          m.sinal_url && React.createElement('a', { href: m.sinal_url, target: '_blank', rel: 'noopener', style: { color: '#60A5FA', fontSize: 9 } }, 'fonte do fato'),
          !m.aprovado_autonomo && m.motivo_qc && React.createElement('div', { style: { color: '#FBBF24', fontSize: 9 } }, 'QC: ' + m.motivo_qc.slice(0, 220)));
      }),
      d.amostra.length > 0 && !amostraOk && React.createElement('div', { style: { marginTop: 10 } }, btn('Aprovar amostra', aprovarAmostra, '#34D399'))),

    (d.pedidos || []).length > 0 && React.createElement('div', { style: card, 'data-testid': 'sdr-pedidos' }, h('Pedidos de case para as agências (' + d.pedidos.length + ')'),
      React.createElement('div', { style: { color: '#9B9BB4', marginBottom: 8 } }, 'Rascunhos prontos. O sistema não envia: você abre no Outlook, escolhe o destinatário e envia.'),
      d.pedidos.map(function (p) {
        var mailto = 'mailto:' + encodeURIComponent(p.destinatario_email || '') + '?subject=' + encodeURIComponent(p.assunto) + '&body=' + encodeURIComponent(p.corpo);
        return React.createElement('div', { key: p.id, style: { borderTop: '.5px solid #1A1A2E', padding: '8px 0' } },
          pill(p.agencia_slug, '#FF6B2B'), React.createElement('b', null, p.assunto),
          React.createElement('div', { style: { whiteSpace: 'pre-wrap', color: '#D0D0E0', margin: '6px 0', maxHeight: 140, overflow: 'auto' } }, p.corpo),
          React.createElement('a', { href: mailto, style: { textDecoration: 'none' } }, btn('Abrir no Outlook', function () {}, '#60A5FA')),
          btn('Copiar texto', function () { copiar(p.corpo); }),
          btn('Marquei como enviado', function () { pedidoEnviado(p); }, '#34D399'));
      })),

    React.createElement('div', { style: card }, h('Topo de funil (' + d.topo.length + ' novos)'),
      React.createElement('div', { style: { color: '#9B9BB4', marginBottom: 8 } }, 'Cross-sell (cliente de uma agência, lead para outra), sinais de compra e empresas parecidas com os melhores clientes. Aceitar coloca na frente da próxima seleção.'),
      d.topo.map(function (t) {
        return React.createElement('div', { key: t.id, style: { borderTop: '.5px solid #1A1A2E', padding: '8px 0', display: 'flex', gap: 8, alignItems: 'flex-start' } },
          React.createElement('div', { style: { flex: 1 } },
            pill(t.fonte.replace('_', ' '), corFonte[t.fonte] || '#9B9BB4'), t.agencia_slug && pill('→ ' + t.agencia_slug, '#FF6B2B'),
            React.createElement('b', null, t.nome || t.dominio),
            React.createElement('div', { style: { color: '#9B9BB4', marginTop: 4 } }, t.motivo),
            t.dados && t.dados.url && React.createElement('a', { href: t.dados.url, target: '_blank', rel: 'noopener', style: { color: '#60A5FA', fontSize: 9 } }, 'fonte')),
          btn('Aceitar', function () { decidirTopo(t, 'aceito'); }, '#34D399'),
          btn('Descartar', function () { decidirTopo(t, 'descartado'); }));
      }))
  );
}

// Amostra: as escolhidas, aprovadas primeiro, intercalando empresas do grupo (até 20).
SdrView.amostra = function (todas) {
  var esc = todas.filter(function (m) { return m.escolhida; });
  esc.sort(function (a, b) { return (Number(b.aprovado_autonomo) - Number(a.aprovado_autonomo)) || ((b.nota_media || 0) - (a.nota_media || 0)); });
  var grupos = {}, ordem = [];
  esc.forEach(function (m) { var k = (m.crm_agencias && m.crm_agencias.slug) || '?'; if (!grupos[k]) { grupos[k] = []; ordem.push(k); } grupos[k].push(m); });
  var out = [];
  for (var i = 0; out.length < 20; i++) { var add = false; ordem.forEach(function (k) { if (grupos[k][i] && out.length < 20) { out.push(grupos[k][i]); add = true; } }); if (!add) break; }
  return out;
};
// Placar: versões, leads, aprovados/retidos (pela escolhida de cada lead), motivos, nota por agência e custo.
SdrView.placar = function (todas, cambio) {
  var esc = todas.filter(function (m) { return m.escolhida; });
  var aprov = esc.filter(function (m) { return m.aprovado_autonomo; }).length;
  var custo = todas.reduce(function (s, m) { return s + Number(m.custo_usd || 0) + Number(m.custo_qc_usd || 0); }, 0);
  var motivos = {};
  esc.filter(function (m) { return !m.aprovado_autonomo; }).forEach(function (m) {
    var parte = String(m.motivo_qc || '').split('||').pop();
    parte.split('|').forEach(function (p) { var k = p.trim().replace(/\s*\(.*$/, '').replace(/\d+(\.\d+)?/g, 'N').slice(0, 60); if (k) motivos[k] = (motivos[k] || 0) + 1; });
  });
  var ag = {};
  esc.forEach(function (m) { var k = (m.crm_agencias && m.crm_agencias.nome) || '?'; ag[k] = ag[k] || { nome: k, leads: 0, aprovados: 0, soma: 0 }; ag[k].leads++; ag[k].soma += Number(m.nota_media || 0); if (m.aprovado_autonomo) ag[k].aprovados++; });
  var notas = esc.map(function (m) { return Number(m.nota_media || 0); });
  return {
    geradas: todas.length, leads: esc.length, aprovados: aprov, retidos: esc.length - aprov,
    taxaReprovacao: esc.length ? Math.round(((esc.length - aprov) / esc.length) * 100) : 0,
    notaMedia: notas.length ? Math.round(notas.reduce(function (a, b) { return a + b; }, 0) / notas.length * 10) / 10 : 0,
    custoBRL: Math.round(custo * cambio * 100) / 100,
    custoPorAprovadaBRL: aprov ? (Math.round(custo * cambio / aprov * 100) / 100).toFixed(2) : '–',
    motivos: Object.entries(motivos).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8),
    porAgencia: Object.values(ag).map(function (a) { return { nome: a.nome, leads: a.leads, aprovados: a.aprovados, nota: Math.round(a.soma / a.leads * 10) / 10 }; }).sort(function (a, b) { return b.leads - a.leads; })
  };
};

// E1 — Tela Hoje: progresso diário, aprovações pendentes, reuniões do dia
// Painel do agente (topo da tela Hoje). Responde em segundos: o que o agente fez
// esta noite, o que está pronto para você, o que deu errado e o próximo passo.
// Tudo é leitura: nenhum botão daqui envia nada.
// Botão "Produzir rascunhos agora" + progresso REAL. O botão chama a mesma RPC do
// relógio noturno (sdr_preparar_agora abre uma janela de 45 min no mesmo pipeline:
// seleção → dossiê → estrategista → redação → QC → rascunho no Gmail). O progresso
// é lido do banco (estado de cada lead, fila e logs), nunca estimado.
function ProducaoAgora(props) {
  var mono = "'IBM Plex Mono',monospace";
  var _p = React.useState(null); var p = _p[0]; var setP = _p[1];
  var _b = React.useState(false); var busy = _b[0]; var setBusy = _b[1];
  var _m = React.useState(''); var msg = _m[0]; var setMsg = _m[1];
  var _meta = React.useState(String(props.meta || 20)); var meta = _meta[0]; var setMeta = _meta[1];
  var admin = props.meuPapel === 'admin';
  function arr(x) { return Array.isArray(x) ? x : []; }
  function carregar() {
    Promise.all([
      supaFetch('/rest/v1/crm_logs?origem=eq.sdr-preparar-agora&order=criado_em.desc&limit=1&select=criado_em'),
      supaFetch('/rest/v1/crm_configuracoes?chave=eq.sdr_demanda_ate&select=valor')
    ]).then(function (r) {
      var ini = arr(r[0])[0] && arr(r[0])[0].criado_em;
      var ate = arr(r[1])[0] && arr(r[1])[0].valor;
      var ativo = !!(ate && new Date(ate) > new Date());
      if (!ini || Date.now() - new Date(ini).getTime() > 6 * 3600e3) { setP({ ativo: ativo, ini: null }); return; }
      return Promise.all([
        supaFetch('/rest/v1/crm_sdr_estado?atualizado_em=gte.' + ini + '&sombra=eq.false&select=etapa,status,motivo&limit=2000'),
        supaFetch('/rest/v1/crm_fila?origem=eq.sdr&gerado_em=gte.' + ini + '&apagado_em=is.null&select=canal,outlook_message_id,rascunho_erro&limit=500'),
        supaFetch('/rest/v1/crm_logs?criado_em=gte.' + ini + '&or=(nivel.eq.error,mensagem.eq.fim)&select=origem,nivel,mensagem,contexto,criado_em&order=criado_em.asc&limit=500')
      ]).then(function (q) {
        var est = arr(q[0]), fila = arr(q[1]), logs = arr(q[2]);
        var fins = function (o) { return logs.filter(function (l) { return l.origem === 'cron:' + o && l.mensagem === 'fim'; }); };
        var c = function (e) { return est.filter(function (x) { return x.etapa === e && x.status === 'ativo'; }).length; };
        var sel = fins('sdr-selecao').reduce(function (a, l) { return a + (Number(l.contexto && l.contexto.gravados) || 0); }, 0);
        var emails = fila.filter(function (x) { return x.canal === 'email'; });
        setP({
          ativo: ativo, ini: ini, ate: ate,
          selecionados: sel, selecaoRodou: fins('sdr-selecao').length > 0,
          pesquisando: c('selecionado') + c('dossie'), pesquisados: est.filter(function (x) { return x.etapa !== 'selecionado'; }).length,
          estrategia: c('estrategia'), revisao: c('redigido'),
          vetados: est.filter(function (x) { return /estrategista: n[ãa]o abordar|encaixe \d+ <|sem sinal p[úu]blico|sem canal|sem empresa/.test(x.motivo || ''); }).length,
          retidos: est.filter(function (x) { return x.etapa === 'avaliado' && /< 8|risco \d|lastro|forma:|numeros|personaliza/.test(x.motivo || ''); }).length,
          produzidos: emails.length, noGmail: emails.filter(function (x) { return x.outlook_message_id; }).length,
          errGmail: emails.filter(function (x) { return !x.outlook_message_id && x.rascunho_erro; }),
          wa: fila.filter(function (x) { return x.canal === 'whatsapp'; }).length,
          erros: logs.filter(function (l) { return l.nivel === 'error'; })
        });
      });
    }).catch(function () {});
  }
  React.useEffect(function () { carregar(); var t = setInterval(carregar, 10000); return function () { clearInterval(t); }; }, []);
  function produzir() {
    if (!props.gmailOk) { setMsg('O Gmail não está conectado: sem ele nenhum rascunho é criado. Conecte na aba SDR antes.'); return; }
    if ((props.feitosHoje || 0) >= (props.meta || 0)) { setMsg('A meta de hoje já foi atingida (' + props.feitosHoje + '/' + props.meta + '). Para produzir mais, aumente a meta' + (admin ? ' ao lado.' : ' (peça a um admin).')); return; }
    setBusy(true); setMsg('Iniciando produção…');
    supaFetch('/rest/v1/rpc/sdr_preparar_agora', { method: 'POST', body: '{}' }).then(function (r) {
      setBusy(false);
      if (r && r.ja_em_andamento) setMsg('A produção já está em andamento (até ' + new Date(r.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ').');
      else if (r && r.ok) setMsg('');
      else setMsg('Não deu para iniciar: ' + ((r && (r.message || r.error)) || 'erro'));
      setTimeout(carregar, 1500);
    }).catch(function () { setBusy(false); setMsg('Falha de rede: a produção não foi iniciada.'); });
  }
  function salvarCfg(chave, valor, aviso) {
    supaFetch('/rest/v1/crm_configuracoes?chave=eq.' + chave, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ valor: valor }) })
      .then(function (r) { setMsg(Array.isArray(r) && r.length ? aviso : 'Não deu para salvar a configuração.'); props.aoMudar && props.aoMudar(); });
  }

  // Etapas reais (✓ feito, ● em andamento, ○ ainda não).
  var etapas = [];
  if (p && p.ini) {
    var fimTudo = !p.ativo;
    etapas = [
      ['Iniciando produção', p.selecaoRodou ? 'ok' : 'agora', p.selecaoRodou ? p.selecionados + ' novos leads selecionados' : 'aguardando a seleção'],
      ['Pesquisando oportunidades', p.pesquisando ? 'agora' : (p.pesquisados ? 'ok' : (fimTudo ? 'ok' : 'nao')), p.pesquisados + ' pesquisados' + (p.pesquisando ? ', ' + p.pesquisando + ' na fila de pesquisa' : '') + (p.vetados ? ' · ' + p.vetados + ' sem oportunidade real (não abordados)' : '')],
      ['Elaborando mensagens', p.estrategia ? 'agora' : (p.produzidos || p.revisao ? 'ok' : (fimTudo ? 'ok' : 'nao')), p.estrategia ? p.estrategia + ' com o estrategista/redação' : ''],
      ['Revisando qualidade', p.revisao ? 'agora' : (p.produzidos || p.retidos ? 'ok' : (fimTudo ? 'ok' : 'nao')), (p.produzidos ? p.produzidos + ' aprovados no controle de qualidade' : '') + (p.retidos ? ' · ' + p.retidos + ' retidos' : '')],
      ['Criando rascunhos no Gmail', p.produzidos > p.noGmail + p.errGmail.length ? 'agora' : (p.noGmail ? 'ok' : (fimTudo ? 'ok' : 'nao')), p.noGmail + ' de ' + p.produzidos + ' criados no Gmail' + (p.wa ? ' · ' + p.wa + ' WhatsApp prontos' : '')],
      ['Produção concluída', fimTudo ? 'ok' : 'nao', fimTudo ? (p.noGmail + ' rascunho(s) no Gmail nesta produção') : 'até ' + (p.ate ? new Date(p.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')]
    ];
  }
  var cor = { ok: '#34D399', agora: '#FBBF24', nao: '#444' };
  var sim = { ok: '✓', agora: '●', nao: '○' };
  var emAndamento = p && p.ativo;

  return React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 10, borderTop: '.5px solid #1A1A2E', borderBottom: '.5px solid #1A1A2E', padding: '12px 0' } },
    React.createElement("div", { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
      React.createElement("button", { onClick: produzir, disabled: busy || emAndamento, 'data-testid': 'produzir-agora',
        style: { fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '.5px', padding: '10px 18px', borderRadius: 6, border: 'none', background: (busy || emAndamento) ? '#2D2D44' : '#FF6B2B', color: '#fff', cursor: (busy || emAndamento) ? 'default' : 'pointer' } },
        emAndamento ? 'PRODUZINDO…' : 'PRODUZIR RASCUNHOS AGORA'),
      React.createElement("span", { style: { fontFamily: mono, fontSize: 9, color: '#555', flex: 1, minWidth: 200 } }, 'Mesmo pipeline da madrugada: pesquisa, estrategista, controle de qualidade e rascunho real no Gmail. Nada é enviado.'),
      admin && React.createElement("span", { style: { display: 'flex', gap: 6, alignItems: 'center', fontFamily: mono, fontSize: 9, color: '#9B9BB4' } },
        'Meta/dia', React.createElement("input", { type: 'number', min: 0, max: 60, value: meta, onChange: function (e) { setMeta(e.target.value); }, 'data-testid': 'meta-dia', style: { width: 48, background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontFamily: mono, fontSize: 11, padding: '3px 5px' } }),
        React.createElement("button", { onClick: function () { var n = Math.max(0, Math.min(60, parseInt(meta, 10) || 0)); salvarCfg('sdr_meta_rascunhos_dia', n, 'Meta diária salva: ' + n + ' rascunhos.'); }, style: { fontFamily: mono, fontSize: 9, padding: '3px 8px', borderRadius: 4, border: '.5px solid #2D2D44', background: 'transparent', color: '#9B9BB4', cursor: 'pointer' } }, 'salvar'),
        React.createElement("label", { style: { display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8, cursor: 'pointer' } },
          React.createElement("input", { type: 'checkbox', checked: !!props.relogio, 'data-testid': 'auto-toggle', onChange: function (e) { salvarCfg('sdr_relogio_ativo', e.target.checked, e.target.checked ? 'Produção automática LIGADA (todo dia de madrugada).' : 'Produção automática DESLIGADA: só roda pelo botão.'); } }),
          'produção automática diária'))
    ),
    msg && React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#F5F5F5' } }, msg),
    etapas.length > 0 && React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
      React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'Última produção pelo botão: ' + new Date(p.ini).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
      etapas.map(function (e) {
        return React.createElement("div", { key: e[0], style: { display: 'flex', gap: 8, fontFamily: mono, fontSize: 10, color: e[1] === 'nao' ? '#555' : '#F5F5F5' } },
          React.createElement("span", { style: { color: cor[e[1]], width: 10 } }, sim[e[1]]),
          React.createElement("span", { style: { minWidth: 190 } }, e[0]),
          React.createElement("span", { style: { color: '#9B9BB4' } }, e[2]));
      }),
      p.errGmail.length > 0 && React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#E24B4A' } }, '✗ ' + p.errGmail.length + ' e-mail(s) não viraram rascunho no Gmail: ' + String(p.errGmail[0].rascunho_erro).slice(0, 120) + ' (nova tentativa automática, até 3 vezes)'),
      p.erros.length > 0 && React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#E24B4A' } }, '✗ Falhas nesta produção: ' + p.erros.map(function (l) { return l.origem.replace('cron:', '') + ' (' + new Date(l.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '): ' + String(l.mensagem).slice(0, 80); }).slice(0, 4).join(' · '))
    )
  );
}

// Proteção: se o painel falhar, a tela Hoje (inicial) continua de pé.
class PainelAgenteSeguro extends React.Component {
  constructor(p) { super(p); this.state = { erro: null }; }
  static getDerivedStateFromError(e) { return { erro: e }; }
  componentDidCatch(e) { try { console.error('[PainelAgente]', e); } catch (_) {} }
  render() {
    if (this.state.erro) return React.createElement("div", { style: { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '14px 18px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: '#E24B4A' } }, 'O painel do agente falhou ao carregar. O resto da tela segue normal.');
    return React.createElement(PainelAgente, this.props);
  }
}
function PainelAgente(props) {
  var mono = "'IBM Plex Mono',monospace";
  var _d = React.useState(null); var d = _d[0]; var setD = _d[1];
  var _v = React.useState(false); var verTodos = _v[0]; var setVerTodos = _v[1];
  function arr(x) { return Array.isArray(x) ? x : []; }
  function inicioBRT() { var b = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); return b + 'T03:00:00.000Z'; }
  function carregar() {
    var ini = inicioBRT(); var dia = ini.slice(0, 10);
    var desde24 = new Date(Date.now() - 24 * 3600e3).toISOString();
    var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
    Promise.all([
      supaFetch('/rest/v1/crm_fila?origem=eq.sdr&gerado_em=gte.' + ini + '&apagado_em=is.null&select=id,canal,status,outlook_message_id,outlook_draft_link,rascunho_erro,assunto,contexto_para_aprovacao,crm_decisores(nome,cargo),crm_empresas(nome)&order=gerado_em.desc&limit=100'),
      supaFetch('/rest/v1/crm_fila?origem=eq.sdr&status=eq.aprovado&apagado_em=is.null&select=id,canal,outlook_message_id&limit=500'),
      supaFetch('/rest/v1/crm_sdr_respostas?lida_pelo_pedro=eq.false&tipo=neq.auto_resposta&select=id&limit=100'),
      supaFetch('/rest/v1/crm_sdr_estado?atualizado_em=gte.' + ini + '&sombra=eq.false&select=etapa,motivo,dia_cadencia&limit=2000'),
      supaFetch('/rest/v1/crm_sdr_estado?etapa=eq.aguardando&status=eq.ativo&data_lote=lte.' + dia + '&select=id&limit=500'),
      supaFetch('/rest/v1/crm_logs?criado_em=gte.' + desde24 + '&or=(nivel.eq.error,and(origem.in.(%22cron:sdr-estrategia%22,%22cron:sdr-redacao%22,%22cron:sdr-qualidade%22),mensagem.eq.fim))&select=origem,nivel,mensagem,contexto,criado_em&order=criado_em.desc&limit=300'),
      supaFetch('/rest/v1/crm_configuracoes?chave=in.(sdr_meta_rascunhos_dia,sdr_relogio_ativo,sdr_piloto_automatico,sdr_custo_dia_max_usd,sdr_usd_brl)&select=chave,valor'),
      fetch('/api/enrich?provider=gmail-status', { headers: { Authorization: 'Bearer ' + jwt } }).then(function (r) { return r.json(); }).catch(function () { return { connected: false }; }),
      supaFetch('/rest/v1/crm_agente_oportunidades_v?gerado_em=gte.' + new Date(Date.now() - 30 * 86400e3).toISOString() + '&select=canal,estado_decisao,estado_envio,estado_producao,enviado_estimado&limit=1000'),
      supaFetch('/rest/v1/crm_gmail_sugestoes?status=eq.pendente&select=id&limit=200')
    ]).then(function (r) {
      var ops = arr(r[8]); var sugGmail = arr(r[9]).length;
      var cfg = {}; arr(r[6]).forEach(function (x) { cfg[x.chave] = x.valor; });
      var hoje = arr(r[0]); var abertos = arr(r[1]); var est = arr(r[3]); var logs = arr(r[5]);
      var custo = 0; logs.forEach(function (l) { if (l.mensagem === 'fim' && l.criado_em >= ini && l.contexto && Number(l.contexto.custo_usd) > 0) custo += Number(l.contexto.custo_usd); });
      var conta = function (f) { return est.filter(f).length; };
      setD({
        meta: Number(cfg.sdr_meta_rascunhos_dia) || 20,
        relogio: cfg.sdr_relogio_ativo === true || cfg.sdr_relogio_ativo === 'true',
        piloto: cfg.sdr_piloto_automatico === true || cfg.sdr_piloto_automatico === 'true',
        tetoUsd: Number(cfg.sdr_custo_dia_max_usd) || 5, cambio: Number(cfg.sdr_usd_brl) || 5.4,
        emailsHoje: hoje.filter(function (x) { return x.canal === 'email'; }),
        waHoje: hoje.filter(function (x) { return x.canal === 'whatsapp'; }),
        rascunhosAbertos: abertos.filter(function (x) { return x.canal === 'email' && x.outlook_message_id; }).length,
        semRascunho: abertos.filter(function (x) { return x.canal === 'email' && !x.outlook_message_id; }).length,
        waProntos: abertos.filter(function (x) { return x.canal === 'whatsapp'; }).length,
        respostas: arr(r[2]).length,
        followups: arr(r[4]).length,
        funil: {
          avaliados: est.length,
          semFato: conta(function (e) { return /sem sinal p[úu]blico/.test(e.motivo || ''); }),
          vetados: conta(function (e) { return /estrategista: n[ãa]o abordar|encaixe \d+ </.test(e.motivo || ''); }),
          retidos: conta(function (e) { return e.etapa === 'avaliado' && /< 8|risco|lastro|forma:|numeros|personaliza/.test(e.motivo || ''); }),
          prontos: conta(function (e) { return ['rascunho', 'enviado'].indexOf(e.etapa) >= 0; }),
          emCurso: conta(function (e) { return ['selecionado', 'dossie', 'estrategia', 'redigido'].indexOf(e.etapa) >= 0; })
        },
        erros: logs.filter(function (l) { return l.nivel === 'error'; }),
        custoUsd: Math.round(custo * 100) / 100,
        gmail: r[7] || { connected: false }, sugGmail: sugGmail,
        ops: {
          aguardando: ops.filter(function (o) { return o.estado_decisao === 'aguardando' && o.estado_envio === 'nao_enviado' && o.estado_producao !== 'erro_gmail'; }).length,
          aprovados: ops.filter(function (o) { return o.estado_decisao === 'aprovado'; }).length,
          rejeitados: ops.filter(function (o) { return o.estado_decisao === 'rejeitado'; }).length,
          enviados: ops.filter(function (o) { return ['enviado', 'followup_agendado', 'concluido'].indexOf(o.estado_envio) >= 0 && !o.enviado_estimado; }).length,
          enviadosEstimados: ops.filter(function (o) { return ['enviado', 'followup_agendado', 'concluido'].indexOf(o.estado_envio) >= 0 && o.enviado_estimado; }).length,
          errosGmail: ops.filter(function (o) { return o.estado_producao === 'erro_gmail'; }).length
        }
      });
    }).catch(function () { setD({ erroCarga: true }); });
  }
  React.useEffect(function () { carregar(); var t = setInterval(carregar, 120000); return function () { clearInterval(t); }; }, []);

  var box = { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '14px 18px' };
  var rot = { fontFamily: mono, fontSize: 9, color: '#9B9BB4', letterSpacing: '.5px' };
  if (!d) return React.createElement("div", { style: Object.assign({}, box, { fontFamily: mono, fontSize: 10, color: '#555' }) }, 'Carregando o agente…');
  if (d.erroCarga) return React.createElement("div", { style: Object.assign({}, box, { fontFamily: mono, fontSize: 10, color: '#E24B4A' }) }, 'Não deu para ler o estado do agente. Recarregue a página.');

  var nav = function (s, aba) { return function () { if (aba) { try { localStorage.setItem('gh_fila_tab', aba); } catch (_) {} } props.navTo && props.navTo(s); }; };
  var feitos = d.emailsHoje.filter(function (x) { return x.outlook_message_id; }).length;
  var pct = Math.min(100, Math.round(feitos / Math.max(1, d.meta) * 100));
  var corMeta = feitos >= d.meta ? '#34D399' : feitos > 0 ? '#FF6B2B' : '#E24B4A';

  // Próximas ações: só o que depende de você, na ordem em que vale fazer.
  var acoes = [];
  if (!d.gmail.connected) acoes.push({ t: 'Conectar o Gmail: sem ele nenhum rascunho é criado', c: '#E24B4A', fn: nav('sdr') });
  if (d.respostas) acoes.push({ t: d.respostas + ' resposta(s) de prospect para ler', c: '#34D399', fn: nav('sdr') });
  if (d.sugGmail) acoes.push({ t: d.sugGmail + ' mudança(s) de pipeline sugerida(s) pelas conversas (Gmail e WhatsApp) para você decidir', c: '#818CF8', fn: nav('inteligencia') });
  if (d.rascunhosAbertos) acoes.push({ t: 'Revisar e enviar ' + d.rascunhosAbertos + ' rascunho(s) na pasta Rascunhos do Gmail', c: '#60A5FA', href: 'https://mail.google.com/mail/' + (d.gmail.email ? '?authuser=' + encodeURIComponent(d.gmail.email) : 'u/0/') + '#drafts' });
  if (d.waProntos) acoes.push({ t: d.waProntos + ' WhatsApp pronto(s): abrir em sequência', c: '#34D399', fn: nav('fila', 'whatsapp') });
  if (d.erros.length) acoes.push({ t: d.erros.length + ' erro(s) nas últimas 24h: ver Atividade', c: '#E24B4A', fn: nav('atividade') });
  if (!d.relogio) acoes.push({ t: 'O relógio do agente está desligado: nada roda de madrugada', c: '#FBBF24', fn: nav('sdr') });

  var lista = verTodos ? d.emailsHoje : d.emailsHoje.slice(0, 6);
  function linha(x) {
    var nome = (x.crm_decisores && x.crm_decisores.nome) || '—';
    var emp = (x.crm_empresas && x.crm_empresas.nome) || '';
    var st = x.status === 'enviado' || x.status === 'respondido' ? ['enviado', '#34D399'] : x.status === 'pulado' ? ['descartado', '#555'] : x.outlook_message_id ? ['no Gmail', '#60A5FA'] : x.rascunho_erro ? ['erro', '#E24B4A'] : ['criando…', '#FBBF24'];
    var semFato = / · contexto: /.test(x.contexto_para_aprovacao || '');
    return React.createElement("div", { key: x.id, title: x.contexto_para_aprovacao || '', style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '.5px solid #1A1A2E', fontSize: 12 } },
      React.createElement("span", { style: { fontFamily: mono, fontSize: 8, color: st[1], border: '.5px solid ' + st[1], borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' } }, st[0]),
      React.createElement("span", { style: { color: '#F5F5F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' } }, nome + (emp ? ' · ' + emp : '')),
      React.createElement("span", { style: { color: '#9B9BB4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 } }, x.assunto || ''),
      semFato && React.createElement("span", { title: 'Sem notícia: retoma um contexto real do CRM (conversa, oportunidade parada ou pedido de retomar)', style: { fontFamily: mono, fontSize: 8, color: '#818CF8' } }, 'retomada'),
      x.outlook_draft_link && x.status === 'aprovado' && React.createElement("a", { href: x.outlook_draft_link, target: '_blank', rel: 'noopener noreferrer', style: { fontFamily: mono, fontSize: 9, color: '#60A5FA', textDecoration: 'none', whiteSpace: 'nowrap' } }, 'abrir →')
    );
  }
  function num(v, l, c, fn) {
    return React.createElement("div", { onClick: fn, style: { flex: 1, minWidth: 110, cursor: fn ? 'pointer' : 'default' } },
      React.createElement("div", { style: { fontFamily: mono, fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 } }, v),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', marginTop: 4 } }, l));
  }

  return React.createElement("div", { style: Object.assign({}, box, { border: '1px solid #2D2D44', display: 'flex', flexDirection: 'column', gap: 14 }) },
    React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
      React.createElement("span", { style: { fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: '#F5F5F5' } }, 'Agente · hoje'),
      React.createElement("span", { style: { fontFamily: mono, fontSize: 9, color: '#555' } },
        (d.gmail.connected ? '● Gmail ' + (d.gmail.email || 'conectado') : '○ Gmail desconectado') + ' · ' + (d.relogio ? 'relógio ligado' : 'relógio desligado') + ' · ' + (d.piloto ? 'PILOTO LIGADO' : 'nada é enviado sem você') +
        ' · IA hoje US$ ' + d.custoUsd.toFixed(2) + ' de ' + d.tetoUsd.toFixed(2))
    ),
    // Meta de rascunhos
    React.createElement("div", null,
      React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 } },
        React.createElement("span", { style: rot }, 'RASCUNHOS DE E-MAIL CRIADOS NO GMAIL HOJE'),
        React.createElement("span", { style: { fontFamily: mono, fontSize: 15, fontWeight: 700, color: corMeta } }, feitos + '/' + d.meta)),
      React.createElement("div", { style: { width: '100%', height: 6, background: '#1A1A2E', borderRadius: 3, overflow: 'hidden' } },
        React.createElement("div", { style: { width: pct + '%', height: '100%', background: corMeta, transition: 'width .3s' } })),
      feitos < d.meta && React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', marginTop: 4 } },
        d.funil.emCurso ? d.funil.emCurso + ' lead(s) ainda em preparo (o agente trabalha das 23h30 às 7h).' : 'Sem mais leads qualificados hoje: o agente não inventa destinatário; continua na próxima noite.')
    ),
    React.createElement(ProducaoAgora, { meuPapel: props.meuPapel, meta: d.meta, feitosHoje: d.emailsHoje.length, relogio: d.relogio, gmailOk: !!d.gmail.connected, aoMudar: carregar }),
    // Funil de hoje e decisões (últimos 30 dias), cada número é um evento diferente
    React.createElement("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
      num(d.funil.avaliados, 'oportunidades pesquisadas hoje', '#9B9BB4'),
      num(d.emailsHoje.length, 'e-mails produzidos hoje', '#F5F5F5'),
      num(feitos, 'rascunhos criados no Gmail hoje', '#60A5FA'),
      num(d.ops.aguardando, 'aguardando sua decisão', d.ops.aguardando ? '#FBBF24' : '#555', nav('fila', 'agente')),
      num(d.ops.aprovados, 'aprovados (30d)', '#34D399', nav('fila', 'agente')),
      num(d.ops.rejeitados, 'rejeitados (30d)', '#E24B4A', nav('fila', 'agente')),
      num(d.ops.enviados + (d.ops.enviadosEstimados ? '+' + d.ops.enviadosEstimados : ''), 'envios confirmados (30d)' + (d.ops.enviadosEstimados ? ' + data estimada' : ''), '#34D399')
    ),
    // Números que pedem ação
    React.createElement("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
      num(d.rascunhosAbertos, 'rascunhos esperando você', '#60A5FA'),
      num(d.waProntos, 'WhatsApp prontos', '#34D399', nav('fila', 'whatsapp')),
      num(d.respostas, 'respostas para ler', d.respostas ? '#34D399' : '#555', nav('sdr')),
      num(d.followups, 'follow-ups vencendo', '#818CF8'),
      num(d.erros.length, 'erros (24h)', d.erros.length ? '#E24B4A' : '#555', nav('atividade'))
    ),
    // Próximas ações
    acoes.length > 0 && React.createElement("div", null,
      React.createElement("div", { style: Object.assign({}, rot, { marginBottom: 6 }) }, 'PRÓXIMAS AÇÕES'),
      acoes.map(function (a, i) {
        var st = { display: 'block', fontSize: 12, color: '#F5F5F5', padding: '5px 0 5px 10px', borderLeft: '2px solid ' + a.c, marginBottom: 4, cursor: 'pointer', textDecoration: 'none' };
        return a.href ? React.createElement("a", { key: i, href: a.href, target: '_blank', rel: 'noopener noreferrer', style: st }, a.t + ' →')
          : React.createElement("div", { key: i, onClick: a.fn, style: st }, a.t + ' →');
      })
    ),
    // Lista do dia
    d.emailsHoje.length > 0 && React.createElement("div", null,
      React.createElement("div", { style: Object.assign({}, rot, { marginBottom: 4 }) }, 'E-MAILS PREPARADOS HOJE'),
      lista.map(linha),
      d.emailsHoje.length > 6 && React.createElement("div", { onClick: function () { setVerTodos(!verTodos); }, style: { fontFamily: mono, fontSize: 9, color: '#60A5FA', cursor: 'pointer', marginTop: 6 } }, verTodos ? 'mostrar menos' : 'ver todos os ' + d.emailsHoje.length)
    ),
    // Funil da noite
    React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', lineHeight: 1.6 } },
      'Esta noite: ' + d.funil.avaliados + ' leads analisados · ' + d.funil.prontos + ' viraram mensagem · ' + d.funil.semFato + ' sem notícia nem contexto (não abordados) · ' +
      d.funil.vetados + ' vetados pelo estrategista · ' + d.funil.retidos + ' retidos no controle de qualidade' +
      (d.semRascunho ? ' · ' + d.semRascunho + ' e-mail(s) aguardando o Gmail' : '') + (d.waHoje.length ? ' · ' + d.waHoje.length + ' WhatsApp' : ''))
  );
}

// ── Prazos dos próximos passos (missão: nada combinado fica esquecido) ─────────
// Lê as oportunidades abertas, separa em vencidos / hoje / esta semana / sem prazo
// (regras em prazos.js) e deixa resolver na hora: Feito (pede o próximo passo com
// data), Adiar, Definir prazo, Abrir no Pipeline. Toda mudança vira nota no
// histórico da oportunidade e linha em crm_auditoria.
function PainelPrazos(props) {
  var mono = "'IBM Plex Mono',monospace";
  var P = window.Prazos;
  var podeEditar = !props || props.meuPapel !== 'leitor';
  var _o = React.useState(null); var ops = _o[0]; var setOps = _o[1];
  var _e = React.useState(null); var edit = _e[0]; var setEdit = _e[1];   // { id, modo: 'feito'|'definir', passo, data, erro }
  var _b = React.useState(null); var busy = _b[0]; var setBusy = _b[1];
  var _v = React.useState(false); var verSem = _v[0]; var setVerSem = _v[1];
  var _vt = React.useState(10); var limiteSem = _vt[0]; var setLimiteSem = _vt[1];
  function carregar() {
    supaFetch('/rest/v1/crm_oportunidades?apagado_em=is.null&estagio=not.in.(%22Perdido%22,%22Cliente%20ativo%22,%22Pausado%22)&select=id,titulo,estagio,proximo_passo,proximo_passo_em,atualizado_em,empresa_id,crm_empresas(nome)&limit=500')
      .then(function (r) { setOps(Array.isArray(r) ? r : []); }).catch(function () { setOps([]); });
  }
  React.useEffect(function () { carregar(); var h = function () { carregar(); }; window.addEventListener('crm-op-updated', h); return function () { window.removeEventListener('crm-op-updated', h); }; }, []);
  if (!P) return null;
  var hoje = P.hojeBRT();
  var g = ops ? P.agruparPrazos(ops, hoje) : null;
  var email = function () { return (window.__supaSession && window.__supaSession.user && window.__supaSession.user.email) || ''; };
  function gravar(op, patch, nota) {
    setBusy(op.id);
    var corpo = Object.assign({}, patch, { atualizado_em: new Date().toISOString() });
    return supaFetch('/rest/v1/crm_oportunidades?id=eq.' + op.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(corpo) })
      .then(function (r) { if (r && r.code) throw new Error(r.message || r.code); })
      .then(function () {
        var regs = [supaFetch('/rest/v1/crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: op.id, tipo: 'nota', texto: nota, autor_email: email() }) })];
        ['proximo_passo', 'proximo_passo_em'].forEach(function (c) {
          if (c in patch && String(op[c] || '') !== String(patch[c] || '')) regs.push(supaFetch('/rest/v1/crm_auditoria', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ tabela: 'crm_oportunidades', registro_id: op.id, campo: c, valor_de: op[c] || null, valor_para: patch[c] || null, usuario_email: email() }) }));
        });
        return Promise.all(regs);
      })
      .then(function () { setEdit(null); setBusy(null); window.dispatchEvent(new CustomEvent('crm-op-updated')); })
      .catch(function (e) { setBusy(null); setEdit(function (x) { return x ? Object.assign({}, x, { erro: 'Não salvou: ' + e.message }) : x; }); });
  }
  function adiar(op, dias, uteis) {
    var base = op.proximo_passo_em && op.proximo_passo_em >= hoje ? op.proximo_passo_em : hoje;
    var nova = uteis ? P.somaDiasUteis(base, dias) : P.somaDias(base, dias);
    gravar(op, { proximo_passo_em: nova }, 'Prazo adiado' + (op.proximo_passo_em ? ' de ' + fmt(op.proximo_passo_em) : '') + ' para ' + fmt(nova) + (op.proximo_passo ? ' — ' + op.proximo_passo : ''));
  }
  function salvarEdit(op) {
    var form = { estagio: op.estagio, proximo_passo: edit.passo, proximo_passo_em: edit.data };
    var erro = P.validarProximoPasso(form);
    if (erro) { setEdit(Object.assign({}, edit, { erro: erro })); return; }
    var nota = edit.modo === 'feito'
      ? 'Feito: ' + (op.proximo_passo || 'próximo passo') + '. Próximo: ' + edit.passo.trim() + ' até ' + fmt(edit.data)
      : 'Prazo definido: ' + edit.passo.trim() + ' até ' + fmt(edit.data);
    gravar(op, { proximo_passo: edit.passo.trim().slice(0, 300), proximo_passo_em: edit.data }, nota);
  }
  function fmt(d) { var p = String(d).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function rotuloData(d) {
    var x = String(d).slice(0, 10);
    if (x < hoje) { var n = P.diasDeAtraso(x, hoje); return { t: 'há ' + n + (n === 1 ? ' dia' : ' dias'), c: '#E24B4A' }; }
    if (x === hoje) return { t: 'hoje', c: '#FF6B2B' };
    var dia = new Date(x + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return { t: dia + ' ' + fmt(x), c: '#60A5FA' };
  }
  var btn = function (label, fn, cor, titulo) { return React.createElement("button", { onClick: fn, disabled: !!busy, title: titulo || '', style: { padding: '3px 8px', borderRadius: 4, border: '.5px solid ' + (cor || '#2D2D44'), background: 'transparent', color: cor || '#9B9BB4', fontFamily: mono, fontSize: 9, cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' } }, label); };
  function abrir(op) { window.__abrirOportunidade = op.id; props && props.navTo && props.navTo('pipeline'); }
  function editor(op) {
    var chip = function (label, d) { return React.createElement("button", { key: label, onClick: function () { setEdit(Object.assign({}, edit, { data: d, erro: null })); }, style: { padding: '2px 7px', borderRadius: 10, border: '.5px solid ' + (edit.data === d ? '#FF6B2B' : '#2D2D44'), background: 'transparent', color: edit.data === d ? '#FF6B2B' : '#9B9BB4', fontFamily: mono, fontSize: 9, cursor: 'pointer' } }, label); };
    var inp = { background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontFamily: mono, fontSize: 11, padding: '6px 8px' };
    return React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0 4px 14px' } },
      React.createElement("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement("input", { autoFocus: true, value: edit.passo, placeholder: 'Próximo passo (ex.: enviar proposta revisada)', onChange: function (e) { setEdit(Object.assign({}, edit, { passo: e.target.value, erro: null })); }, onKeyDown: function (e) { if (e.key === 'Enter') salvarEdit(op); if (e.key === 'Escape') setEdit(null); }, style: Object.assign({ flex: 1, minWidth: 220 }, inp) }),
        React.createElement("input", { type: 'date', value: edit.data || '', onChange: function (e) { setEdit(Object.assign({}, edit, { data: e.target.value, erro: null })); }, style: inp })),
      React.createElement("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
        chip('amanhã', P.somaDiasUteis(hoje, 1)), chip('+3 dias úteis', P.somaDiasUteis(hoje, 3)), chip('+1 semana', P.somaDias(hoje, 7)), chip('+2 semanas', P.somaDias(hoje, 14)),
        React.createElement("span", { style: { flex: 1 } }),
        btn(busy === op.id ? 'salvando…' : 'Salvar', function () { salvarEdit(op); }, '#34D399'), btn('Cancelar', function () { setEdit(null); })),
      edit.erro && React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#E24B4A' } }, edit.erro));
  }
  function linha(op, semPrazo) {
    var r = !semPrazo && rotuloData(op.proximo_passo_em);
    var nome = (op.crm_empresas && op.crm_empresas.nome) || op.titulo || '—';
    var editando = edit && edit.id === op.id;
    return React.createElement("div", { key: op.id, style: { borderBottom: '.5px solid #1A1A2E', padding: '7px 0' } },
      React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        r && React.createElement("span", { style: { fontFamily: mono, fontSize: 10, color: r.c, minWidth: 74, fontWeight: 700 } }, r.t),
        React.createElement("span", { style: { fontSize: 12, color: '#F5F5F5', fontWeight: 600 } }, nome),
        React.createElement("span", { style: { fontFamily: mono, fontSize: 8, color: '#9B9BB4', border: '.5px solid #2D2D44', borderRadius: 3, padding: '1px 5px' } }, op.estagio),
        React.createElement("span", { style: { fontSize: 11, color: semPrazo ? '#555' : '#C9C9D6', flex: 1, minWidth: 160 } }, op.proximo_passo || (semPrazo ? 'sem próximo passo definido' : '—')),
        podeEditar && !editando && (semPrazo
          ? React.createElement("span", { style: { display: 'flex', gap: 4 } }, btn('Definir prazo', function () { setEdit({ id: op.id, modo: 'definir', passo: op.proximo_passo || '', data: P.somaDiasUteis(hoje, 3) }); }, '#FF6B2B'), btn('Abrir', function () { abrir(op); }))
          : React.createElement("span", { style: { display: 'flex', gap: 4 } },
              btn('✓ Feito', function () { setEdit({ id: op.id, modo: 'feito', passo: '', data: P.somaDiasUteis(hoje, 3) }); }, '#34D399', 'Marca como feito e pede o próximo passo'),
              btn('+1 dia', function () { adiar(op, 1, true); }, null, 'Adia para o próximo dia útil'),
              btn('+1 sem', function () { adiar(op, 7, false); }, null, 'Adia uma semana'),
              btn('Abrir', function () { abrir(op); })))),
      editando && editor(op));
  }
  function bloco(titulo, cor, lista, semPrazo) {
    if (!lista.length) return null;
    return React.createElement("div", { style: { marginTop: 10 } },
      React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: cor, letterSpacing: '.5px', marginBottom: 2 } }, titulo + ' (' + lista.length + ')'),
      lista.map(function (o) { return linha(o, semPrazo); }));
  }
  var cont = function (label, n, cor) { return React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 6 } }, React.createElement("span", { style: { fontFamily: mono, fontSize: 20, fontWeight: 700, color: n ? cor : '#333' } }, n), React.createElement("span", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, label)); };
  return React.createElement("div", { style: { background: '#0D0D1A', border: '.5px solid ' + (g && g.vencidos.length ? 'rgba(226,75,74,.45)' : '#1A1A2E'), borderRadius: 8, padding: '14px 18px' } },
    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' } },
      React.createElement("span", { style: { fontFamily: mono, fontSize: 10, color: '#F5F5F5', letterSpacing: '.5px', fontWeight: 700, marginRight: 'auto' } }, 'PRAZOS DOS PRÓXIMOS PASSOS'),
      g && cont('vencidos', g.vencidos.length, '#E24B4A'), g && cont('hoje', g.hoje.length, '#FF6B2B'), g && cont('esta semana', g.semana.length, '#60A5FA'), g && cont('sem prazo', g.semPrazo.length, '#9B9BB4')),
    !g ? React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#555', marginTop: 10 } }, 'Carregando prazos…')
    : React.createElement(React.Fragment, null,
        !g.vencidos.length && !g.hoje.length && !g.semana.length && React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#555', marginTop: 10 } }, 'Nada vencido nem para esta semana.'),
        bloco('VENCIDOS', '#E24B4A', g.vencidos), bloco('HOJE', '#FF6B2B', g.hoje), bloco('ESTA SEMANA', '#60A5FA', g.semana),
        g.semPrazo.length > 0 && React.createElement("div", { style: { marginTop: 12 } },
          React.createElement("button", { onClick: function () { setVerSem(!verSem); }, style: { background: 'transparent', border: 'none', color: '#9B9BB4', fontFamily: mono, fontSize: 10, cursor: 'pointer', padding: 0 } },
            (verSem ? '▾ ' : '▸ ') + g.semPrazo.length + ' oportunidade(s) abertas sem prazo — mais perto de fechar primeiro'),
          verSem && React.createElement("div", null, g.semPrazo.slice(0, limiteSem).map(function (o) { return linha(o, true); }),
            g.semPrazo.length > limiteSem && React.createElement("button", { onClick: function () { setLimiteSem(limiteSem + 20); }, style: { marginTop: 6, background: 'transparent', border: 'none', color: '#60A5FA', fontFamily: mono, fontSize: 10, cursor: 'pointer', padding: 0 } }, 'ver mais ' + Math.min(20, g.semPrazo.length - limiteSem))))));
}

// ── Reuniões: meta da semana + próximas reuniões (crm_reunioes_v) ─────────────
var META_REUNIOES_SEMANA = 10; // meta definida pelo Pedro em 26/11/2026 (era 40)
function PainelReunioes(props) {
  var mono = "'IBM Plex Mono',monospace";
  var P = window.Prazos;
  var linhas = (props && props.linhas) || [];
  if (!P) return null;
  var hoje = P.hojeBRT();
  var semana = P.reunioesDaSemana(linhas, hoje);
  var prox = P.proximasReunioes(linhas).slice(0, 8);
  var meta = META_REUNIOES_SEMANA; var n = semana.length;
  var quando = function (iso) { var d = new Date(iso); var dia = P.dataBRT(iso); var hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: P.FUSO });
    var rot = dia === hoje ? 'hoje' : dia === P.somaDias(hoje, 1) ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: P.FUSO }).replace('.', '');
    return rot + (hm !== '00:00' ? ' ' + hm : ''); };
  var lista = function (itens, render) { return itens.map(function (r) { return React.createElement("div", { key: r.id, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: '.5px solid #1A1A2E' } }, render(r)); }); };
  return React.createElement("div", { style: { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 24, flexWrap: 'wrap' } },
    React.createElement("div", { style: { flex: 1, minWidth: 260 } },
      React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 } },
        React.createElement("span", { style: { fontFamily: mono, fontSize: 10, color: '#F5F5F5', letterSpacing: '.5px', fontWeight: 700 } }, 'REUNIÕES MARCADAS NESTA SEMANA'),
        React.createElement("span", { style: { fontFamily: mono, fontSize: 15, fontWeight: 700, color: n >= meta ? '#34D399' : '#FF6B2B' } }, n + '/' + meta)),
      React.createElement("div", { style: { width: '100%', height: 6, background: '#1A1A2E', borderRadius: 3, overflow: 'hidden', marginBottom: 8 } },
        React.createElement("div", { style: { width: Math.min(100, n / meta * 100) + '%', height: '100%', background: n >= meta ? '#34D399' : '#FF6B2B' } })),
      n === 0 ? React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#555' } }, 'Nenhuma ainda nesta semana.')
      : lista(semana, function (r) { return [
          React.createElement("span", { key: 'e', style: { fontSize: 12, color: '#F5F5F5', flex: 1 } }, r.empresa || r.titulo || '—'),
          React.createElement("span", { key: 'o', style: { fontFamily: mono, fontSize: 9, color: '#555' } }, r.origem === 'pipeline' ? 'pipeline' : 'registrada')]; })),
    React.createElement("div", { style: { flex: 1, minWidth: 260 } },
      React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#F5F5F5', letterSpacing: '.5px', fontWeight: 700, marginBottom: 8 } }, 'PRÓXIMAS REUNIÕES'),
      prox.length === 0 ? React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#555' } }, 'Nenhuma reunião com data marcada.')
      : lista(prox, function (r) { return [
          React.createElement("span", { key: 'q', style: { fontFamily: mono, fontSize: 10, color: P.dataBRT(r.reuniao_em) === hoje ? '#FF6B2B' : '#60A5FA', minWidth: 92 } }, quando(r.reuniao_em)),
          React.createElement("span", { key: 'e', style: { fontSize: 12, color: '#F5F5F5' } }, r.empresa || '—'),
          React.createElement("span", { key: 't', style: { fontSize: 10, color: '#9B9BB4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.titulo || '')]; })));
}

function TelaHoje(props) {
  var mono = "'IBM Plex Mono',monospace";
  var jwt = function() { return (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON; };
  function sj(path) {
    return fetch(SUPA_URL + path, { headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' } }).then(function(r){ return r.ok ? r.json() : []; });
  }

  var hoje = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'})); hoje.setHours(0,0,0,0);
  var hojeIso = hoje.toISOString();

  var _stats = React.useState(null); var stats = _stats[0]; var setStats = _stats[1];
  var _loading = React.useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _kanban = React.useState([]); var kanban = _kanban[0]; var setKanban = _kanban[1];
  var _relatorio = React.useState(null); var relatorio = _relatorio[0]; var setRelatorio = _relatorio[1];

  React.useEffect(function() {
    var pending = sj('/rest/v1/crm_fila?status=eq.rascunho&select=id,canal,custo_usd');
    var enviados = sj('/rest/v1/crm_fila?status=in.(aprovado,enviado)&enviado_em=gte.' + hojeIso + '&select=id,canal');
    var respondeu = sj('/rest/v1/crm_toques?data=gte.' + hojeIso + '&resultado=in.(respondeu,resposta,reuniao_marcada)&select=id,empresa_id');
    // Reuniões de fontes reais (crm_reunioes_v): conseguidas nos últimos 10 dias ou com data daqui para frente.
    var desde = new Date(Date.now() - 10 * 864e5).toISOString(); var agoraIso = new Date(Date.now() - 2 * 3600e3).toISOString();
    var reunioes = sj('/rest/v1/crm_reunioes_v?or=(marcada_em.gte.' + desde + ',reuniao_em.gte.' + agoraIso + ')&select=*&limit=500');
    var kanbanAll = Promise.resolve([]);
    // Card "Semana fechada": busca relatório da semana corrente
    sj('/rest/v1/crm_relatorios?tipo=eq.semanal&order=gerado_em.desc&limit=1&select=token,dados,semana_inicio,gerado_em').then(function(rows) {
      var r = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (r) setRelatorio(r);
    }).catch(function(){});
    Promise.all([pending, enviados, respondeu, reunioes, kanbanAll]).then(function(rs) {
      var p = Array.isArray(rs[0]) ? rs[0] : [];
      var e = Array.isArray(rs[1]) ? rs[1] : [];
      var r = Array.isArray(rs[2]) ? rs[2] : [];
      var re = Array.isArray(rs[3]) ? rs[3] : [];
      var ka = Array.isArray(rs[4]) ? rs[4] : [];
      var custo = p.reduce(function(acc, x) { return acc + (Number(x.custo_usd) || 0); }, 0);
      setStats({ pending: p.length, enviados: e.length, respondeu: r.length, custoUsd: custo,
        emailPend: p.filter(function(x){return x.canal==='email';}).length,
        waPend: p.filter(function(x){return x.canal==='whatsapp';}).length,
        liPend: p.filter(function(x){return x.canal==='linkedin_convite'||x.canal==='linkedin_mensagem';}).length,
      });
      setKanban(re);
      var reunSem = window.Prazos ? window.Prazos.reunioesDaSemana(re, window.Prazos.hojeBRT()) : [];
      setStats(function(prev) { return Object.assign({}, prev, { reunioesSemana: reunSem.length }); });
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }, []);

  if (loading) return React.createElement("div", { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: mono, fontSize: 11 } }, 'Carregando…');

  var now = new Date();
  var hBRT = (now.getUTCHours() - 3 + 24) % 24;
  var minBRT = now.getUTCMinutes();
  var progressDia = Math.min(100, Math.max(0, ((hBRT - 8) * 60 + minBRT) / ((17 - 8) * 60) * 100));
  var sexta = now.getDay() === 5;

  function StatCard(label, value, sub, color) {
    return React.createElement("div", { style: { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '14px 18px', minWidth: 130, flex: 1 } },
      React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', letterSpacing: '.5px', marginBottom: 4 } }, label.toUpperCase()),
      React.createElement("div", { style: { fontFamily: mono, fontSize: 28, fontWeight: 700, color: color || '#F5F5F5', lineHeight: 1 } }, value),
      sub && React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', marginTop: 4 } }, sub)
    );
  }

  return React.createElement("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#060610', padding: '20px 24px', gap: 20 } },
    // Header
    React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontFamily: mono, fontSize: 11, color: '#FF6B2B', letterSpacing: '.5px' } }, 'HOJE · ' + now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()),
        React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', marginTop: 2 } }, sexta ? '⚑ Sexta — encerramento às 17h BRT' : 'Dia de trabalho')
      ),
      React.createElement("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 } },
        React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555' } }, 'Progresso do dia'),
        React.createElement("div", { style: { width: 160, height: 4, background: '#1A1A2E', borderRadius: 2, overflow: 'hidden' } },
          React.createElement("div", { style: { width: progressDia + '%', height: '100%', background: '#FF6B2B', transition: 'width .3s' } })
        ),
        React.createElement("div", { style: { fontFamily: mono, fontSize: 8, color: '#555' } }, hBRT + 'h' + String(minBRT).padStart(2,'0') + ' BRT')
      )
    ),
    // Missão: reuniões e prazos primeiro
    React.createElement(PainelReunioes, { linhas: kanban }),
    React.createElement(PainelPrazos, { navTo: props && props.navTo, meuPapel: props && props.meuPapel }),
    typeof PainelMovimentacoes !== 'undefined' && React.createElement(PainelMovimentacoes, { navTo: props && props.navTo }),
    // Agente: o que fez, o que está pendente e o que precisa de você
    React.createElement(PainelAgenteSeguro, { navTo: props && props.navTo, meuPapel: props && props.meuPapel }),
    // Stats
    React.createElement("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
      StatCard('Aprovações pendentes', stats ? stats.pending : '—', stats ? stats.emailPend + ' email · ' + stats.waPend + ' WA · ' + stats.liPend + ' LI' : null, stats && stats.pending > 0 ? '#FF6B2B' : '#34D399'),
      StatCard('Enviados hoje', stats ? stats.enviados : '—', 'emails + WA + LI', '#60A5FA'),
      StatCard('Responderam', stats ? stats.respondeu : '—', 'hoje', '#34D399'),
      StatCard('Reuniões nesta semana', stats ? (stats.reunioesSemana || 0) : '—', 'meta: ' + META_REUNIOES_SEMANA, (stats && stats.reunioesSemana >= META_REUNIOES_SEMANA) ? '#34D399' : '#E24B4A')
    ),
    // Card "Semana fechada"
    relatorio && React.createElement("div", { style: { background: '#0D1A0D', border: '1px solid #34D399', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontFamily: mono, fontSize: 10, color: '#34D399', letterSpacing: '.5px', fontWeight: 700 } }, '✓ SEMANA FECHADA'),
        React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#9B9BB4', marginTop: 4 } }, 'Relatório gerado — pronto para enviar aos sócios')
      ),
      React.createElement("a", { href: '/api/relatorio/' + relatorio.token, target: '_blank', rel: 'noopener noreferrer', style: { fontFamily: mono, fontSize: 9, color: '#34D399', textDecoration: 'none', border: '1px solid #34D399', borderRadius: 4, padding: '4px 10px', whiteSpace: 'nowrap' } }, 'VER RELATÓRIO →')
    ),
    // Custo AI do dia
    stats && stats.custoUsd > 0 && React.createElement("div", { style: { fontFamily: mono, fontSize: 9, color: '#555', textAlign: 'right' } },
      'Custo IA acumulado (rascunhos pendentes): USD ' + stats.custoUsd.toFixed(4)
    )
  );
}

// E2 — PainelMetas: métricas semanais por agência (usada como aba em HoldingHome)
function PainelMetas({ agencias }) {
  var mono = "'IBM Plex Mono',monospace";
  var AG = Array.isArray(agencias) ? agencias : [];
  var jwt = function() { return (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON; };
  function sj(path) {
    return fetch(SUPA_URL + path, { headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + jwt() } }).then(function(r){ return r.ok ? r.json() : []; });
  }

  var _data = React.useState(null); var data = _data[0]; var setData = _data[1];
  var _loading = React.useState(true); var loading = _loading[0]; var setLoading = _loading[1];

  React.useEffect(function() {
    // Últimas 4 semanas de reuniões (crm_reunioes_v — mesma fonte da tela Hoje; o crm_kanban é legado)
    var since = new Date(); since.setDate(since.getDate() - 28); since.setHours(0,0,0,0);
    Promise.all([
      sj('/rest/v1/crm_reunioes_v?marcada_em=gte.' + since.toISOString() + '&select=id,empresa_id,agencia_slug,marcada_em&order=marcada_em.asc&limit=1000'),
      sj('/rest/v1/crm_fila?enviado_em=gte.' + since.toISOString() + '&select=id,agencia_id,canal,status,respondido_em&limit=2000'),
    ]).then(function(rs) {
      var kRows = Array.isArray(rs[0]) ? rs[0] : [];
      var fRows = Array.isArray(rs[1]) ? rs[1] : [];
      // Build weeks
      var weeks = [];
      var now = new Date();
      for (var w = 0; w < 4; w++) {
        var wS = new Date(now); wS.setDate(wS.getDate() - (wS.getDay() === 0 ? 6 : wS.getDay() - 1) - w * 7); wS.setHours(0,0,0,0);
        var wE = new Date(wS); wE.setDate(wE.getDate() + 7);
        // uma reunião por empresa na semana (igual à tela Hoje)
        var vistosK = {};
        var wK = kRows.filter(function(c){ var d = new Date(c.marcada_em); if (!(d >= wS && d < wE)) return false; var k = c.empresa_id || c.id; if (vistosK[k]) return false; vistosK[k] = 1; return true; });
        var wF = fRows.filter(function(f){ var d = new Date(f.enviado_em); return d >= wS && d < wE; });
        var byAg = {};
        AG.forEach(function(a) {
          var agK = wK.filter(function(c){ return (c.agencia_slug || '').toLowerCase() === String(a.id).toLowerCase(); });
          var agF = wF.filter(function(f){ return f.agencia_id === a.id; });
          byAg[a.id] = {
            reunioes: agK.length,
            enviados: agF.length,
            respondeu: agF.filter(function(f){ return f.status === 'respondido'; }).length,
          };
        });
        var total = wK.length;
        weeks.push({ label: w === 0 ? 'Esta semana' : 'Sem -' + w, wS: wS, total: total, byAg: byAg,
          enviados: wF.length, respondeu: wF.filter(function(f){ return f.status === 'respondido'; }).length });
      }
      setData(weeks);
      setLoading(false);
    }).catch(function(){ setLoading(false); });
  }, []);

  if (loading) return React.createElement("div", { style: { color: '#555', fontFamily: mono, fontSize: 11, padding: 24 } }, 'Carregando metas…');
  if (!data) return null;

  return React.createElement("div", { style: { flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 } },
    data.map(function(week, wi) {
      return React.createElement("div", { key: wi, style: { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '14px 18px' } },
        React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
          React.createElement("span", { style: { fontFamily: mono, fontSize: 10, color: '#9B9BB4', fontWeight: 700, letterSpacing: '.5px' } }, week.label.toUpperCase()),
          React.createElement("div", { style: { display: 'flex', gap: 16 } },
            React.createElement("span", { style: { fontFamily: mono, fontSize: 9, color: '#60A5FA' } }, week.enviados + ' enviados'),
            React.createElement("span", { style: { fontFamily: mono, fontSize: 9, color: '#34D399' } }, week.respondeu + ' respostas'),
            React.createElement("span", { style: { fontFamily: mono, fontSize: 11, fontWeight: 700, color: week.total >= META_REUNIOES_SEMANA ? '#34D399' : '#E24B4A' } }, week.total + '/' + META_REUNIOES_SEMANA + ' reuniões')
          )
        ),
        React.createElement("div", { style: { width: '100%', height: 4, background: '#1A1A2E', borderRadius: 2, overflow: 'hidden', marginBottom: 12 } },
          React.createElement("div", { style: { width: Math.min(100, (week.total / META_REUNIOES_SEMANA) * 100) + '%', height: '100%', background: week.total >= META_REUNIOES_SEMANA ? '#34D399' : '#FF6B2B' } })
        ),
        React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          AG.map(function(a) {
            var ag = week.byAg[a.id] || { reunioes: 0, enviados: 0, respondeu: 0 };
            return React.createElement("div", { key: a.id,
              style: { display: 'flex', alignItems: 'center', gap: 6, background: '#060610', border: '.5px solid #1A1A2E', borderLeft: '2px solid ' + a.color, borderRadius: 4, padding: '4px 8px', minWidth: 130 } },
              React.createElement("span", { style: { fontFamily: mono, fontSize: 8, color: '#666', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.id),
              React.createElement("span", { style: { fontFamily: mono, fontSize: 10, fontWeight: 700, color: ag.reunioes >= 3 ? '#34D399' : '#E24B4A' } }, ag.reunioes + '/3'),
              ag.enviados > 0 && React.createElement("span", { style: { fontFamily: mono, fontSize: 8, color: '#555' } }, ag.enviados + '→' + ag.respondeu)
            );
          })
        )
      );
    })
  );
}

function LegacyKanbanTab() {
  var LCOLS = [
    {id:'contato', label:'1º Contato'},
    {id:'reuniao', label:'Reunião'},
    {id:'proposta', label:'Proposta'},
    {id:'negociacao', label:'Negociação'},
    {id:'fechamento', label:'Fechamento'},
  ];
  var [lCards, setLCards] = React.useState([]);
  var [lLoading, setLLoading] = React.useState(true);
  React.useEffect(function() {
    supaFetch('/rest/v1/crm_kanban?select=*&order=ordem.asc').then(function(d) {
      setLCards(Array.isArray(d) ? d : []);
      setLLoading(false);
    }).catch(function() { setLLoading(false); });
  }, []);
  return React.createElement("div", {style:{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}},
    React.createElement("div", {style:{background:'#1A0A00',borderBottom:'.5px solid #FF6B2B44',padding:'8px 16px',flexShrink:0,display:'flex',alignItems:'center',gap:8}},
      React.createElement("span", {style:{fontSize:11,color:'#FF6B2B',fontFamily:'IBM Plex Mono,monospace',fontWeight:700}}, '⚠ Tabela legada, migrada em 01/10/2026'),
      React.createElement("span", {style:{fontSize:10,color:'#9B9BB4',fontFamily:'IBM Plex Mono,monospace'}}, '— somente leitura, dados preservados para auditoria')
    ),
    React.createElement("div", {style:{display:'flex',flex:1,overflow:'auto',gap:6,padding:'10px 12px'}},
      LCOLS.map(function(col) {
        var cc = lCards.filter(function(c) { return c.col === col.id; });
        return React.createElement("div", {key:col.id, style:{flex:'0 0 190px',background:'#08080F',border:'.5px solid #1A1A2E',borderRadius:8,display:'flex',flexDirection:'column',maxHeight:'100%'}},
          React.createElement("div", {style:{padding:'7px 10px',borderBottom:'.5px solid #1A1A2E',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}},
            React.createElement("span", {style:{fontFamily:'IBM Plex Mono,monospace',fontSize:9,color:'#9B9BB4',fontWeight:700,letterSpacing:.5}}, col.label.toUpperCase()),
            React.createElement("span", {style:{fontFamily:'IBM Plex Mono,monospace',fontSize:13,color:'#FF6B2B',fontWeight:700}}, cc.length)
          ),
          React.createElement("div", {style:{overflowY:'auto',padding:'6px',flex:1}},
            lLoading ? React.createElement("div", {style:{color:'#555',fontSize:11,textAlign:'center',marginTop:20}}, '…') :
            cc.map(function(card) {
              return React.createElement("div", {key:card.id, style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:6,padding:'8px 10px',marginBottom:6}},
                React.createElement("div", {style:{fontSize:12,fontWeight:600,color:'#9B9BB4',lineHeight:1.3}}, card.nome||'—'),
                card.produto && React.createElement("div", {style:{fontSize:10,color:'#666',marginTop:3}}, card.produto),
                card.valor && React.createElement("div", {style:{fontSize:9,fontFamily:'IBM Plex Mono,monospace',color:'#555',marginTop:3}}, 'R$ '+Number(card.valor).toLocaleString('pt-BR'))
              );
            })
          )
        );
      })
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
  var [expanded, setExpanded] = React.useState({});
  var agUuid = agenciaUuids && agencia ? (agenciaUuids[agencia.id] || null) : null;
  var mono = 'IBM Plex Mono,monospace';

  React.useEffect(function() {
    if (!agUuid) { setLoading(false); return; }
    supaFetch('/rest/v1/crm_servicos?agencia_id=eq.'+agUuid+'&ativo=eq.true&order=nome.asc').then(function(d) {
      setServicos(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, [agUuid]);

  function blankForm() { return {nome:'',descricao:'',descricao_longa:'',preco_min:'',preco_max:'',sinais_de_encaixe:'',entregaveis:'',ativo:true}; }
  function setF(f, v) { setForm(function(p){var o=Object.assign({},p);o[f]=v;return o;}); }

  function save() {
    if (!form || !form.nome) return;
    setSaving(true);
    var payload = {nome:form.nome,descricao:form.descricao||null,descricao_longa:form.descricao_longa||null,preco_min:form.preco_min?Number(form.preco_min):null,preco_max:form.preco_max?Number(form.preco_max):null,sinais_de_encaixe:form.sinais_de_encaixe||null,entregaveis:form.entregaveis||null,ativo:form.ativo!==false,atualizado_em:new Date().toISOString()};
    if (form.id) {
      supaFetch('/rest/v1/crm_servicos?id=eq.'+form.id, {method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)})
        .then(function(d){setSaving(false);setForm(null);setServicos(function(p){return p.map(function(s){return s.id===form.id?Object.assign({},s,Array.isArray(d)?d[0]:{}):s;});});});
    } else {
      supaFetch('/rest/v1/crm_servicos', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(Object.assign({agencia_id:agUuid},payload))})
        .then(function(d){setSaving(false);setForm(null);if(Array.isArray(d))setServicos(function(p){return p.concat(d);});});
    }
  }

  function deactivate(s) {
    if (!confirm('Desativar "'+s.nome+'"?')) return;
    supaFetch('/rest/v1/crm_servicos?id=eq.'+s.id, {method:'PATCH',body:JSON.stringify({ativo:false})}).then(function(){
      setServicos(function(p){return p.filter(function(x){return x.id!==s.id;});});
    });
  }

  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:mono};
  var LABELS = {nome:'Nome *',descricao:'Descrição curta',descricao_longa:'Descrição longa',preco_min:'Preço mín (R$)',preco_max:'Preço máx (R$)',sinais_de_encaixe:'Sinais de encaixe',entregaveis:'Entregáveis'};
  var TEXTAREAS = ['descricao','descricao_longa','sinais_de_encaixe','entregaveis'];

  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:mono,fontSize:11,padding:20}},'…');

  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    !form && React.createElement("button",{onClick:function(){setForm(blankForm());},style:{marginBottom:12,padding:'6px 14px',border:'.5px solid #FF6B2B44',borderRadius:6,background:'transparent',color:'#FF6B2B',fontSize:11,fontFamily:mono,cursor:'pointer'}},'+ Novo serviço'),
    form && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #FF6B2B44',borderRadius:8,padding:'14px',marginBottom:14}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#FF6B2B',fontFamily:mono,marginBottom:10}},form.id?'Editar serviço':'Novo serviço'),
      Object.keys(LABELS).map(function(f) {
        return React.createElement("div",{key:f,style:{marginBottom:7}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},LABELS[f]),
          TEXTAREAS.indexOf(f)>=0
            ? React.createElement("textarea",{style:Object.assign({},inp,{height:f==='descricao_longa'||f==='entregaveis'?80:50,resize:'vertical'}),value:form[f]||'',onChange:function(e){setF(f,e.target.value);}})
            : React.createElement("input",{style:inp,value:form[f]||'',type:f.includes('preco')?'number':'text',onChange:function(e){setF(f,e.target.value);}})
        );
      }),
      React.createElement("div",{style:{display:'flex',gap:8,marginTop:8}},
        React.createElement("button",{onClick:save,disabled:saving,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#FF6B2B',color:'#fff',fontSize:10,fontFamily:mono,cursor:'pointer'}},saving?'…':'Salvar'),
        React.createElement("button",{onClick:function(){setForm(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:10,fontFamily:mono,cursor:'pointer'}},'Cancelar')
      )
    ),
    servicos.length===0 && !form && React.createElement("div",{style:{color:'#555',fontFamily:mono,fontSize:10,padding:'20px 0'}},'Nenhum serviço cadastrado para esta agência.'),
    servicos.map(function(s) {
      var open = !!expanded[s.id];
      return React.createElement("div",{key:s.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,padding:'10px 14px',marginBottom:8}},
        React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}},
          React.createElement("div",{style:{flex:1,cursor:'pointer'},onClick:function(){setExpanded(function(p){var o=Object.assign({},p);o[s.id]=!o[s.id];return o;});}},
            React.createElement("div",{style:{fontSize:12,fontWeight:600,color:'#F5F5F5',marginBottom:2}},s.nome),
            s.descricao && React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',lineHeight:1.5}},s.descricao)
          ),
          React.createElement("div",{style:{display:'flex',gap:6,marginLeft:10,flexShrink:0}},
            React.createElement("button",{onClick:function(){setForm(Object.assign({},s));},style:{padding:'3px 8px',border:'.5px solid #2D2D44',borderRadius:4,background:'transparent',color:'#555',fontSize:8,cursor:'pointer',fontFamily:mono}},'Editar'),
            React.createElement("button",{onClick:function(){deactivate(s);},style:{padding:'3px 8px',border:'none',borderRadius:4,background:'transparent',color:'#F87171',fontSize:8,cursor:'pointer',fontFamily:mono}},'×')
          )
        ),
        open && React.createElement("div",{style:{marginTop:8,paddingTop:8,borderTop:'.5px solid #1A1A2E'}},
          s.descricao_longa && React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',lineHeight:1.6,marginBottom:6,whiteSpace:'pre-wrap'}},s.descricao_longa),
          s.entregaveis && React.createElement("div",{style:{marginBottom:6}},
            React.createElement("div",{style:{fontSize:9,color:'#A78BFA',fontFamily:mono,marginBottom:2}},'Entregáveis'),
            React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',lineHeight:1.5,whiteSpace:'pre-wrap'}},s.entregaveis)
          ),
          s.sinais_de_encaixe && React.createElement("div",{style:{marginBottom:6}},
            React.createElement("div",{style:{fontSize:9,color:'#A78BFA',fontFamily:mono,marginBottom:2}},'Sinais de encaixe'),
            React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',lineHeight:1.5}},s.sinais_de_encaixe)
          ),
          (s.preco_min||s.preco_max) && React.createElement("div",{style:{fontSize:9,fontFamily:mono,color:'#34D399'}},
            'R$ '+Number(s.preco_min||0).toLocaleString('pt-BR')+(s.preco_max?' – R$ '+Number(s.preco_max).toLocaleString('pt-BR'):'')
          )
        )
      );
    })
  );
}

// Barra de sub-abas do menu enxuto (mesmo visual da barra de abas das agências).
function BarraSubAbas({ abas, atual, onChange }) {
  return React.createElement("div", { style:{ display:'flex', alignItems:'stretch', background:'#080810', borderBottom:'.5px solid #1A1A2E', paddingLeft: window.innerWidth < 768 ? 8 : 60, height:30, overflowX:'auto', WebkitOverflowScrolling:'touch', flexShrink:0 } },
    abas.map(([t, l]) => React.createElement("div", { key:t, onClick:() => onChange(t), style:{ display:'flex', alignItems:'center', padding:'0 14px', fontFamily:'IBM Plex Mono,monospace', fontSize:10, cursor:'pointer', whiteSpace:'nowrap', color: atual === t ? '#F5F5F5' : '#6B6B85', borderBottom: atual === t ? '2px solid #FF6B2B' : '2px solid transparent' } }, l)));
}

// Agência › Materiais: Cases, Credenciais e Textos numa aba só.
function AgMateriaisTab({ agencia, agenciaUuids }) {
  const [sub, setSub] = React.useState('cases');
  return React.createElement("div", { style:{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' } },
    React.createElement("div", { style:{ display:'flex', gap:6, padding:'8px 16px', borderBottom:'.5px solid #1A1A2E', flexShrink:0 } },
      [['cases','Cases'],['credenciais','Credenciais'],['textos','Textos']].map(([t, l]) => React.createElement("button", { key:t, onClick:() => setSub(t),
        style:{ padding:'4px 10px', borderRadius:4, border:'.5px solid ' + (sub === t ? '#FF6B2B' : '#2D2D44'), background: sub === t ? 'rgba(255,107,43,.12)' : 'transparent', color: sub === t ? '#FF6B2B' : '#9B9BB4', fontFamily:'IBM Plex Mono,monospace', fontSize:10, cursor:'pointer' } }, l))),
    React.createElement("div", { style:{ flex:1, overflow:'auto', display:'flex', flexDirection:'column' } },
      sub === 'cases' ? React.createElement(AgCasesTab, { agencia: agencia, agenciaUuids: agenciaUuids })
      : sub === 'credenciais' ? React.createElement(AgCredenciaisTab, { agencia: agencia })
      : React.createElement(AgTextosTab, { agencia: agencia })));
}

function AgCasesTab({ agencia, agenciaUuids }) {
  var [cases, setCases] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [form, setForm] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var [player, setPlayer] = React.useState(null);
  var [quickUrl, setQuickUrl] = React.useState('');
  var [filter, setFilter] = React.useState({q:'',tipo:'',destaque:'',prospeccao:''});
  var agUuid = agenciaUuids && agencia ? (agenciaUuids[agencia.id] || null) : null;
  var mono = 'IBM Plex Mono,monospace';

  React.useEffect(function() {
    if (!agUuid) { setLoading(false); return; }
    supaFetch('/rest/v1/crm_cases?agencia_id=eq.'+agUuid+'&order=ano.desc,titulo.asc&select=*').then(function(d) {
      setCases(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, [agUuid]);

  function thumbUrl(url) {
    if (!url) return null;
    var yt = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return 'https://img.youtube.com/vi/'+yt[1]+'/mqdefault.jpg';
    return null;
  }
  function embedUrl(url) {
    if (!url) return null;
    var yt = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return 'https://www.youtube.com/embed/'+yt[1]+'?autoplay=1';
    var vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) return 'https://player.vimeo.com/video/'+vm[1]+'?autoplay=1';
    return null;
  }
  function blankForm(url) {
    return {titulo:'',marca:'',categoria_da_marca:'',tipo:'star',url_video:url||'',url_pagina:'',idioma:'pt',resumo:'',tarefa:'',acao:'',resultado:'',ano:'',tags:'',destaque:false,permitido_em_prospeccao:true,ativo:true};
  }
  function save() {
    if (!form || !form.titulo) return;
    setSaving(true);
    var tags = form.tags ? form.tags.split(',').map(function(t){return t.trim();}).filter(Boolean) : null;
    var payload = {titulo:form.titulo,marca:form.marca||null,categoria_da_marca:form.categoria_da_marca||null,tipo:form.tipo||'star',url_video:form.url_video||null,url_pagina:form.url_pagina||null,idioma:form.idioma||'pt',resumo:form.resumo||null,tarefa:form.tarefa||null,acao:form.acao||null,resultado:form.resultado||null,ano:form.ano?Number(form.ano):null,tags:tags,destaque:!!form.destaque,permitido_em_prospeccao:form.permitido_em_prospeccao!==false,ativo:form.ativo!==false};
    if (form.id) {
      supaFetch('/rest/v1/crm_cases?id=eq.'+form.id, {method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)})
        .then(function(d){setSaving(false);setForm(null);setCases(function(p){return p.map(function(s){return s.id===form.id?Object.assign({},s,Array.isArray(d)?d[0]:{}):s;});});});
    } else {
      supaFetch('/rest/v1/crm_cases', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(Object.assign({agencia_id:agUuid},payload))})
        .then(function(d){setSaving(false);setForm(null);if(Array.isArray(d))setCases(function(p){return[d[0]].concat(p);});});
    }
  }
  function deactivate(c) {
    if (!confirm('Desativar "'+c.titulo+'"?')) return;
    supaFetch('/rest/v1/crm_cases?id=eq.'+c.id, {method:'PATCH',body:JSON.stringify({ativo:false})}).then(function(){
      setCases(function(p){return p.filter(function(s){return s.id!==c.id;});});
    });
  }
  function duplicate(c, idioma) {
    var payload = Object.assign({},c,{id:undefined,idioma:idioma,criado_em:undefined,atualizado_em:undefined,agencia_id:agUuid,titulo:c.titulo+' ('+idioma+')'});
    delete payload.id; delete payload.criado_em; delete payload.atualizado_em;
    supaFetch('/rest/v1/crm_cases', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)})
      .then(function(d){if(Array.isArray(d)&&d[0])setCases(function(p){return[d[0]].concat(p);});});
  }
  function setF(field, val) { setForm(function(p){var o=Object.assign({},p);o[field]=val;return o;}); }

  var filtered = cases.filter(function(c) {
    if (!c.ativo) return false;
    var q = filter.q.toLowerCase();
    if (q && !(c.titulo||'').toLowerCase().includes(q) && !(c.marca||'').toLowerCase().includes(q)) return false;
    if (filter.tipo && c.tipo !== filter.tipo) return false;
    if (filter.destaque === 'sim' && !c.destaque) return false;
    if (filter.prospeccao === 'sim' && !c.permitido_em_prospeccao) return false;
    return true;
  });

  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:mono};
  var btnSm = {fontSize:8,color:'#555',background:'none',border:'none',cursor:'pointer',fontFamily:mono,padding:'2px 4px'};
  var TIPO_CLR = {filme:{bg:'#1e3a5f',tx:'#60A5FA'},star:{bg:'#2d1a4a',tx:'#A78BFA'},internacional:{bg:'#1e3d2e',tx:'#34D399'}};

  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:mono,fontSize:11,padding:20}},'…');

  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    // Player modal
    player && React.createElement("div",{onClick:function(){setPlayer(null);},style:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.88)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}},
      React.createElement("iframe",{src:player,style:{width:'80vw',height:'45vw',maxWidth:900,maxHeight:506,border:'none',borderRadius:8},allow:'autoplay; fullscreen',onClick:function(e){e.stopPropagation();}})
    ),
    // Barra quick-add
    React.createElement("div",{style:{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}},
      React.createElement("input",{placeholder:'Colar URL YouTube/Vimeo para cadastro rápido…',value:quickUrl,onChange:function(e){setQuickUrl(e.target.value);},onKeyDown:function(e){if(e.key==='Enter'&&quickUrl.trim()){setForm(blankForm(quickUrl.trim()));setQuickUrl('');}},style:Object.assign({},inp,{flex:'1 1 260px',minWidth:200})}),
      React.createElement("button",{onClick:function(){if(quickUrl.trim()){setForm(blankForm(quickUrl.trim()));setQuickUrl('');}},style:{padding:'5px 10px',border:'.5px solid #FF6B2B44',borderRadius:6,background:'transparent',color:'#FF6B2B',fontSize:10,cursor:'pointer',fontFamily:mono,whiteSpace:'nowrap'}},'+ URL'),
      React.createElement("button",{onClick:function(){setForm(blankForm(''));},style:{padding:'5px 10px',border:'.5px solid #2D2D44',borderRadius:6,background:'transparent',color:'#9B9BB4',fontSize:10,cursor:'pointer',fontFamily:mono,whiteSpace:'nowrap'}},'+ Manual')
    ),
    // Filtros
    React.createElement("div",{style:{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}},
      React.createElement("input",{placeholder:'Buscar…',value:filter.q,onChange:function(e){setFilter(function(f){return Object.assign({},f,{q:e.target.value});});},style:Object.assign({},inp,{flex:'1 1 120px',minWidth:100})}),
      React.createElement("select",{value:filter.tipo,onChange:function(e){setFilter(function(f){return Object.assign({},f,{tipo:e.target.value});});},style:Object.assign({},inp,{flex:'0 0 130px',width:'auto'})},
        React.createElement("option",{value:''},'Todos os tipos'),
        React.createElement("option",{value:'filme'},'Filme'),
        React.createElement("option",{value:'star'},'STAR'),
        React.createElement("option",{value:'internacional'},'Internacional')
      ),
      React.createElement("select",{value:filter.destaque,onChange:function(e){setFilter(function(f){return Object.assign({},f,{destaque:e.target.value});});},style:Object.assign({},inp,{flex:'0 0 110px',width:'auto'})},
        React.createElement("option",{value:''},'Todos'),
        React.createElement("option",{value:'sim'},'★ Destaque')
      ),
      React.createElement("select",{value:filter.prospeccao,onChange:function(e){setFilter(function(f){return Object.assign({},f,{prospeccao:e.target.value});});},style:Object.assign({},inp,{flex:'0 0 140px',width:'auto'})},
        React.createElement("option",{value:''},'Todos'),
        React.createElement("option",{value:'sim'},'✓ Prospecção')
      ),
      React.createElement("span",{style:{fontSize:9,color:'#555',fontFamily:mono,whiteSpace:'nowrap'}},filtered.length+' case'+(filtered.length!==1?'s':''))
    ),
    // Formulário
    form && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #FF6B2B44',borderRadius:8,padding:'14px',marginBottom:14}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#FF6B2B',fontFamily:mono,marginBottom:10}},form.id?'Editar case':'Novo case'),
      React.createElement("div",{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 10px',marginBottom:8}},
        React.createElement("div",{style:{gridColumn:'1/-1'}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Título *'),
          React.createElement("input",{style:inp,value:form.titulo||'',onChange:function(e){setF('titulo',e.target.value);}})
        ),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Marca'),
          React.createElement("input",{style:inp,value:form.marca||'',onChange:function(e){setF('marca',e.target.value);}})
        ),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Categoria'),
          React.createElement("input",{style:inp,value:form.categoria_da_marca||'',onChange:function(e){setF('categoria_da_marca',e.target.value);}})
        ),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Ano'),
          React.createElement("input",{style:inp,type:'number',value:form.ano||'',onChange:function(e){setF('ano',e.target.value);}})
        ),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Idioma'),
          React.createElement("select",{style:inp,value:form.idioma||'pt',onChange:function(e){setF('idioma',e.target.value);}},
            React.createElement("option",{value:'pt'},'pt'),
            React.createElement("option",{value:'en'},'en'),
            React.createElement("option",{value:'es'},'es')
          )
        ),
        React.createElement("div",{style:{gridColumn:'1/-1'}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'URL Vídeo (YouTube / Vimeo)'),
          React.createElement("input",{style:inp,value:form.url_video||'',onChange:function(e){setF('url_video',e.target.value);}})
        ),
        React.createElement("div",{style:{gridColumn:'1/-1'}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'URL Página'),
          React.createElement("input",{style:inp,value:form.url_pagina||'',onChange:function(e){setF('url_pagina',e.target.value);}})
        ),
        React.createElement("div",{style:{gridColumn:'1/-1'}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Tags (separar por vírgula)'),
          React.createElement("input",{style:inp,value:form.tags||'',onChange:function(e){setF('tags',e.target.value);}})
        )
      ),
      form.url_video && thumbUrl(form.url_video) && React.createElement("img",{src:thumbUrl(form.url_video),alt:'',style:{width:'100%',borderRadius:6,marginBottom:8,objectFit:'cover',maxHeight:90}}),
      // Tipo
      React.createElement("div",{style:{marginBottom:8}},
        React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:4}},'Tipo'),
        React.createElement("div",{style:{display:'flex',gap:6}},
          ['filme','star','internacional'].map(function(t){
            return React.createElement("button",{key:t,onClick:function(){setF('tipo',t);},style:{padding:'3px 10px',borderRadius:4,border:'none',background:form.tipo===t?(TIPO_CLR[t]||{bg:'#2D2D44'}).bg:'#1A1A2E',color:form.tipo===t?(TIPO_CLR[t]||{tx:'#fff'}).tx:'#555',fontSize:9,cursor:'pointer',fontFamily:mono}},t);
          })
        )
      ),
      // STAR
      React.createElement("div",{style:{fontSize:9,fontWeight:700,color:'#A78BFA',fontFamily:mono,marginBottom:6}},'STAR — Situação / Tarefa / Ação / Resultado'),
      [['tarefa','Situação / Tarefa'],['acao','Ação'],['resultado','Resultado'],['resumo','Resumo curto (exibição)']].map(function(pair){
        var f=pair[0],l=pair[1];
        return React.createElement("div",{key:f,style:{marginBottom:6}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},l),
          React.createElement("textarea",{style:Object.assign({},inp,{height:50,resize:'vertical'}),value:form[f]||'',onChange:function(e){setF(f,e.target.value);}})
        );
      }),
      // Flags
      React.createElement("div",{style:{display:'flex',gap:16,marginTop:8,flexWrap:'wrap'}},
        [['destaque','★ Destaque'],['permitido_em_prospeccao','✓ Usar em prospecção'],['ativo','Ativo']].map(function(pair){
          var f=pair[0],l=pair[1];
          return React.createElement("label",{key:f,style:{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#9B9BB4',cursor:'pointer',fontFamily:mono}},
            React.createElement("input",{type:'checkbox',checked:form[f]!==false&&!!form[f],onChange:function(e){setF(f,e.target.checked);}}),
            l
          );
        })
      ),
      React.createElement("div",{style:{display:'flex',gap:8,marginTop:10}},
        React.createElement("button",{onClick:save,disabled:saving,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#FF6B2B',color:'#fff',fontSize:10,cursor:'pointer',fontFamily:mono}},saving?'…':'Salvar'),
        React.createElement("button",{onClick:function(){setForm(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:10,cursor:'pointer',fontFamily:mono}},'Cancelar')
      )
    ),
    // Grade de cards
    React.createElement("div",{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:12}},
      filtered.map(function(c) {
        var thumb = thumbUrl(c.url_video);
        var embed = embedUrl(c.url_video);
        var tc = TIPO_CLR[c.tipo]||{bg:'#1A1A2E',tx:'#555'};
        return React.createElement("div",{key:c.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,overflow:'hidden',display:'flex',flexDirection:'column'}},
          React.createElement("div",{style:{position:'relative',height:110,background:'#080810',cursor:embed?'pointer':'default',flexShrink:0},onClick:function(){if(embed)setPlayer(embed);}},
            thumb ? React.createElement("img",{src:thumb,alt:'',style:{width:'100%',height:'100%',objectFit:'cover',display:'block'}})
                  : React.createElement("div",{style:{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:'#1A1A2E'}},'🎬'),
            embed && React.createElement("div",{style:{position:'absolute',top:0,left:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.25)'}},
              React.createElement("span",{style:{fontSize:24,color:'rgba(255,255,255,.85)'}},'▶')
            )
          ),
          React.createElement("div",{style:{padding:'8px 10px',flex:1,display:'flex',flexDirection:'column',gap:3}},
            React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}},
              React.createElement("div",{style:{fontSize:11,fontWeight:600,color:'#F5F5F5',lineHeight:1.3,flex:1}},c.titulo),
              c.destaque && React.createElement("span",{style:{fontSize:13,marginLeft:4,flexShrink:0}},'★')
            ),
            c.marca && React.createElement("div",{style:{fontSize:9,color:'#A78BFA',fontFamily:mono}},c.marca+(c.categoria_da_marca?' · '+c.categoria_da_marca:'')+(c.ano?' · '+c.ano:'')),
            React.createElement("div",{style:{display:'flex',gap:3,flexWrap:'wrap'}},
              c.tipo && React.createElement("span",{style:{fontSize:8,fontFamily:mono,background:tc.bg,color:tc.tx,borderRadius:3,padding:'1px 5px'}},c.tipo),
              c.permitido_em_prospeccao && React.createElement("span",{style:{fontSize:8,fontFamily:mono,background:'#1e3a1e',color:'#4ade80',borderRadius:3,padding:'1px 5px'}},'prospecção')
            ),
            c.tags && c.tags.length>0 && React.createElement("div",{style:{display:'flex',gap:3,flexWrap:'wrap'}},
              c.tags.slice(0,3).map(function(t){return React.createElement("span",{key:t,style:{fontSize:8,fontFamily:mono,background:'#111',color:'#555',borderRadius:3,padding:'1px 4px'}},t);}),
              c.tags.length>3 && React.createElement("span",{style:{fontSize:8,fontFamily:mono,color:'#555'}},'+'+String(c.tags.length-3))
            ),
            c.resumo && React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}},c.resumo),
            React.createElement("div",{style:{display:'flex',gap:2,flexWrap:'wrap',marginTop:'auto',paddingTop:4}},
              c.url_video && React.createElement("a",{href:c.url_video,target:'_blank',rel:'noopener noreferrer',style:{fontSize:8,color:'#60A5FA',fontFamily:mono,textDecoration:'none'}},'▶ vídeo'),
              c.url_pagina && React.createElement("a",{href:c.url_pagina,target:'_blank',rel:'noopener noreferrer',style:{fontSize:8,color:'#60A5FA',fontFamily:mono,textDecoration:'none'}},' ↗ página'),
              React.createElement("button",{onClick:function(){setForm(Object.assign({},c,{tags:Array.isArray(c.tags)?c.tags.join(', '):''}));},style:btnSm},'editar'),
              React.createElement("button",{onClick:function(){deactivate(c);},style:Object.assign({},btnSm,{color:'#F87171'})},'×'),
              c.idioma==='pt' && React.createElement("button",{onClick:function(){duplicate(c,'en');},style:btnSm},'EN↗'),
              c.idioma==='pt' && React.createElement("button",{onClick:function(){duplicate(c,'es');},style:btnSm},'ES↗')
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
  var [idiomaFiltro, setIdiomaFiltro] = React.useState('pt');
  var [gerador, setGerador] = React.useState(null);
  var [gerando, setGerando] = React.useState(false);
  var [geradoUrl, setGeradoUrl] = React.useState(null);
  var agId = agencia ? agencia.id : '';
  var mono = 'IBM Plex Mono,monospace';
  var TIPOS = ['capa','manifesto','numeros','ecossistema','servicos','metodologia','case','time','clientes','premios','fechamento','livre'];
  var TIPO_CLR = {capa:'#F59E0B',manifesto:'#60A5FA',numeros:'#34D399',ecossistema:'#A78BFA',servicos:'#F472B6',metodologia:'#FB923C',case:'#38BDF8',time:'#4ADE80',clientes:'#E879F9',premios:'#FBBF24',fechamento:'#F87171',livre:'#9B9BB4'};

  function load() {
    if (!agId) return;
    supaFetch('/rest/v1/crm_credenciais_blocos?agencia_id=eq.'+agId+'&ativo=eq.true&idioma=eq.'+idiomaFiltro+'&order=ordem.asc,titulo.asc').then(function(d) {
      setBlocos(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }
  React.useEffect(function(){setLoading(true);load();}, [agId, idiomaFiltro]);

  function blankForm() { return {titulo:'',tipo:'livre',idioma:idiomaFiltro,ordem:blocos.length,corpo:'',midia:'',dadosRaw:'{}'}; }
  function setF(f, v) { setForm(function(p){var o=Object.assign({},p);o[f]=v;return o;}); }

  function save() {
    if (!form || !form.titulo) return;
    setSaving(true);
    var dados = null;
    try { dados = JSON.parse(form.dadosRaw||'{}'); } catch(e) { dados = null; }
    var payload = {titulo:form.titulo,tipo:form.tipo||'livre',idioma:form.idioma||'pt',ordem:Number(form.ordem)||0,corpo:form.corpo||null,midia:form.midia||null,dados:dados,ativo:true,atualizado_em:new Date().toISOString()};
    if (form.id) {
      supaFetch('/rest/v1/crm_credenciais_blocos?id=eq.'+form.id, {method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)})
        .then(function(){setSaving(false);setForm(null);load();});
    } else {
      supaFetch('/rest/v1/crm_credenciais_blocos', {method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(Object.assign({agencia_id:agId},payload))})
        .then(function(d){setSaving(false);setForm(null);if(Array.isArray(d))setBlocos(function(p){return p.concat(d);});});
    }
  }

  function deactivate(b) {
    supaFetch('/rest/v1/crm_credenciais_blocos?id=eq.'+b.id, {method:'PATCH',body:JSON.stringify({ativo:false})}).then(function(){
      setBlocos(function(p){return p.filter(function(x){return x.id!==b.id;});});
    });
  }

  function moveOrdem(b, dir) {
    var next = Number(b.ordem||0)+dir;
    supaFetch('/rest/v1/crm_credenciais_blocos?id=eq.'+b.id, {method:'PATCH',body:JSON.stringify({ordem:next})}).then(function(){load();});
  }

  function gerarCredencial() {
    var sel = gerador && gerador.selecionados || [];
    if (sel.length === 0) return;
    setGerando(true);
    var jwt = window.__supaSession && window.__supaSession.access_token;
    fetch('/api/fila?action=credencial', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+(jwt||'')},
      body:JSON.stringify({agencia_ids:[],idioma:idiomaFiltro,blocos:sel,cases:[],titulo:agencia?agencia.name+' — Credencial':''})
    }).then(function(r){return r.json();}).then(function(d){
      setGerando(false);
      if (d.html_url) setGeradoUrl(d.html_url);
      else alert('Erro ao gerar: '+(d.error||'desconhecido'));
    }).catch(function(){setGerando(false);alert('Falha ao conectar com o servidor.');});
  }

  var inp = {width:'100%',background:'#0f1623',border:'.5px solid #2D2D44',borderRadius:6,padding:'5px 8px',color:'#F5F5F5',fontSize:11,outline:'none',boxSizing:'border-box',fontFamily:mono};

  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:mono,fontSize:11,padding:20}},'…');

  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    // Barra topo
    React.createElement("div",{style:{display:'flex',gap:8,marginBottom:12,alignItems:'center'}},
      ['pt','en','es'].map(function(l){
        return React.createElement("button",{key:l,onClick:function(){setIdiomaFiltro(l);},style:{padding:'3px 10px',borderRadius:4,border:'none',background:idiomaFiltro===l?'#FF6B2B':'#1A1A2E',color:idiomaFiltro===l?'#fff':'#555',fontSize:9,cursor:'pointer',fontFamily:mono}},l.toUpperCase());
      }),
      React.createElement("span",{style:{fontSize:9,color:'#555',fontFamily:mono}},blocos.length+' bloco'+(blocos.length!==1?'s':'')),
      React.createElement("button",{onClick:function(){setForm(blankForm());},style:{marginLeft:'auto',padding:'5px 12px',border:'.5px solid #FF6B2B44',borderRadius:6,background:'transparent',color:'#FF6B2B',fontSize:10,fontFamily:mono,cursor:'pointer'}},'+ Novo bloco'),
      React.createElement("button",{onClick:function(){setGerador({selecionados:blocos.map(function(b){return b.id;})});setGeradoUrl(null);},style:{padding:'5px 12px',border:'.5px solid #34D39944',borderRadius:6,background:'transparent',color:'#34D399',fontSize:10,fontFamily:mono,cursor:'pointer'}},'Gerar credencial')
    ),
    // Gerador modal
    gerador && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #34D39944',borderRadius:8,padding:'14px',marginBottom:14}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#34D399',fontFamily:mono,marginBottom:8}},'Gerar credencial — '+idiomaFiltro.toUpperCase()),
      React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:6}},'Selecione os blocos a incluir:'),
      React.createElement("div",{style:{display:'flex',flexDirection:'column',gap:4,marginBottom:10}},
        blocos.map(function(b){
          var sel = gerador.selecionados.indexOf(b.id)>=0;
          return React.createElement("label",{key:b.id,style:{display:'flex',alignItems:'center',gap:6,fontSize:10,color:sel?'#F5F5F5':'#9B9BB4',cursor:'pointer',fontFamily:mono}},
            React.createElement("input",{type:'checkbox',checked:sel,onChange:function(e){
              setGerador(function(g){
                var s = g.selecionados.slice();
                if(e.target.checked){if(s.indexOf(b.id)<0)s.push(b.id);}else{s=s.filter(function(x){return x!==b.id;});}
                return Object.assign({},g,{selecionados:s});
              });
            }}),
            React.createElement("span",{style:{fontSize:8,color:'#555',fontFamily:mono,background:'#1A1A2E',padding:'1px 4px',borderRadius:3}},b.tipo),
            b.titulo
          );
        })
      ),
      geradoUrl && React.createElement("div",{style:{marginBottom:10}},
        React.createElement("div",{style:{fontSize:9,color:'#34D399',fontFamily:mono,marginBottom:4}},'✓ Link gerado (válido 7 dias):'),
        React.createElement("input",{readOnly:true,value:geradoUrl,style:Object.assign({},inp,{color:'#60A5FA',cursor:'pointer'}),onClick:function(e){e.target.select();try{navigator.clipboard.writeText(geradoUrl);}catch(ex){}}}),
        React.createElement("a",{href:geradoUrl,target:'_blank',rel:'noopener',style:{fontSize:9,color:'#60A5FA',fontFamily:mono,display:'block',marginTop:4}},'↗ Abrir preview')
      ),
      React.createElement("div",{style:{display:'flex',gap:8}},
        React.createElement("button",{onClick:gerarCredencial,disabled:gerando||!gerador.selecionados.length,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#34D399',color:'#000',fontSize:10,fontFamily:mono,cursor:'pointer'}},gerando?'Gerando…':'Gerar link'),
        React.createElement("button",{onClick:function(){setGerador(null);setGeradoUrl(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:10,fontFamily:mono,cursor:'pointer'}},'Cancelar')
      )
    ),
    // Formulário
    form && React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #FF6B2B44',borderRadius:8,padding:'14px',marginBottom:14}},
      React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'#FF6B2B',fontFamily:mono,marginBottom:10}},form.id?'Editar bloco':'Novo bloco'),
      React.createElement("div",{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 10px',marginBottom:8}},
        React.createElement("div",{style:{gridColumn:'1/-1'}},
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Título *'),
          React.createElement("input",{style:inp,value:form.titulo||'',onChange:function(e){setF('titulo',e.target.value);}})
        ),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:4}},'Tipo'),
          React.createElement("div",{style:{display:'flex',flexWrap:'wrap',gap:4}},
            TIPOS.map(function(t){
              return React.createElement("button",{key:t,onClick:function(){setF('tipo',t);},style:{padding:'2px 7px',borderRadius:3,border:'none',background:form.tipo===t?'#1A1A2E':'transparent',color:form.tipo===t?(TIPO_CLR[t]||'#fff'):'#555',fontSize:8,cursor:'pointer',fontFamily:mono,outline:form.tipo===t?'1px solid '+(TIPO_CLR[t]||'#fff'):'none'}},t);
            })
          )
        ),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Idioma / Ordem'),
          React.createElement("div",{style:{display:'flex',gap:6}},
            React.createElement("select",{style:Object.assign({},inp,{width:60}),value:form.idioma||'pt',onChange:function(e){setF('idioma',e.target.value);}},
              React.createElement("option",{value:'pt'},'pt'),
              React.createElement("option",{value:'en'},'en'),
              React.createElement("option",{value:'es'},'es')
            ),
            React.createElement("input",{style:Object.assign({},inp,{width:60}),type:'number',value:form.ordem||0,onChange:function(e){setF('ordem',e.target.value);}})
          )
        )
      ),
      React.createElement("div",{style:{marginBottom:7}},
        React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Corpo (markdown)'),
        React.createElement("textarea",{style:Object.assign({},inp,{height:90,resize:'vertical',fontFamily:'monospace',fontSize:10}),value:form.corpo||'',onChange:function(e){setF('corpo',e.target.value);}})
      ),
      React.createElement("div",{style:{marginBottom:7}},
        React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Mídia (URL)'),
        React.createElement("input",{style:inp,value:form.midia||'',onChange:function(e){setF('midia',e.target.value);}})
      ),
      React.createElement("div",{style:{marginBottom:7}},
        React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:2}},'Dados estruturados (JSON)'),
        React.createElement("textarea",{style:Object.assign({},inp,{height:60,resize:'vertical',fontFamily:'monospace',fontSize:10}),value:form.dadosRaw||'{}',onChange:function(e){setF('dadosRaw',e.target.value);}})
      ),
      React.createElement("div",{style:{display:'flex',gap:8,marginTop:8}},
        React.createElement("button",{onClick:save,disabled:saving,style:{padding:'5px 12px',borderRadius:5,border:'none',background:'#FF6B2B',color:'#fff',fontSize:10,fontFamily:mono,cursor:'pointer'}},saving?'…':'Salvar'),
        React.createElement("button",{onClick:function(){setForm(null);},style:{padding:'5px 12px',borderRadius:5,border:'.5px solid #2D2D44',background:'transparent',color:'#9B9BB4',fontSize:10,fontFamily:mono,cursor:'pointer'}},'Cancelar')
      )
    ),
    // Lista de blocos
    blocos.length===0 && !form && React.createElement("div",{style:{color:'#555',fontFamily:mono,fontSize:10,padding:'20px 0'}},'Nenhum bloco cadastrado para '+idiomaFiltro.toUpperCase()+'.'),
    blocos.map(function(b, idx) {
      var clr = TIPO_CLR[b.tipo]||'#9B9BB4';
      return React.createElement("div",{key:b.id,style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,padding:'10px 14px',marginBottom:8}},
        React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:b.corpo?6:0}},
          React.createElement("div",{style:{display:'flex',alignItems:'center',gap:8,flex:1}},
            React.createElement("div",{style:{display:'flex',flexDirection:'column',gap:1}},
              React.createElement("button",{onClick:function(){moveOrdem(b,-1);},disabled:idx===0,style:{fontSize:8,background:'none',border:'none',color:'#555',cursor:'pointer',padding:'0 2px',lineHeight:1}},'▲'),
              React.createElement("button",{onClick:function(){moveOrdem(b,1);},disabled:idx===blocos.length-1,style:{fontSize:8,background:'none',border:'none',color:'#555',cursor:'pointer',padding:'0 2px',lineHeight:1}},'▼')
            ),
            React.createElement("span",{style:{fontSize:8,fontFamily:mono,color:clr,background:clr+'22',padding:'1px 5px',borderRadius:100,flexShrink:0}},b.tipo),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:'#F5F5F5'}},b.titulo)
          ),
          React.createElement("div",{style:{display:'flex',gap:4,flexShrink:0,marginLeft:8}},
            React.createElement("button",{onClick:function(){setForm(Object.assign({},b,{dadosRaw:JSON.stringify(b.dados||b.bloco||{},null,2)}));},style:{fontSize:8,color:'#555',background:'none',border:'none',cursor:'pointer',fontFamily:mono}},'editar'),
            React.createElement("button",{onClick:function(){deactivate(b);},style:{fontSize:8,color:'#F87171',background:'none',border:'none',cursor:'pointer',fontFamily:mono}},'×')
          )
        ),
        b.corpo && React.createElement("div",{style:{fontSize:10,color:'#9B9BB4',lineHeight:1.5,whiteSpace:'pre-wrap',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical'}},b.corpo)
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

function AgEnviarTab({ agencia, agenciaUuids }) {
  var [geradas, setGeradas] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [copiado, setCopiado] = React.useState(null);
  var mono = 'IBM Plex Mono,monospace';
  var agNome = agencia ? (agencia.name||agencia.id) : '';
  // Gerar fila
  var [gerando, setGerando] = React.useState(false);
  var [geracaoResult, setGeracaoResult] = React.useState(null);
  var [geracaoErr, setGeracaoErr] = React.useState(null);

  function gerarFila(limite) {
    var agId = agenciaUuids && agencia ? (agenciaUuids[agencia.id] || agencia.id) : (agencia ? agencia.id : null);
    if (!agId) { setGeracaoErr('Agência sem UUID mapeado'); return; }
    var jwt = (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON;
    setGerando(true); setGeracaoResult(null); setGeracaoErr(null);
    fetch('/api/fila', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ agencia_slug: agId, canais: ['email', 'whatsapp', 'linkedin_convite'], limite: limite || 30 })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      setGeracaoResult(d);
      setGerando(false);
    })
    .catch(function(e){ setGeracaoErr(e.message); setGerando(false); });
  }

  React.useEffect(function() {
    supaFetch('/rest/v1/crm_credenciais_geradas?order=criado_em.desc&limit=20&select=id,token,titulo,html_url,idioma,expira_em,criado_em').then(function(d) {
      setGeradas(Array.isArray(d)?d:[]); setLoading(false);
    }).catch(function(){setLoading(false);});
  }, []);

  function copiar(texto, id) {
    try { navigator.clipboard.writeText(texto); } catch(e){}
    setCopiado(id);
    setTimeout(function(){setCopiado(null);}, 1800);
  }

  function msgEmail(url) {
    return 'Olá,\n\nSegue nossa credencial com cases e serviços relevantes para vocês:\n\n'+url+'\n\n(Link válido por 7 dias)\n\nPedro Ica, Head of Growth, Galeria Holding';
  }
  function msgWA(url) { return 'Oi! Segue nossa credencial: '+url+' (válido 7 dias)'; }
  function msgLI(url) { return 'Segue nossa credencial: '+url; }

  if (loading) return React.createElement("div",{style:{color:'#555',fontFamily:mono,fontSize:11,padding:20}},'…');

  return React.createElement("div",{style:{flex:1,overflowY:'auto',padding:'12px 20px'}},
    // Bloco: Gerar e-mails de hoje
    React.createElement("div",{style:{background:'#0D0D1A',border:'.5px solid #1A1A2E',borderRadius:8,padding:'14px 18px',marginBottom:16}},
      React.createElement("div",{style:{fontFamily:mono,fontSize:9,color:'#9B9BB4',letterSpacing:'.5px',marginBottom:8}}, 'GERAR FILA DE HOJE'),
      React.createElement("div",{style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}},
        [10,20,30].map(function(n){
          return React.createElement("button",{key:n,onClick:function(){gerarFila(n);},disabled:gerando,
            style:{padding:'5px 14px',border:'none',borderRadius:4,background:gerando?'#1A1A2E':'#FF6B2B22',color:gerando?'#555':'#FF6B2B',border:'.5px solid rgba(255,107,43,.3)',fontSize:9,fontFamily:mono,cursor:gerando?'not-allowed':'pointer',fontWeight:600}},
            gerando ? '…gerando' : 'Gerar '+n+' e-mails'
          );
        })
      ),
      geracaoErr && React.createElement("div",{style:{fontFamily:mono,fontSize:9,color:'#E24B4A',marginTop:4}}, '✗ '+geracaoErr),
      geracaoResult && React.createElement("div",null,
        React.createElement("div",{style:{fontFamily:mono,fontSize:9,color:'#34D399',marginBottom:4}}, '✓ '+geracaoResult.gerados+' itens gerados na fila'),
        geracaoResult.erros && geracaoResult.erros.length > 0 && React.createElement("div",{style:{fontFamily:mono,fontSize:8,color:'#E24B4A'}}, geracaoResult.erros.length+' erros'),
        geracaoResult.bloqueados && geracaoResult.bloqueados.length > 0 && React.createElement("div",{style:{fontFamily:mono,fontSize:8,color:'#555'}}, geracaoResult.bloqueados.length+' bloqueados (exclusividade/inelegíveis)'),
        geracaoResult.itens && React.createElement("div",{style:{marginTop:8,maxHeight:120,overflowY:'auto'}},
          geracaoResult.itens.map(function(it,i){
            return React.createElement("div",{key:i,style:{fontFamily:mono,fontSize:8,color:'#666',borderBottom:'.5px solid #1A1A2E',paddingBottom:2,marginBottom:2}},
              it.empresa + ' · ' + it.decisor + ' · ' + it.canal + (it.estrelas?' · '+it.estrelas+'★':'')
            );
          })
        )
      )
    ),
    React.createElement("div",{style:{marginBottom:14}},
      React.createElement("div",{style:{fontSize:11,fontWeight:600,color:'#F5F5F5',marginBottom:4}},'Credenciais geradas'),
      React.createElement("div",{style:{fontSize:9,color:'#9B9BB4',fontFamily:mono,marginBottom:8}},'Gere credenciais na aba Credenciais → botão "Gerar credencial". Links válidos 7 dias.')
    ),
    geradas.length === 0 && React.createElement("div",{style:{color:'#555',fontFamily:mono,fontSize:10,padding:'20px 0'}},'Nenhuma credencial gerada ainda. Vá em Credenciais → Gerar credencial.'),
    geradas.map(function(g) {
      var expired = new Date(g.expira_em) < new Date();
      var url = g.html_url || ('https://galeria-holding-sage.vercel.app/c/'+(g.token||''));
      var expDate = g.expira_em ? new Date(g.expira_em).toLocaleDateString('pt-BR') : '—';
      return React.createElement("div",{key:g.id,style:{background:'#0D0D1A',border:'.5px solid '+(expired?'#2D2D44':'#1A1A2E'),borderRadius:8,padding:'10px 14px',marginBottom:8,opacity:expired?0.5:1}},
        React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}},
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:11,fontWeight:600,color:'#F5F5F5'}},(g.titulo||'Credencial')+(g.idioma?' ('+g.idioma+')':'')),
            React.createElement("div",{style:{fontSize:9,color:'#555',fontFamily:mono}},'Expira: '+expDate+(expired?' — EXPIRADO':'')),
            React.createElement("a",{href:url,target:'_blank',rel:'noopener',style:{fontSize:9,color:'#60A5FA',fontFamily:mono}},url.slice(0,50)+'…')
          ),
          !expired && React.createElement("a",{href:url,target:'_blank',rel:'noopener noreferrer',style:{padding:'4px 10px',border:'.5px solid #60A5FA44',borderRadius:4,color:'#60A5FA',fontSize:9,fontFamily:mono,textDecoration:'none',whiteSpace:'nowrap'}},'↗ Abrir')
        ),
        !expired && React.createElement("div",{style:{display:'flex',gap:6,flexWrap:'wrap'}},
          React.createElement("button",{onClick:function(){copiar(url,g.id+'u');},style:{padding:'3px 8px',border:'.5px solid #2D2D44',borderRadius:4,background:'transparent',color:copiado===g.id+'u'?'#34D399':'#9B9BB4',fontSize:8,cursor:'pointer',fontFamily:mono}},copiado===g.id+'u'?'✓ Copiado':'Copiar link'),
          React.createElement("button",{onClick:function(){copiar(msgEmail(url),g.id+'e');},style:{padding:'3px 8px',border:'.5px solid #2D2D44',borderRadius:4,background:'transparent',color:copiado===g.id+'e'?'#34D399':'#9B9BB4',fontSize:8,cursor:'pointer',fontFamily:mono}},copiado===g.id+'e'?'✓ Copiado':'Texto e-mail'),
          React.createElement("button",{onClick:function(){copiar(msgWA(url),g.id+'w');},style:{padding:'3px 8px',border:'.5px solid #2D2D44',borderRadius:4,background:'transparent',color:copiado===g.id+'w'?'#34D399':'#9B9BB4',fontSize:8,cursor:'pointer',fontFamily:mono}},copiado===g.id+'w'?'✓ Copiado':'Texto WA'),
          React.createElement("button",{onClick:function(){copiar(msgLI(url),g.id+'l');},style:{padding:'3px 8px',border:'.5px solid #2D2D44',borderRadius:4,background:'transparent',color:copiado===g.id+'l'?'#34D399':'#9B9BB4',fontSize:8,cursor:'pointer',fontFamily:mono}},copiado===g.id+'l'?'✓ Copiado':'Texto LinkedIn')
        )
      );
    })
  );
}

function AgenciaHome({ agencia, tab, navTo, agenciaUuids }) {
  return React.createElement("div",{style:{display:'flex',flex:1,flexDirection:'column',overflow:'hidden'}},
    tab === 'pipeline' ? React.createElement("div",{style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}},
      typeof PipelineGlobalView !== 'undefined'
        ? React.createElement(PipelineGlobalView, { key: (agencia && agencia.id !== 'global' && agenciaUuids && agenciaUuids[agencia.id]) || (agencia && agencia.id) || 'global', meuPapel: 'admin', minhaAgenciaId: agencia && agencia.id, agenciaFiltro: agencia && agencia.id !== 'global' && agenciaUuids && agenciaUuids[agencia.id] || null })
        : React.createElement("div",{style:{padding:20,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11}},'Pipeline carregando...')
    ) :
    tab === 'noticias'    ? React.createElement(AgNoticiasTab,   {agencia:agencia, agenciaUuids:agenciaUuids}) :
    tab === 'servicos'    ? React.createElement(AgServicosTab,   {agencia:agencia, agenciaUuids:agenciaUuids}) :
    tab === 'materiais'   ? React.createElement(AgMateriaisTab,  {agencia:agencia, agenciaUuids:agenciaUuids}) :
    tab === 'cases'       ? React.createElement(AgCasesTab,      {agencia:agencia, agenciaUuids:agenciaUuids}) :
    tab === 'credenciais' ? React.createElement(AgCredenciaisTab,{agencia:agencia}) :
    tab === 'textos'      ? React.createElement(AgTextosTab,     {agencia:agencia}) :
    tab === 'enviar'      ? React.createElement(AgEnviarTab,     {agencia:agencia, agenciaUuids:agenciaUuids}) :
    React.createElement("div",{style:{padding:20,color:'#555',fontFamily:'IBM Plex Mono,monospace',fontSize:11}}, tab)
  );
}

