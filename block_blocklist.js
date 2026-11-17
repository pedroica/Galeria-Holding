/* ═══════════════════════════════════════════════════════════════════════════
   Aba "Blocklist" — CRM de produção (galeria-holding-sage)
   Fonte: tabela crm_blocklist (via JWT da sessão). Enforcement real vive no
   server (api/fila.js + lib/blocklist.js): nenhum item entra em crm_fila para
   empresa/e-mail bloqueado. Clientes ativos (crm_empresas.cliente_ativo) são
   bloqueados automaticamente além desta lista.
   Esta aba é o CRUD + um testador que espelha as MESMAS regras do server.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const h = React.createElement;
  const { useState, useEffect, useMemo } = React;
  const SUPA_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
  const SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';

  function sj(path, opts) {
    const jwt = (window.__supaSession && window.__supaSession.access_token) || SUPA_ANON;
    const hdrs = Object.assign({ apikey: SUPA_ANON, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' }, opts && opts.headers);
    return fetch(SUPA_URL + '/rest/v1' + path, Object.assign({}, opts, { headers: hdrs }))
      .then(r => (r.ok ? (r.status === 204 ? null : r.json().catch(() => null)) : Promise.reject(new Error('HTTP ' + r.status))));
  }

  // ── Matcher espelhado de lib/blocklist.js (mesmas regras do server) ─────────
  const STOP = new Set(['de','da','do','das','dos','e','the','s','a','ltda','sa','eireli','me','epp','mei']);
  const stripAcc = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const normName = s => stripAcc((s || '').toLowerCase()).replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const toks = s => normName(s).split(' ').filter(t => t && !STOP.has(t));
  function normDom(s) { let d = (s || '').trim().toLowerCase(); if (!d) return ''; if (d.includes('@')) d = d.split('@').pop(); d = d.replace(/^https?:\/\//, '').replace(/^www\./, ''); return d.split('/')[0].split('?')[0].split('#')[0].split(':')[0].trim(); }
  function domMatch(dom, blk) { const d = normDom(dom), b = normDom(blk); if (!d || !b) return false; return d === b || d.endsWith('.' + b); }
  const shortNum = t => t.length <= 2 || /^\d+$/.test(t);
  function tokContain(nameT, aliasT) {
    if (!aliasT.length) return false;
    if (aliasT.length === 1 && shortNum(aliasT[0])) return nameT.length === 1 && nameT[0] === aliasT[0];
    for (let i = 0; i + aliasT.length <= nameT.length; i++) { let ok = true; for (let j = 0; j < aliasT.length; j++) { if (nameT[i + j] !== aliasT[j]) { ok = false; break; } } if (ok) return true; }
    return false;
  }
  function checkBlock(rows, input) {
    const cands = []; if (input.domain) cands.push(input.domain); if (input.email) cands.push(input.email);
    const nameT = input.name ? toks(input.name) : [];
    for (const e of rows) {
      for (const c of cands) for (const bd of (e.dominios || [])) if (domMatch(c, bd)) return { blocked: true, entryName: e.nome_canonico, reason: 'domínio', matched: bd };
      if (nameT.length) {
        const names = [e.nome_canonico].concat(e.aliases || []); if (e.grupo_economico) names.push(e.grupo_economico);
        for (const nm of names) { const at = toks(nm); if (at.length && tokContain(nameT, at)) return { blocked: true, entryName: e.nome_canonico, reason: 'nome', matched: at.join(' ') }; }
      }
    }
    return { blocked: false };
  }

  function BlocklistView() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [q, setQ] = useState('');
    const [testIn, setTestIn] = useState('');
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ nome_canonico: '', dominios: '', aliases: '', grupo_economico: '', motivo: '' });

    function load() {
      setLoading(true); setErr('');
      sj('/crm_blocklist?apagado_em=is.null&ativo=eq.true&select=*&order=nome_canonico.asc&limit=2000')
        .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false); })
        .catch(e => { setErr('Erro ao carregar: ' + e.message + ' (faça login)'); setLoading(false); });
    }
    useEffect(load, []);

    const filtered = useMemo(() => {
      const term = normName(q); if (!term) return rows;
      return rows.filter(e => normName(e.nome_canonico).includes(term)
        || (e.dominios || []).some(d => d.includes(q.toLowerCase()))
        || (e.aliases || []).some(a => normName(a).includes(term)));
    }, [rows, q]);

    const testResult = useMemo(() => {
      if (!testIn.trim()) return null;
      const isEmail = testIn.includes('@');
      return checkBlock(rows, isEmail ? { email: testIn } : { name: testIn, domain: testIn.includes('.') ? testIn : undefined });
    }, [rows, testIn]);

    function addEntry() {
      const nome = form.nome_canonico.trim(); if (!nome) return;
      setBusy(true);
      const body = {
        nome_canonico: nome,
        dominios: form.dominios.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        aliases: form.aliases.split(',').map(s => s.trim()).filter(Boolean),
        grupo_economico: form.grupo_economico.trim() || null,
        motivo: form.motivo.trim() || null,
        origem: 'manual'
      };
      sj('/crm_blocklist', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) })
        .then(() => { setForm({ nome_canonico: '', dominios: '', aliases: '', grupo_economico: '', motivo: '' }); setAdding(false); setBusy(false); load(); })
        .catch(e => { setErr('Erro ao adicionar: ' + e.message); setBusy(false); });
    }
    function removeEntry(id) {
      setBusy(true);
      sj('/crm_blocklist?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ apagado_em: new Date().toISOString() }) })
        .then(() => { setRows(p => p.filter(x => x.id !== id)); setBusy(false); })
        .catch(e => { setErr('Erro ao remover: ' + e.message); setBusy(false); });
    }

    function field(label, key, ph) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('label', { style: { fontSize: 9, fontFamily: 'IBM Plex Mono,monospace', color: '#9B9BB4', letterSpacing: .5, textTransform: 'uppercase' } }, label),
        h('input', { value: form[key], placeholder: ph || '', onChange: e => setForm(Object.assign({}, form, { [key]: e.target.value })),
          style: { background: '#0D0D0D', border: '.5px solid #2D2D44', borderRadius: 6, padding: '8px 10px', color: '#F5F5F5', fontSize: 12, outline: 'none' } }));
    }

    return h('div', { style: { padding: 24, maxWidth: 980, margin: '0 auto' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' } },
        h('div', { style: { fontSize: 20, fontWeight: 600, color: '#F5F5F5' } }, '🚫 Blocklist'),
        h('span', { style: { fontSize: 11, fontFamily: 'IBM Plex Mono,monospace', color: '#9B9BB4' } }, rows.length + ' empresas')),
      h('div', { style: { fontSize: 11, color: '#9B9BB4', marginBottom: 16, lineHeight: 1.6 } },
        'Empresas que o agente ', h('b', null, 'nunca'), ' aborda. A geração da fila ignora qualquer decisor cuja empresa, domínio ou e-mail caia aqui. ',
        h('b', { style: { color: '#FF6B2B' } }, 'Clientes ativos da holding são bloqueados automaticamente'), ', além desta lista.'),

      err && h('div', { style: { background: 'rgba(226,75,74,.1)', border: '.5px solid rgba(226,75,74,.3)', borderRadius: 8, padding: '8px 12px', color: '#E24B4A', fontSize: 11, fontFamily: 'IBM Plex Mono,monospace', marginBottom: 12 } }, err),

      // Testador
      h('div', { style: { background: '#111827', border: '.5px solid #2D2D44', borderRadius: 10, padding: 14, marginBottom: 16 } },
        h('div', { style: { fontSize: 9, fontFamily: 'IBM Plex Mono,monospace', color: '#9B9BB4', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 } }, 'Testar empresa / e-mail'),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('input', { placeholder: 'Ex: Itaú Unibanco · cmo@natura.com.br · Gerdau', value: testIn, onChange: e => setTestIn(e.target.value),
            style: { flex: 1, minWidth: 220, background: '#0D0D0D', border: '.5px solid #2D2D44', borderRadius: 6, padding: '8px 10px', color: '#F5F5F5', fontSize: 13, outline: 'none' } }),
          testResult && h('span', { style: { fontSize: 11, fontFamily: 'IBM Plex Mono,monospace', padding: '6px 12px', borderRadius: 6, whiteSpace: 'nowrap',
              background: testResult.blocked ? 'rgba(226,75,74,.12)' : 'rgba(29,158,117,.12)', color: testResult.blocked ? '#E24B4A' : '#1D9E75',
              border: '1px solid ' + (testResult.blocked ? 'rgba(226,75,74,.3)' : 'rgba(29,158,117,.3)') } },
            testResult.blocked ? ('🔴 BLOQUEADA — ' + testResult.entryName + ' (' + testResult.reason + ')') : '🟢 Liberada'))),

      // Ações
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' } },
        h('input', { placeholder: 'Buscar na blocklist…', value: q, onChange: e => setQ(e.target.value),
          style: { flex: 1, minWidth: 180, background: '#1A1A2E', border: '.5px solid #2D2D44', borderRadius: 6, padding: '8px 10px', color: '#F5F5F5', fontSize: 12, outline: 'none' } }),
        h('button', { onClick: () => setAdding(!adding), disabled: busy,
          style: { background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer' } }, adding ? 'Cancelar' : '+ Adicionar')),

      adding && h('div', { style: { background: '#1A1A2E', border: '.5px solid #2D2D44', borderRadius: 10, padding: 16, marginBottom: 14 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
          field('Nome *', 'nome_canonico', 'Ex: Ambev'),
          field('Grupo econômico', 'grupo_economico', 'Ex: AB InBev'),
          field('Domínios (vírgula)', 'dominios', 'ambev.com.br, ambev.com'),
          field('Aliases (vírgula)', 'aliases', 'ambev, brahma, skol')),
        h('div', { style: { marginTop: 10 } }, field('Motivo', 'motivo', 'Por que está bloqueada')),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 } },
          h('button', { onClick: addEntry, disabled: busy, style: { background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 500, cursor: 'pointer' } }, busy ? '...' : 'Salvar na blocklist'))),

      loading ? h('div', { style: { color: '#555', fontFamily: 'IBM Plex Mono,monospace', fontSize: 12, padding: 24 } }, 'Carregando…')
        : h('div', null, filtered.map(e => h('div', { key: e.id, style: { display: 'flex', gap: 12, alignItems: 'flex-start', background: '#1A1A2E', border: '.5px solid #2D2D44', borderRadius: 10, padding: '12px 14px', marginBottom: 8 } },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                h('span', { style: { fontSize: 13, fontWeight: 600, color: '#F5F5F5' } }, e.nome_canonico),
                e.origem === 'seed' && h('span', { style: { fontSize: 8, fontFamily: 'IBM Plex Mono,monospace', padding: '1px 6px', borderRadius: 100, background: 'rgba(155,155,180,.1)', color: '#9B9BB4', border: '.5px solid #2D2D44' } }, 'seed'),
                e.grupo_economico && h('span', { style: { fontSize: 8, fontFamily: 'IBM Plex Mono,monospace', padding: '1px 7px', borderRadius: 100, background: 'rgba(255,107,43,.1)', color: '#FF6B2B', border: '1px solid rgba(255,107,43,.25)' } }, e.grupo_economico)),
              h('div', { style: { fontSize: 9, fontFamily: 'IBM Plex Mono,monospace', color: '#9B9BB4', marginTop: 5, lineHeight: 1.6 } },
                (e.dominios && e.dominios.length ? ('🌐 ' + e.dominios.join(', ')) : 'sem domínio'),
                (e.aliases && e.aliases.length ? ('   ·   alias: ' + e.aliases.join(', ')) : ''))),
            h('button', { onClick: () => removeEntry(e.id), disabled: busy, title: 'Remover',
              style: { background: 'rgba(226,75,74,.1)', color: '#E24B4A', border: '.5px solid rgba(226,75,74,.3)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, flexShrink: 0 } }, '🗑')))),
      !loading && filtered.length === 0 && h('div', { style: { textAlign: 'center', color: '#555', fontSize: 11, padding: 24, fontFamily: 'IBM Plex Mono,monospace' } }, 'Nenhuma empresa encontrada.'));
  }

  window.BlocklistView = BlocklistView;
})();
