// block_copiloto.js — Copiloto de Prospecção IA (sem JSX, React 18 UMD)
// Carregado via (0,eval)() pelo index.html

(function() {
'use strict';

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const APP_URL = 'https://galeria-holding-sage.vercel.app';
const API_URL = '/api/copiloto';

function getJwt() {
  try {
    const k = 'sb-uetltlnjmobeiunxfsqi-auth-token';
    const v = localStorage.getItem(k);
    if (!v) return '';
    const s = JSON.parse(v);
    return s.access_token || s?.session?.access_token || '';
  } catch { return ''; }
}

// ── Markdown-ish renderer (minimal, no deps) ────────────────────────────────
function renderMd(text) {
  if (!text) return '';
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Code blocks
  text = text.replace(/```(?:\w+)?\n?([\s\S]+?)```/g, '<pre style="background:#0d1117;border:1px solid #2D2D44;border-radius:6px;padding:10px;overflow-x:auto;font-size:11px;margin:6px 0"><code>$1</code></pre>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code style="background:#1A1A2E;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
  // Lines
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('## ')) { out.push('<h3 style="margin:10px 0 4px;font-size:13px;color:#FF6B2B">' + l.slice(3) + '</h3>'); }
    else if (l.startsWith('# ')) { out.push('<h2 style="margin:10px 0 4px;font-size:14px;color:#FF6B2B">' + l.slice(2) + '</h2>'); }
    else if (l.startsWith('- ')) { out.push('<div style="padding-left:12px;margin:1px 0">• ' + l.slice(2) + '</div>'); }
    else if (l.match(/^\d+\. /)) { out.push('<div style="padding-left:12px;margin:1px 0">' + l + '</div>'); }
    else if (l.trim() === '') { out.push('<div style="height:8px"></div>'); }
    else { out.push('<div>' + l + '</div>'); }
  }
  return out.join('');
}

// ── Tool indicator ───────────────────────────────────────────────────────────
const TOOL_LABELS = {
  buscar_empresa: '🔍 Buscando empresa',
  listar_decisores: '👥 Listando decisores',
  historico_toques: '📋 Histórico de toques',
  itens_fila: '📥 Fila de prospecção',
  contadores_semana: '📊 Contadores da semana',
  listar_templates: '📄 Templates',
  noticias_empresa: '📰 Notícias',
  web_search: '🌐 Buscando na web',
  gerar_fila: '⚡ Gerando fila',
  registrar_resultado: '✍️ Registrando resultado',
  abordar: '📨 Abrindo painel Abordar'
};

function ToolBadge({ name, done }) {
  return React.createElement('div', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 5, background: done ? '#0d2610' : '#0d0d2a', border: '1px solid ' + (done ? '#34D399' : '#2D2D44'), borderRadius: 100, padding: '3px 10px', fontSize: 10, color: done ? '#34D399' : '#818CF8', fontFamily: 'IBM Plex Mono,monospace', margin: '2px 0', transition: 'all .3s' }
  }, done ? '✓ ' : '◌ ', TOOL_LABELS[name] || name);
}

// ── Confirm card ─────────────────────────────────────────────────────────────
const ACTION_LABELS = { gerar_fila: 'Gerar fila de prospecção', registrar_resultado: 'Registrar resultado', abordar: 'Abrir painel Abordar' };

