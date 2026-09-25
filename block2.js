const {
  useState,
  useMemo,
  useEffect,
  useCallback
} = React;
function normalizarNome(nome) {
  return (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
}
function calcularScore(empresa, accs, grupoId, alertas) {
  let score = 0;
  const key = (grupoId || "galeria") + "_" + empresa.rank;
  const acc = (accs || {})[key] || {};
  const decisors = acc.decisors || [];
  const activities = acc.activities || [];
  const setoresAlta = ["Fintech", "E-commerce", "FMCG", "Beleza", "Saude", "Streaming", "B2B Tech", "Super App"];
  if (setoresAlta.includes(empresa.setor)) score += 20;else score += 10;
  const lastAct = activities.length > 0 ? activities[activities.length - 1] : null;
  if (!lastAct) {
    score += 20;
  } else {
    const diasAtras = (Date.now() - new Date(lastAct.isoDate || lastAct.date || 0).getTime()) / 86400000;
    if (isNaN(diasAtras) || diasAtras > 90) score += 20;else if (diasAtras > 30) score += 10;
  }
  const nDec = decisors.length;
  if (nDec === 0) score += 15;else if (nDec <= 2) score += 10;else score += 5;
  const alertasArr = alertas || [];
  const temCMO = alertasArr.some(a => {
    const mesmoNome = (a.empresa || "").toLowerCase().includes((empresa.nome || "").toLowerCase().slice(0, 6));
    const recente = !a.date || (Date.now() - new Date(a.date.split("/").reverse().join("-")).getTime()) / 86400000 < 90;
    return mesmoNome && recente;
  });
  if (temCMO) score += 25;
  const fitAlto = ["E-commerce", "Fintech", "FMCG", "Beleza", "Varejo", "Super App", "Social Media"].includes(empresa.setor);
  score += fitAlto ? 20 : 10;
  return Math.min(100, score);
}
function scoreCor(s) {
  if (s >= 80) return "#E24B4A";
  if (s >= 60) return "#EF9F27";
  if (s >= 40) return "#FF6B2B";
  return "#9B9BB4";
}
function scoreCls(s) {
  if (s >= 80) return "score-urgent";
  if (s >= 60) return "score-high";
  if (s >= 40) return "score-mid";
  return "score-low";
}
async function claudeSearch(prompt, maxTokens) {
  if (!getClaudeKey()) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getClaudeKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens || 2000,
        tools: [{
          type: "web_search_20250305",
          name: "web_search"
        }],
        messages: [{
          role: "user",
          content: prompt
        }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const d = await r.json();
    return (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}
async function claudeAsk(prompt, maxTokens) {
  if (!getClaudeKey()) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getClaudeKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens || 2000,
        messages: [{
          role: "user",
          content: prompt
        }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const d = await r.json();
    return (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}
function parseJSON(txt) {
  if (!txt) return null;
  try {
    const clean = (txt || "").replace(/```json[\s\S]*?```|```/g, "").trim();
    const arr = clean.match(/\[[\s\S]*\]/);
    if (arr) return JSON.parse(arr[0]);
    const obj = clean.match(/\{[\s\S]*\}/);
    if (obj) return JSON.parse(obj[0]);
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}
function lsGet(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch (e) {
    return def;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.error('[CRM] localStorage cheio — dado não salvo:', key);
      alert('⚠️ Armazenamento local cheio. Exporte um backup (🛟 Ferramentas) e limpe dados antigos para continuar salvando.');
    }
  }
}
function lsMerge(key, patch) {
  const cur = lsGet(key, {});
  lsSet(key, {
    ...cur,
    ...patch
  });
}
function getWeekKey(offsetWeeks) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetWeeks || 0) * 7);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return d.getFullYear() + "-W" + String(wk).padStart(2, "0");
}
function getWeekLabel(weekKey) {
  if (!weekKey) return "";
  const [year, w] = weekKey.split("-W");
  const jan1 = new Date(parseInt(year), 0, 1);
  const days = (parseInt(w) - 1) * 7 - jan1.getDay() + 1;
  const s = new Date(jan1.getTime() + days * 86400000);
  const e = new Date(s.getTime() + 4 * 86400000);
  const f = d => d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short"
  });
  return `Semana ${w} — ${f(s)} a ${f(e)} ${year}`;
}
function ini(nome) {
  return (nome || "?").split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
}
var GRADS = [["#FF6B2B", "#e55a1f"], ["#A78BFA", "#7C3AED"], ["#34D399", "#059669"], ["#60A5FA", "#2563EB"], ["#F472B6", "#DB2777"], ["#FB923C", "#EA580C"], ["#1D9E75", "#065f46"], ["#EF9F27", "#b45309"]];
function getGrad(nome) {
  return GRADS[(nome || "A").charCodeAt(0) % GRADS.length];
}
var TUTORIAL_STEPS = [{
  icon: "🏠",
  title: "Bem-vindo ao sistema",
  body: "Este é o sistema de prospecção da Galeria Holding. Ele enriquece empresas, monitora o mercado, sugere prioridades e gera abordagens personalizadas. Vamos começar?"
}, {
  icon: "🎴",
  title: "Álbum de Figurinhas",
  body: "Aqui ficam todas as suas empresas-alvo. Cada empresa tem decisores — os verificados você cadastrou, os sugeridos o sistema encontrou. Meta: 5 verificados por empresa."
}, {
  icon: "⚡",
  title: "Enriquecimento automático",
  body: "Clique em 'Enriquecer empresa' para o sistema buscar CMOs, diretores e gerentes via web search. Você revisa e confirma antes de usar."
}, {
  icon: "✉",
  title: "Criar abordagem",
  body: "Para cada decisor, clique em '✉ Abordagem'. O sistema gera email, LinkedIn DM, WhatsApp e comentário personalizados usando metodologia SPEAR + Challenger Sale."
}, {
  icon: "📋",
  title: "Kanban semanal",
  body: "Toda vez que você aciona alguém, ele entra automaticamente no Kanban. Meta: 50 acionamentos por semana. O Cockpit matinal mostra o que fazer hoje."
}, {
  icon: "🔔",
  title: "Monitor de CMO",
  body: "Todo dia o sistema pode buscar novos executivos que assumiram cargos de marketing no Brasil. Novo CMO = janela de 90 dias de oportunidade."
}, {
  icon: "🤖",
  title: "Perguntas inteligentes",
  body: "Clique em 🤖 Perguntar e faça qualquer pergunta sobre seus dados: 'quais empresas de bet tenho?', 'quem está sem contato há mais de 60 dias?'."
}, {
  icon: "🚀",
  title: "Pronto para começar",
  body: "Sua primeira ação recomendada: veja o Top 10 de empresas por score e enriqueça as 3 primeiras. Depois crie abordagens para os decisores encontrados. Bom hunting."
}];
function TutorialOverlay({
  onClose
}) {
  const [step, setStep] = useState(0);
  const total = TUTORIAL_STEPS.length;
  const cur = TUTORIAL_STEPS[step];
  const finish = () => {
    lsSet("gh_tutorial_v1", {
      concluido: true,
      data: new Date().toLocaleDateString("pt-BR")
    });
    onClose();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "tut-overlay"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tut-card"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 40,
      marginBottom: 12,
      textAlign: "center"
    }
  }, cur.icon), /*#__PURE__*/React.createElement("div", {
    className: "tut-step"
  }, step + 1, " / ", total), /*#__PURE__*/React.createElement("div", {
    className: "tut-title"
  }, cur.title), /*#__PURE__*/React.createElement("div", {
    className: "tut-body"
  }, cur.body), /*#__PURE__*/React.createElement("div", {
    className: "tut-dots"
  }, TUTORIAL_STEPS.map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "tut-dot" + (i === step ? " on" : "")
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tut-btns"
  }, step > 0 && /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-ghost",
    onClick: () => setStep(p => p - 1)
  }, "Anterior"), step < total - 1 ? /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-primary",
    style: {
      marginLeft: "auto"
    },
    onClick: () => setStep(p => p + 1)
  }, "Próximo →") : /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-primary",
    style: {
      marginLeft: "auto"
    },
    onClick: finish
  }, "Começar agora 🚀"), /*#__PURE__*/React.createElement("button", {
    className: "gh-btn-ghost",
    onClick: finish
  }, "Pular"))));
}
function Top10View({
  accs,
  alertas,
  curGrupo,
  onEmpresaClick
}) {
  const empresas = (typeof PROSP !== "undefined" ? PROSP : []).filter(e => e.setor);
  const scored = empresas.map(e => ({
    ...e,
    score: calcularScore(e, accs, curGrupo.id, alertas)
  })).sort((a, b) => b.score - a.score).slice(0, 10);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      background: "#0D0D0D"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px",
      borderBottom: ".5px solid #2D2D44",
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 500,
      color: "#F5F5F5",
      letterSpacing: -.3
    }
  }, "🎯 Top 10 Empresas"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      marginTop: 2
    }
  }, "Priorizadas por score — ", curGrupo.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4"
    }
  }, "Atualizado agora")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "16px 20px"
    }
  }, scored.map((e, i) => {
    const sc = e.score;
    const g = getGrad(e.nome);
    return /*#__PURE__*/React.createElement("div", {
      key: e.rank,
      className: "top10-row",
      onClick: () => onEmpresaClick && onEmpresaClick(e)
    }, /*#__PURE__*/React.createElement("div", {
      className: "top10-rank"
    }, "#", i + 1), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: `linear-gradient(135deg,${g[0]},${g[1]})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 500,
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
        fontSize: 12,
        fontWeight: 500,
        color: "#F5F5F5",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, e.nome), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontFamily: "IBM Plex Mono,monospace",
        color: "#9B9BB4",
        marginTop: 2
      }
    }, e.setor)), /*#__PURE__*/React.createElement("div", {
      className: "score-badge " + scoreCls(sc),
      style: {
        width: 38,
        height: 38
      }
    }, sc), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 8,
        fontFamily: "IBM Plex Mono,monospace",
        padding: "2px 8px",
        borderRadius: 100,
        background: sc >= 80 ? "rgba(226,75,74,.1)" : sc >= 60 ? "rgba(239,159,39,.1)" : "rgba(255,107,43,.1)",
        color: scoreCor(sc),
        border: "1px solid " + scoreCor(sc) + "44",
        flexShrink: 0
      }
    }, sc >= 80 ? "URGENTE" : sc >= 60 ? "ALTA" : sc >= 40 ? "MÉDIA" : "BAIXA"));
  }), scored.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 60,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      fontSize: 12
    }
  }, "Nenhuma empresa encontrada")));
}
function AbordagemModal({
  decisor,
  empresa,
  empresaId,
  setor,
  clienteAtivo,
  agenciaAtendendo,
  onClose,
  onKanbanAdd
}) {
  // ── state ──────────────────────────────────────────────────────────────────
  var _agId = useState(null); var agId = _agId[0]; var setAgId = _agId[1];
  var _canal = useState('whatsapp'); var canal = _canal[0]; var setCanal = _canal[1];
  var _etapa = useState('1'); var etapa = _etapa[0]; var setEtapa = _etapa[1];
  var _texto = useState(''); var texto = _texto[0]; var setTexto = _texto[1];
  var _assunto = useState(''); var assunto = _assunto[0]; var setAssunto = _assunto[1];
  var _templateId = useState(null); var templateId = _templateId[0]; var setTemplateId = _templateId[1];
  var _toques = useState([]); var toques = _toques[0]; var setToques = _toques[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _tplLoading = useState(false); var tplLoading = _tplLoading[0]; var setTplLoading = _tplLoading[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _avisos = useState([]); var avisos = _avisos[0]; var setAvisos = _avisos[1];
  var _eid = useState(empresaId || null); var eid = _eid[0]; var setEid = _eid[1];
  var _ligResultado = useState(''); var ligResultado = _ligResultado[0]; var setLigResultado = _ligResultado[1];
  var _nota = useState(''); var nota = _nota[0]; var setNota = _nota[1];
  var _reuniaoEm = useState(''); var reuniaoEm = _reuniaoEm[0]; var setReuniaoEm = _reuniaoEm[1];
  var _showReuniao = useState(false); var showReuniao = _showReuniao[0]; var setShowReuniao = _showReuniao[1];
  var _gravado = useState(false); var gravado = _gravado[0]; var setGravado = _gravado[1];
  var _copiado = useState(false); var copiado = _copiado[0]; var setCopiado = _copiado[1];
  // ── Supabase fetch helper (JWT auth) ───────────────────────────────────────
  function sjAb(path, opts) {
    var ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
    var BASE = 'https://uetltlnjmobeiunxfsqi.supabase.co';
    var jwt = (window.__supaSession && window.__supaSession.access_token) || ANON;
    var h = Object.assign({'Content-Type':'application/json','Authorization':'Bearer '+jwt,'apikey':ANON}, opts&&opts.headers);
    return fetch(BASE+path, Object.assign({},opts,{headers:h}))
      .then(function(r){ return (r.status===204||r.status===200&&r.headers.get('content-length')==='0')?null:r.json(); })
      .catch(function(){ return null; });
  }

  // ── São Paulo Monday 00:00 UTC ──────────────────────────────────────────────
  function semanaInicio() {
    var now = new Date();
    var sp = new Date(now.toLocaleString('en-US', {timeZone:'America/Sao_Paulo'}));
    var day = sp.getDay();
    var diff = day===0 ? -6 : 1-day;
    var mon = new Date(sp); mon.setDate(sp.getDate()+diff); mon.setHours(0,0,0,0);
    var offset = now.getTime() - sp.getTime();
    return new Date(mon.getTime()+offset).toISOString();
  }

  // ── Interpolate template ────────────────────────────────────────────────────
  function interpolarAb(tpl, ag) {
    if (!tpl) return '';
    var pn = ((decisor&&decisor.nome)||'').split(' ')[0];
    var st = (typeof setorGerar === 'function') ? setorGerar({setor:setor||''}) : (setor||'marketing').toLowerCase()||'marketing';
    return tpl
      .replace(/\{primeiro_nome\}/g, pn)
      .replace(/\{empresa\}/g, empresa||'')
      .replace(/\{cargo\}/g, (decisor&&decisor.cargo)||'')
      .replace(/\{agencia\}/g, ag||'Galeria Holding')
      .replace(/\{setor\}/g, st);
  }

  // ── Load data on mount ──────────────────────────────────────────────────────
  useEffect(function() {
    var AG = (typeof AGENCIAS_GERAR!=='undefined') ? AGENCIAS_GERAR : [{id:'3409ab82-f0cd-4d95-b6e2-398995425411',nome:'Galeria Holding'}];
    setAgId(AG[0].id);
    var cancelled = false;
    (async function() {
      setLoading(true);
      // 1. Resolve empresa
      var resolvedEid = eid;
      var empRow = null;
      if (!resolvedEid && empresa) {
        var er = await sjAb('/rest/v1/crm_empresas?nome=eq.'+encodeURIComponent(empresa)+'&select=id,cliente_ativo,agencia_atendendo&limit=1');
        if (er&&er[0]) { resolvedEid=er[0].id; empRow=er[0]; }
      }
      if (!cancelled && resolvedEid) setEid(resolvedEid);
      // 2. Last 5 toques
      var tqs = [];
      if (decisor&&decisor.id) {
        var dt = await sjAb('/rest/v1/crm_toques?decisor_id=eq.'+decisor.id+'&select=id,data,canal,agencia_id,resultado,resumo,decisor_id&order=data.desc&limit=5');
        tqs = Array.isArray(dt)?dt:[];
      }
      if (resolvedEid) {
        var et = await sjAb('/rest/v1/crm_toques?empresa_id=eq.'+resolvedEid+'&select=id,data,canal,agencia_id,resultado,resumo,decisor_id&order=data.desc&limit=5');
        var etA = Array.isArray(et)?et:[];
        var ids = new Set(tqs.map(function(t){return t.id;}));
        etA.forEach(function(t){if(!ids.has(t.id))tqs.push(t);});
        tqs.sort(function(a,b){return (b.data||'').localeCompare(a.data||'');});
        tqs = tqs.slice(0,5);
      }
      if (!cancelled) setToques(tqs);
      // 3. Suggest etapa
      var decTqs = tqs.filter(function(t){return t.decisor_id===(decisor&&decisor.id);});
      var sugEtapa = '1';
      if (decTqs.length>0) {
        var last = decTqs[0];
        var days = (Date.now()-new Date(last.data).getTime())/86400000;
        if (days>=5&&days<=10&&!['resposta','reuniao_marcada','reuniao'].includes(last.resultado||'')) sugEtapa='2';
      }
      if (!cancelled) setEtapa(sugEtapa);
      // 4. Rule warnings
      var warns = [];
      var isAtivo = clienteAtivo||(empRow&&empRow.cliente_ativo);
      var atendendo = agenciaAtendendo||(empRow&&empRow.agencia_atendendo);
      if (isAtivo) warns.push('Cliente ativo'+(atendendo?' de '+atendendo:'')+'  — considerar fluxo de upsell');
      if (resolvedEid) {
        var wk = await sjAb('/rest/v1/crm_toques?empresa_id=eq.'+resolvedEid+'&data=gte.'+encodeURIComponent(semanaInicio())+'&select=agencia_id,decisor_id');
        var wkA = Array.isArray(wk)?wk:[];
        var agSel = agId || AG[0].id;
        if (wkA.find(function(t){return t.agencia_id&&t.agencia_id!==agSel;})) warns.push('Empresa já abordada por outra agência nesta semana');
        var decIdsW = new Set(wkA.filter(function(t){return t.decisor_id;}).map(function(t){return t.decisor_id;}));
        if (decIdsW.size>=2) warns.push('Já 2 decisores desta empresa abordados nesta semana');
      }
      if (decisor&&decisor.id&&decTqs.length>0) {
        var daysSince = (Date.now()-new Date(decTqs[0].data).getTime())/86400000;
        if (daysSince<5) warns.push('Mesmo decisor abordado há '+Math.floor(daysSince)+' dia(s) — aguardar 5 dias');
      }
      if (!cancelled) setAvisos(warns);
      setLoading(false);
    })();
    return function(){cancelled=true;};
  }, []);

  // ── Load template when agência/canal/etapa changes ──────────────────────────
  useEffect(function() {
    if (!agId) return;
    var AG = (typeof AGENCIAS_GERAR!=='undefined')?AGENCIAS_GERAR:[{id:'3409ab82-f0cd-4d95-b6e2-398995425411',nome:'Galeria Holding'}];
    var agObj = AG.find(function(a){return a.id===agId;})||AG[0]||{nome:'Galeria Holding'};
    setTplLoading(true);
    sjAb('/rest/v1/crm_templates?agencia_id=eq.'+agId+'&canal=eq.'+canal+'&etapa=eq.'+etapa+'&tipo=eq.prospeccao&ativo=eq.true&select=id,assunto,corpo&limit=1')
      .then(function(rows) {
        setTplLoading(false);
        if (rows&&rows[0]) {
          setTemplateId(rows[0].id);
          setTexto(interpolarAb(rows[0].corpo, agObj.nome));
          setAssunto(interpolarAb(rows[0].assunto, agObj.nome));
        } else {
          setTemplateId(null);
          var pn = ((decisor&&decisor.nome)||'').split(' ')[0];
          if (canal==='email') { setTexto(pn+',\n\nAcompanho o trabalho da '+empresa+'.\n\nAbraço,'); setAssunto(empresa+' · uma conversa'); }
          else if (canal==='ligacao') { setTexto('Olá '+pn+', aqui é Pedro da '+agObj.nome+'.\nGostaria de conversar sobre uma oportunidade para '+empresa+'.\nA empresa atua em '+(setor||'marketing')+'.\nValeria 15 minutos?\nPosso ligar em outro momento?\nObrigado.'); setAssunto(''); }
          else { setTexto(pn+', sou Pedro, da '+agObj.nome+'. Vi o trabalho da '+empresa+'.'); setAssunto(''); }
        }
      });
  }, [agId, canal, etapa]);

  // ── Gravar toque ────────────────────────────────────────────────────────────
  async function gravarToque(resultado, notaTxt, reuniaoEmVal) {
    if (saving) return;
    setSaving(true);
    var now = new Date().toISOString();
    // Quando reunião foi agendada, o resultado mais específico é reuniao_marcada
    var resFinal = (reuniaoEmVal && resultado === 'atendeu') ? 'reuniao_marcada' : (resultado || null);
    var row = {
      decisor_id:(decisor&&decisor.id)||null, empresa_id:eid||null,
      agencia_id:agId||null, canal:canal, etapa:etapa,
      template_id:templateId||null, texto_enviado:texto||null,
      assunto:assunto||null, nota:notaTxt||null,
      resultado:resFinal, reuniao_em:reuniaoEmVal||null,
      data:now, criado_em:now, origem:'abordagem_direta',
      direcao:'enviado', fonte:'manual'
    };
    await sjAb('/rest/v1/crm_toques',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(row)});
    if (decisor&&decisor.id) await sjAb('/rest/v1/crm_decisores?id=eq.'+decisor.id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({ultimo_toque_em:now,ultimo_tema:canal})});
    if (eid) await sjAb('/rest/v1/crm_empresas?id=eq.'+eid,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({ultimo_toque_em:now})});
    // Criar oportunidade automaticamente quando reunião marcada via Abordar
    if (reuniaoEmVal && eid) {
      var desde30 = new Date(Date.now() - 30*86400000).toISOString();
      var existing = await sjAb('/rest/v1/crm_oportunidades?empresa_id=eq.'+eid+'&agencia_id=eq.'+agId+'&aberta_em=gte.'+encodeURIComponent(desde30)+'&select=id&limit=1');
      if (!existing || !Array.isArray(existing) || !existing.length) {
        var AG_LOC = (typeof AGENCIAS_GERAR !== 'undefined') ? AGENCIAS_GERAR : [];
        var agNome = (AG_LOC.find(function(a){return a.id===agId;}) || {}).nome || '';
        var oport = await sjAb('/rest/v1/crm_oportunidades', {
          method:'POST', headers:{'Prefer':'return=representation'},
          body:JSON.stringify({
            empresa_id:eid, agencia_id:agId||null,
            titulo:(empresa||'Empresa')+' — '+agNome,
            estagio:'Reunião marcada', origem:'abordagem_direta',
            aberta_em:now, criado_em:now, atualizado_em:now
          })
        });
        if (oport && Array.isArray(oport) && oport[0]) {
          await sjAb('/rest/v1/crm_oportunidade_eventos', {
            method:'POST', headers:{'Prefer':'return=minimal'},
            body:JSON.stringify({oportunidade_id:oport[0].id, tipo:'criada', para:'Reunião marcada', texto:'Criada automaticamente via Abordar — reunião marcada'})
          });
          if (decisor&&decisor.id) {
            await sjAb('/rest/v1/crm_decisores?id=eq.'+decisor.id, {
              method:'PATCH', headers:{'Prefer':'return=minimal'},
              body:JSON.stringify({reuniao_marcada_em:now, agencia_prospectando:agId})
            });
          }
        }
      }
    }
    setSaving(false); setGravado(true);
    setToques(function(p){return [{...row,id:'new'+Date.now(),data:now}].concat(p).slice(0,5);});
  }

  // ── Actions by canal ────────────────────────────────────────────────────────
  function acaoEmail() {
    var dest=(decisor&&decisor.email)||'';
    var url='https://outlook.office.com/mail/deeplink/compose?to='+encodeURIComponent(dest)+'&subject='+encodeURIComponent(assunto)+'&body='+encodeURIComponent(texto);
    window.open(url,'_blank'); gravarToque('enviado',null,null);
  }
  function acaoWhatsApp() {
    var n=((decisor&&decisor.wa)||'').replace(/\D/g,'');
    var num=(n.startsWith('55')&&n.length>=12)?n:'55'+n;
    window.open('https://wa.me/'+num+'?text='+encodeURIComponent(texto),'_blank');
    gravarToque('enviado',null,null);
  }
  function acaoLinkedIn() {
    try{navigator.clipboard.writeText(texto);}catch(e){}
    setCopiado(true); setTimeout(function(){setCopiado(false);},2500);
    var li=(decisor&&(decisor.linkedin_url||decisor.linkedin))||'';
    if(!li) li='https://www.linkedin.com/search/results/people/?keywords='+encodeURIComponent((decisor&&decisor.nome)||'');
    else if(!li.startsWith('http')) li='https://'+li;
    window.open(li,'_blank'); gravarToque('enviado',null,null);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  var AGENCIAS = (typeof AGENCIAS_GERAR!=='undefined')?AGENCIAS_GERAR:[{id:'3409ab82-f0cd-4d95-b6e2-398995425411',nome:'Galeria Holding'}];
  var CANAIS = [{id:'whatsapp',label:'WhatsApp'},{id:'email',label:'E-mail'},{id:'linkedin',label:'LinkedIn'},{id:'ligacao',label:'Ligação'}];
  var ETAPAS = [{id:'1',label:'Etapa 1'},{id:'2',label:'Etapa 2'},{id:'3',label:'Etapa 3'}];

  function canalLabel(c){return {email:'E-mail',whatsapp:'WhatsApp',linkedin:'LinkedIn',ligacao:'Ligação',reuniao:'Reunião'}[c]||c||'—';}
  function agNomeById(id){if(!id)return '—';var a=(AGENCIAS_GERAR||AGENCIAS).find(function(x){return x.id===id;});return a?a.nome:id.slice(0,8)+'…';}

  var S = {
    overlay:{position:'fixed',inset:0,zIndex:1200,background:'rgba(0,0,0,.65)',display:'flex',justifyContent:'flex-end'},
    drawer:{width:500,maxWidth:'96vw',background:'#0a0a14',borderLeft:'.5px solid #2D2D44',display:'flex',flexDirection:'column',height:'100%',overflowY:'auto'},
    hdr:{padding:'16px 18px 12px',borderBottom:'.5px solid #2D2D44',display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexShrink:0},
    body:{flex:1,padding:'12px 18px 28px',overflowY:'auto'},
    sec:{marginTop:16},
    secH:{fontSize:9,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'#9B9BB4',fontFamily:"'IBM Plex Mono',monospace",marginBottom:7},
    card:{background:'#111827',border:'.5px solid #2D2D44',borderRadius:7,padding:'9px 11px',marginBottom:6},
    inp:{width:'100%',background:'#080810',border:'.5px solid #2D2D44',borderRadius:6,padding:'7px 10px',color:'#F5F5F5',fontSize:12,outline:'none',boxSizing:'border-box',fontFamily:"'IBM Plex Mono',monospace"},
    btn:{padding:'7px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:11,fontWeight:600},
    aviso:{background:'rgba(251,191,36,.07)',border:'.5px solid rgba(251,191,36,.4)',borderRadius:6,padding:'7px 10px',fontSize:11,color:'#FBBF24',marginBottom:5,fontFamily:"'IBM Plex Mono',monospace"},
  };

  function ChipSel(p) {
    return React.createElement('div',{style:{display:'flex',gap:5,flexWrap:'wrap'}},
      p.options.map(function(o){
        var act=o.id===p.value;
        return React.createElement('button',{key:o.id,onClick:function(){p.onChange(o.id);},style:{padding:'4px 12px',borderRadius:20,border:'.5px solid '+(act?'#FF6B2B':'#2D2D44'),background:act?'rgba(255,107,43,.15)':'transparent',color:act?'#FF6B2B':'#9B9BB4',fontSize:11,cursor:'pointer',fontWeight:act?700:400}},o.label);
      })
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return React.createElement('div',{style:S.overlay,onClick:onClose},
    React.createElement('div',{style:S.drawer,onClick:function(e){e.stopPropagation();}},
      // Header
      React.createElement('div',{style:S.hdr},
        React.createElement('div',null,
          React.createElement('div',{style:{fontSize:14,fontWeight:700,color:'#F5F5F5',lineHeight:1.2}},'📨 Abordar '+((decisor&&decisor.nome)||'')),
          React.createElement('div',{style:{fontSize:10,color:'#9B9BB4',fontFamily:"'IBM Plex Mono',monospace",marginTop:3}},empresa+(setor?' · '+setor:''))
        ),
        React.createElement('button',{onClick:onClose,style:{background:'none',border:'none',color:'#9B9BB4',cursor:'pointer',fontSize:18,padding:'0 4px',lineHeight:1}},'✕')
      ),
      // Body
      React.createElement('div',{style:S.body},
        loading&&React.createElement('div',{style:{color:'#9B9BB4',fontSize:12,marginTop:24,textAlign:'center'}},'Carregando…'),
        !loading&&React.createElement('div',null,
          // Agência
          React.createElement('div',{style:S.sec},
            React.createElement('div',{style:S.secH},'AGÊNCIA'),
            React.createElement(ChipSel,{options:AGENCIAS.map(function(a){return {id:a.id,label:a.nome};}),value:agId||'',onChange:setAgId})
          ),
          // Canal
          React.createElement('div',{style:S.sec},
            React.createElement('div',{style:S.secH},'CANAL'),
            React.createElement(ChipSel,{options:CANAIS,value:canal,onChange:setCanal})
          ),
          // Etapa
          React.createElement('div',{style:S.sec},
            React.createElement('div',{style:S.secH},'ETAPA (sugerida pelo histórico)'),
            React.createElement(ChipSel,{options:ETAPAS,value:etapa,onChange:setEtapa})
          ),
          // Avisos
          avisos.length>0&&React.createElement('div',{style:{marginTop:14}},
            avisos.map(function(av,i){return React.createElement('div',{key:i,style:S.aviso},'⚠ '+av);})
          ),
          // Histórico últimos 5 toques
          toques.length>0&&React.createElement('div',{style:S.sec},
            React.createElement('div',{style:S.secH},'ÚLTIMOS 5 TOQUES'),
            toques.map(function(t){
              return React.createElement('div',{key:t.id,style:{...S.card,padding:'8px 10px',marginBottom:4}},
                React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                  React.createElement('span',{style:{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:'#9B9BB4'}},
                    (t.data?new Date(t.data).toLocaleDateString('pt-BR'):'—')+' · '+canalLabel(t.canal)
                  ),
                  React.createElement('span',{style:{fontSize:9,color:'#555',fontFamily:"'IBM Plex Mono',monospace"}},agNomeById(t.agencia_id))
                ),
                t.resultado&&React.createElement('span',{style:{fontSize:9,background:'rgba(52,211,153,.12)',color:'#34D399',padding:'1px 6px',borderRadius:100,display:'inline-block',marginTop:3}},t.resultado),
                t.resumo&&React.createElement('div',{style:{fontSize:11,color:'#9B9BB4',marginTop:4,whiteSpace:'pre-wrap',maxHeight:36,overflow:'hidden'}},t.resumo)
              );
            })
          ),
          // Gravado feedback
          gravado&&React.createElement('div',{style:{marginTop:16,padding:'10px 12px',background:'rgba(52,211,153,.08)',border:'.5px solid rgba(52,211,153,.3)',borderRadius:8,textAlign:'center',color:'#34D399',fontSize:12}},'✅ Toque gravado em crm_toques'),
          // Template + Action
          !gravado&&React.createElement('div',null,
            tplLoading&&React.createElement('div',{style:{color:'#555',fontSize:11,marginTop:16,textAlign:'center'}},'Carregando template…'),
            !tplLoading&&canal==='email'&&React.createElement('div',{style:{marginTop:16}},
              React.createElement('div',{style:S.secH},'ASSUNTO'),
              React.createElement('input',{style:{...S.inp,marginBottom:10},value:assunto,onChange:function(e){setAssunto(e.target.value);}}),
              React.createElement('div',{style:S.secH},'CORPO'),
              React.createElement('textarea',{style:{...S.inp,minHeight:130,resize:'vertical',lineHeight:1.6},value:texto,onChange:function(e){setTexto(e.target.value);}}),
              !(decisor&&decisor.email)&&React.createElement('div',{style:{marginTop:7,fontSize:11,color:'#FBBF24'}},'⚠ E-mail não cadastrado para este decisor'),
              React.createElement('div',{style:{display:'flex',gap:8,marginTop:12}},
                React.createElement('button',{onClick:acaoEmail,disabled:saving||!(decisor&&decisor.email),style:{...S.btn,flex:1,background:'#0078D4',color:'#fff',opacity:(decisor&&decisor.email)?1:.4}},saving?'Abrindo…':'✉ Abrir no Outlook Web'),
                React.createElement('button',{onClick:function(){try{navigator.clipboard.writeText((assunto?assunto+'\n\n':'')+texto);}catch(e){}},style:{...S.btn,background:'#1A1A2E',color:'#9B9BB4'}},'📋')
              )
            ),
            !tplLoading&&canal==='whatsapp'&&React.createElement('div',{style:{marginTop:16}},
              React.createElement('div',{style:S.secH},'MENSAGEM'),
              React.createElement('textarea',{style:{...S.inp,minHeight:110,resize:'vertical',lineHeight:1.6},value:texto,onChange:function(e){setTexto(e.target.value);}}),
              !(decisor&&decisor.wa)&&React.createElement('div',{style:{marginTop:7,fontSize:11,color:'#FBBF24'}},'⚠ WhatsApp não cadastrado para este decisor'),
              React.createElement('div',{style:{display:'flex',gap:8,marginTop:12}},
                React.createElement('button',{onClick:acaoWhatsApp,disabled:saving||!(decisor&&decisor.wa),style:{...S.btn,flex:1,background:'#25D366',color:'#fff',opacity:(decisor&&decisor.wa)?1:.4}},saving?'Abrindo…':'💬 Abrir no WhatsApp'),
                React.createElement('button',{onClick:function(){try{navigator.clipboard.writeText(texto);}catch(e){}},style:{...S.btn,background:'#1A1A2E',color:'#9B9BB4'}},'📋')
              )
            ),
            !tplLoading&&canal==='linkedin'&&React.createElement('div',{style:{marginTop:16}},
              React.createElement('div',{style:S.secH},'NOTA / MENSAGEM'),
              React.createElement('textarea',{style:{...S.inp,minHeight:110,resize:'vertical',lineHeight:1.6},value:texto,onChange:function(e){setTexto(e.target.value);}}),
              React.createElement('div',{style:{display:'flex',gap:8,marginTop:12}},
                React.createElement('button',{onClick:acaoLinkedIn,disabled:saving,style:{...S.btn,flex:1,background:'#0A66C2',color:'#fff'}},
                  copiado?'✓ Copiado! Abrindo perfil…':'💼 Copiar e abrir perfil LinkedIn')
              )
            ),
            !tplLoading&&canal==='ligacao'&&React.createElement('div',{style:{marginTop:16}},
              React.createElement('div',{style:S.secH},'ROTEIRO (6 LINHAS)'),
              React.createElement('textarea',{style:{...S.inp,minHeight:130,resize:'vertical',lineHeight:1.7},value:texto,onChange:function(e){setTexto(e.target.value);}}),
              React.createElement('div',{style:{...S.secH,marginTop:14}},'RESULTADO'),
              React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}},
                [['atendeu','✅ Atendeu'],['caixa_postal','📭 Caixa postal'],['nao_atendeu','❌ Não atendeu']].map(function(pair){
                  var r=pair[0],l=pair[1],act=ligResultado===r;
                  return React.createElement('button',{key:r,onClick:function(){setLigResultado(r);},style:{...S.btn,background:act?'rgba(52,211,153,.15)':'#1A1A2E',border:'.5px solid '+(act?'#34D399':'#2D2D44'),color:act?'#34D399':'#9B9BB4'}},l);
                })
              ),
              ligResultado&&React.createElement('div',{style:{marginBottom:10}},
                React.createElement('div',{style:S.secH},'NOTA'),
                React.createElement('textarea',{style:{...S.inp,minHeight:55,resize:'vertical'},value:nota,onChange:function(e){setNota(e.target.value);}})
              ),
              ligResultado==='atendeu'&&React.createElement('div',{style:{marginBottom:10}},
                !showReuniao&&React.createElement('button',{onClick:function(){setShowReuniao(true);},style:{...S.btn,background:'rgba(96,165,250,.1)',color:'#60A5FA',border:'.5px solid rgba(96,165,250,.3)'}},'📅 Reunião marcada'),
                showReuniao&&React.createElement('div',null,
                  React.createElement('div',{style:S.secH},'DATA E HORA DA REUNIÃO'),
                  React.createElement('input',{type:'datetime-local',style:S.inp,value:reuniaoEm,onChange:function(e){setReuniaoEm(e.target.value);}})
                )
              ),
              ligResultado&&React.createElement('button',{
                onClick:function(){gravarToque(ligResultado,nota,reuniaoEm?new Date(reuniaoEm).toISOString():null);},
                disabled:saving,
                style:{...S.btn,background:'#7C3AED',color:'#fff',width:'100%',marginTop:4}
              },saving?'Gravando…':'Gravar resultado')
            )
          )
        )
      )
    )
  );
}

