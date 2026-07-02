/* ═══════════════════════════════════════════════════════════════
   BLOCO 7 — 🚀 OUTBOUND
   📡 Disparo omnichannel (templates + motor de escolha)
   📊 Fila de enriquecimento C-level (Hunter → Lusha)
   🚀 Radar de empresas despontando (Claude + web search)
   🎬 Roteiros de vídeo + teleprompter
   ═══════════════════════════════════════════════════════════════ */

/* ── Templates (defaults; editáveis, persistidos em gh_templates_v1) ── */
var GH_TEMPLATES_DEFAULT = [{
  id: "cold_cmo",
  nome: "Cold — CMO/Marketing",
  alvo: ["CMO", "DIRETOR DE MARKETING", "DIRETORA DE MARKETING", "VP MARKETING", "HEAD DE MARKETING", "HEAD DE GROWTH", "GERENTE DE MARKETING", "BRAND"],
  estagio: "frio",
  canal: ["email", "linkedin"],
  assunto: "{{empresa}} + {{agencia}}: {{gancho_curto}}",
  corpo: "Direto ao ponto, {{primeiro_nome}}: acompanhei {{contexto_empresa}} e vi um paralelo forte com um case nosso — {{case_relevante}}.\n\n{{proposta_valor}}\n\nVale 20 minutos para eu te mostrar como isso se aplica na {{empresa}}?"
}, {
  id: "cold_ceo",
  nome: "Cold — CEO/Founder",
  alvo: ["CEO", "FOUNDER", "FUNDADOR", "PRESIDENTE", "SOCIO", "SÓCIO", "DIRETOR GERAL", "DIRETOR-PRESIDENTE"],
  estagio: "frio",
  canal: ["email"],
  assunto: "Crescimento da {{empresa}} — ideia rápida",
  corpo: "{{primeiro_nome}}, sem rodeio: {{gancho_negocio}}.\n\nNa {{agencia}} fizemos isso para {{case_relevante}}. Acredito que há um caminho parecido para a {{empresa}}.\n\n20 minutos essa semana?"
}, {
  id: "followup_1",
  nome: "Follow-up",
  alvo: ["*"],
  estagio: "morno",
  canal: ["whatsapp", "email"],
  assunto: "Re: {{empresa}} — próximo passo",
  corpo: "{{primeiro_nome}}, retomando nossa conversa sobre {{contexto_conversa}}. {{novidade_ou_dado}}\n\nConsigo te mandar uma proposta enxuta até {{prazo}} — faz sentido?"
}, {
  id: "case_relevante",
  nome: "Case relevante",
  alvo: ["*"],
  estagio: "morno",
  canal: ["email"],
  assunto: "{{empresa}}: o que fizemos em {{setor}} pode te interessar",
  corpo: "{{primeiro_nome}}, saiu um resultado novo aqui que tem tudo a ver com o desafio que você comentou: {{case_relevante}}.\n\nTe mando o material completo ou prefere que eu apresente em 15 minutos?"
}, {
  id: "reativacao",
  nome: "Reativação",
  alvo: ["*"],
  estagio: "congelado",
  canal: ["whatsapp", "email"],
  assunto: "{{empresa}} — vale retomar?",
  corpo: "{{primeiro_nome}}, faz um tempo que não falamos. De lá pra cá, {{novidade_agencia}}.\n\nSe o tema {{tema_original}} ainda estiver na mesa, tenho novidades que valem 15 minutos."
}, {
  id: "pos_reuniao",
  nome: "Pós-reunião",
  alvo: ["*"],
  estagio: "quente",
  canal: ["email"],
  assunto: "{{empresa}} + {{agencia}} — resumo e próximos passos",
  corpo: "{{primeiro_nome}}, obrigado pelo papo de hoje. Resumo do que alinhamos:\n\n{{resumo_pontos}}\n\nPróximo passo do nosso lado: {{proximo_passo}}. Fico no aguardo do seu ok."
}];
function ghGetTemplates() {
  try {
    var s = localStorage.getItem("gh_templates_v1");
    if (s) {
      var arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) {}
  return GH_TEMPLATES_DEFAULT;
}
function ghSaveTemplates(t) {
  try {
    localStorage.setItem("gh_templates_v1", JSON.stringify(t));
  } catch (e) {}
}

/* ── Motor de decisão: qual mensagem, para qual decisor, em qual canal ── */
function ghEstagio(temp) {
  if (temp.status === "Quente") return "quente";
  if (temp.status === "Morno") return "morno";
  if (temp.status === "Congelado") return "congelado";
  return "frio";
}
function escolherTemplate(decisor, acc, templates) {
  var temp = calcularTemperatura(acc || {});
  // sem NENHUMA atividade = cold outreach (frio); congelado pressupõe histórico que esfriou
  var estagio = acc && acc.activities && acc.activities.length ? ghEstagio(temp) : "frio";
  var cargo = (decisor.cargo || "").toUpperCase();
  var tpls = templates || ghGetTemplates();
  var candidatos = tpls.filter(function (t) {
    if (t.estagio !== estagio) return false;
    if (t.alvo.indexOf("*") >= 0) return true;
    return t.alvo.some(function (a) {
      return cargo.indexOf(a) >= 0;
    });
  });
  // regra de ouro: CEO recebe negócio, CMO recebe craft/case; fallback genérico
  if (!candidatos.length) candidatos = tpls.filter(function (t) {
    return t.estagio === estagio;
  });
  if (!candidatos.length) candidatos = tpls;
  var waLimpo = ghWaDigits(decisor.wa || decisor.wa2 || "");
  var canal = waLimpo && (estagio === "morno" || estagio === "quente" || estagio === "congelado") ? "whatsapp" : decisor.email ? "email" : decisor.li ? "linkedin" : "email";
  // se o template não suporta o canal, respeita o template
  var tpl = candidatos[0];
  if (tpl.canal.indexOf(canal) < 0) canal = tpl.canal[0];
  return {
    template: tpl,
    canal: canal,
    estagio: estagio,
    temp: temp
  };
}
function ghWaDigits(wa) {
  var d = String(wa || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return d.length >= 10 ? d : "";
  return d;
}

/* ── Cases do grupo (usados em disparo e vídeo) ── */
var CASES_GRUPO = [{
  empresa_case: "Natura",
  agencia: "GAIA/CR.IA",
  setor: "Beleza",
  resultado: "produção de campanha de Dia dos Pais com IA em 7 dias",
  tags: ["beleza", "cpg", "fmcg", "varejo", "datas", "escala"]
}, {
  empresa_case: "McFriday (McDonald's)",
  agencia: "GAIA/CR.IA",
  setor: "Food",
  resultado: "volume massivo de peças para Black Friday com criativo gerado por IA",
  tags: ["food", "varejo", "promo", "escala", "e-commerce"]
}, {
  empresa_case: "iCarros",
  agencia: "GAIA/CR.IA",
  setor: "Marketplace",
  resultado: "criativos de performance em escala para marketplace automotivo",
  tags: ["marketplace", "automotivo", "performance"]
}, {
  empresa_case: "McDonald's",
  agencia: "Catalyst",
  setor: "Food",
  resultado: "aquisição e retenção mobile com mídia otimizada in-app",
  tags: ["food", "super app", "mobile"]
}, {
  empresa_case: "Nomad",
  agencia: "Catalyst",
  setor: "Fintech",
  resultado: "crescimento de aquisição mobile com CAC controlado",
  tags: ["fintech", "mobile", "financeiro"]
}, {
  empresa_case: "Itaú",
  agencia: "Galeria",
  setor: "Financeiro",
  resultado: "integração de performance e criatividade em escala nacional",
  tags: ["financeiro", "fintech", "performance", "marca"]
}, {
  empresa_case: "Vivo",
  agencia: "Galeria",
  setor: "Telecom",
  resultado: "plataforma de comunicação integrada data-driven",
  tags: ["telecom", "tech", "marca"]
}];
function escolherCase(setor, agenciaId) {
  var s = (setor || "").toLowerCase();
  var porTag = CASES_GRUPO.filter(function (c) {
    return c.tags.some(function (t) {
      return s.indexOf(t) >= 0 || t.indexOf(s) >= 0;
    });
  });
  var porAgencia = porTag.filter(function (c) {
    return agenciaId && c.agencia.toLowerCase().indexOf(agenciaId.toLowerCase()) >= 0;
  });
  return porAgencia[0] || porTag[0] || CASES_GRUPO[0];
}

/* ── Cargos-alvo do enriquecimento ── */
var CARGOS_ALVO = ["CMO", "CEO", "CGO", "CCO", "VP MARKETING", "DIRETOR DE MARKETING", "DIRETORA DE MARKETING", "HEAD DE MARKETING", "HEAD DE GROWTH", "GERENTE DE MARKETING", "BRAND MANAGER", "DIRETOR DE COMUNICA", "MARKETING DIRECTOR", "HEAD OF MARKETING", "GROWTH", "CHIEF MARKETING", "FOUNDER", "PRESIDENTE"];
function ghCargoAlvo(position, seniority) {
  var p = (position || "").toUpperCase();
  if (CARGOS_ALVO.some(function (c) {
    return p.indexOf(c) >= 0;
  })) return true;
  return ["executive", "management", "director", "vp", "c_suite"].indexOf((seniority || "").toLowerCase()) >= 0;
}

/* ── Chamada Claude simples (o interceptor do gh-core roteia p/ /api/claude) ── */
async function ghClaude(prompt, maxTokens, tools) {
  var body = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens || 900,
    messages: [{
      role: "user",
      content: prompt
    }]
  };
  if (tools) body.tools = tools;
  var r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getClaudeKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return (d.content || []).filter(function (c) {
    return c.type === "text";
  }).map(function (c) {
    return c.text;
  }).join("");
}

/* ═══════════════ VIEW PRINCIPAL ═══════════════ */
function OutboundView({
  accs,
  setAccs,
  curGrupo,
  onAddCompany,
  nextRank
}) {
  const {
    useState
  } = React;
  const [tab, setTab] = useState("disparo");
  const tabs = [["disparo", "📡 Disparo"], ["enriquecimento", "📊 Enriquecimento"], ["radar", "🚀 Radar"], ["video", "🎬 Vídeo"]];
  const gravarActivity = (empresaKey, canal, decisorNome, nota) => {
    const tmap = {
      email: "✉ Email",
      whatsapp: "💬 WhatsApp",
      linkedin: "in LinkedIn",
      video: "🎬 Vídeo"
    };
    setAccs(prev => {
      const acc = prev[empresaKey] || {
        decisors: [],
        sugeridos: [],
        activities: []
      };
      const a = {
        type: canal,
        typeLabel: tmap[canal] || canal,
        decisor: decisorNome,
        note: nota,
        date: new Date().toLocaleDateString("pt-BR"),
        isoDate: new Date().toISOString(),
        synced: false
      };
      return {
        ...prev,
        [empresaKey]: {
          ...acc,
          activities: [...(acc.activities || []), a]
        }
      };
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#0D0D0D",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 20px",
      borderBottom: ".5px solid #2D2D44",
      flexShrink: 0,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: "#F5F5F5"
    }
  }, "🚀 Outbound"), /*#__PURE__*/React.createElement("div", {
    className: "kes-sub-nav"
  }, tabs.map(([id, lbl]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: "kes-sub-btn" + (tab === id ? " on" : ""),
    onClick: () => setTab(id)
  }, lbl))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555"
    }
  }, "grupo: ", curGrupo && curGrupo.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, tab === "disparo" && /*#__PURE__*/React.createElement(DisparoTab, {
    accs: accs,
    curGrupo: curGrupo,
    gravarActivity: gravarActivity
  }), tab === "enriquecimento" && /*#__PURE__*/React.createElement(EnriquecimentoTab, {
    accs: accs,
    setAccs: setAccs,
    curGrupo: curGrupo
  }), tab === "radar" && /*#__PURE__*/React.createElement(RadarTab, {
    onAddCompany: onAddCompany,
    nextRank: nextRank
  }), tab === "video" && /*#__PURE__*/React.createElement(VideoTab, {
    accs: accs,
    curGrupo: curGrupo,
    gravarActivity: gravarActivity
  })));
}