function ConfirmCard({ confirm, onConfirm, onReject }) {
  const { action, params } = confirm;
  const lines = Object.entries(params).map(([k, v]) => k + ': ' + JSON.stringify(v));
  return React.createElement('div', {
    style: { border: '1px solid #FBBF24', borderRadius: 8, padding: '12px 14px', margin: '8px 0', background: '#0d0c00' }
  },
    React.createElement('div', { style: { fontSize: 11, color: '#FBBF24', fontFamily: 'IBM Plex Mono,monospace', marginBottom: 6 } }, '⚡ ' + (ACTION_LABELS[action] || action)),
    React.createElement('pre', { style: { fontSize: 10, color: '#9B9BB4', margin: '0 0 10px', background: '#0d1117', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 120 } }, lines.join('\n')),
    React.createElement('div', { style: { display: 'flex', gap: 8 } },
      React.createElement('button', {
        onClick: () => onConfirm(confirm),
        style: { background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'IBM Plex Mono,monospace' }
      }, 'Confirmar'),
      React.createElement('button', {
        onClick: () => onReject(confirm.id),
        style: { background: 'transparent', color: '#9B9BB4', border: '1px solid #2D2D44', borderRadius: 6, padding: '5px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'IBM Plex Mono,monospace' }
      }, 'Cancelar')
    )
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, toolStates, confirms, onConfirm, onReject }) {
  const isUser = msg.role === 'user';
  const html = useMemo(() => renderMd(msg.content || ''), [msg.content]);

  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }
  },
    // Tool badges
    (msg.tools || []).map((t, i) =>
      React.createElement('div', { key: i, style: { marginBottom: 4 } },
        React.createElement(ToolBadge, { name: t.name, done: t.done })
      )
    ),
    // Message content
    React.createElement('div', {
      style: {
        maxWidth: '85%', padding: '10px 13px', borderRadius: 10, fontSize: 12, lineHeight: 1.6, fontFamily: 'IBM Plex Mono,monospace',
        background: isUser ? '#1A1A2E' : '#080812',
        border: '1px solid ' + (isUser ? '#2D2D44' : '#1A1A2E'),
        color: '#E0E0E0',
        whiteSpace: isUser ? 'pre-wrap' : 'normal'
      },
      dangerouslySetInnerHTML: { __html: isUser ? (msg.content || '').replace(/</g,'&lt;') : html }
    }),
    // Confirm cards
    (msg.confirms || []).filter(c => !c.dismissed).map((c, i) =>
      React.createElement(ConfirmCard, { key: c.id, confirm: c, onConfirm, onReject })
    )
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ conversas, activeId, onSelect, onNova, mobile, onClose }) {
  return React.createElement('div', {
    style: { width: mobile ? '100%' : 220, minWidth: mobile ? '100%' : 220, height: '100%', display: 'flex', flexDirection: 'column', borderRight: mobile ? 'none' : '.5px solid #1A1A2E', background: '#060606', overflow: 'hidden' }
  },
    React.createElement('div', { style: { padding: '12px 12px 8px', borderBottom: '.5px solid #1A1A2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement('span', { style: { fontSize: 10, fontFamily: 'IBM Plex Mono,monospace', color: '#9B9BB4', letterSpacing: '.5px' } }, 'CONVERSAS'),
      React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
        React.createElement('button', { onClick: onNova, style: { background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'IBM Plex Mono,monospace' } }, '+ Nova'),
        mobile && React.createElement('button', { onClick: onClose, style: { background: 'transparent', color: '#9B9BB4', border: 'none', cursor: 'pointer', fontSize: 14 } }, '✕')
      )
    ),
    React.createElement('div', { style: { flex: 1, overflowY: 'auto' } },
      conversas.length === 0 && React.createElement('div', { style: { padding: 16, fontSize: 11, color: '#555', fontFamily: 'IBM Plex Mono,monospace' } }, 'Sem conversas'),
      conversas.map(c =>
        React.createElement('div', {
          key: c.id,
          onClick: () => { onSelect(c.id); if (mobile) onClose(); },
          style: {
            padding: '10px 12px', cursor: 'pointer', borderBottom: '.5px solid #0d0d1a',
            background: c.id === activeId ? '#0d0d2a' : 'transparent',
            borderLeft: c.id === activeId ? '2px solid #FF6B2B' : '2px solid transparent',
            transition: 'all .15s'
          }
        },
          React.createElement('div', { style: { fontSize: 11, fontFamily: 'IBM Plex Mono,monospace', color: '#E0E0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 } }, c.titulo || 'Sem título'),
          React.createElement('div', { style: { fontSize: 9, color: '#555', fontFamily: 'IBM Plex Mono,monospace' } }, new Date(c.atualizado_em).toLocaleDateString('pt-BR'))
        )
      )
    )
  );
}

// ── Main CopiloView ──────────────────────────────────────────────────────────
function CopiloView() {
  const [conversas, setConversas]         = useState([]);
  const [activeId, setActiveId]           = useState(null);
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState('');
  const [streaming, setStreaming]         = useState(false);
  const [showSidebar, setShowSidebar]     = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const abortRef   = useRef(null);

  const isMobile = window.innerWidth < 768;

  // Load conversations list
  const loadConversas = useCallback(async () => {
    const jwt = getJwt();
    if (!jwt) return;
    try {
      const r = await fetch('https://uetltlnjmobeiunxfsqi.supabase.co/rest/v1/crm_copiloto_conversas?select=id,titulo,atualizado_em&order=atualizado_em.desc&limit=50', {
        headers: { apikey: 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r', Authorization: 'Bearer ' + jwt }
      });
      if (r.ok) setConversas(await r.json());
    } catch {}
  }, []);

  useEffect(() => { loadConversas(); }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const jwt = getJwt();
      const r = await fetch('https://uetltlnjmobeiunxfsqi.supabase.co/rest/v1/crm_copiloto_conversas?id=eq.' + activeId + '&select=mensagens&limit=1', {
        headers: { apikey: 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r', Authorization: 'Bearer ' + jwt }
      });
      if (r.ok) {
        const rows = await r.json();
        setMessages(rows?.[0]?.mensagens || []);
      }
    })();
  }, [activeId]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function newConversation() { setActiveId(null); setMessages([]); setInput(''); setTimeout(() => inputRef.current?.focus(), 100); }

  async function handleConfirm(confirm) {
    // Mark confirm as dismissed in messages
    setMessages(prev => prev.map(m => ({
      ...m,
      confirms: (m.confirms || []).map(c => c.id === confirm.id ? { ...c, dismissed: true } : c)
    })));

    if (confirm.action === 'abordar') {
      // Navigate to base + open abordar — dispatch custom event for block3.js to handle
      window.dispatchEvent(new CustomEvent('copiloto:abordar', { detail: confirm.params }));
      return;
    }

    await sendMessage(null, { confirmarAcao: { action: confirm.action, params: confirm.params } });
  }

  function handleReject(confirmId) {
    setMessages(prev => prev.map(m => ({
      ...m,
      confirms: (m.confirms || []).map(c => c.id === confirmId ? { ...c, dismissed: true } : c)
    })));
  }

  async function sendMessage(text, extra) {
    const jwt = getJwt();
    if (!jwt) return;
    const msg = (text || input || '').trim();
    if (!msg && !extra) return;

    if (!extra) {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', content: msg, ts: new Date().toISOString() }]);
    }

    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Create streaming message placeholder
    const streamId = 'stream_' + Date.now();
    setMessages(prev => [...prev, { role: 'assistant', content: '', tools: [], confirms: [], _id: streamId, _streaming: true }]);

    try {
      const body = extra
        ? { jwt, conversaId: activeId, ...extra }
        : { jwt, conversaId: activeId, mensagem: msg };

      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          let ev;
          try { ev = JSON.parse(part.slice(6)); } catch { continue; }

          if (ev.t === 'text') {
            setMessages(prev => prev.map(m => m._id === streamId ? { ...m, content: m.content + ev.d } : m));
          } else if (ev.t === 'tool_start') {
            setMessages(prev => prev.map(m => m._id === streamId ? { ...m, tools: [...(m.tools||[]), { name: ev.n, id: ev.id, done: false }] } : m));
          } else if (ev.t === 'tool_done') {
            setMessages(prev => prev.map(m => m._id === streamId ? { ...m, tools: (m.tools||[]).map(t => t.id === ev.id ? { ...t, done: true } : t) } : m));
          } else if (ev.t === 'confirm') {
            setMessages(prev => prev.map(m => m._id === streamId ? { ...m, confirms: [...(m.confirms||[]), { id: ev.id, action: ev.action, params: ev.params, dismissed: false }] } : m));
          } else if (ev.t === 'abordar') {
            window.dispatchEvent(new CustomEvent('copiloto:abordar', { detail: ev.params }));
          } else if (ev.t === 'done') {
            if (ev.conversaId && ev.conversaId !== activeId) { setActiveId(ev.conversaId); loadConversas(); }
            else { loadConversas(); }
            setMessages(prev => prev.map(m => m._id === streamId ? { ...m, _streaming: false } : m));
          } else if (ev.t === 'error') {
            setMessages(prev => prev.map(m => m._id === streamId ? { ...m, content: m.content + '\n\n❌ ' + ev.msg, _streaming: false } : m));
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages(prev => prev.map(m => m._id === streamId ? { ...m, content: m.content + '\n\n❌ Erro de conexão: ' + e.message, _streaming: false } : m));
      }
    }

    setStreaming(false);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const renderMessages = useMemo(() => {
    if (!messages.length) return React.createElement('div', {
      style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: 'IBM Plex Mono,monospace', fontSize: 11, gap: 8 }
    },
      React.createElement('div', { style: { fontSize: 24 } }, '🤖'),
      React.createElement('div', null, 'Copiloto de Prospecção'),
      React.createElement('div', { style: { color: '#333', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 } },
        'Pergunte sobre empresas, histórico, fila ou peça para gerar uma lista de prospecção.'
      ),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 } },
        ['Qual meu último contato com a Ambev?', 'O que a Ambev anunciou este mês?', 'Monte uma fila de 5 empresas de varejo para a Caramelo', 'Quantas reuniões marquei essa semana?'].map(s =>
          React.createElement('div', { key: s, onClick: () => { setInput(s); inputRef.current?.focus(); }, style: { background: '#0d0d1a', border: '1px solid #2D2D44', borderRadius: 100, padding: '5px 12px', fontSize: 10, color: '#818CF8', cursor: 'pointer', fontFamily: 'IBM Plex Mono,monospace', transition: 'all .15s' } }, s)
        )
      )
    );

    return React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' } },
      messages.map((msg, i) =>
        React.createElement(MessageBubble, { key: msg._id || i, msg, onConfirm: handleConfirm, onReject: handleReject })
      ),
      React.createElement('div', { ref: bottomRef })
    );
  }, [messages]);

  return React.createElement('div', {
    style: { display: 'flex', height: '100%', background: '#060606', overflow: 'hidden', position: 'relative' }
  },
    // Sidebar — desktop always visible, mobile as overlay
    !isMobile && React.createElement(Sidebar, { conversas, activeId, onSelect: (id) => { setActiveId(id); }, onNova: newConversation, mobile: false }),
    isMobile && showSidebar && React.createElement('div', {
      style: { position: 'absolute', inset: 0, zIndex: 10, display: 'flex' }
    },
      React.createElement('div', { style: { width: 280, height: '100%', background: '#060606', zIndex: 11, boxShadow: '4px 0 20px rgba(0,0,0,.5)' } },
        React.createElement(Sidebar, { conversas, activeId, onSelect: (id) => { setActiveId(id); setShowSidebar(false); }, onNova: () => { newConversation(); setShowSidebar(false); }, mobile: true, onClose: () => setShowSidebar(false) })
      ),
      React.createElement('div', { onClick: () => setShowSidebar(false), style: { flex: 1, background: 'rgba(0,0,0,.5)' } })
    ),

    // Chat area
    React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
      // Header
      React.createElement('div', { style: { padding: '10px 16px', borderBottom: '.5px solid #1A1A2E', display: 'flex', alignItems: 'center', gap: 10 } },
        isMobile && React.createElement('button', { onClick: () => setShowSidebar(true), style: { background: 'transparent', border: 'none', color: '#9B9BB4', cursor: 'pointer', fontSize: 16, padding: 0 } }, '☰'),
        React.createElement('span', { style: { fontSize: 11, fontFamily: 'IBM Plex Mono,monospace', color: '#FF6B2B', letterSpacing: '.5px' } }, '🤖 COPILOTO'),
        !activeId && React.createElement('span', { style: { fontSize: 10, fontFamily: 'IBM Plex Mono,monospace', color: '#555' } }, '— nova conversa'),
        streaming && React.createElement('div', { style: { marginLeft: 'auto', fontSize: 10, color: '#818CF8', fontFamily: 'IBM Plex Mono,monospace', display: 'flex', alignItems: 'center', gap: 5 } },
          React.createElement('span', { style: { display: 'inline-block', width: 6, height: 6, background: '#818CF8', borderRadius: '50%', animation: 'pulse 1s infinite' } }),
          'pensando'
        )
      ),

      // Messages area
      renderMessages,

      // Input area
      React.createElement('div', { style: { padding: '12px 16px', borderTop: '.5px solid #1A1A2E', background: '#060606' } },
        React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: 900, margin: '0 auto' } },
          React.createElement('textarea', {
            ref: inputRef,
            value: input,
            onChange: e => setInput(e.target.value),
            onKeyDown: handleKey,
            disabled: streaming,
            placeholder: 'Pergunte sobre empresas, histórico, fila... (Enter para enviar, Shift+Enter nova linha)',
            rows: Math.min(5, Math.max(1, (input.match(/\n/g)||[]).length + 1)),
            style: {
              flex: 1, background: '#0d0d1a', border: '1px solid #2D2D44', borderRadius: 8, padding: '9px 12px',
              color: '#E0E0E0', fontFamily: 'IBM Plex Mono,monospace', fontSize: 12, resize: 'none', outline: 'none',
              lineHeight: 1.5, transition: 'border .15s'
            }
          }),
          React.createElement('button', {
            onClick: () => sendMessage(),
            disabled: streaming || !input.trim(),
            style: { background: (streaming || !input.trim()) ? '#1A1A2E' : '#FF6B2B', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: (streaming || !input.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'IBM Plex Mono,monospace', fontSize: 12, flexShrink: 0, transition: 'all .15s' }
          }, streaming ? '...' : '→')
        )
      )
    )
  );
}

// Export global
window.CopiloView = CopiloView;

})();
