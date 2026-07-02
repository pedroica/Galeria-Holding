const {
  useState,
  useMemo,
  useEffect,
  useCallback
} = React;
// ═══════════════════════════════════════════════════════════════
// UTILITÁRIOS ESTRATÉGICOS
// ═══════════════════════════════════════════════════════════════
var KES_EMPRESAS = ['Galeria', 'GAIA', 'Catalyst', 'Vitrine', 'Fluxo', 'Frame', 'Croquis', 'A.gente', '404', 'GUX'];
var KES_RESPONSAVEIS = ['Pedro Ica', 'Equipe Galeria', 'Equipe GAIA', 'Equipe Catalyst', 'Equipe Vitrine', 'Outro'];
var KES_ORIGENS = ['Indicação', 'LinkedIn', 'Evento', 'Inbound', 'Prospecção Ativa', 'Parceiro', 'Outro'];
function kesGet(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
}
function kesSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}
function kesUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function kesFmt(v) {
  if (!v) return 'R$ 0';
  if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(0) + 'k';
  return 'R$ ' + v;
}
function kesDate() {
  return new Date().toLocaleDateString('pt-BR');
}
function kesSort(arr, key, dir) {
  return [...arr].sort((a, b) => {
    const va = a[key] || 0,
      vb = b[key] || 0;
    return dir === 'asc' ? va - vb : vb - va;
  });
}