/* helpers de listagem de empresas do grupo com dados */
function ghEmpresasDoGrupo(accs, curGrupo, minDecisores) {
  const gid = curGrupo && curGrupo.id || "galeria";
  const nomes = {};
  (typeof LEADS_ALL !== "undefined" ? LEADS_ALL : []).forEach(l => {
    nomes[String(l.rank)] = l;
  });
  try {
    (loadSt("ghub_custom_leads", []) || []).forEach(l => {
      nomes[String(l.rank)] = l;
    });
  } catch (e) {}
  const out = [];
  Object.keys(accs || {}).forEach(key => {
    if (key.indexOf(gid + "_") !== 0) return;
    const acc = accs[key] || {};
    const rank = key.slice(gid.length + 1);
    const lead = nomes[rank] || {};
    const dec = acc.decisors || [];
    if (minDecisores !== undefined ? dec.length < minDecisores : dec.length === 0) return;
    out.push({
      key,
      rank,
      nome: lead.nome || "#" + rank,
      setor: lead.setor || "—",
      site: lead.site || "",
      acc,
      decisors: dec
    });
  });
  out.sort((a, b) => a.nome.localeCompare(b.nome));
  return out;
}

/* ═══════════════ 📡 DISPARO OMNICHANNEL ═══════════════ */
function DisparoTab({
  accs,
  curGrupo,
  gravarActivity
}) {
  const {
    useState,
    useMemo
  } = React;
  const [busca, setBusca] = useState("");
  const [empresaKey, setEmpresaKey] = useState(null);
  const [itens, setItens] = useState([]); // [{decisor, canal, template, assunto, corpo, aprovado, gerando}]
  const [editTpl, setEditTpl] = useState(false);
  const [templates, setTemplates] = useState(ghGetTemplates());
  const [msg, setMsg] = useState("");
  const empresas = useMemo(() => ghEmpresasDoGrupo(accs, curGrupo, 1), [accs, curGrupo]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? empresas.filter(e => e.nome.toLowerCase().includes(q)) : empresas.slice(0, 30);
  }, [empresas, busca]);
  const empresa = empresas.find(e => e.key === empresaKey) || null;
  const preparar = emp => {
    setEmpresaKey(emp.key);
    setMsg("");
    const its = emp.decisors.map(d => {
      const esc = escolherTemplate(d, emp.acc, templates);
      return {
        decisor: d,
        canal: esc.canal,
        estagio: esc.estagio,
        template: esc.template,
        assunto: (esc.template.assunto || "").replace(/\{\{empresa\}\}/g, emp.nome).replace(/\{\{agencia\}\}/g, curGrupo.name).replace(/\{\{setor\}\}/g, emp.setor),
        corpo: "",
        aprovado: false,
        gerando: false
      };
    });
    setItens(its);
  };
  const personalizarIA = async idx => {
    if (!empresa) return;
    setItens(p => p.map((it, i) => i === idx ? {
      ...it,
      gerando: true
    } : it));
    const it = itens[idx];
    const d = it.decisor;
    const caseIdeal = escolherCase(empresa.setor, curGrupo.id);
    const hist = (empresa.acc.activities || []).slice(-5).map(a => a.typeLabel + " " + a.date + (a.note ? ": " + a.note : "")).join("; ") || "sem histórico";
    const prompt = `Você escreve mensagens de prospecção B2B para Pedro Ica (Head of Growth, ${curGrupo.name} — Galeria Holding).
DESTINATÁRIO: ${d.nome} (${d.cargo || "cargo não informado"}) da ${empresa.nome} (setor ${empresa.setor}).
ESTÁGIO DO DEAL: ${it.estagio}. CANAL: ${it.canal}. HISTÓRICO RECENTE: ${hist}.
TEMPLATE-BASE (siga a estrutura, preencha as variáveis com conteúdo real e específico):
Assunto: ${it.template.assunto}
Corpo: ${it.template.corpo}
CASE PARA USAR: ${caseIdeal.empresa_case} — ${caseIdeal.resultado} (${caseIdeal.agencia}).
REGRAS: português brasileiro, direto, sem "espero que esteja bem", máximo 90 palavras no corpo (WhatsApp: máximo 60, sem assunto). CEO recebe ângulo de negócio/crescimento; cargo de marketing recebe ângulo de craft/case.
Responda SOMENTE com JSON: {"assunto":"...","corpo":"..."}`;
    try {
      const txt = await ghClaude(prompt, 600);
      const j = JSON.parse(txt.replace(/```json|```/g, "").trim());
      setItens(p => p.map((x, i) => i === idx ? {
        ...x,
        assunto: j.assunto || x.assunto,
        corpo: j.corpo || "",
        gerando: false
      } : x));
    } catch (e) {
      setMsg("❌ IA: " + e.message);
      setItens(p => p.map((x, i) => i === idx ? {
        ...x,
        gerando: false
      } : x));
    }
  };
  const disparar = () => {
    if (!empresa) return;
    let n = 0;
    itens.forEach(it => {
      if (!it.aprovado || !it.corpo.trim()) return;
      const d = it.decisor;
      const ass = typeof ASSINATURAS !== "undefined" && ASSINATURAS[curGrupo.id] ? "\n\n" + ASSINATURAS[curGrupo.id] : "";
      if (it.canal === "email" && d.email) {
        window.open("mailto:" + encodeURIComponent(d.email) + "?subject=" + encodeURIComponent(it.assunto) + "&body=" + encodeURIComponent(it.corpo + ass), "_blank");
      } else if (it.canal === "whatsapp") {
        const dig = ghWaDigits(d.wa || d.wa2 || "");
        if (dig) window.open("https://wa.me/" + dig + "?text=" + encodeURIComponent(it.corpo), "_blank");
      } else if (it.canal === "linkedin") {
        try {
          navigator.clipboard.writeText(it.corpo);
        } catch (e) {}
        if (d.li) window.open(d.li, "_blank");
      }
      gravarActivity(empresa.key, it.canal, d.nome, "Disparo omnichannel [" + it.template.id + "] " + it.assunto);
      n++;
    });
    setMsg(n ? "✅ " + n + " mensagem(ns) disparada(s) e registrada(s) no histórico — a temperatura já reflete." : "Nenhum item aprovado com corpo preenchido.");
  };
  const salvarTemplates = () => {
    ghSaveTemplates(templates);
    setEditTpl(false);
    setMsg("✅ Templates salvos (gh_templates_v1).");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 260,
      borderRight: ".5px solid #2D2D44",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    placeholder: "Buscar empresa com decisores...",
    value: busca,
    onChange: e => setBusca(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "0 8px 12px"
    }
  }, visiveis.map(e => {
    const t = calcularTemperatura(e.acc);
    return /*#__PURE__*/React.createElement("div", {
      key: e.key,
      onClick: () => preparar(e),
      style: {
        padding: "8px 10px",
        borderRadius: 6,
        cursor: "pointer",
        marginBottom: 4,
        background: empresaKey === e.key ? "rgba(255,107,43,.1)" : "transparent",
        border: ".5px solid " + (empresaKey === e.key ? "#FF6B2B" : "#1a1a2e")
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#F5F5F5",
        fontWeight: 500
      }
    }, t.emoji, " ", e.nome), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 8,
        fontFamily: "IBM Plex Mono,monospace",
        color: "#555"
      }
    }, e.decisors.length, " decisor(es) · ", t.status, " · ", e.setor));
  }), !visiveis.length && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      fontSize: 10,
      color: "#444",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "Nenhuma empresa com decisores neste grupo.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      borderTop: ".5px solid #1a1a2e"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    style: {
      width: "100%",
      fontSize: 10
    },
    onClick: () => setEditTpl(v => !v)
  }, editTpl ? "Fechar templates" : "✎ Editar templates"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "14px 20px 30px"
    }
  }, editTpl ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#F5F5F5",
      fontWeight: 600,
      marginBottom: 10
    }
  }, "Templates (variáveis: ", "{{empresa}} {{agencia}} {{primeiro_nome}} {{setor}}", " e placeholders livres que a IA preenche)"), templates.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    style: {
      marginBottom: 14,
      padding: 12,
      border: ".5px solid #2D2D44",
      borderRadius: 8,
      background: "#111827"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#FF6B2B",
      marginBottom: 6
    }
  }, t.id, " · estágio: ", t.estagio, " · canais: ", t.canal.join(", "), " · alvo: ", t.alvo.join(", ")), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    style: {
      marginBottom: 6
    },
    value: t.assunto,
    onChange: e => setTemplates(p => p.map((x, j) => j === i ? {
      ...x,
      assunto: e.target.value
    } : x))
  }), /*#__PURE__*/React.createElement("textarea", {
    className: "kes-input",
    rows: 4,
    value: t.corpo,
    onChange: e => setTemplates(p => p.map((x, j) => j === i ? {
      ...x,
      corpo: e.target.value
    } : x))
  }))), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: salvarTemplates
  }, "Salvar templates")) : !empresa ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "60px 0",
      textAlign: "center",
      color: "#444",
      fontSize: 12,
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "← Selecione uma empresa.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10
    }
  }, "O motor escolhe template e canal por decisor: CEO recebe negócio, marketing recebe craft/case, e o canal esquenta junto com o deal (frio = e-mail; morno/quente = WhatsApp).")) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 14,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "#F5F5F5",
      fontWeight: 600
    }
  }, "📡 ", empresa.nome), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    style: {
      fontSize: 10
    },
    onClick: () => itens.forEach((_, i) => {
      if (!itens[i].corpo) personalizarIA(i);
    })
  }, "✨ Personalizar todos com IA"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: disparar
  }, "🚀 Disparar aprovados")), itens.map((it, i) => {
    const d = it.decisor;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        marginBottom: 12,
        padding: 14,
        border: ".5px solid " + (it.aprovado ? "#1D9E75" : "#2D2D44"),
        borderRadius: 10,
        background: "#111827"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: it.aprovado,
      onChange: e => setItens(p => p.map((x, j) => j === i ? {
        ...x,
        aprovado: e.target.checked
      } : x))
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: "#F5F5F5",
        fontWeight: 600
      }
    }, d.nome)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontFamily: "IBM Plex Mono,monospace",
        color: "#9B9BB4"
      }
    }, d.cargo || "—"), /*#__PURE__*/React.createElement("span", {
      className: "pex-badge",
      style: {
        background: "rgba(255,107,43,.08)",
        color: "#FF6B2B",
        border: ".5px solid rgba(255,107,43,.3)"
      }
    }, it.template.id), /*#__PURE__*/React.createElement("select", {
      className: "kes-input",
      style: {
        width: 130,
        padding: "4px 8px",
        fontSize: 10
      },
      value: it.canal,
      onChange: e => setItens(p => p.map((x, j) => j === i ? {
        ...x,
        canal: e.target.value
      } : x))
    }, /*#__PURE__*/React.createElement("option", {
      value: "email",
      disabled: !d.email
    }, "✉ email ", d.email ? "" : "(sem)"), /*#__PURE__*/React.createElement("option", {
      value: "whatsapp",
      disabled: !ghWaDigits(d.wa || d.wa2)
    }, "💬 whatsapp ", ghWaDigits(d.wa || d.wa2) ? "" : "(sem)"), /*#__PURE__*/React.createElement("option", {
      value: "linkedin",
      disabled: !d.li
    }, "in linkedin ", d.li ? "" : "(sem)")), /*#__PURE__*/React.createElement("button", {
      className: "kes-btn-s",
      style: {
        fontSize: 10,
        padding: "4px 10px"
      },
      disabled: it.gerando,
      onClick: () => personalizarIA(i)
    }, it.gerando ? "gerando..." : "✨ IA")), it.canal !== "whatsapp" && /*#__PURE__*/React.createElement("input", {
      className: "kes-input",
      style: {
        marginBottom: 6
      },
      placeholder: "Assunto",
      value: it.assunto,
      onChange: e => setItens(p => p.map((x, j) => j === i ? {
        ...x,
        assunto: e.target.value
      } : x))
    }), /*#__PURE__*/React.createElement("textarea", {
      className: "kes-input",
      rows: 4,
      placeholder: "Corpo — use ✨ IA para preencher a partir do template",
      value: it.corpo,
      onChange: e => setItens(p => p.map((x, j) => j === i ? {
        ...x,
        corpo: e.target.value
      } : x))
    }));
  }), msg && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 11,
      color: "#F5F5F5",
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 8,
      padding: "8px 12px"
    }
  }, msg))));
}

