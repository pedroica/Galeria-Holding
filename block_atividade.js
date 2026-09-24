// block_atividade.js — Tela Atividade (Bloco 6)
// Exporta window.AtividadeView e window.checkCronAlertFromLogs

(function () {
  const { useState, useEffect, useMemo } = React;
  const SUPA_URL  = 'https://uetltlnjmobeiunxfsqi.supabase.co';
  const SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';

  function getJwt() {
    try {
      if (window.__supaSession?.access_token) return window.__supaSession.access_token;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes('supabase')) {
          const v = JSON.parse(localStorage.getItem(k) || 'null');
          if (v?.access_token) return v.access_token;
        }
      }
    } catch (_) {}
    return null;
  }

  async function supa(path) {
    try {
      const jwt = getJwt();
      const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
        headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + (jwt || SUPA_ANON) }
      });
      if (!r.ok) return [];
      const text = await r.text();
      if (!text) return [];
      return JSON.parse(text);
    } catch (_) { return []; }
  }

  // ── Bar chart SVG ────────────────────────────────────────────────────────────
  function BarChart({ data }) {
    if (!data || data.length === 0) {
      return React.createElement('div', {
        style: { color: '#555', fontSize: 11, fontFamily: 'IBM Plex Mono,monospace', padding: '12px 0' }
      }, 'Sem toques nos últimos 28 dias');
    }
    const max = Math.max(...data.map(d => d.count), 1);
    const W = 700, H = 80;
    const barW = Math.floor(W / data.length) - 1;
    const hoje = new Date().toISOString().slice(0, 10);

    return React.createElement('svg', {
      viewBox: '0 0 ' + W + ' ' + (H + 18),
      width: '100%',
      style: { display: 'block' }
    },
      ...data.map((d, i) => {
        const h = Math.max(2, Math.round(d.count / max * H));
        const x = i * (barW + 1);
        const y = H - h;
        const isHoje = d.date === hoje;
        const showLabel = i % 7 === 0 || i === data.length - 1;
        return React.createElement('g', { key: d.date },
          React.createElement('rect', { x, y, width: barW, height: h, fill: isHoje ? '#FF6B2B' : '#60A5FA', opacity: 0.8 }),
          d.count > 0 && React.createElement('text', {
            x: x + barW / 2, y: y - 2, textAnchor: 'middle', fontSize: 7, fill: '#9B9BB4',
            fontFamily: 'IBM Plex Mono,monospace'
          }, d.count),
          showLabel && React.createElement('text', {
            x: x + barW / 2, y: H + 14, textAnchor: 'middle', fontSize: 7, fill: '#555',
            fontFamily: 'IBM Plex Mono,monospace'
          }, d.date.slice(5))
        );
      })
    );
  }

  // ── Cron log row ─────────────────────────────────────────────────────────────
  function CronLogRow({ log }) {
    const ctx = log.contexto || {};
    const isError = log.nivel === 'error';
    const isFim   = (log.mensagem || '').startsWith('fim');
    const job     = (log.origem || '').replace('cron:', '');
    const dt      = new Date(log.criado_em);
    const dtStr   = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
                    dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let nums = '';
    if (ctx.gerados  != null) nums += ctx.gerados  + ' gerados';
    if (ctx.revelados!= null) nums += ctx.revelados + ' revelados';
    if (ctx.creditos_usados != null) nums += ' créditos usados: ' + ctx.creditos_usados;
    if (ctx.enviados != null) nums += ctx.enviados + ' env';
    if (ctx.reunioes != null) nums += ' / ' + ctx.reunioes + ' reun';
    if (ctx.ms       != null) nums += ' (' + (ctx.ms / 1000).toFixed(1) + 's)';
    const motivo = ctx.motivo || ctx.pulado_motivo || '';

    return React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
        borderBottom: '.5px solid #1A1A2E',
        background: isError ? 'rgba(226,75,74,0.07)' : 'transparent'
      }
    },
      React.createElement('span', { style: { color: '#555', fontSize: 9, fontFamily: 'IBM Plex Mono,monospace', minWidth: 90, flexShrink: 0 } }, dtStr),
      React.createElement('span', { style: { color: isError ? '#E24B4A' : isFim ? '#34D399' : '#9B9BB4', fontSize: 10, fontFamily: 'IBM Plex Mono,monospace', minWidth: 150, flexShrink: 0 } }, job),
      React.createElement('span', { style: { color: isError ? '#E24B4A' : isFim ? '#34D399' : '#FBBF24', fontSize: 9, fontFamily: 'IBM Plex Mono,monospace', minWidth: 70, flexShrink: 0 } }, log.mensagem || ''),
      React.createElement('span', { style: { color: '#555', fontSize: 9, fontFamily: 'IBM Plex Mono,monospace', flex: 1 } }, motivo || nums),
      isError && log.contexto?.hint && React.createElement('span', {
        style: { color: '#E24B4A', fontSize: 9, fontFamily: 'IBM Plex Mono,monospace' }
      }, String(log.contexto.hint).slice(0, 60))
    );
  }

  // ── Relatório viewer ─────────────────────────────────────────────────────────
  function RelatorioView({ relatorio }) {
    if (!relatorio) return null;
    const d = relatorio.dados || {};
    const semana = d.semana_inicio || relatorio.semana_inicio || '';
    const gerado  = new Date(relatorio.gerado_em || relatorio.criado_em);
    const geradoStr = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return React.createElement('div', {
      style: { padding: '12px 16px', background: '#0d0d1a', borderRadius: 6, border: '.5px solid #1A1A2E' }
    },
      React.createElement('div', {
        style: { fontSize: 10, color: '#555', fontFamily: 'IBM Plex Mono,monospace', marginBottom: 10 }
      }, 'Semana de ' + semana + '  ·  gerado em ' + geradoStr),
      d.resumo_texto
        ? React.createElement('pre', {
            style: {
              fontSize: 11, color: '#F5F5F5', fontFamily: 'IBM Plex Mono,monospace',
              whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0
            }
          }, d.resumo_texto)
        : React.createElement('div', { style: { display: 'flex', gap: 24, flexWrap: 'wrap' } },
            React.createElement('div', { style: { fontSize: 11, fontFamily: 'IBM Plex Mono,monospace' } },
              React.createElement('span', { style: { color: '#555' } }, 'enviados '),
              React.createElement('span', { style: { color: '#F5F5F5' } }, d.enviados_total || 0)
            ),
            React.createElement('div', { style: { fontSize: 11, fontFamily: 'IBM Plex Mono,monospace' } },
              React.createElement('span', { style: { color: '#555' } }, 'reuniões '),
              React.createElement('span', { style: { color: '#34D399' } }, d.reunioes_total || 0)
            ),
            React.createElement('div', { style: { fontSize: 11, fontFamily: 'IBM Plex Mono,monospace' } },
              React.createElement('span', { style: { color: '#555' } }, 'resposta '),
              React.createElement('span', { style: { color: '#60A5FA' } }, (d.taxa_resposta_pct || 0) + '%')
            )
          )
    );
  }

  // ── AtividadeView ─────────────────────────────────────────────────────────────
  function AtividadeView() {
    const [filaEnviados, setFilaEnviados] = useState([]);
    const [cronLogs,     setCronLogs]     = useState([]);
    const [relatorio,    setRelatorio]    = useState(null);
    const [agencias,     setAgencias]     = useState([]);
    const [loading,      setLoading]      = useState(true);

    useEffect(() => {
      const since = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
      Promise.all([
        supa('crm_fila?status=eq.enviado&enviado_em=gte.' + since + 'T00:00:00&select=enviado_em,canal,agencia_id&limit=5000'),
        supa('crm_logs?origem=like.cron:*&order=criado_em.desc&limit=200'),
        supa('crm_relatorios?tipo=eq.semanal&order=semana_inicio.desc&limit=1'),
        supa('crm_agencias?select=id,nome&limit=20')
      ]).then(([fila, logs, rs, ags]) => {
        setFilaEnviados(Array.isArray(fila) ? fila : []);
        setCronLogs(Array.isArray(logs) ? logs : []);
        setRelatorio(Array.isArray(rs) && rs[0] ? rs[0] : null);
        setAgencias(Array.isArray(ags) ? ags : []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, []);

    // Bar chart: group by day
    const chartData = useMemo(() => {
      const days = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        days.push(d.toISOString().slice(0, 10));
      }
      const counts = {};
      for (const f of filaEnviados) {
        const day = (f.enviado_em || '').slice(0, 10);
        if (day) counts[day] = (counts[day] || 0) + 1;
      }
      return days.map(date => ({ date, count: counts[date] || 0 }));
    }, [filaEnviados]);

    // Table: por canal e agência
    const tableData = useMemo(() => {
      const agNome = {};
      for (const ag of agencias) agNome[ag.id] = ag.nome;
      const rows = {};
      const canalSet = new Set();
      for (const f of filaEnviados) {
        const ag = agNome[f.agencia_id] || f.agencia_id || 'Desconhecida';
        const canal = f.canal || 'outros';
        canalSet.add(canal);
        if (!rows[ag]) rows[ag] = {};
        rows[ag][canal] = (rows[ag][canal] || 0) + 1;
      }
      return { rows, canais: [...canalSet].sort() };
    }, [filaEnviados, agencias]);

    const mono  = { fontFamily: 'IBM Plex Mono,monospace' };
    const card  = { background: '#0d0d1a', border: '.5px solid #1A1A2E', borderRadius: 6, padding: 12, marginBottom: 16 };
    const title = { fontSize: 10, color: '#555', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 10, ...mono };

    if (loading) return React.createElement('div', {
      style: { padding: 32, color: '#555', fontSize: 12, ...mono }
    }, 'Carregando atividade...');

    return React.createElement('div', {
      style: { flex: 1, overflow: 'auto', padding: '16px 24px', background: '#060606' }
    },
      React.createElement('div', { style: { fontSize: 13, color: '#F5F5F5', marginBottom: 16, ...mono } }, 'ATIVIDADE'),

      // Bar chart
      React.createElement('div', { style: card },
        React.createElement('div', { style: title }, 'Toques enviados por dia (últimas 4 semanas)'),
        React.createElement(BarChart, { data: chartData })
      ),

      // Table by canal/agência
      React.createElement('div', { style: card },
        React.createElement('div', { style: title }, 'Por canal e agência (28 dias)'),
        tableData.canais.length === 0
          ? React.createElement('div', { style: { color: '#555', fontSize: 11, ...mono } }, 'Sem dados')
          : React.createElement('div', { style: { overflowX: 'auto' } },
              React.createElement('table', { style: { borderCollapse: 'collapse', fontSize: 10, ...mono, minWidth: '100%' } },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', { style: { textAlign: 'left', color: '#555', paddingBottom: 6, borderBottom: '.5px solid #2D2D44', paddingRight: 20 } }, 'Agência'),
                    ...tableData.canais.map(c =>
                      React.createElement('th', { key: c, style: { textAlign: 'right', color: '#555', paddingBottom: 6, borderBottom: '.5px solid #2D2D44', paddingLeft: 16 } }, c)
                    ),
                    React.createElement('th', { style: { textAlign: 'right', color: '#555', paddingBottom: 6, borderBottom: '.5px solid #2D2D44', paddingLeft: 16 } }, 'total')
                  )
                ),
                React.createElement('tbody', null,
                  Object.entries(tableData.rows).map(([ag, canals]) => {
                    const total = Object.values(canals).reduce((a, b) => a + b, 0);
                    return React.createElement('tr', { key: ag },
                      React.createElement('td', { style: { color: '#F5F5F5', padding: '4px 20px 4px 0' } }, ag),
                      ...tableData.canais.map(c =>
                        React.createElement('td', { key: c, style: { textAlign: 'right', color: '#9B9BB4', padding: '4px 0 4px 16px' } }, canals[c] || 0)
                      ),
                      React.createElement('td', { style: { textAlign: 'right', color: '#FF6B2B', padding: '4px 0 4px 16px' } }, total)
                    );
                  })
                )
              )
            )
      ),

      // Cron execution list
      React.createElement('div', { style: { ...card, padding: 0, overflow: 'hidden' } },
        React.createElement('div', { style: { ...title, padding: '12px 10px 8px' } }, 'Execuções dos crons'),
        cronLogs.length === 0
          ? React.createElement('div', { style: { color: '#555', fontSize: 11, ...mono, padding: '8px 10px' } }, 'Sem logs de cron')
          : cronLogs.slice(0, 100).map((log, i) =>
              React.createElement(CronLogRow, { key: log.id || i, log })
            )
      ),

      // Last Friday report
      relatorio && React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement('div', { style: title }, 'Último relatório de sexta'),
        React.createElement(RelatorioView, { relatorio })
      )
    );
  }

  window.AtividadeView = AtividadeView;

  // ── Alert helper (chamado por block3.js) ─────────────────────────────────────
  window.checkCronAlertFromLogs = function (logs) {
    if (!Array.isArray(logs) || logs.length === 0) return false;
    const brt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hoje = brt.toISOString().slice(0, 10);
    const dia  = brt.getDay(); // 0=Dom, 6=Sáb

    // Qualquer erro hoje
    if (logs.some(l => l.nivel === 'error' && (l.criado_em || '').startsWith(hoje))) return true;

    // Crons que completaram hoje (mensagem começa com 'fim')
    const finalizados = new Set(
      logs.filter(l => (l.criado_em || '').startsWith(hoje) && (l.mensagem || '').startsWith('fim'))
          .map(l => (l.origem || '').replace('cron:', ''))
    );

    // Crons que pularam (mensagem contém 'pulado') também contam como OK
    const pulados = new Set(
      logs.filter(l => (l.criado_em || '').startsWith(hoje) && (l.mensagem || '').includes('pulado'))
          .map(l => (l.origem || '').replace('cron:', ''))
    );

    const ok = job => finalizados.has(job) || pulados.has(job);

    if (dia >= 1 && dia <= 5 && !ok('gerar-fila-diario'))    return true;
    if (!ok('enriquecimento-diario'))                          return true;
    if (dia === 5 && !ok('fechamento-sexta'))                  return true;

    return false;
  };
})();