// ═══════════════════════════════════════════════════════════════
// KANBAN ESTRATÉGICO
// ═══════════════════════════════════════════════════════════════
var KES_COLS_DEFAULT = [{
  id: 'backlog',
  label: 'Backlog',
  color: '#9B9BB4'
}, {
  id: 'plan',
  label: 'Planejamento',
  color: '#60A5FA'
}, {
  id: 'producao',
  label: 'Em Produção',
  color: '#FF6B2B'
}, {
  id: 'aprovacao',
  label: 'Aprovação',
  color: '#EF9F27'
}, {
  id: 'publicado',
  label: 'Publicado',
  color: '#1D9E75'
}];
var KES_PRIOS = [{
  v: 'high',
  l: 'Alta'
}, {
  v: 'med',
  l: 'Média'
}, {
  v: 'low',
  l: 'Baixa'
}];
function loadKesState() {
  const def = {
    cols: KES_COLS_DEFAULT,
    cards: []
  };
  return kesGet('gh_kestra_v1', def);
}
function saveKesState(st) {
  kesSet('gh_kestra_v1', st);
}
function KanbanEstrategico() {
  const [st, setSt] = useState(loadKesState);
  const [drag, setDrag] = useState(null); // {cardId}
  const [overCol, setOverCol] = useState(null);
  const [cardModal, setCardModal] = useState(null); // null | {cardId, colId} | {new: true, colId}
  const [colModal, setColModal] = useState(null); // null | {colId} | {new:true}
  const [search, setSearch] = useState('');
  const [filterEmp, setFilterEmp] = useState('Todos');
  const [filterPrio, setFilterPrio] = useState('Todos');
  const save = newSt => {
    setSt(newSt);
    saveKesState(newSt);
  };
  const filtered = useMemo(() => (st.cards || []).filter(c => {
    if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !(c.empresa || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterEmp !== 'Todos' && c.empresa !== filterEmp) return false;
    if (filterPrio !== 'Todos' && c.prio !== filterPrio) return false;
    return true;
  }), [st.cards, search, filterEmp, filterPrio]);

  // Drag & Drop
  const onDragStart = cardId => setDrag({
    cardId
  });
  const onDragEnd = () => {
    setDrag(null);
    setOverCol(null);
  };
  const onDragOver = (e, colId) => {
    e.preventDefault();
    setOverCol(colId);
  };
  const onDrop = (e, colId) => {
    e.preventDefault();
    if (!drag) return;
    const newCards = (st.cards || []).map(c => c.id === drag.cardId ? {
      ...c,
      col: colId
    } : c);
    save({
      ...st,
      cards: newCards
    });
    setDrag(null);
    setOverCol(null);
  };

  // Card CRUD
  const saveCard = data => {
    let newCards;
    if (data.id) {
      newCards = (st.cards || []).map(c => c.id === data.id ? data : c);
    } else {
      newCards = [...(st.cards || []), {
        ...data,
        id: kesUid(),
        createdAt: kesDate()
      }];
    }
    save({
      ...st,
      cards: newCards
    });
    setCardModal(null);
  };
  const deleteCard = id => {
    if (!window.confirm('Excluir card?')) return;
    save({
      ...st,
      cards: (st.cards || []).filter(c => c.id !== id)
    });
    setCardModal(null);
  };
  const saveCol = data => {
    let newCols;
    if (data.id && !data._new) {
      newCols = (st.cols || []).map(c => c.id === data.id ? {
        ...c,
        ...data
      } : c);
    } else {
      const {
        _new,
        ...rest
      } = data;
      newCols = [...(st.cols || []), {
        ...rest,
        id: kesUid()
      }];
    }
    save({
      ...st,
      cols: newCols
    });
    setColModal(null);
  };
  const deleteCol = id => {
    if (!window.confirm('Excluir coluna e todos os cards nela?')) return;
    save({
      ...st,
      cols: (st.cols || []).filter(c => c.id !== id),
      cards: (st.cards || []).filter(c => c.col !== id)
    });
    setColModal(null);
  };
  const openEdit = card => setCardModal({
    ...card,
    _edit: true
  });
  const openNew = colId => setCardModal({
    _new: true,
    col: colId,
    prio: 'med'
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "kes-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "kes-title"
  }, "📌 Kanban Estratégico"), /*#__PURE__*/React.createElement("input", {
    className: "kes-search",
    placeholder: "Buscar cards...",
    value: search,
    onChange: e => setSearch(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    className: "kes-filter-row"
  }, /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 'auto',
      padding: '4px 10px',
      fontSize: 10
    },
    value: filterEmp,
    onChange: e => setFilterEmp(e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), KES_EMPRESAS.map(e => /*#__PURE__*/React.createElement("option", {
    key: e
  }, e))), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 'auto',
      padding: '4px 10px',
      fontSize: 10
    },
    value: filterPrio,
    onChange: e => setFilterPrio(e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), KES_PRIOS.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.v,
    value: p.v
  }, p.l)))), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    style: {
      padding: '6px 14px',
      fontSize: 10,
      marginLeft: 'auto'
    },
    onClick: () => setColModal({
      _new: true,
      label: '',
      color: '#9B9BB4'
    })
  }, "+ Coluna")), /*#__PURE__*/React.createElement("div", {
    className: "kes-board"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-cols"
  }, (st.cols || []).map(col => {
    const colCards = filtered.filter(c => c.col === col.id);
    const isOver = overCol === col.id;
    return /*#__PURE__*/React.createElement("div", {
      key: col.id,
      className: "kes-col",
      onDragOver: e => onDragOver(e, col.id),
      onDrop: e => onDrop(e, col.id)
    }, /*#__PURE__*/React.createElement("div", {
      className: "kes-col-head"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: col.color,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "kes-col-name",
      style: {
        color: col.color
      }
    }, col.label)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "kes-col-cnt"
    }, colCards.length), /*#__PURE__*/React.createElement("button", {
      className: "kes-card-btn",
      style: {
        opacity: .6
      },
      onClick: () => setColModal({
        ...col
      }),
      title: "Editar coluna"
    }, "✎"))), /*#__PURE__*/React.createElement("div", {
      className: "kes-col-body"
    }, colCards.map(card => /*#__PURE__*/React.createElement("div", {
      key: card.id,
      className: "kes-card" + (drag?.cardId === card.id ? ' dragging' : ''),
      draggable: true,
      onDragStart: () => onDragStart(card.id),
      onDragEnd: onDragEnd
    }, /*#__PURE__*/React.createElement("div", {
      className: "kes-card-title"
    }, card.title), card.empresa && /*#__PURE__*/React.createElement("div", {
      className: "kes-card-meta"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'rgba(255,107,43,.08)',
        color: '#FF6B2B',
        border: '.5px solid rgba(255,107,43,.2)',
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 8,
        fontFamily: 'IBM Plex Mono,monospace'
      }
    }, card.empresa)), card.desc && /*#__PURE__*/React.createElement("div", {
      className: "kes-card-desc"
    }, card.desc), /*#__PURE__*/React.createElement("div", {
      className: "kes-card-footer"
    }, card.prio && /*#__PURE__*/React.createElement("span", {
      className: "kes-card-prio " + card.prio
    }, KES_PRIOS.find(p => p.v === card.prio)?.l || ''), card.resp && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: '#555',
        fontFamily: 'IBM Plex Mono,monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 100
      }
    }, card.resp), /*#__PURE__*/React.createElement("div", {
      className: "kes-card-actions",
      style: {
        marginLeft: 'auto'
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "kes-card-btn",
      onClick: () => openEdit(card)
    }, "✎"), /*#__PURE__*/React.createElement("button", {
      className: "kes-card-btn",
      style: {
        color: '#E24B4A'
      },
      onClick: () => deleteCard(card.id)
    }, "✕"))))), /*#__PURE__*/React.createElement("div", {
      className: "kes-drop-zone" + (isOver ? ' over' : ''),
      onDragOver: e => onDragOver(e, col.id),
      onDrop: e => onDrop(e, col.id)
    }, isOver ? 'Soltar aqui' : 'Arraste aqui')), /*#__PURE__*/React.createElement("button", {
      className: "kes-col-add",
      onClick: () => openNew(col.id)
    }, "+ novo card"));
  }), /*#__PURE__*/React.createElement("button", {
    className: "kes-add-col-btn",
    onClick: () => setColModal({
      _new: true,
      label: '',
      color: '#9B9BB4'
    })
  }, "+ Nova coluna"))), cardModal && /*#__PURE__*/React.createElement(KesCardModal, {
    data: cardModal,
    cols: st.cols || [],
    onSave: saveCard,
    onDelete: cardModal._edit ? () => deleteCard(cardModal.id) : null,
    onClose: () => setCardModal(null)
  }), colModal && /*#__PURE__*/React.createElement(KesColModal, {
    data: colModal,
    onSave: saveCol,
    onDelete: colModal.id && !colModal._new ? () => deleteCol(colModal.id) : null,
    onClose: () => setColModal(null)
  }));
}
function KesCardModal({
  data,
  cols,
  onSave,
  onDelete,
  onClose
}) {
  const [title, setTitle] = useState(data.title || '');
  const [desc, setDesc] = useState(data.desc || '');
  const [col, setCol] = useState(data.col || cols[0]?.id || '');
  const [prio, setPrio] = useState(data.prio || 'med');
  const [empresa, setEmpresa] = useState(data.empresa || '');
  const [resp, setResp] = useState(data.resp || '');
  const [tags, setTags] = useState(data.tags || '');
  const handle = () => {
    if (!title.trim()) return;
    onSave({
      ...(data._edit ? {
        ...data
      } : {}),
      id: data.id,
      title: title.trim(),
      desc: desc.trim(),
      col,
      prio,
      empresa,
      resp,
      tags
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-ov",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-title"
  }, data._edit ? 'Editar Card' : 'Novo Card'), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Título *"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    autoFocus: true,
    value: title,
    onChange: e => setTitle(e.target.value),
    onKeyDown: e => e.key === 'Enter' && !e.shiftKey && handle(),
    placeholder: "Ex: Landing page produto X"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Descrição"), /*#__PURE__*/React.createElement("textarea", {
    className: "kes-input",
    value: desc,
    onChange: e => setDesc(e.target.value),
    placeholder: "Detalhes, contexto, links..."
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Coluna"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: col,
    onChange: e => setCol(e.target.value)
  }, cols.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.label)))), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Prioridade"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: prio,
    onChange: e => setPrio(e.target.value)
  }, KES_PRIOS.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.v,
    value: p.v
  }, p.l))))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Empresa"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: empresa,
    onChange: e => setEmpresa(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Todas"), KES_EMPRESAS.map(e => /*#__PURE__*/React.createElement("option", {
    key: e
  }, e)))), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Responsável"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: resp,
    onChange: e => setResp(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "—"), KES_RESPONSAVEIS.map(r => /*#__PURE__*/React.createElement("option", {
    key: r
  }, r))))), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Tags (separadas por vírgula)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    value: tags,
    onChange: e => setTags(e.target.value),
    placeholder: "design, urgente, cliente"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-acts"
  }, onDelete && /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-danger",
    onClick: onDelete
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: handle
  }, data._edit ? 'Salvar' : 'Criar'))));
}
function KesColModal({
  data,
  onSave,
  onDelete,
  onClose
}) {
  const [label, setLabel] = useState(data.label || '');
  const [color, setColor] = useState(data.color || '#9B9BB4');
  const COLORS = ['#9B9BB4', '#FF6B2B', '#60A5FA', '#A78BFA', '#34D399', '#F472B6', '#EF9F27', '#E24B4A', '#1D9E75', '#FB923C'];
  const handle = () => {
    if (!label.trim()) return;
    onSave({
      ...data,
      label: label.trim(),
      color
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-ov",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal",
    style: {
      maxWidth: 380
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-title"
  }, data._new ? 'Nova Coluna' : 'Editar Coluna'), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Nome"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    autoFocus: true,
    value: label,
    onChange: e => setLabel(e.target.value),
    onKeyDown: e => e.key === 'Enter' && handle(),
    placeholder: "Ex: Em Review"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Cor"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 4
    }
  }, COLORS.map(c => /*#__PURE__*/React.createElement("div", {
    key: c,
    onClick: () => setColor(c),
    style: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: c,
      cursor: 'pointer',
      outline: color === c ? `3px solid ${c}` : '3px solid transparent',
      outlineOffset: 2,
      transition: 'outline .12s'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-acts"
  }, onDelete && /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-danger",
    onClick: onDelete
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: handle
  }, data._new ? 'Criar' : 'Salvar'))));
}

