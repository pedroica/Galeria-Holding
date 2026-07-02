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
  } catch (e) {}
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
  setor,
  onClose,
  onKanbanAdd
}) {
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState("whatsapp");
  const [contexto, setContexto] = useState("");
  const [empresaFoco, setEmpresaFoco] = useState("CR.IA");
  const [copiado, setCopiado] = useState("");
  const [erro, setErro] = useState("");

  // Textos padrão — usados imediatamente, substituídos pela IA se gerar
  const [textos, setTextos] = useState(() => {
    const pnome = (decisor.nome || "").split(" ")[0];
    const emp = empresaFoco;
    return {
      whatsapp: `Oi ${pnome}, tudo bem? Sou Pedro Ica, Head of Growth da Galeria Holding.
Vi o trabalho da ${empresa} e acredito que temos algo relevante pra vocês — posso te contar em 2 minutos?`,
      linkedin: `Oi ${pnome}, vi sua trajetória na ${empresa} e fiz a conexão.
Sou Pedro Ica, da Galeria Holding — trabalho com os maiores anunciantes do Brasil. Teria 15 min essa semana pra trocar uma ideia?`,
      email_assunto: `${empresa} · uma troca de 15 min`,
      email_corpo: `${pnome},

Acompanho a ${empresa} há algum tempo e identifiquei algo que pode ser relevante para ${setor || "o seu setor"}.

Sou Pedro Ica, Head of Growth da Galeria Holding — grupo com 10 empresas especializadas em comunicação, performance e produção criativa.

Valeria 15 minutos para eu compartilhar um insight que geramos com anunciantes do mesmo segmento?

Abraço,`
    };
  });
  const EMPRESAS_GALERIA = ["CR.IA", "Galeria", "404", "Milà", "ccCaramelo", "BrandSync", "Vitrine", "Mantiqueira", "A.gente", "Catalyst"];

  // Recalcular textos padrão quando muda empresa foco
  const resetTextos = emp => {
    const pnome = (decisor.nome || "").split(" ")[0];
    setTextos({
      whatsapp: `Oi ${pnome}, tudo bem? Sou Pedro Ica, Head of Growth da Galeria Holding.
Vi o trabalho da ${empresa} e acredito que temos algo relevante pra vocês — posso te contar em 2 minutos?`,
      linkedin: `Oi ${pnome}, vi sua trajetória na ${empresa} e fiz a conexão.
Sou Pedro Ica, da Galeria Holding — trabalho com os maiores anunciantes do Brasil. Teria 15 min essa semana pra trocar uma ideia?`,
      email_assunto: `${empresa} · uma troca de 15 min`,
      email_corpo: `${pnome},

Acompanho a ${empresa} há algum tempo e identifiquei algo que pode ser relevante para ${setor || "o seu setor"}.

Sou Pedro Ica, Head of Growth da Galeria Holding — grupo com 10 empresas especializadas em comunicação, performance e produção criativa com ${emp}.

Valeria 15 minutos para eu compartilhar um insight que geramos com anunciantes do mesmo segmento?

Abraço,`
    });
  };
  const gerarComIA = async () => {
    if (!getClaudeKey()) {
      setErro("⚠ Claude API Key não configurada. Vá em ⚙ Configurações e insira sua chave sk-ant-...");
      return;
    }
    setLoading(true);
    setErro("");
    const prompt = `Você é especialista em vendas B2B consultivas para comunicação brasileira.
REMETENTE: Pedro Ica, Head of Growth, Galeria Holding — 10 empresas: Galeria, 404, Milà, ccCaramelo, CR.IA (produção criativa com IA -70% custo), BrandSync, Vitrine (OOH/DOOH), Mantiqueira, A.gente, Catalyst.
EMPRESA GALERIA FOCO: ${empresaFoco}
DECISOR: ${decisor.nome || ""}, ${decisor.cargo || ""}, ${empresa}, setor ${setor || ""}
CONTEXTO: ${contexto || "nenhum"}
REGRAS: 1) Abra com fato real sobre a empresa/pessoa. 2) Entregue insight, não proposta. 3) Peça "15 minutos". 4) Tom par a par. 5) PROIBIDO: "espero que esteja bem","gostaria de apresentar","temos uma solução".
LIMITES: Email corpo 5 linhas. LinkedIn DM 3 linhas. WhatsApp 2 linhas + pergunta.
Retorne SOMENTE JSON sem markdown: {"email_assunto":"","email_corpo":"","linkedin_dm":"","whatsapp":""}`;
    const txt = await claudeAsk(prompt, 900);
    const obj = parseJSON(txt);
    if (obj && (obj.email_assunto || obj.whatsapp)) {
      setTextos({
        whatsapp: obj.whatsapp || textos.whatsapp,
        linkedin: obj.linkedin_dm || textos.linkedin,
        email_assunto: obj.email_assunto || textos.email_assunto,
        email_corpo: obj.email_corpo || textos.email_corpo
      });
      setErro("");
      const key = normalizarNome(decisor.nome || "") + "_" + normalizarNome(empresa || "");
      const saved = lsGet("gh_abordagens_v1", {});
      saved[key] = {
        ...obj,
        decisor: decisor.nome,
        empresa,
        geradoEm: new Date().toLocaleDateString("pt-BR")
      };
      lsSet("gh_abordagens_v1", saved);
    } else {
      setErro("IA não retornou texto. Os textos padrão continuam disponíveis.");
    }
    setLoading(false);
  };
  const copiar = txt => {
    navigator.clipboard.writeText(txt).catch(() => {});
    setCopiado(aba);
    setTimeout(() => setCopiado(""), 2500);
  };
  const registrarKanban = canal => {
    if (onKanbanAdd) onKanbanAdd(decisor.nome, decisor.cargo, empresa, canal);
  };
  const waNro = decisor.wa ? (() => {
    const n = (decisor.wa || "").replace(/[^0-9]/g, "");
    return n.startsWith("55") && n.length >= 12 ? n : "55" + n;
  })() : "";
  const waTextoEnc = encodeURIComponent(textos.whatsapp + "\n\n" + ASSINATURA_TEXTO);
  const liUrl = decisor.linkedin ? decisor.linkedin.startsWith("http") ? decisor.linkedin : "https://" + decisor.linkedin : "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(decisor.nome || "");
  const emailCorpoFull = textos.email_corpo + ASSINATURA_TEXTO;
  const ABAS = [{
    id: "whatsapp",
    icon: "💬",
    label: "WhatsApp"
  }, {
    id: "linkedin",
    icon: "💼",
    label: "LinkedIn"
  }, {
    id: "email",
    icon: "✉️",
    label: "Email"
  }];
  const inpStyle = {
    width: "100%",
    background: "#0D0D0D",
    border: ".5px solid #2D2D44",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#F5F5F5",
    fontSize: 12,
    fontFamily: "IBM Plex Mono,monospace",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
    lineHeight: 1.6
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modov",
    style: {
      zIndex: 1100
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mod mod-wide",
    style: {
      maxWidth: 660,
      maxHeight: "92vh",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: "#F5F5F5"
    }
  }, "📨 Abordagem"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontFamily: "IBM Plex Mono,monospace",
      color: "#9B9BB4",
      marginTop: 2
    }
  }, decisor.nome || "Decisor", " · ", empresa)), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#555",
      cursor: "pointer",
      fontSize: 22,
      lineHeight: 1
    }
  }, "×")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 14,
      flexShrink: 0
    }
  }, ABAS.map(a => /*#__PURE__*/React.createElement("button", {
    key: a.id,
    onClick: () => setAba(a.id),
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 8,
      border: ".5px solid",
      cursor: "pointer",
      fontWeight: 600,
      fontSize: 12,
      transition: "all .15s",
      borderColor: aba === a.id ? "#FF6B2B" : "#2D2D44",
      background: aba === a.id ? "rgba(255,107,43,.1)" : "transparent",
      color: aba === a.id ? "#FF6B2B" : "#9B9BB4"
    }
  }, a.icon, " ", a.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      marginBottom: 12
    }
  }, aba === "whatsapp" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 6,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Mensagem WhatsApp"), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: textos.whatsapp,
    onChange: e => setTextos({
      ...textos,
      whatsapp: e.target.value
    }),
    style: inpStyle
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#555",
      fontFamily: "IBM Plex Mono,monospace",
      marginTop: 4,
      marginBottom: 14
    }
  }, "Assinatura será adicionada automaticamente ao enviar."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, waNro ? /*#__PURE__*/React.createElement("a", {
    href: "https://wa.me/" + waNro + "?text=" + waTextoEnc,
    target: "_blank",
    onClick: () => registrarKanban("whatsapp"),
    style: {
      flex: 2,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "11px 0",
      borderRadius: 8,
      border: "none",
      background: "#25D366",
      color: "#fff",
      fontSize: 13,
      fontWeight: 700,
      textDecoration: "none",
      cursor: "pointer"
    }
  }, "💬 Abrir WhatsApp com texto pronto") : /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 2,
      padding: "11px 12px",
      borderRadius: 8,
      border: ".5px solid #2D2D44",
      fontSize: 11,
      color: "#555",
      fontFamily: "IBM Plex Mono,monospace",
      textAlign: "center"
    }
  }, "Número de WhatsApp não cadastrado para este decisor"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      copiar(textos.whatsapp + "\n\n" + ASSINATURA_TEXTO);
      registrarKanban("whatsapp");
    },
    style: {
      flex: 1,
      padding: "11px 0",
      borderRadius: 8,
      border: ".5px solid #2D2D44",
      background: "transparent",
      color: "#9B9BB4",
      fontSize: 12,
      cursor: "pointer"
    }
  }, copiado === "whatsapp" ? "✓ Copiado!" : "📋 Copiar"))), aba === "linkedin" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 6,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Mensagem LinkedIn DM"), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: textos.linkedin,
    onChange: e => setTextos({
      ...textos,
      linkedin: e.target.value
    }),
    style: inpStyle
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#555",
      fontFamily: "IBM Plex Mono,monospace",
      marginTop: 4,
      marginBottom: 14
    }
  }, "Copie o texto e cole no LinkedIn após abrir o perfil."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: liUrl,
    target: "_blank",
    onClick: () => {
      copiar(textos.linkedin);
      registrarKanban("linkedin");
    },
    style: {
      flex: 2,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "11px 0",
      borderRadius: 8,
      border: "none",
      background: "#0A66C2",
      color: "#fff",
      fontSize: 13,
      fontWeight: 700,
      textDecoration: "none",
      cursor: "pointer"
    }
  }, "💼 Abrir perfil + copiar texto"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      copiar(textos.linkedin);
      registrarKanban("linkedin");
    },
    style: {
      flex: 1,
      padding: "11px 0",
      borderRadius: 8,
      border: ".5px solid #2D2D44",
      background: "transparent",
      color: "#9B9BB4",
      fontSize: 12,
      cursor: "pointer"
    }
  }, copiado === "linkedin" ? "✓ Copiado!" : "📋 Copiar"))), aba === "email" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Assunto"), /*#__PURE__*/React.createElement("input", {
    value: textos.email_assunto,
    onChange: e => setTextos({
      ...textos,
      email_assunto: e.target.value
    }),
    style: {
      ...inpStyle,
      resize: "none",
      marginBottom: 10,
      padding: "8px 12px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#9B9BB4",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: .5
    }
  }, "Corpo"), /*#__PURE__*/React.createElement("textarea", {
    rows: 7,
    value: textos.email_corpo,
    onChange: e => setTextos({
      ...textos,
      email_corpo: e.target.value
    }),
    style: {
      ...inpStyle,
      marginBottom: 4
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#555",
      fontFamily: "IBM Plex Mono,monospace",
      marginBottom: 14
    }
  }, "Assinatura Galeria Holding será adicionada automaticamente."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "https://mail.google.com/mail/?view=cm&su=" + encodeURIComponent(textos.email_assunto) + "&body=" + encodeURIComponent(emailCorpoFull),
    target: "_blank",
    onClick: () => registrarKanban("email"),
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "11px 0",
      borderRadius: 8,
      border: "none",
      background: "#EA4335",
      color: "#fff",
      fontSize: 12,
      fontWeight: 700,
      textDecoration: "none",
      cursor: "pointer"
    }
  }, "✉️ Abrir no Gmail"), /*#__PURE__*/React.createElement("a", {
    href: "https://outlook.office.com/mail/deeplink/compose?subject=" + encodeURIComponent(textos.email_assunto) + "&body=" + encodeURIComponent(emailCorpoFull),
    target: "_blank",
    onClick: () => registrarKanban("email"),
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "11px 0",
      borderRadius: 8,
      border: "none",
      background: "#0078D4",
      color: "#fff",
      fontSize: 12,
      fontWeight: 700,
      textDecoration: "none",
      cursor: "pointer"
    }
  }, "✉️ Abrir no Outlook"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      copiar(emailCorpoFull);
      registrarKanban("email");
    },
    style: {
      flex: 1,
      padding: "11px 0",
      borderRadius: 8,
      border: ".5px solid #2D2D44",
      background: "transparent",
      color: "#9B9BB4",
      fontSize: 12,
      cursor: "pointer"
    }
  }, copiado === "email" ? "✓ Copiado!" : "📋 Copiar")))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: ".5px solid #2D2D44",
      paddingTop: 12,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      marginBottom: erro ? 8 : 0,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#555",
      fontFamily: "IBM Plex Mono,monospace",
      whiteSpace: "nowrap"
    }
  }, "EMPRESA FOCO"), /*#__PURE__*/React.createElement("select", {
    value: empresaFoco,
    onChange: e => {
      setEmpresaFoco(e.target.value);
      resetTextos(e.target.value);
    },
    style: {
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 6,
      padding: "5px 10px",
      color: "#9B9BB4",
      fontSize: 11,
      outline: "none",
      cursor: "pointer"
    }
  }, EMPRESAS_GALERIA.map(eg => /*#__PURE__*/React.createElement("option", {
    key: eg
  }, eg))), /*#__PURE__*/React.createElement("input", {
    value: contexto,
    onChange: e => setContexto(e.target.value),
    placeholder: "contexto extra (opcional)",
    style: {
      flex: 1,
      background: "#0D0D0D",
      border: ".5px solid #2D2D44",
      borderRadius: 6,
      padding: "5px 10px",
      color: "#F5F5F5",
      fontSize: 11,
      outline: "none",
      minWidth: 100
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: gerarComIA,
    disabled: loading,
    style: {
      padding: "6px 14px",
      borderRadius: 6,
      border: ".5px solid rgba(255,107,43,.4)",
      background: "rgba(255,107,43,.08)",
      color: loading ? "#555" : "#FF6B2B",
      fontSize: 11,
      cursor: loading ? "not-allowed" : "pointer",
      fontWeight: 600,
      whiteSpace: "nowrap"
    }
  }, loading ? "Gerando..." : "⚡ Melhorar com IA")), erro && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      background: "rgba(226,75,74,.08)",
      border: ".5px solid rgba(226,75,74,.3)",
      borderRadius: 6,
      fontSize: 11,
      color: "#E24B4A"
    }
  }, erro))));
}