/* ═══════════════ 📊 FILA DE ENRIQUECIMENTO ═══════════════ */
function EnriquecimentoTab({
  accs,
  setAccs,
  curGrupo
}) {
  const {
    useState,
    useMemo,
    useRef
  } = React;
  const [porLote, setPorLote] = useState(10);
  const [rodando, setRodando] = useState(false);
  const [log, setLog] = useState([]);
  const [dominios, setDominios] = useState({}); // overrides manuais {key: dominio}
  const stopRef = useRef(false);
  const fila = useMemo(() => {
    const gid = curGrupo && curGrupo.id || "galeria";
    const nomes = {};
    (typeof LEADS_ALL !== "undefined" ? LEADS_ALL : []).forEach(l => {
      nomes[String(l.rank)] = l;
    });
    try {
      (loadSt("ghub_custom_leads", []) || []).forEach(l => {
        nomes[String(l.rank)] = l;
      });
    } catch (e) {}
    const out = [];
    const NOVENTA = 90 * 86400000;
    Object.keys(accs || {}).forEach(key => {
      if (key.indexOf(gid + "_") !== 0) return;
      const acc = accs[key] || {};
      const rank = key.slice(gid.length + 1);
      const lead = nomes[rank];
      if (!lead) return;
      const pend = !acc.enriquecidaEm || Date.now() - acc.enriquecidaEm > NOVENTA;
      if (!pend) return;
      const dom = dominios[key] || acc.dominio || lead.site || (typeof getDomain === "function" ? getDomain(lead.nome || "") : null) || "";
      out.push({
        key,
        nome: lead.nome,
        setor: lead.setor || "—",
        dominio: dom,
        nDec: (acc.decisors || []).length,
        nSug: (acc.sugeridos || []).length
      });
    });
    // prioriza quem tem domínio e menos decisores
    out.sort((a, b) => (b.dominio ? 1 : 0) - (a.dominio ? 1 : 0) || a.nDec - b.nDec);
    return out;
  }, [accs, curGrupo, dominios]);
  const addLog = t => setLog(p => [...p.slice(-200), "[" + new Date().toLocaleTimeString("pt-BR") + "] " + t]);
  const rodarFila = async () => {
    setRodando(true);
    stopRef.current = false;
    setLog([]);
    const alvo = fila.filter(f => f.dominio).slice(0, porLote);
    addLog("Fila: " + alvo.length + " empresa(s) com domínio (limite " + porLote + "/execução).");
    for (const f of alvo) {
      if (stopRef.current) {
        addLog("⏹ Interrompido.");
        break;
      }
      addLog("→ " + f.nome + " (" + f.dominio + ")");
      try {
        const emails = await hunterSearch(f.dominio.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
        const relevantes = (emails || []).filter(e => ghCargoAlvo(e.position, e.seniority)).slice(0, 3);
        addLog("  Hunter: " + (emails || []).length + " e-mails, " + relevantes.length + " com cargo-alvo");
        const sug = [];
        for (const p of relevantes) {
          let tel = "";
          try {
            const lr = await lushaEnrich(p.first_name || "", p.last_name || "", f.nome);
            tel = lr && lr.phone || "";
          } catch (e) {}
          sug.push({
            nome: ((p.first_name || "") + " " + (p.last_name || "")).trim() || p.value,
            cargo: p.position || "",
            email: p.value || "",
            confianca: p.confidence || 0,
            wa: tel,
            wa2: "",
            wa3: "",
            wa4: "",
            li: p.linkedin || "",
            fonte: "auto",
            addedAt: Date.now()
          });
          await new Promise(r => setTimeout(r, 800));
        }
        setAccs(prev => {
          const acc = prev[f.key] || {
            decisors: [],
            sugeridos: [],
            activities: []
          };
          const existentes = new Set([...(acc.decisors || []), ...(acc.sugeridos || [])].map(d => (d.email || d.nome || "").toLowerCase()));
          const novos = sug.filter(s => !existentes.has((s.email || s.nome || "").toLowerCase()));
          return {
            ...prev,
            [f.key]: {
              ...acc,
              sugeridos: [...(acc.sugeridos || []), ...novos],
              enriquecidaEm: Date.now()
            }
          };
        });
        addLog("  ✓ " + sug.length + " sugerido(s) adicionados — vá em Empresas → Decisores para promover (badge de confiança: 🟢>90 🟡70-90 🔴<70)");
      } catch (e) {
        addLog("  ❌ " + e.message);
      }
      await new Promise(r => setTimeout(r, 1500)); // rate limit entre empresas
    }
    setRodando(false);
    addLog("Fila concluída.");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "14px 20px 30px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#F5F5F5",
      fontWeight: 600
    }
  }, "Fila de enriquecimento C-level — ", fila.length, " pendente(s) (sem enriquecimento ou >90 dias)"), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4"
    }
  }, "por execução:", /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "number",
    min: 1,
    max: 50,
    value: porLote,
    onChange: e => setPorLote(+e.target.value || 10),
    style: {
      width: 64,
      marginLeft: 6,
      padding: "4px 8px"
    }
  })), !rodando ? /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: rodarFila
  }, "▶ Rodar fila") : /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-danger",
    onClick: () => {
      stopRef.current = true;
    }
  }, "⏹ Parar")), /*#__PURE__*/React.createElement("table", {
    className: "pex-table",
    style: {
      minWidth: 560
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Empresa"), /*#__PURE__*/React.createElement("th", null, "Setor"), /*#__PURE__*/React.createElement("th", null, "Domínio (editável)"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Decisores"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Sugeridos"))), /*#__PURE__*/React.createElement("tbody", null, fila.slice(0, 60).map(f => /*#__PURE__*/React.createElement("tr", {
    key: f.key
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: 500
    }
  }, f.nome), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4"
    }
  }, f.setor), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    style: {
      padding: "4px 8px",
      fontSize: 10,
      width: 180
    },
    placeholder: "empresa.com.br",
    value: f.dominio,
    onChange: e => setDominios(p => ({
      ...p,
      [f.key]: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, f.nDec), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, f.nSug))))), fila.length > 60 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#555",
      fontFamily: "IBM Plex Mono,monospace",
      marginTop: 8
    }
  }, "Mostrando 60 de ", fila.length, ". A fila prioriza quem tem domínio e menos decisores.")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 340,
      borderLeft: ".5px solid #2D2D44",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 14px",
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      borderBottom: ".5px solid #1a1a2e"
    }
  }, "LOG DA FILA ", rodando && "· rodando..."), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "10px 14px",
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      lineHeight: 1.7
    }
  }, log.length ? log.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, l)) : /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#444"
    }
  }, "Rate limit: 1,5s entre empresas, 0,8s entre contatos. Sugeridos não sobrescrevem decisores existentes."))));
}