// ═══════════════════════════════════════════════════════════════
// FUNIL COMERCIAL
// ═══════════════════════════════════════════════════════════════
var FCS_STAGES = [{
  id: 'lead',
  label: 'Lead',
  color: '#9B9BB4'
}, {
  id: 'quali',
  label: 'Qualificação',
  color: '#60A5FA'
}, {
  id: 'diag',
  label: 'Diagnóstico',
  color: '#A78BFA'
}, {
  id: 'prop',
  label: 'Proposta',
  color: '#FF6B2B'
}, {
  id: 'neg',
  label: 'Negociação',
  color: '#EF9F27'
}, {
  id: 'fecha',
  label: 'Fechamento',
  color: '#F472B6'
}, {
  id: 'ganho',
  label: 'Ganho ✓',
  color: '#1D9E75'
}, {
  id: 'perdido',
  label: 'Perdido ✗',
  color: '#E24B4A'
}];
function loadFcsState() {
  return kesGet('gh_funil_v1', {
    opps: []
  });
}
function saveFcsState(st) {
  kesSet('gh_funil_v1', st);
}
function FunilComercial() {
  const [st, setSt] = useState(loadFcsState);
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [modal, setModal] = useState(null); // null | {opp} | {_new, stage}
  const [search, setSearch] = useState('');
  const [filterEmp, setFilterEmp] = useState('Todos');
  const [filterResp, setFilterResp] = useState('Todos');
  const [sortBy, setSortBy] = useState('data'); // data | valor
  const [viewDetail, setViewDetail] = useState(null); // opp id

  const save = newSt => {
    setSt(newSt);
    saveFcsState(newSt);
  };
  const filtered = useMemo(() => {
    let arr = (st.opps || []).filter(o => {
      if (search && !o.empresa.toLowerCase().includes(search.toLowerCase()) && !o.marca.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterEmp !== 'Todos' && o.empresa !== filterEmp) return false;
      if (filterResp !== 'Todos' && o.responsavel !== filterResp) return false;
      return true;
    });
    return sortBy === 'valor' ? kesSort(arr, 'valorEstimado', 'desc') : kesSort(arr, 'dataEntrada', 'desc');
  }, [st.opps, search, filterEmp, filterResp, sortBy]);

  // KPIs
  const kpis = useMemo(() => {
    const ativas = (st.opps || []).filter(o => o.stage !== 'ganho' && o.stage !== 'perdido');
    const ganhas = (st.opps || []).filter(o => o.stage === 'ganho');
    const perdidas = (st.opps || []).filter(o => o.stage === 'perdido');
    const pipeline = ativas.reduce((s, o) => s + (+o.valorEstimado || 0), 0);
    const ponderado = ativas.reduce((s, o) => s + (+o.valorEstimado || 0) * (+o.probabilidade || 0) / 100, 0);
    const ticket = ativas.length ? Math.round(pipeline / ativas.length) : 0;
    const totalFechadas = ganhas.length + perdidas.length;
    const conv = totalFechadas ? Math.round(ganhas.length / totalFechadas * 100) : 0;
    return {
      pipeline,
      ponderado,
      qtd: ativas.length,
      ticket,
      conv,
      ganhas: ganhas.length,
      perdidas: perdidas.length
    };
  }, [st.opps]);

  // D&D
  const onDrop = (e, stageId) => {
    e.preventDefault();
    if (!dragId) return;
    const newOpps = (st.opps || []).map(o => o.id === dragId ? {
      ...o,
      stage: stageId
    } : o);
    save({
      ...st,
      opps: newOpps
    });
    setDragId(null);
    setOverStage(null);
  };
  const saveOpp = data => {
    let newOpps;
    if (data.id && !data._new) {
      newOpps = (st.opps || []).map(o => o.id === data.id ? data : o);
    } else {
      const {
        _new,
        ...rest
      } = data;
      newOpps = [...(st.opps || []), {
        ...rest,
        id: kesUid(),
        dataEntrada: kesDate()
      }];
    }
    save({
      ...st,
      opps: newOpps
    });
    setModal(null);
  };
  const deleteOpp = id => {
    if (!window.confirm('Excluir oportunidade?')) return;
    save({
      ...st,
      opps: (st.opps || []).filter(o => o.id !== id)
    });
    setModal(null);
    setViewDetail(null);
  };
  const maxPipeline = Math.max(...FCS_STAGES.map(s => filtered.filter(o => o.stage === s.id).reduce((sum, o) => sum + (+o.valorEstimado || 0), 0)), 1);
  return /*#__PURE__*/React.createElement("div", {
    className: "fcs-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcs-dash"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi accent"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-label"
  }, "Pipeline Total"), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-val"
  }, kesFmt(kpis.pipeline)), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-sub"
  }, kpis.qtd, " oportunidades")), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-label"
  }, "Valor Ponderado"), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-val",
    style: {
      color: '#A78BFA'
    }
  }, kesFmt(kpis.ponderado)), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-sub"
  }, "por probabilidade")), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-label"
  }, "Ticket Médio"), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-val",
    style: {
      color: '#60A5FA'
    }
  }, kesFmt(kpis.ticket)), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-sub"
  }, "ativos")), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-label"
  }, "Taxa Conversão"), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-val",
    style: {
      color: '#1D9E75'
    }
  }, kpis.conv, "%"), /*#__PURE__*/React.createElement("div", {
    className: "fcs-kpi-sub"
  }, kpis.ganhas, " ganhos / ", kpis.perdidas, " perdidos"))), /*#__PURE__*/React.createElement("div", {
    className: "kes-header",
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "kes-search",
    placeholder: "Buscar empresa/marca...",
    value: search,
    onChange: e => setSearch(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    className: "kes-filter-row"
  }, /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 'auto',
      padding: '4px 10px',
      fontSize: 10
    },
    value: filterEmp,
    onChange: e => setFilterEmp(e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), KES_EMPRESAS.map(e => /*#__PURE__*/React.createElement("option", {
    key: e
  }, e))), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 'auto',
      padding: '4px 10px',
      fontSize: 10
    },
    value: filterResp,
    onChange: e => setFilterResp(e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), KES_RESPONSAVEIS.map(r => /*#__PURE__*/React.createElement("option", {
    key: r
  }, r))), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 'auto',
      padding: '4px 10px',
      fontSize: 10
    },
    value: sortBy,
    onChange: e => setSortBy(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "data"
  }, "Por data"), /*#__PURE__*/React.createElement("option", {
    value: "valor"
  }, "Por valor ↓"))), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    style: {
      padding: '6px 14px',
      fontSize: 10,
      marginLeft: 'auto'
    },
    onClick: () => setModal({
      _new: true,
      stage: 'lead',
      empresa: '',
      marca: '',
      contato: '',
      valorEstimado: '',
      probabilidade: '30',
      responsavel: '',
      origem: '',
      observacoes: ''
    })
  }, "+ Oportunidade")), /*#__PURE__*/React.createElement("div", {
    className: "fcs-board"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcs-cols"
  }, FCS_STAGES.map(stage => {
    const stagOpps = filtered.filter(o => o.stage === stage.id);
    const stageTotal = stagOpps.reduce((s, o) => s + (+o.valorEstimado || 0), 0);
    const pct = Math.round(stageTotal / maxPipeline * 100);
    const isOver = overStage === stage.id;
    return /*#__PURE__*/React.createElement("div", {
      key: stage.id,
      className: "fcs-col",
      style: {
        border: isOver ? `.5px solid ${stage.color}` : '.5px solid #1e2a3a'
      },
      onDragOver: e => {
        e.preventDefault();
        setOverStage(stage.id);
      },
      onDrop: e => onDrop(e, stage.id),
      onDragLeave: () => setOverStage(null)
    }, /*#__PURE__*/React.createElement("div", {
      className: "fcs-col-head"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "fcs-col-name",
      style: {
        color: stage.color
      }
    }, stage.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontFamily: 'IBM Plex Mono,monospace',
        background: 'rgba(255,255,255,.06)',
        padding: '1px 7px',
        borderRadius: 100,
        color: '#9B9BB4'
      }
    }, stagOpps.length)), /*#__PURE__*/React.createElement("div", {
      className: "fcs-col-total"
    }, kesFmt(stageTotal)), /*#__PURE__*/React.createElement("div", {
      className: "fcs-col-bar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "fcs-col-fill",
      style: {
        width: pct + '%',
        background: stage.color
      }
    }))), /*#__PURE__*/React.createElement("div", {
      className: "fcs-col-body"
    }, stagOpps.map(opp => {
      const probC = opp.probabilidade >= 70 ? '#1D9E75' : opp.probabilidade >= 40 ? '#EF9F27' : '#9B9BB4';
      return /*#__PURE__*/React.createElement("div", {
        key: opp.id,
        className: "fcs-opp",
        draggable: true,
        onDragStart: () => setDragId(opp.id),
        onDragEnd: () => {
          setDragId(null);
          setOverStage(null);
        },
        onClick: () => setViewDetail(opp.id)
      }, /*#__PURE__*/React.createElement("div", {
        className: "fcs-opp-empresa"
      }, opp.empresa || 'Empresa'), opp.marca && /*#__PURE__*/React.createElement("div", {
        className: "fcs-opp-marca"
      }, opp.marca), /*#__PURE__*/React.createElement("div", {
        className: "fcs-opp-val",
        style: {
          color: stage.color
        }
      }, kesFmt(+opp.valorEstimado || 0)), /*#__PURE__*/React.createElement("div", {
        className: "fcs-opp-meta"
      }, /*#__PURE__*/React.createElement("span", {
        className: "fcs-opp-prob",
        style: {
          background: `rgba(${opp.probabilidade >= 70 ? '29,158,117' : opp.probabilidade >= 40 ? '239,159,39' : '155,155,180'},.1)`,
          color: probC,
          border: `.5px solid ${probC}44`
        }
      }, opp.probabilidade || 0, "%"), opp.responsavel && /*#__PURE__*/React.createElement("span", {
        className: "fcs-opp-resp"
      }, opp.responsavel.split(' ')[0]), /*#__PURE__*/React.createElement("button", {
        style: {
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          color: '#555',
          padding: '0 2px'
        },
        onClick: e => {
          e.stopPropagation();
          setModal({
            ...opp
          });
        }
      }, "✎")));
    })), /*#__PURE__*/React.createElement("button", {
      className: "fcs-col-add",
      onClick: () => setModal({
        _new: true,
        stage: stage.id,
        empresa: '',
        marca: '',
        contato: '',
        valorEstimado: '',
        probabilidade: '30',
        responsavel: '',
        origem: '',
        observacoes: ''
      })
    }, "+ oportunidade"));
  }))), modal && /*#__PURE__*/React.createElement(FcsOppModal, {
    data: modal,
    onSave: saveOpp,
    onDelete: modal.id && !modal._new ? () => deleteOpp(modal.id) : null,
    onClose: () => setModal(null)
  }), viewDetail && (() => {
    const opp = (st.opps || []).find(o => o.id === viewDetail);
    return opp ? /*#__PURE__*/React.createElement(FcsDetailModal, {
      opp: opp,
      onEdit: () => {
        setViewDetail(null);
        setModal({
          ...opp
        });
      },
      onDelete: () => deleteOpp(opp.id),
      onClose: () => setViewDetail(null),
      onStageChange: newStage => {
        const newOpps = (st.opps || []).map(o => o.id === opp.id ? {
          ...o,
          stage: newStage
        } : o);
        save({
          ...st,
          opps: newOpps
        });
        setViewDetail(null);
      }
    }) : null;
  })());
}
function FcsOppModal({
  data,
  onSave,
  onDelete,
  onClose
}) {
  const [f, setF] = useState({
    empresa: data.empresa || '',
    marca: data.marca || '',
    contato: data.contato || '',
    valorEstimado: data.valorEstimado || '',
    probabilidade: data.probabilidade || '30',
    responsavel: data.responsavel || '',
    origem: data.origem || '',
    stage: data.stage || 'lead',
    observacoes: data.observacoes || ''
  });
  const up = (k, v) => setF(p => ({
    ...p,
    [k]: v
  }));
  const handle = () => {
    if (!f.empresa.trim()) return;
    onSave({
      ...(data._new ? {} : {
        ...data
      }),
      id: data.id,
      ...f
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-ov",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-title"
  }, data._new ? 'Nova Oportunidade' : 'Editar Oportunidade'), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Empresa *"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    autoFocus: true,
    value: f.empresa,
    onChange: e => up('empresa', e.target.value),
    placeholder: "Nome do cliente"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Marca/Produto"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    value: f.marca,
    onChange: e => up('marca', e.target.value),
    placeholder: "Marca específica"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Contato"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    value: f.contato,
    onChange: e => up('contato', e.target.value),
    placeholder: "Nome do decisor"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Empresa Galeria"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: f.responsavel,
    onChange: e => up('responsavel', e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "—"), KES_EMPRESAS.map(r => /*#__PURE__*/React.createElement("option", {
    key: r
  }, r))))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Valor Estimado (R$)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "number",
    min: "0",
    value: f.valorEstimado,
    onChange: e => up('valorEstimado', e.target.value),
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Probabilidade (%)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "number",
    min: "0",
    max: "100",
    value: f.probabilidade,
    onChange: e => up('probabilidade', e.target.value)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Etapa do Funil"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: f.stage,
    onChange: e => up('stage', e.target.value)
  }, FCS_STAGES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, s.label)))), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Origem"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: f.origem,
    onChange: e => up('origem', e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "—"), KES_ORIGENS.map(o => /*#__PURE__*/React.createElement("option", {
    key: o
  }, o))))), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Observações"), /*#__PURE__*/React.createElement("textarea", {
    className: "kes-input",
    value: f.observacoes,
    onChange: e => up('observacoes', e.target.value),
    placeholder: "Contexto, próximos passos, riscos..."
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-acts"
  }, onDelete && /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-danger",
    onClick: onDelete
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: handle
  }, data._new ? 'Criar' : 'Salvar'))));
}
function FcsDetailModal({
  opp,
  onEdit,
  onDelete,
  onClose,
  onStageChange
}) {
  const stage = FCS_STAGES.find(s => s.id === opp.stage) || FCS_STAGES[0];
  return /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-ov",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal wide"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 500,
      color: '#F5F5F5',
      marginBottom: 4
    }
  }, opp.empresa), opp.marca && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#9B9BB4',
      fontFamily: 'IBM Plex Mono,monospace'
    }
  }, opp.marca)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fcs-opp-prob",
    style: {
      fontSize: 10,
      background: stage.color + '18',
      color: stage.color,
      border: `.5px solid ${stage.color}44`,
      padding: '3px 10px',
      borderRadius: 100,
      fontFamily: 'IBM Plex Mono,monospace'
    }
  }, stage.label), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      color: '#555',
      cursor: 'pointer',
      fontSize: 20,
      lineHeight: 1
    }
  }, "×"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 10,
      marginBottom: 16
    }
  }, [['Valor', kesFmt(+opp.valorEstimado || 0), '#FF6B2B'], ['Probabilidade', (opp.probabilidade || 0) + '%', '#A78BFA'], ['Valor Pond.', kesFmt((+opp.valorEstimado || 0) * (+opp.probabilidade || 0) / 100), '#1D9E75']].map(([l, v, c]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      color: '#555',
      fontFamily: 'IBM Plex Mono,monospace',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 4
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: c,
      fontFamily: 'IBM Plex Mono,monospace'
    }
  }, v)))), [['Contato', opp.contato], ['Responsável', opp.responsavel], ['Origem', opp.origem], ['Entrada', opp.dataEntrada]].filter(([, v]) => v).map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 8,
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#555',
      fontFamily: 'IBM Plex Mono,monospace',
      minWidth: 90,
      fontSize: 9,
      paddingTop: 1
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#F5F5F5'
    }
  }, v))), opp.observacoes && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: 12,
      background: '#0D0D0D',
      border: '.5px solid #2D2D44',
      borderRadius: 8,
      fontSize: 11,
      color: '#9B9BB4',
      lineHeight: 1.6
    }
  }, opp.observacoes), /*#__PURE__*/React.createElement("div", {
    className: "kes-divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: '#555',
      fontFamily: 'IBM Plex Mono,monospace',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 1
    }
  }, "Mover para etapa:"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5,
      flexWrap: 'wrap'
    }
  }, FCS_STAGES.filter(s => s.id !== opp.stage).map(s => /*#__PURE__*/React.createElement("button", {
    key: s.id,
    onClick: () => onStageChange(s.id),
    style: {
      padding: '4px 10px',
      borderRadius: 100,
      border: `.5px solid ${s.color}44`,
      background: `${s.color}10`,
      color: s.color,
      fontSize: 9,
      fontFamily: 'IBM Plex Mono,monospace',
      cursor: 'pointer',
      transition: 'all .12s'
    }
  }, s.label)))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-acts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-danger",
    onClick: onDelete
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: onClose
  }, "Fechar"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: onEdit
  }, "Editar"))));
}

