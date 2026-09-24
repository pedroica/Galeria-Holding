// block_pipeline.js — Bloco 7: Pipeline global + Admin
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  const SUPA_URL  = 'https://uetltlnjmobeiunxfsqi.supabase.co';
  const SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';

  const ESTAGIOS = ['Prospect','Reunião marcada','Reunião feita','Briefing','Proposta','Negociação','Ganho','Perdido','Pausado'];
  const ESTAGIOS_ATIVOS = ['Prospect','Reunião marcada','Reunião feita','Briefing','Proposta','Negociação'];
  const OFERTAS = ['CR.IA','BrandSync','GEO','Hiper Presence','criação','planejamento','mídia','conteúdo','outro'];

  const COR_ESTAGIO = {
    'Prospect':        '#60A5FA',
    'Reunião marcada': '#A78BFA',
    'Reunião feita':   '#818CF8',
    'Briefing':        '#FBBF24',
    'Proposta':        '#FB923C',
    'Negociação':      '#F472B6',
    'Ganho':           '#34D399',
    'Perdido':         '#EF4444',
    'Pausado':         '#6B7280',
  };

  function getJwt() { return (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON; }

  async function supa(path, opts) {
    opts = opts || {};
    try {
      const r = await fetch(SUPA_URL + '/rest/v1/' + path, Object.assign({}, opts, {
        headers: Object.assign({ apikey: SUPA_ANON, Authorization: 'Bearer ' + getJwt(), 'Content-Type': 'application/json' }, opts.headers || {})
      }));
      if (!r.ok) { console.warn('[pipeline] supa error', path, r.status); return opts._arr !== false ? [] : null; }
      if (r.status === 204 || r.headers.get('content-length') === '0') return null;
      return r.json();
    } catch (e) { return opts._arr !== false ? [] : null; }
  }

  function fmtVal(v) {
    if (!v) return '';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
  }

  function diasNoEstagio(op) {
    const d = new Date(op.atualizado_em || op.criado_em);
    return Math.floor((Date.now() - d) / 86400000);
  }

  function ptDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR');
  }

  // ── EstagioBadge ────────────────────────────────────────────────────────────
  function EstagioBadge({ estagio }) {
    return React.createElement('span', {
      style: { background: COR_ESTAGIO[estagio] || '#555', color: '#000', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: 'IBM Plex Mono,monospace', fontWeight: 700, whiteSpace: 'nowrap' }
    }, estagio);
  }

  // ── OportunidadeCard ────────────────────────────────────────────────────────
  function OportunidadeCard({ op, agencias, meuPapel, minhaAgenciaId, onClick, onDragStart, isDragging, temPedido }) {
    const ag = agencias.find(a => a.id === op.agencia_id);
    const ehMinha = op.agencia_id === minhaAgenciaId || meuPapel === 'admin';
    const dias = diasNoEstagio(op);

    return React.createElement('div', {
      draggable: meuPapel === 'admin',
      onDragStart: onDragStart,
      onClick: onClick,
      style: {
        background: isDragging ? '#1e1e38' : '#0d0d1a',
        border: '1px solid ' + (temPedido ? '#EF4444' : (isDragging ? '#FF6B2B' : '#2D2D44')),
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        marginBottom: 8,
        transition: 'border .15s',
        opacity: isDragging ? 0.6 : 1,
      }
    },
      temPedido && React.createElement('div', { style: { fontSize: 9, color: '#EF4444', marginBottom: 4, fontFamily: 'IBM Plex Mono,monospace' } }, '⚠ Pedido de atualização'),
      React.createElement('div', { style: { fontFamily: 'IBM Plex Mono,monospace', fontSize: 11, color: '#eee', fontWeight: 700, marginBottom: 4, lineHeight: '1.3' } }, op.titulo || op.empresa_nome || '—'),
      ag && React.createElement('div', { style: { fontSize: 9, color: '#818CF8', marginBottom: 4 } }, ag.nome),
      op.oferta && React.createElement('div', { style: { fontSize: 9, color: '#FBBF24', marginBottom: 4 } }, op.oferta),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        ehMinha && op.valor_estimado ? React.createElement('span', { style: { fontSize: 9, color: '#34D399' } }, fmtVal(op.valor_estimado)) : React.createElement('span', null),
        React.createElement('span', { style: { fontSize: 9, color: dias > 14 ? '#EF4444' : '#555' } }, dias + 'd')
      ),
      !op.agencia_id && React.createElement('div', { style: { marginTop: 4, fontSize: 9, color: '#FF6B2B', fontWeight: 700 } }, 'Sem dono')
    );
  }

  // ── OportunidadeDetalhe ─────────────────────────────────────────────────────
  function OportunidadeDetalhe({ op, agencias, meuPapel, minhaAgenciaId, onClose, onAtualizar, empresaNome }) {
    const [eventos, setEventos] = useState([]);
    const [toques, setToques] = useState([]);
    const [nota, setNota] = useState('');
    const [editando, setEditando] = useState(false);
    const [form, setForm] = useState({});
    const [salvando, setSalvando] = useState(false);
    const ehMinha = op.agencia_id === minhaAgenciaId || meuPapel === 'admin';

    useEffect(() => {
      supa('crm_oportunidade_eventos?oportunidade_id=eq.' + op.id + '&order=criado_em.desc&limit=50').then(r => setEventos(Array.isArray(r) ? r : []));
      if (op.empresa_id) {
        supa('crm_toques?empresa_id=eq.' + op.empresa_id + '&order=criado_em.desc&limit=20&select=id,canal,resultado,resumo,criado_em').then(r => setToques(Array.isArray(r) ? r : []));
      }
    }, [op.id]);

    async function salvarNota() {
      if (!nota.trim()) return;
      setSalvando(true);
      await supa('crm_oportunidade_eventos', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ oportunidade_id: op.id, tipo: 'nota', texto: nota.trim(), autor_email: getJwt() === SUPA_ANON ? '' : '' })
      });
      setNota('');
      supa('crm_oportunidade_eventos?oportunidade_id=eq.' + op.id + '&order=criado_em.desc&limit=50').then(r => setEventos(Array.isArray(r) ? r : []));
      setSalvando(false);
    }

    async function pedirAtualizacao() {
      await supa('crm_oportunidade_eventos', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ oportunidade_id: op.id, tipo: 'pedido_atualizacao', texto: 'Pedido de atualização enviado por leitor.' })
      });
      alert('Pedido enviado!');
    }

    async function assumirAgencia(agId) {
      setSalvando(true);
      await supa('crm_oportunidades?id=eq.' + op.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ agencia_id: agId, atualizado_em: new Date().toISOString() }) });
      await supa('crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: op.id, tipo: 'dono', de: op.agencia_id, para: agId }) });
      setSalvando(false);
      onAtualizar();
    }

    async function salvarEdicao() {
      setSalvando(true);
      const patch = Object.assign({}, form, { atualizado_em: new Date().toISOString() });
      if (form.estagio && form.estagio !== op.estagio) {
        await supa('crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: op.id, tipo: 'estagio', de: op.estagio, para: form.estagio }) });
      }
      await supa('crm_oportunidades?id=eq.' + op.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      setSalvando(false);
      setEditando(false);
      onAtualizar();
    }

    const s = { fontFamily: 'IBM Plex Mono,monospace' };

    return React.createElement('div', {
      style: { position: 'fixed', top: 0, right: 0, width: 400, height: '100vh', background: '#0d0d1a', borderLeft: '1px solid #2D2D44', zIndex: 200, display: 'flex', flexDirection: 'column', overflowY: 'auto' }
    },
      // Header
      React.createElement('div', { style: { padding: '14px 16px', borderBottom: '1px solid #1A1A2E', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        React.createElement('div', null,
          React.createElement('div', { style: Object.assign({}, s, { fontSize: 13, fontWeight: 700, color: '#eee', marginBottom: 4 }) }, op.titulo || empresaNome || '—'),
          React.createElement(EstagioBadge, { estagio: op.estagio })
        ),
        React.createElement('button', { onClick: onClose, style: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 } }, '×')
      ),

      // Body
      React.createElement('div', { style: { padding: 16, flex: 1 } },

        // Info row
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 } },
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s } }, 'EMPRESA'),
            React.createElement('div', { style: { fontSize: 11, color: '#eee', ...s } }, empresaNome || '—')
          ),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s } }, 'AGÊNCIA'),
            React.createElement('div', { style: { fontSize: 11, color: '#818CF8', ...s } }, (agencias.find(a => a.id === op.agencia_id) || {}).nome || 'Sem dono')
          ),
          ehMinha && React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s } }, 'VALOR'),
            React.createElement('div', { style: { fontSize: 11, color: '#34D399', ...s } }, fmtVal(op.valor_estimado) || '—')
          ),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s } }, 'OFERTA'),
            React.createElement('div', { style: { fontSize: 11, color: '#FBBF24', ...s } }, op.oferta || '—')
          ),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s } }, 'ORIGEM'),
            React.createElement('div', { style: { fontSize: 11, color: '#eee', ...s } }, op.origem || '—')
          ),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s } }, 'ABERTA EM'),
            React.createElement('div', { style: { fontSize: 11, color: '#eee', ...s } }, ptDate(op.aberta_em))
          )
        ),

        // Proximo passo (only for own or admin)
        ehMinha && op.proximo_passo && React.createElement('div', { style: { marginBottom: 16, padding: '8px 12px', background: '#1A1A2E', borderRadius: 6 } },
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 4 } }, 'PRÓXIMO PASSO'),
          React.createElement('div', { style: { fontSize: 11, color: '#eee', ...s } }, op.proximo_passo),
          op.proximo_passo_em && React.createElement('div', { style: { fontSize: 9, color: '#FBBF24', ...s, marginTop: 4 } }, 'Até ' + ptDate(op.proximo_passo_em))
        ),

        // Ações
        meuPapel === 'admin' && React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' } },
          React.createElement('button', {
            onClick: () => { setForm({ estagio: op.estagio, valor_estimado: op.valor_estimado, proximo_passo: op.proximo_passo, proximo_passo_em: op.proximo_passo_em, oferta: op.oferta, titulo: op.titulo, motivo_perda: op.motivo_perda }); setEditando(true); },
            style: { fontSize: 9, padding: '4px 10px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, cursor: 'pointer', ...s }
          }, 'Editar'),
          !op.agencia_id && agencias.length > 0 && React.createElement('select', {
            onChange: e => { if (e.target.value) assumirAgencia(e.target.value); },
            style: { fontSize: 9, padding: '4px 8px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#60A5FA', borderRadius: 4, cursor: 'pointer', ...s }
          },
            React.createElement('option', { value: '' }, 'Assumir para...'),
            agencias.map(a => React.createElement('option', { key: a.id, value: a.id }, a.nome))
          )
        ),

        meuPapel === 'leitor' && React.createElement('button', {
          onClick: pedirAtualizacao,
          style: { fontSize: 9, padding: '6px 14px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#FBBF24', borderRadius: 4, cursor: 'pointer', marginBottom: 16, ...s }
        }, '📩 Pedir atualização'),

        // Editar form
        editando && React.createElement('div', { style: { background: '#1A1A2E', border: '1px solid #2D2D44', borderRadius: 8, padding: 12, marginBottom: 16 } },
          ['titulo','proximo_passo','motivo_perda'].map(k =>
            React.createElement('div', { key: k, style: { marginBottom: 8 } },
              React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 2 } }, k.replace(/_/g,' ').toUpperCase()),
              React.createElement('input', {
                value: form[k] || '',
                onChange: e => setForm(prev => Object.assign({}, prev, { [k]: e.target.value })),
                style: { width: '100%', background: '#0d0d1a', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontFamily: 'IBM Plex Mono,monospace', boxSizing: 'border-box' }
              })
            )
          ),
          React.createElement('div', { style: { marginBottom: 8 } },
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 2 } }, 'ESTÁGIO'),
            React.createElement('select', {
              value: form.estagio || '',
              onChange: e => setForm(prev => Object.assign({}, prev, { estagio: e.target.value })),
              style: { width: '100%', background: '#0d0d1a', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontFamily: 'IBM Plex Mono,monospace' }
            }, ESTAGIOS.map(es => React.createElement('option', { key: es, value: es }, es)))
          ),
          React.createElement('div', { style: { marginBottom: 8 } },
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 2 } }, 'OFERTA'),
            React.createElement('select', {
              value: form.oferta || '',
              onChange: e => setForm(prev => Object.assign({}, prev, { oferta: e.target.value })),
              style: { width: '100%', background: '#0d0d1a', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontFamily: 'IBM Plex Mono,monospace' }
            }, OFERTAS.map(o => React.createElement('option', { key: o, value: o }, o)))
          ),
          React.createElement('div', { style: { marginBottom: 8 } },
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 2 } }, 'VALOR ESTIMADO'),
            React.createElement('input', {
              type: 'number',
              value: form.valor_estimado || '',
              onChange: e => setForm(prev => Object.assign({}, prev, { valor_estimado: e.target.value ? Number(e.target.value) : null })),
              style: { width: '100%', background: '#0d0d1a', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontFamily: 'IBM Plex Mono,monospace', boxSizing: 'border-box' }
            })
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { onClick: salvarEdicao, disabled: salvando, style: { fontSize: 9, padding: '4px 12px', background: '#FF6B2B', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', ...s } }, salvando ? '…' : 'Salvar'),
            React.createElement('button', { onClick: () => setEditando(false), style: { fontSize: 9, padding: '4px 12px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#555', borderRadius: 4, cursor: 'pointer', ...s } }, 'Cancelar')
          )
        ),

        // Nota
        meuPapel === 'admin' && React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('textarea', {
            value: nota, onChange: e => setNota(e.target.value), placeholder: 'Adicionar nota...',
            style: { width: '100%', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, padding: '6px 8px', fontSize: 10, fontFamily: 'IBM Plex Mono,monospace', resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }
          }),
          React.createElement('button', {
            onClick: salvarNota, disabled: salvando || !nota.trim(),
            style: { marginTop: 4, fontSize: 9, padding: '4px 12px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, cursor: 'pointer', ...s }
          }, 'Gravar nota')
        ),

        // Histórico de eventos
        eventos.length > 0 && React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 8 } }, 'HISTÓRICO'),
          eventos.map(ev => React.createElement('div', { key: ev.id, style: { padding: '6px 0', borderBottom: '1px solid #1A1A2E', display: 'flex', flexDirection: 'column', gap: 2 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
              React.createElement('span', { style: { fontSize: 9, color: ev.tipo === 'pedido_atualizacao' ? '#EF4444' : '#60A5FA', ...s } }, ev.tipo),
              React.createElement('span', { style: { fontSize: 8, color: '#555', ...s } }, ptDate(ev.criado_em))
            ),
            ev.de && React.createElement('div', { style: { fontSize: 9, color: '#555', ...s } }, ev.de + ' → ' + ev.para),
            ev.texto && React.createElement('div', { style: { fontSize: 10, color: '#aaa', ...s } }, ev.texto)
          ))
        ),

        // Toques da empresa
        toques.length > 0 && React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 8 } }, 'TOQUES DA EMPRESA'),
          toques.map(t => React.createElement('div', { key: t.id, style: { padding: '4px 0', borderBottom: '1px solid #1A1A2E', display: 'flex', gap: 8, alignItems: 'center' } },
            React.createElement('span', { style: { fontSize: 9, color: '#818CF8', ...s } }, t.canal || '—'),
            React.createElement('span', { style: { fontSize: 9, color: '#aaa', ...s } }, t.resultado || ''),
            React.createElement('span', { style: { fontSize: 8, color: '#555', ...s, marginLeft: 'auto' } }, ptDate(t.criado_em))
          ))
        )
      )
    );
  }

  // ── NovaOportunidadeModal ────────────────────────────────────────────────────
  function NovaOportunidadeModal({ agencias, onClose, onCriada, empresaPresel }) {
    const [form, setForm] = useState({ titulo: '', empresa_id: empresaPresel || '', agencia_id: '', oferta: 'outro', estagio: 'Prospect', origem: 'abordagem_direta', valor_estimado: '' });
    const [empresas, setEmpresas] = useState([]);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
      supa('crm_empresas?select=id,nome&order=nome.asc&limit=300').then(r => setEmpresas(Array.isArray(r) ? r : []));
    }, []);

    async function criar() {
      if (!form.titulo.trim()) return;
      setSalvando(true);
      const body = Object.assign({}, form, {
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
        agencia_id: form.agencia_id || null,
        empresa_id: form.empresa_id || null,
        aberta_em: new Date().toISOString(),
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      });
      if (!body.titulo) { setSalvando(false); return; }
      const rows = await supa('crm_oportunidades', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body), _arr: false
      });
      const nova = Array.isArray(rows) ? rows[0] : null;
      if (nova) {
        await supa('crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: nova.id, tipo: 'criada', para: nova.estagio }) });
      }
      setSalvando(false);
      onCriada();
    }

    const s = { fontFamily: 'IBM Plex Mono,monospace' };
    const inp = { width: '100%', background: '#0d0d1a', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, padding: '6px 8px', fontSize: 10, ...s, boxSizing: 'border-box' };

    return React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      onClick: e => { if (e.target === e.currentTarget) onClose(); }
    },
      React.createElement('div', { style: { background: '#0d0d1a', border: '1px solid #2D2D44', borderRadius: 12, padding: 24, width: 420, maxHeight: '90vh', overflowY: 'auto' } },
        React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: '#eee', ...s, marginBottom: 16 } }, 'Nova oportunidade'),

        [['Título', 'titulo', 'text', null], ['Valor estimado', 'valor_estimado', 'number', null]].map(([label, key, type]) =>
          React.createElement('div', { key: key, style: { marginBottom: 12 } },
            React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 4 } }, label.toUpperCase()),
            React.createElement('input', { type, value: form[key] || '', onChange: e => setForm(p => Object.assign({}, p, { [key]: e.target.value })), style: inp })
          )
        ),

        React.createElement('div', { style: { marginBottom: 12 } },
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 4 } }, 'EMPRESA'),
          React.createElement('select', { value: form.empresa_id, onChange: e => setForm(p => Object.assign({}, p, { empresa_id: e.target.value })), style: inp },
            React.createElement('option', { value: '' }, '— sem empresa —'),
            empresas.map(e => React.createElement('option', { key: e.id, value: e.id }, e.nome))
          )
        ),

        React.createElement('div', { style: { marginBottom: 12 } },
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 4 } }, 'AGÊNCIA'),
          React.createElement('select', { value: form.agencia_id, onChange: e => setForm(p => Object.assign({}, p, { agencia_id: e.target.value })), style: inp },
            React.createElement('option', { value: '' }, '— sem dono —'),
            agencias.map(a => React.createElement('option', { key: a.id, value: a.id }, a.nome))
          )
        ),

        React.createElement('div', { style: { marginBottom: 12 } },
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 4 } }, 'OFERTA'),
          React.createElement('select', { value: form.oferta, onChange: e => setForm(p => Object.assign({}, p, { oferta: e.target.value })), style: inp },
            OFERTAS.map(o => React.createElement('option', { key: o, value: o }, o))
          )
        ),

        React.createElement('div', { style: { marginBottom: 12 } },
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 4 } }, 'ESTÁGIO'),
          React.createElement('select', { value: form.estagio, onChange: e => setForm(p => Object.assign({}, p, { estagio: e.target.value })), style: inp },
            ESTAGIOS.map(es => React.createElement('option', { key: es, value: es }, es))
          )
        ),

        React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('div', { style: { fontSize: 9, color: '#555', ...s, marginBottom: 4 } }, 'ORIGEM'),
          React.createElement('select', { value: form.origem, onChange: e => setForm(p => Object.assign({}, p, { origem: e.target.value })), style: inp },
            ['abordagem_direta','fila','indicação','inbound','upsell'].map(o => React.createElement('option', { key: o, value: o }, o))
          )
        ),

        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement('button', { onClick: criar, disabled: salvando || !form.titulo.trim(), style: { flex: 1, padding: '8px', background: '#FF6B2B', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 10, ...s } }, salvando ? 'Criando…' : 'Criar oportunidade'),
          React.createElement('button', { onClick: onClose, style: { padding: '8px 16px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#555', borderRadius: 6, cursor: 'pointer', fontSize: 10, ...s } }, 'Cancelar')
        )
      )
    );
  }

  // ── PipelineGlobalView ───────────────────────────────────────────────────────
  function PipelineGlobalView({ meuPapel, minhaAgenciaId }) {
    const [oportunidades, setOportunidades] = useState([]);
    const [agencias, setAgencias] = useState([]);
    const [empresasMap, setEmpresasMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [detalhe, setDetalhe] = useState(null);
    const [novaModal, setNovaModal] = useState(false);
    const [dragId, setDragId] = useState(null);
    const [overCol, setOverCol] = useState(null);
    const [filtroAg, setFiltroAg] = useState('');
    const [filtroOferta, setFiltroOferta] = useState('');
    const [busca, setBusca] = useState('');
    const [verFechados, setVerFechados] = useState(false);
    const [eventos, setEventos] = useState([]);

    async function carregar() {
      setLoading(true);
      const [ops, ags] = await Promise.all([
        supa('crm_oportunidades?select=*&order=atualizado_em.desc&limit=500'),
        supa('crm_agencias?select=id,nome&limit=20')
      ]);
      const opsArr = Array.isArray(ops) ? ops : [];
      const agsArr = Array.isArray(ags) ? ags : [];
      setOportunidades(opsArr);
      setAgencias(agsArr);

      const empIds = [...new Set(opsArr.filter(o => o.empresa_id).map(o => o.empresa_id))];
      if (empIds.length > 0) {
        const emps = await supa('crm_empresas?id=in.(' + empIds.join(',') + ')&select=id,nome&limit=500');
        if (Array.isArray(emps)) {
          const m = {};
          emps.forEach(e => { m[e.id] = e.nome; });
          setEmpresasMap(m);
        }
      }

      // Pedidos de atualização pendentes
      const evs = await supa('crm_oportunidade_eventos?tipo=eq.pedido_atualizacao&order=criado_em.desc&limit=200');
      setEventos(Array.isArray(evs) ? evs : []);
      setLoading(false);
    }

    useEffect(() => { carregar(); }, []);

    const estagiosVisiveis = verFechados ? ESTAGIOS : ESTAGIOS_ATIVOS;

    const opsFiltradas = useMemo(() => oportunidades.filter(op => {
      if (filtroAg && op.agencia_id !== filtroAg) return false;
      if (filtroOferta && op.oferta !== filtroOferta) return false;
      if (busca) {
        const nome = (empresasMap[op.empresa_id] || op.titulo || '').toLowerCase();
        if (!nome.includes(busca.toLowerCase())) return false;
      }
      return true;
    }), [oportunidades, filtroAg, filtroOferta, busca, empresasMap]);

    const semDono = opsFiltradas.filter(op => !op.agencia_id && ESTAGIOS_ATIVOS.includes(op.estagio));

    function pedidoPorOp(opId) { return eventos.some(e => e.oportunidade_id === opId); }

    async function moverEstagio(opId, novoEstagio) {
      const op = oportunidades.find(o => o.id === opId);
      if (!op || op.estagio === novoEstagio) return;
      await supa('crm_oportunidades?id=eq.' + opId, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estagio: novoEstagio, atualizado_em: new Date().toISOString() }) });
      await supa('crm_oportunidade_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ oportunidade_id: opId, tipo: 'estagio', de: op.estagio, para: novoEstagio }) });
      carregar();
    }

    const s = { fontFamily: 'IBM Plex Mono,monospace' };

    return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#060606' } },

      // Header + filtros
      React.createElement('div', { style: { padding: '12px 20px', borderBottom: '1px solid #1A1A2E', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
        React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: '#eee', ...s, marginRight: 8 } }, 'PIPELINE GLOBAL'),
        React.createElement('select', { value: filtroAg, onChange: e => setFiltroAg(e.target.value), style: { fontSize: 9, padding: '3px 6px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, ...s } },
          React.createElement('option', { value: '' }, 'Todas as agências'),
          agencias.map(a => React.createElement('option', { key: a.id, value: a.id }, a.nome))
        ),
        React.createElement('select', { value: filtroOferta, onChange: e => setFiltroOferta(e.target.value), style: { fontSize: 9, padding: '3px 6px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, ...s } },
          React.createElement('option', { value: '' }, 'Todas as ofertas'),
          OFERTAS.map(o => React.createElement('option', { key: o, value: o }, o))
        ),
        React.createElement('input', { placeholder: 'Buscar empresa…', value: busca, onChange: e => setBusca(e.target.value), style: { fontSize: 9, padding: '3px 8px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, ...s, width: 160 } }),
        React.createElement('label', { style: { fontSize: 9, color: '#555', ...s, display: 'flex', alignItems: 'center', gap: 4 } },
          React.createElement('input', { type: 'checkbox', checked: verFechados, onChange: e => setVerFechados(e.target.checked) }),
          'Ver Ganho/Perdido/Pausado'
        ),
        meuPapel === 'admin' && React.createElement('button', {
          onClick: () => setNovaModal(true),
          style: { marginLeft: 'auto', fontSize: 9, padding: '5px 12px', background: '#FF6B2B', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', ...s }
        }, '+ Nova oportunidade')
      ),

      // Faixa Sem dono
      semDono.length > 0 && React.createElement('div', { style: { padding: '8px 20px', background: '#1a0a00', borderBottom: '1px solid #FF6B2B44' } },
        React.createElement('div', { style: { fontSize: 9, color: '#FF6B2B', ...s, marginBottom: 6 } }, '⚠ SEM DONO — ' + semDono.length + ' oportunidade(s) aguardando atribuição'),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          semDono.map(op => React.createElement('div', {
            key: op.id,
            onClick: () => setDetalhe(op),
            style: { background: '#1A1A2E', border: '1px solid #FF6B2B', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', ...s, fontSize: 9, color: '#eee' }
          },
            React.createElement('span', { style: { color: '#FF6B2B' } }, empresasMap[op.empresa_id] || op.titulo || '—'),
            React.createElement('span', { style: { color: '#555', marginLeft: 6 } }, op.oferta || '')
          ))
        )
      ),

      // Kanban
      loading ? React.createElement('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', ...s, fontSize: 11 } }, 'Carregando…') :
      React.createElement('div', { style: { flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', padding: '12px 20px', gap: 10 } },
        estagiosVisiveis.map(estagio => {
          const colOps = opsFiltradas.filter(op => op.estagio === estagio);
          const totalVal = colOps.reduce((s, op) => s + (op.valor_estimado || 0), 0);
          const isOver = overCol === estagio;

          return React.createElement('div', {
            key: estagio,
            onDragOver: e => { e.preventDefault(); setOverCol(estagio); },
            onDrop: () => { if (dragId && meuPapel === 'admin') { moverEstagio(dragId, estagio); } setDragId(null); setOverCol(null); },
            onDragLeave: () => setOverCol(null),
            style: {
              width: 220, minWidth: 220, display: 'flex', flexDirection: 'column',
              background: isOver ? '#1A1A2E' : '#0a0a14',
              border: '1px solid ' + (isOver ? COR_ESTAGIO[estagio] : '#1A1A2E'),
              borderRadius: 8, padding: '8px 8px 4px', transition: 'border .15s'
            }
          },
            // Column header
            React.createElement('div', { style: { marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: 9, fontWeight: 700, color: COR_ESTAGIO[estagio] || '#eee', ...s } }, estagio.toUpperCase()),
                React.createElement('div', { style: { fontSize: 8, color: '#555', ...s } }, colOps.length + ' op' + (colOps.length !== 1 ? 's' : ''))
              ),
              totalVal > 0 && React.createElement('div', { style: { fontSize: 9, color: '#34D399', ...s } }, fmtVal(totalVal))
            ),

            // Cards
            React.createElement('div', { style: { flex: 1, overflowY: 'auto', minHeight: 40 } },
              colOps.map(op => React.createElement(OportunidadeCard, {
                key: op.id,
                op, agencias,
                meuPapel, minhaAgenciaId,
                empresaNome: empresasMap[op.empresa_id],
                temPedido: pedidoPorOp(op.id),
                isDragging: dragId === op.id,
                onClick: () => setDetalhe(op),
                onDragStart: () => setDragId(op.id)
              }))
            )
          );
        })
      ),

      // Side panel
      detalhe && React.createElement(OportunidadeDetalhe, {
        op: detalhe,
        agencias,
        meuPapel, minhaAgenciaId,
        empresaNome: empresasMap[detalhe.empresa_id],
        onClose: () => setDetalhe(null),
        onAtualizar: () => { carregar(); setDetalhe(null); }
      }),

      // Modal
      novaModal && React.createElement(NovaOportunidadeModal, {
        agencias,
        onClose: () => setNovaModal(false),
        onCriada: () => { setNovaModal(false); carregar(); }
      })
    );
  }

  // ── AdminView ─────────────────────────────────────────────────────────────────
  function AdminView() {
    const [usuarios, setUsuarios] = useState([]);
    const [agencias, setAgencias] = useState([]);
    const [form, setForm] = useState({ email: '', nome: '', agencia_id: '', papel: 'leitor' });
    const [editEmail, setEditEmail] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const s = { fontFamily: 'IBM Plex Mono,monospace' };

    async function carregar() {
      const [us, ags] = await Promise.all([
        supa('crm_usuarios?order=criado_em.desc&limit=100'),
        supa('crm_agencias?select=id,nome&limit=20')
      ]);
      setUsuarios(Array.isArray(us) ? us : []);
      setAgencias(Array.isArray(ags) ? ags : []);
    }

    useEffect(() => { carregar(); }, []);

    async function salvar() {
      if (!form.email.trim()) return;
      setSalvando(true);
      const body = { email: form.email.trim(), nome: form.nome.trim(), agencia_id: form.agencia_id || null, papel: form.papel, ativo: true };
      if (editEmail) {
        await supa('crm_usuarios?email=eq.' + encodeURIComponent(editEmail), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      } else {
        await supa('crm_usuarios', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      }
      setForm({ email: '', nome: '', agencia_id: '', papel: 'leitor' });
      setEditEmail(null);
      setSalvando(false);
      carregar();
    }

    async function desativar(email) {
      if (!window.confirm('Desativar ' + email + '?')) return;
      await supa('crm_usuarios?email=eq.' + encodeURIComponent(email), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ativo: false }) });
      carregar();
    }

    function editar(u) {
      setForm({ email: u.email, nome: u.nome || '', agencia_id: u.agencia_id || '', papel: u.papel });
      setEditEmail(u.email);
    }

    const inp = { background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 4, padding: '5px 8px', fontSize: 10, ...s };

    return React.createElement('div', { style: { flex: 1, overflow: 'auto', padding: 24 } },
      React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: '#eee', ...s, marginBottom: 16 } }, 'ADMIN — Usuários'),

      // Form
      React.createElement('div', { style: { background: '#0d0d1a', border: '1px solid #2D2D44', borderRadius: 10, padding: 16, marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto auto', gap: 8, alignItems: 'end' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 8, color: '#555', ...s, marginBottom: 4 } }, 'EMAIL'),
          React.createElement('input', { value: form.email, onChange: e => setForm(p => Object.assign({}, p, { email: e.target.value })), disabled: !!editEmail, style: Object.assign({}, inp, { width: '100%', boxSizing: 'border-box', opacity: editEmail ? .5 : 1 }) })
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 8, color: '#555', ...s, marginBottom: 4 } }, 'NOME'),
          React.createElement('input', { value: form.nome, onChange: e => setForm(p => Object.assign({}, p, { nome: e.target.value })), style: Object.assign({}, inp, { width: '100%', boxSizing: 'border-box' }) })
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 8, color: '#555', ...s, marginBottom: 4 } }, 'AGÊNCIA'),
          React.createElement('select', { value: form.agencia_id, onChange: e => setForm(p => Object.assign({}, p, { agencia_id: e.target.value })), style: Object.assign({}, inp, { width: '100%' }) },
            React.createElement('option', { value: '' }, '— sem agência —'),
            agencias.map(a => React.createElement('option', { key: a.id, value: a.id }, a.nome))
          )
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 8, color: '#555', ...s, marginBottom: 4 } }, 'PAPEL'),
          React.createElement('select', { value: form.papel, onChange: e => setForm(p => Object.assign({}, p, { papel: e.target.value })), style: inp },
            React.createElement('option', { value: 'leitor' }, 'leitor'),
            React.createElement('option', { value: 'admin' }, 'admin')
          )
        ),
        React.createElement('button', { onClick: salvar, disabled: salvando || !form.email.trim(), style: { fontSize: 9, padding: '5px 12px', background: '#FF6B2B', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', ...s } }, editEmail ? 'Atualizar' : 'Adicionar'),
        editEmail && React.createElement('button', { onClick: () => { setForm({ email: '', nome: '', agencia_id: '', papel: 'leitor' }); setEditEmail(null); }, style: { fontSize: 9, padding: '5px 10px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#555', borderRadius: 4, cursor: 'pointer', ...s } }, '×')
      ),

      // Tabela
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', ...s, fontSize: 10 } },
        React.createElement('thead', null,
          React.createElement('tr', null,
            ['Email','Nome','Agência','Papel','Ativo','Último acesso','Ações'].map(h =>
              React.createElement('th', { key: h, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2D2D44', color: '#555', fontSize: 8, fontWeight: 700 } }, h)
            )
          )
        ),
        React.createElement('tbody', null,
          usuarios.map(u => {
            const ag = agencias.find(a => a.id === u.agencia_id);
            return React.createElement('tr', { key: u.email, style: { borderBottom: '1px solid #1A1A2E', opacity: u.ativo ? 1 : .4 } },
              React.createElement('td', { style: { padding: '6px 8px', color: '#eee' } }, u.email),
              React.createElement('td', { style: { padding: '6px 8px', color: '#aaa' } }, u.nome || '—'),
              React.createElement('td', { style: { padding: '6px 8px', color: '#818CF8' } }, ag ? ag.nome : '—'),
              React.createElement('td', { style: { padding: '6px 8px', color: u.papel === 'admin' ? '#FF6B2B' : '#60A5FA' } }, u.papel),
              React.createElement('td', { style: { padding: '6px 8px', color: u.ativo ? '#34D399' : '#EF4444' } }, u.ativo ? 'sim' : 'não'),
              React.createElement('td', { style: { padding: '6px 8px', color: '#555', fontSize: 8 } }, u.ultimo_acesso_em ? ptDate(u.ultimo_acesso_em) : '—'),
              React.createElement('td', { style: { padding: '6px 8px', display: 'flex', gap: 6 } },
                React.createElement('button', { onClick: () => editar(u), style: { fontSize: 8, padding: '2px 8px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#eee', borderRadius: 3, cursor: 'pointer' } }, 'Editar'),
                u.ativo && React.createElement('button', { onClick: () => desativar(u.email), style: { fontSize: 8, padding: '2px 8px', background: '#1A1A2E', border: '1px solid #2D2D44', color: '#EF4444', borderRadius: 3, cursor: 'pointer' } }, 'Desativar')
              )
            );
          })
        )
      )
    );
  }

  window.PipelineGlobalView = PipelineGlobalView;
  window.AdminView = AdminView;

})();