/* ═══════════════ 🚀 RADAR DE EMPRESAS DESPONTANDO ═══════════════ */
function RadarTab({
  onAddCompany,
  nextRank
}) {
  const {
    useState
  } = React;
  const [itens, setItens] = useState(() => loadSt("gh_radar_v1", []));
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState("");
  const persist = arr => {
    setItens(arr);
    saveSt("gh_radar_v1", arr);
  };
  const buscar = async () => {
    setRodando(true);
    setMsg("Pesquisando na web (30-60s)...");
    try {
      const prompt = `Pesquise na web empresas brasileiras que estão despontando AGORA:
- rodadas de investimento (Series A/B/C) anunciadas nos últimos 30 dias
- empresas que anunciaram novo CMO ou VP de Marketing recentemente
- marcas abrindo concorrência de agência ou trocando de agência
- rankings recentes de scale-ups e empresas que mais crescem no Brasil

Responda SOMENTE com JSON válido, sem markdown:
[{"nome":"","dominio":"","setor":"","motivo":"","fonte_url":"","potencial":"alto"}]
potencial deve ser "alto", "medio" ou "baixo". Máximo 12 empresas.`;
      const txt = await ghClaude(prompt, 2500, [{
        type: "web_search_20250305",
        name: "web_search"
      }]);
      const m = txt.replace(/```json|```/g, "").trim();
      const inicio = m.indexOf("["),
        fim = m.lastIndexOf("]");
      const novas = JSON.parse(m.slice(inicio, fim + 1));
      // dedupe: base existente + radar anterior
      const existentes = new Set();
      (typeof LEADS_ALL !== "undefined" ? LEADS_ALL : []).forEach(l => existentes.add((l.nome || "").toUpperCase()));
      try {
        (loadSt("ghub_custom_leads", []) || []).forEach(l => existentes.add((l.nome || "").toUpperCase()));
      } catch (e) {}
      itens.forEach(i => existentes.add((i.nome || "").toUpperCase()));
      const filtradas = novas.filter(n => n.nome && !existentes.has(n.nome.toUpperCase())).map(n => ({
        ...n,
        id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        status: "pendente",
        encontradaEm: new Date().toISOString()
      }));
      persist([...filtradas, ...itens].slice(0, 100));
      localStorage.setItem("gh_radar_last_run", new Date().toISOString());
      setMsg("✅ " + filtradas.length + " empresa(s) nova(s) no radar (" + (novas.length - filtradas.length) + " já conhecidas, ignoradas).");
    } catch (e) {
      setMsg("❌ " + e.message);
    }
    setRodando(false);
  };
  const aprovar = it => {
    if (onAddCompany) {
      onAddCompany({
        rank: typeof nextRank === "function" ? nextRank() : Math.floor(9000 + Math.random() * 999),
        nome: (it.nome || "").toUpperCase(),
        setor: it.setor || "Outros",
        site: it.dominio || "",
        cidade: "",
        cli: false,
        custom: true,
        radar: {
          motivo: it.motivo,
          fonte: it.fonte_url
        }
      });
    }
    persist(itens.map(x => x.id === it.id ? {
      ...x,
      status: "aprovada"
    } : x));
  };
  const descartar = it => persist(itens.map(x => x.id === it.id ? {
    ...x,
    status: "descartada"
  } : x));
  const pend = itens.filter(i => i.status === "pendente");
  const potCor = {
    alto: "#1D9E75",
    medio: "#EF9F27",
    baixo: "#9B9BB4"
  };
  const lastRun = localStorage.getItem("gh_radar_last_run");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "14px 20px 30px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    disabled: rodando,
    onClick: buscar
  }, rodando ? "🔍 Pesquisando..." : "🔍 Buscar empresas despontando"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555"
    }
  }, lastRun ? "última rodada: " + new Date(lastRun).toLocaleString("pt-BR") : "rode 1x por semana (toda segunda) — novo CMO quer mostrar resultado nos primeiros 90 dias")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555",
      marginBottom: 14
    }
  }, "Gatilhos: troca de CMO · captação · IPO/M&A · lançamento de produto · expansão · concorrência de agência aberta. Aprovar adiciona a empresa à base e ela entra na fila de Enriquecimento."), msg && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12,
      fontSize: 11,
      color: "#F5F5F5",
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 8,
      padding: "8px 12px"
    }
  }, msg), pend.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "40px 0",
      textAlign: "center",
      color: "#444",
      fontSize: 11,
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "Radar vazio — rode uma busca."), pend.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    style: {
      marginBottom: 10,
      padding: 14,
      border: ".5px solid #2D2D44",
      borderRadius: 10,
      background: "#111827",
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 240
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "#F5F5F5",
      fontWeight: 600
    }
  }, it.nome), /*#__PURE__*/React.createElement("span", {
    className: "pex-badge",
    style: {
      color: potCor[it.potencial] || "#9B9BB4",
      border: ".5px solid " + (potCor[it.potencial] || "#2D2D44"),
      background: "rgba(255,255,255,.03)"
    }
  }, (it.potencial || "?").toUpperCase()), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4"
    }
  }, it.setor, " · ", it.dominio || "sem domínio")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#9B9BB4",
      marginTop: 6,
      lineHeight: 1.5
    }
  }, it.motivo), it.fonte_url && /*#__PURE__*/React.createElement("a", {
    href: it.fonte_url,
    target: "_blank",
    rel: "noreferrer",
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#FF6B2B"
    }
  }, "fonte ↗")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    style: {
      padding: "6px 14px",
      fontSize: 11
    },
    onClick: () => aprovar(it)
  }, "✓ Aprovar"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    style: {
      padding: "6px 12px",
      fontSize: 11
    },
    onClick: () => descartar(it)
  }, "✕")))), itens.some(i => i.status === "aprovada") && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555"
    }
  }, "Aprovadas: ", itens.filter(i => i.status === "aprovada").map(i => i.nome).join(" · ")));
}