// ═══════════════════════════════════════════════════════════════
// PORTFÓLIO EXECUTIVO (PMO)
// ═══════════════════════════════════════════════════════════════
var PEX_STATUS = [{
  v: 'ativo',
  l: 'Ativo'
}, {
  v: 'atencao',
  l: 'Atenção'
}, {
  v: 'risco',
  l: 'Em Risco'
}, {
  v: 'encerrado',
  l: 'Encerrado'
}];
var PEX_RISCO = [{
  v: 'baixo',
  l: 'Baixo'
}, {
  v: 'medio',
  l: 'Médio'
}, {
  v: 'alto',
  l: 'Alto'
}];
function loadPexState() {
  return kesGet('gh_portfolio_v1', {
    projetos: []
  });
}
function savePexState(st) {
  kesSet('gh_portfolio_v1', st);
}
function PortfolioExecutivo() {
  const [st, setSt] = useState(loadPexState);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [filterEmp, setFilterEmp] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [sortKey, setSortKey] = useState('cliente');
  const [sortDir, setSortDir] = useState('asc');
  const save = newSt => {
    setSt(newSt);
    savePexState(newSt);
  };
  const filtered = useMemo(() => {
    let arr = (st.projetos || []).filter(p => {
      if (search && !p.cliente.toLowerCase().includes(search.toLowerCase()) && !p.projeto.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterEmp !== 'Todos' && p.empresa !== filterEmp) return false;
      if (filterStatus !== 'Todos' && p.status !== filterStatus) return false;
      return true;
    });
    return [...arr].sort((a, b) => {
      const va = a[sortKey] || '',
        vb = b[sortKey] || '';
      const r = typeof va === 'number' ? va - vb : va.toString().localeCompare(vb.toString());
      return sortDir === 'asc' ? r : -r;
    });
  }, [st.projetos, search, filterEmp, filterStatus, sortKey, sortDir]);
  const kpis = useMemo(() => {
    const ativos = (st.projetos || []).filter(p => p.status === 'ativo');
    const prevista = (st.projetos || []).reduce((s, p) => s + (+p.receitaPrevista || 0), 0);
    const realizada = (st.projetos || []).reduce((s, p) => s + (+p.receitaRealizada || 0), 0);
    const margem = (st.projetos || []).reduce((s, p) => s + (+p.margem || 0), 0);
    const margMedia = (st.projetos || []).length ? Math.round(margem / (st.projetos || []).length) : 0;
    const risco = (st.projetos || []).filter(p => p.risco === 'alto').length;
    return {
      total: (st.projetos || []).length,
      ativos: ativos.length,
      prevista,
      realizada,
      margMedia,
      risco
    };
  }, [st.projetos]);
  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const sortIcon = key => sortKey === key ? sortDir === 'asc' ? ' ↑' : ' ↓' : '';
  const saveProjeto = data => {
    let newP;
    if (data.id && !data._new) {
      newP = (st.projetos || []).map(p => p.id === data.id ? data : p);
    } else {
      const {
        _new,
        ...rest
      } = data;
      newP = [...(st.projetos || []), {
        ...rest,
        id: kesUid(),
        dataInicio: kesDate()
      }];
    }
    save({
      ...st,
      projetos: newP
    });
    setModal(null);
  };
  const deleteProjeto = id => {
    if (!window.confirm('Excluir projeto?')) return;
    save({
      ...st,
      projetos: (st.projetos || []).filter(p => p.id !== id)
    });
    setModal(null);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "pex-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pex-dash"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-label"
  }, "Projetos Ativos"), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-val",
    style: {
      color: '#FF6B2B'
    }
  }, kpis.ativos), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-sub"
  }, "de ", kpis.total, " total")), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-label"
  }, "Receita Prevista"), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-val",
    style: {
      color: '#A78BFA'
    }
  }, kesFmt(kpis.prevista))), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-label"
  }, "Receita Realizada"), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-val",
    style: {
      color: '#1D9E75'
    }
  }, kesFmt(kpis.realizada))), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-label"
  }, "Margem Média"), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-val",
    style: {
      color: kpis.margMedia >= 30 ? '#1D9E75' : kpis.margMedia >= 15 ? '#EF9F27' : '#E24B4A'
    }
  }, kpis.margMedia, "%")), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-label"
  }, "Em Risco"), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-val",
    style: {
      color: kpis.risco > 0 ? '#E24B4A' : '#1D9E75'
    }
  }, kpis.risco), /*#__PURE__*/React.createElement("div", {
    className: "pex-kpi-sub"
  }, "projetos"))), /*#__PURE__*/React.createElement("div", {
    className: "pex-header"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: '#F5F5F5'
    }
  }, "📁 Portfólio Executivo"), /*#__PURE__*/React.createElement("input", {
    className: "kes-search",
    placeholder: "Buscar cliente/projeto...",
    value: search,
    onChange: e => setSearch(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    className: "kes-filter-row"
  }, /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 'auto',
      padding: '4px 10px',
      fontSize: 10
    },
    value: filterEmp,
    onChange: e => setFilterEmp(e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), KES_EMPRESAS.map(e => /*#__PURE__*/React.createElement("option", {
    key: e
  }, e))), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    style: {
      width: 'auto',
      padding: '4px 10px',
      fontSize: 10
    },
    value: filterStatus,
    onChange: e => setFilterStatus(e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), PEX_STATUS.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.v,
    value: s.v
  }, s.l)))), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    style: {
      padding: '6px 14px',
      fontSize: 10,
      marginLeft: 'auto'
    },
    onClick: () => setModal({
      _new: true,
      cliente: '',
      projeto: '',
      empresa: '',
      receitaPrevista: '',
      receitaRealizada: '',
      margem: '',
      status: 'ativo',
      risco: 'baixo',
      observacoes: ''
    })
  }, "+ Projeto")), /*#__PURE__*/React.createElement("div", {
    className: "pex-table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "pex-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, [['cliente', 'Cliente'], ['projeto', 'Projeto'], ['empresa', 'Empresa'], ['receitaPrevista', 'Prev.'], ['receitaRealizada', 'Real.'], ['margem', 'Margem'], ['status', 'Status'], ['risco', 'Risco']].map(([k, l]) => /*#__PURE__*/React.createElement("th", {
    key: k,
    onClick: () => toggleSort(k)
  }, l, sortIcon(k))), /*#__PURE__*/React.createElement("th", null, "Progresso"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, filtered.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 10,
    style: {
      textAlign: 'center',
      padding: 40,
      color: '#444',
      fontFamily: 'IBM Plex Mono,monospace',
      fontSize: 11
    }
  }, "Nenhum projeto. Clique em \"+ Projeto\" para começar.")), filtered.map(p => {
    const pct = p.receitaPrevista > 0 ? Math.min(100, Math.round((+p.receitaRealizada || 0) / +p.receitaPrevista * 100)) : 0;
    const riscoC = {
      baixo: '#1D9E75',
      medio: '#EF9F27',
      alto: '#E24B4A'
    }[p.risco] || '#9B9BB4';
    return /*#__PURE__*/React.createElement("tr", {
      key: p.id
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        fontWeight: 500
      }
    }, p.cliente), /*#__PURE__*/React.createElement("td", {
      style: {
        color: '#9B9BB4',
        fontSize: 10,
        fontFamily: 'IBM Plex Mono,monospace'
      }
    }, p.projeto), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontFamily: 'IBM Plex Mono,monospace',
        padding: '2px 8px',
        borderRadius: 100,
        background: 'rgba(255,107,43,.08)',
        color: '#FF6B2B',
        border: '.5px solid rgba(255,107,43,.2)'
      }
    }, p.empresa)), /*#__PURE__*/React.createElement("td", {
      style: {
        fontFamily: 'IBM Plex Mono,monospace',
        color: '#A78BFA'
      }
    }, kesFmt(+p.receitaPrevista || 0)), /*#__PURE__*/React.createElement("td", {
      style: {
        fontFamily: 'IBM Plex Mono,monospace',
        color: '#1D9E75'
      }
    }, kesFmt(+p.receitaRealizada || 0)), /*#__PURE__*/React.createElement("td", {
      style: {
        fontFamily: 'IBM Plex Mono,monospace',
        color: (+p.margem || 0) >= 30 ? '#1D9E75' : (+p.margem || 0) >= 15 ? '#EF9F27' : '#E24B4A'
      }
    }, p.margem || 0, "%"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "pex-badge " + (p.status || 'encerrado')
    }, PEX_STATUS.find(s => s.v === p.status)?.l || p.status)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontFamily: 'IBM Plex Mono,monospace',
        color: riscoC
      }
    }, PEX_RISCO.find(r => r.v === p.risco)?.l || p.risco)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "pex-progress"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pex-progress-fill",
      style: {
        width: pct + '%'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: '#555',
        fontFamily: 'IBM Plex Mono,monospace',
        minWidth: 28
      }
    }, pct, "%"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
      onClick: () => setModal({
        ...p
      }),
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#555',
        fontSize: 12,
        padding: '2px 6px',
        transition: 'color .12s'
      },
      onMouseOver: e => e.target.style.color = '#FF6B2B',
      onMouseOut: e => e.target.style.color = '#555'
    }, "✎")));
  })))), modal && /*#__PURE__*/React.createElement(PexProjetoModal, {
    data: modal,
    onSave: saveProjeto,
    onDelete: modal.id && !modal._new ? () => deleteProjeto(modal.id) : null,
    onClose: () => setModal(null)
  }));
}
function PexProjetoModal({
  data,
  onSave,
  onDelete,
  onClose
}) {
  const [f, setF] = useState({
    cliente: data.cliente || '',
    projeto: data.projeto || '',
    empresa: data.empresa || '',
    receitaPrevista: data.receitaPrevista || '',
    receitaRealizada: data.receitaRealizada || '',
    margem: data.margem || '',
    status: data.status || 'ativo',
    risco: data.risco || 'baixo',
    observacoes: data.observacoes || ''
  });
  const up = (k, v) => setF(p => ({
    ...p,
    [k]: v
  }));
  const handle = () => {
    if (!f.cliente.trim() || !f.projeto.trim()) return;
    onSave({
      ...(data._new ? {} : {
        ...data
      }),
      id: data.id,
      ...f
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-ov",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-title"
  }, data._new ? 'Novo Projeto' : 'Editar Projeto'), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Cliente *"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    autoFocus: true,
    value: f.cliente,
    onChange: e => up('cliente', e.target.value),
    placeholder: "Nome do cliente"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Projeto *"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    value: f.projeto,
    onChange: e => up('projeto', e.target.value),
    placeholder: "Nome do projeto/campanha"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Empresa Galeria"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: f.empresa,
    onChange: e => up('empresa', e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "—"), KES_EMPRESAS.map(e => /*#__PURE__*/React.createElement("option", {
    key: e
  }, e)))), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Status"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: f.status,
    onChange: e => up('status', e.target.value)
  }, PEX_STATUS.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.v,
    value: s.v
  }, s.l))))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Receita Prevista (R$)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "number",
    min: "0",
    value: f.receitaPrevista,
    onChange: e => up('receitaPrevista', e.target.value),
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Receita Realizada (R$)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "number",
    min: "0",
    value: f.receitaRealizada,
    onChange: e => up('receitaRealizada', e.target.value),
    placeholder: "0"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Margem (%)"), /*#__PURE__*/React.createElement("input", {
    className: "kes-input",
    type: "number",
    min: "0",
    max: "100",
    value: f.margem,
    onChange: e => up('margem', e.target.value),
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Risco"), /*#__PURE__*/React.createElement("select", {
    className: "kes-input",
    value: f.risco,
    onChange: e => up('risco', e.target.value)
  }, PEX_RISCO.map(r => /*#__PURE__*/React.createElement("option", {
    key: r.v,
    value: r.v
  }, r.l))))), /*#__PURE__*/React.createElement("div", {
    className: "kes-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "kes-label"
  }, "Observações"), /*#__PURE__*/React.createElement("textarea", {
    className: "kes-input",
    value: f.observacoes,
    onChange: e => up('observacoes', e.target.value),
    placeholder: "Status, próximos passos, riscos identificados..."
  })), /*#__PURE__*/React.createElement("div", {
    className: "kes-modal-acts"
  }, onDelete && /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-danger",
    onClick: onDelete
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-s",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "kes-btn-p",
    onClick: handle
  }, data._new ? 'Criar' : 'Salvar'))));
}

// ═══════════════════════════════════════════════════════════════
// HUB ESTRATÉGICO — wrapper com sub-nav interna
// ═══════════════════════════════════════════════════════════════
function StrategicHub() {
  const [view, setView] = useState('kanban');
  const VIEWS = [{
    id: 'kanban',
    label: '📌 Kanban'
  }, {
    id: 'funil',
    label: '🏆 Funil Comercial'
  }, {
    id: 'pmo',
    label: '📁 Portfólio'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '6px 20px',
      borderBottom: '.5px solid #2D2D44',
      background: '#0D0D0D',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kes-sub-nav"
  }, VIEWS.map(v => /*#__PURE__*/React.createElement("button", {
    key: v.id,
    className: "kes-sub-btn" + (view === v.id ? ' on' : ''),
    onClick: () => setView(v.id)
  }, v.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }
  }, view === 'kanban' && /*#__PURE__*/React.createElement(KanbanEstrategico, null), view === 'funil' && /*#__PURE__*/React.createElement(FunilComercial, null), view === 'pmo' && /*#__PURE__*/React.createElement(PortfolioExecutivo, null)));
}