/* ═══════════════ 🎬 ROTEIROS DE VÍDEO + TELEPROMPTER ═══════════════ */
function VideoTab({
  accs,
  curGrupo,
  gravarActivity
}) {
  const {
    useState,
    useMemo,
    useEffect,
    useRef
  } = React;
  const [empresaKey, setEmpresaKey] = useState("");
  const [decIdx, setDecIdx] = useState(0);
  const [roteiro, setRoteiro] = useState("");
  const [ganchos, setGanchos] = useState([]);
  const [gerando, setGerando] = useState(false);
  const [tele, setTele] = useState(false);
  const [msg, setMsg] = useState("");
  const empresas = useMemo(() => ghEmpresasDoGrupo(accs, curGrupo, 1), [accs, curGrupo]);
  const empresa = empresas.find(e => e.key === empresaKey) || null;
  const decisor = empresa ? empresa.decisors[decIdx] || empresa.decisors[0] : null;
  const gerar = async () => {
    if (!empresa || !decisor) return;
    setGerando(true);
    setMsg("");
    setRoteiro("");
    setGanchos([]);
    const caseIdeal = escolherCase(empresa.setor, curGrupo.id);
    const prompt = `Você é roteirista de vídeos curtos de prospecção B2B.
Crie um roteiro de 60-90 segundos para Pedro Ica (Head of Growth, Galeria Holding${curGrupo.id === "gaia" ? " e sócio da GAIA" : ""})
gravar em selfie/câmera direta para ${decisor.nome} (${decisor.cargo || "decisor"} da ${empresa.nome}).

CASE A APRESENTAR: ${caseIdeal.empresa_case} — ${caseIdeal.resultado} (${caseIdeal.agencia})
CONTEXTO DA EMPRESA-ALVO: setor ${empresa.setor}

ESTRUTURA OBRIGATÓRIA:
1. GANCHO (0-10s): mencionar ${decisor.nome} e a ${empresa.nome} pelo nome, com um insight do setor
2. PONTE (10-25s): por que esse case é relevante para o desafio deles
3. CASE (25-60s): história e resultado, números concretos
4. CTA (60-75s): convite para 20 minutos de conversa

FORMATO: linhas "[TEMPO] FALA — (nota de gravação)". Tom: direto, confiante, sem "espero que esteja bem". Português brasileiro falado, frases curtas para câmera.
Ao final, adicione uma seção "GANCHOS ALTERNATIVOS:" com 3 variações do gancho inicial (1: dado do setor / 2: provocação / 3: referência ao momento da empresa), uma por linha começando com "G1:", "G2:", "G3:".`;
    try {
      const txt = await ghClaude(prompt, 1400);
      const partes = txt.split(/GANCHOS ALTERNATIVOS:/i);
      setRoteiro(partes[0].trim());
      const gs = (partes[1] || "").split("\n").map(s => s.trim()).filter(s => /^G\d:/.test(s));
      setGanchos(gs);
    } catch (e) {
      setMsg("❌ " + e.message);
    }
    setGerando(false);
  };
  const marcarEnviado = () => {
    if (!empresa || !decisor) return;
    gravarActivity(empresa.key, "video", decisor.nome, "Vídeo personalizado enviado (roteiro CR.IA outbound)");
    setMsg("✅ Activity 'vídeo enviado' registrada — peso alto na temperatura.");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "14px 20px 30px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 280
    },
    value: empresaKey,
    onChange: e => {
      setEmpresaKey(e.target.value);
      setDecIdx(0);
      setRoteiro("");
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Selecione a empresa..."), empresas.map(e => /*#__PURE__*/React.createElement("option", {
    key: e.key,
    value: e.key
  }, e.nome, " (", e.decisors.length, " decisor/es)"))), empresa && /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 260
    },
    value: decIdx,
    onChange: e => setDecIdx(+e.target.value)
  }, empresa.decisors.map((d, i) => /*#__PURE__*/React.createElement("option", {
    key: i,
    value: i
  }, d.nome, " — ", d.cargo || "cargo?"))), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    disabled: !decisor || gerando,
    onClick: gerar
  }, gerando ? "Gerando..." : "🎬 Gerar roteiro"), roteiro && /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: () => setTele(true)
  }, "📺 Teleprompter"), roteiro && /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: marcarEnviado
  }, "✓ Marcar como enviado")), empresa && decisor && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#555",
      marginBottom: 12
    }
  }, "case sugerido: ", escolherCase(empresa.setor, curGrupo.id).empresa_case, " (", escolherCase(empresa.setor, curGrupo.id).agencia, ") · fluxo: gravar → subir no Loom/Drive → colar o link no CRM → marcar como enviado"), msg && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12,
      fontSize: 11,
      color: "#F5F5F5",
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 8,
      padding: "8px 12px"
    }
  }, msg), roteiro && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("pre", {
    style: {
      flex: 2,
      minWidth: 320,
      whiteSpace: "pre-wrap",
      fontSize: 12,
      lineHeight: 1.8,
      color: "#F5F5F5",
      background: "#111827",
      border: ".5px solid #2D2D44",
      borderRadius: 10,
      padding: 18,
      fontFamily: "Inter,sans-serif"
    }
  }, roteiro), ganchos.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 240
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#FF6B2B",
      marginBottom: 8
    }
  }, "GANCHOS ALTERNATIVOS — escolha o que soa mais natural na sua voz:"), ganchos.map((g, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontSize: 11,
      color: "#9B9BB4",
      background: "#111827",
      border: ".5px solid #2D2D44",
      borderRadius: 8,
      padding: "10px 12px",
      marginBottom: 8,
      lineHeight: 1.5,
      cursor: "pointer"
    },
    title: "Clique para substituir o gancho no roteiro",
    onClick: () => setRoteiro(r => {
      const linhas = r.split("\n");
      const idx = linhas.findIndex(l => /GANCHO|\[0/i.test(l));
      if (idx >= 0) linhas[idx + (linhas[idx].includes("—") ? 0 : 1)] = g.replace(/^G\d:\s*/, "");
      return linhas.join("\n");
    })
  }, g)))), tele && /*#__PURE__*/React.createElement(Teleprompter, {
    texto: roteiro,
    onClose: () => setTele(false)
  }));
}
function Teleprompter({
  texto,
  onClose
}) {
  const {
    useState,
    useEffect,
    useRef
  } = React;
  const [vel, setVel] = useState(30); // px/s
  const [fonte, setFonte] = useState(34);
  const [play, setPlay] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!play) return;
    let raf,
      last = performance.now();
    const step = t => {
      const dt = (t - last) / 1000;
      last = t;
      if (boxRef.current) boxRef.current.scrollTop += vel * dt;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [play, vel]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000",
      zIndex: 3000,
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      alignItems: "center",
      padding: "10px 16px",
      background: "#0a0a0a",
      borderBottom: ".5px solid #222",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: () => setPlay(p => !p)
  }, play ? "⏸ Pausar" : "▶ Rolar"), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "velocidade ", /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 10,
    max: 90,
    value: vel,
    onChange: e => setVel(+e.target.value)
  })), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace"
    }
  }, "fonte ", /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 20,
    max: 64,
    value: fonte,
    onChange: e => setFonte(+e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: onClose
  }, "✕ Fechar")), /*#__PURE__*/React.createElement("div", {
    ref: boxRef,
    style: {
      flex: 1,
      overflow: "auto",
      padding: "40vh 8vw"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      whiteSpace: "pre-wrap",
      fontSize: fonte,
      lineHeight: 1.7,
      color: "#F5F5F5",
      fontWeight: 600,
      textAlign: "center",
      fontFamily: "Inter,sans-serif"
    }
  }, texto), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "60vh"
    }
  })));
}
