// block_base.js — Base › Listas e blitz, Base › Placar.
// Filtra a base inteira (crm_base_contatos_v), mostra quantas empresas e contatos
// cabem no filtro e salva como lista (crm_listas / crm_lista_itens) para blitz.
// Regras de filtro em base.js (window.BaseFiltros). Sem JSX: React.createElement.
var BB_MONO = "'IBM Plex Mono',monospace";
var bbe = React.createElement;

function bbBotao(label, onClick, cor, opts) {
  opts = opts || {};
  return bbe("button", { onClick: onClick, disabled: !!opts.disabled, title: opts.title || '',
    style: { padding: opts.grande ? '8px 16px' : '4px 10px', borderRadius: 4, border: '.5px solid ' + (cor || '#2D2D44'),
      background: opts.cheio ? (cor || '#FF6B2B') : 'transparent', color: opts.cheio ? '#fff' : (cor || '#9B9BB4'),
      fontFamily: BB_MONO, fontSize: opts.grande ? 11 : 10, fontWeight: opts.cheio ? 700 : 400, cursor: opts.disabled ? 'not-allowed' : 'pointer', opacity: opts.disabled ? .5 : 1, whiteSpace: 'nowrap' } }, label);
}
function bbChip(label, ativo, onClick, extra) {
  return bbe("button", { key: label, onClick: onClick, style: { padding: '3px 9px', borderRadius: 12, border: '.5px solid ' + (ativo ? '#FF6B2B' : '#2D2D44'),
    background: ativo ? 'rgba(255,107,43,.14)' : 'transparent', color: ativo ? '#FF6B2B' : '#9B9BB4', fontFamily: BB_MONO, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' } },
    label + (extra != null ? ' · ' + extra : ''));
}
function bbEmail() { return (window.__supaSession && window.__supaSession.user && window.__supaSession.user.email) || ''; }

// ── Placar ────────────────────────────────────────────────────────────────────
function PlacarBase(props) {
  var _p = React.useState(null); var p = _p[0]; var setP = _p[1];
  React.useEffect(function () { supaFetch('/rest/v1/crm_placar_v?select=*').then(function (r) { setP(Array.isArray(r) && r[0] ? r[0] : {}); }).catch(function () { setP({}); }); }, []);
  var B = window.BaseFiltros;
  if (!p || !B) return bbe("div", { style: { padding: 24, fontFamily: BB_MONO, fontSize: 11, color: '#555' } }, 'Carregando placar…');
  var np = B.notaPlacar(p);
  var cor = function (v) { return v >= 80 ? '#34D399' : v >= 50 ? '#FBBF24' : '#E24B4A'; };
  return bbe("div", { style: { flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 } },
    bbe("div", { style: { display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' } },
      bbe("div", { style: { fontFamily: BB_MONO, fontSize: 44, fontWeight: 700, color: cor(np.nota), lineHeight: 1 } }, np.nota + '%'),
      bbe("div", null,
        bbe("div", { style: { fontFamily: BB_MONO, fontSize: 12, color: '#F5F5F5', fontWeight: 700, letterSpacing: '.5px' } }, 'BASE ENRIQUECIDA'),
        bbe("div", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#6B6B85', marginTop: 4 } },
          p.empresas + ' empresas · ' + p.contatos + ' contatos · ' + p.contatos_prontos + ' contatos prontos para abordar (cargo + e-mail ou celular)'))),
    bbe("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 } },
      np.itens.map(function (i) {
        return bbe("div", { key: i.k, style: { background: '#0D0D1A', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '12px 14px' } },
          bbe("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
            bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#9B9BB4' } }, i.label),
            bbe("span", { style: { fontFamily: BB_MONO, fontSize: 16, fontWeight: 700, color: cor(i.pct) } }, i.pct + '%')),
          bbe("div", { style: { height: 5, background: '#1A1A2E', borderRadius: 3, overflow: 'hidden', margin: '8px 0 6px' } },
            bbe("div", { style: { width: i.pct + '%', height: '100%', background: cor(i.pct) } })),
          bbe("div", { style: { fontFamily: BB_MONO, fontSize: 9, color: '#555' } }, i.v + ' de ' + i.de + ' · faltam ' + (i.de - i.v)));
      })),
    bbe("div", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#555', lineHeight: 1.6 } },
      'Setor é classificado pela IA (grátis). Site, cargo e LinkedIn vêm da busca do Lusha (quase grátis). E-mail e celular gastam créditos do Lusha: o enriquecimento diário respeita o teto configurado.'));
}

// ── Listas ────────────────────────────────────────────────────────────────────
var BB_NIVEIS = ['C-level', 'Marketing', 'Diretoria', 'Outros', 'sem cargo'];
function ListasView(props) {
  var B = window.BaseFiltros;
  var _l = React.useState(null); var linhas = _l[0]; var setLinhas = _l[1];
  var _ls = React.useState([]); var listas = _ls[0]; var setListas = _ls[1];
  var _f = React.useState({ setores: [], niveis: [], estrelasMin: 0, comEmailOuCelular: true, excluirClientes: true, excluirComOportunidade: false, semToqueDias: 30, umPorEmpresa: true, busca: '' });
  var f = _f[0]; var setF = _f[1];
  var _fora = React.useState({}); var fora = _fora[0]; var setFora = _fora[1];   // desmarcados à mão
  var _nome = React.useState(''); var nome = _nome[0]; var setNome = _nome[1];
  var _msg = React.useState(null); var msg = _msg[0]; var setMsg = _msg[1];
  var _busy = React.useState(false); var busy = _busy[0]; var setBusy = _busy[1];
  var _aberta = React.useState(null); var aberta = _aberta[0]; var setAberta = _aberta[1];   // lista salva sendo vista
  var _todosSet = React.useState(false); var verTodosSetores = _todosSet[0]; var setVerTodosSetores = _todosSet[1];

  function carregar() {
    supaFetch('/rest/v1/crm_base_contatos_v?select=*&limit=10000').then(function (r) { setLinhas(Array.isArray(r) ? r : []); }).catch(function () { setLinhas([]); });
    carregarListas();
  }
  function carregarListas() {
    supaFetch('/rest/v1/crm_listas?apagado_em=is.null&select=id,nome,descricao,filtros,criado_em,crm_lista_itens(count)&order=criado_em.desc&limit=100')
      .then(function (r) { setListas(Array.isArray(r) ? r : []); }).catch(function () {});
  }
  React.useEffect(carregar, []);
  if (!B) return null;
  if (!linhas) return bbe("div", { style: { padding: 24, fontFamily: BB_MONO, fontSize: 11, color: '#555' } }, 'Carregando a base…');

  var set = function (k, v) { setF(function (p) { var n = Object.assign({}, p); n[k] = v; return n; }); setFora({}); setAberta(null); };
  var alterna = function (k, v) { set(k, f[k].indexOf(v) >= 0 ? f[k].filter(function (x) { return x !== v; }) : f[k].concat([v])); };
  var filtradas = aberta ? aberta.linhas : B.filtrar(linhas, f);
  var escolhidas = filtradas.filter(function (r) { return !fora[r.decisor_id]; });
  var rs = B.resumo(escolhidas);
  var setoresCont = B.contarSetores(linhas);
  var setoresVisiveis = verTodosSetores ? setoresCont : setoresCont.slice(0, 12);

  function salvar() {
    var n = nome.trim();
    if (!n) { setMsg({ t: 'Dê um nome para a lista (ex.: Blitz Educação — dez/26).', c: '#E24B4A' }); return; }
    if (!escolhidas.length) { setMsg({ t: 'A lista está vazia.', c: '#E24B4A' }); return; }
    setBusy(true); setMsg(null);
    supaFetch('/rest/v1/crm_listas', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ nome: n.slice(0, 120), filtros: f, criado_por: bbEmail() }) })
      .then(function (r) {
        var lista = Array.isArray(r) && r[0]; if (!lista) throw new Error((r && r.message) || 'não salvou');
        var itens = escolhidas.map(function (x) { return { lista_id: lista.id, decisor_id: x.decisor_id, empresa_id: x.empresa_id }; });
        return supaFetch('/rest/v1/crm_lista_itens', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(itens) })
          .then(function (r2) { if (r2 && r2.code) throw new Error(r2.message); return lista; });
      })
      .then(function () { setBusy(false); setNome(''); setMsg({ t: '✓ Lista salva: ' + rs.empresas + ' empresas, ' + rs.contatos + ' contatos.', c: '#34D399' }); carregarListas(); })
      .catch(function (e) { setBusy(false); setMsg({ t: 'Não salvou: ' + e.message, c: '#E24B4A' }); });
  }
  function abrirLista(l) {
    supaFetch('/rest/v1/crm_lista_itens?lista_id=eq.' + l.id + '&select=decisor_id&limit=5000').then(function (r) {
      var ids = {}; (Array.isArray(r) ? r : []).forEach(function (x) { ids[x.decisor_id] = 1; });
      setFora({}); setAberta({ lista: l, linhas: linhas.filter(function (x) { return ids[x.decisor_id]; }) });
    });
  }
  function apagarLista(l) {
    if (!window.confirm('Arquivar a lista "' + l.nome + '"? Os contatos não são apagados.')) return;
    supaFetch('/rest/v1/crm_listas?id=eq.' + l.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ apagado_em: new Date().toISOString() }) }).then(function () { if (aberta && aberta.lista.id === l.id) setAberta(null); carregarListas(); });
  }

  var rotulo = function (t) { return bbe("div", { style: { fontFamily: BB_MONO, fontSize: 9, color: '#6B6B85', letterSpacing: '.5px', marginBottom: 6 } }, t); };
  var check = function (k, label) {
    return bbe("label", { key: k, style: { display: 'flex', alignItems: 'center', gap: 6, fontFamily: BB_MONO, fontSize: 10, color: '#C9C9D6', cursor: 'pointer' } },
      bbe("input", { type: 'checkbox', checked: !!f[k], onChange: function (e) { set(k, e.target.checked); } }), label);
  };
  var colunaFiltros = bbe("div", { style: { width: 300, flexShrink: 0, borderRight: '.5px solid #1A1A2E', padding: '16px 18px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 } },
    bbe("div", null, rotulo('BUSCA'),
      bbe("input", { value: f.busca, placeholder: 'empresa, pessoa ou cargo', onChange: function (e) { set('busca', e.target.value); },
        style: { width: '100%', boxSizing: 'border-box', background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontFamily: BB_MONO, fontSize: 11, padding: '6px 8px' } })),
    bbe("div", null, rotulo('SETOR (empresas na base)'),
      bbe("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } }, setoresVisiveis.map(function (s) { return bbChip(s.setor, f.setores.indexOf(s.setor) >= 0, function () { alterna('setores', s.setor); }, s.empresas); })),
      setoresCont.length > 12 && bbe("button", { onClick: function () { setVerTodosSetores(!verTodosSetores); }, style: { marginTop: 6, background: 'none', border: 'none', color: '#60A5FA', fontFamily: BB_MONO, fontSize: 10, cursor: 'pointer', padding: 0 } }, verTodosSetores ? 'ver menos' : 'ver todos (' + setoresCont.length + ')')),
    bbe("div", null, rotulo('CARGO'),
      bbe("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } }, BB_NIVEIS.map(function (n) { return bbChip(n, f.niveis.indexOf(n) >= 0, function () { alterna('niveis', n); }); }))),
    bbe("div", null, rotulo('ESTRELAS (mínimo)'),
      bbe("div", { style: { display: 'flex', gap: 5 } }, [0, 3, 4, 5].map(function (n) { return bbChip(n ? n + '★+' : 'todas', f.estrelasMin === n, function () { set('estrelasMin', n); }); }))),
    bbe("div", { style: { display: 'flex', flexDirection: 'column', gap: 7 } }, rotulo('CONTATO'),
      check('comEmailOuCelular', 'com e-mail ou celular'), check('comEmail', 'só com e-mail'), check('comCelular', 'só com celular'), check('umPorEmpresa', '1 contato por empresa (o de cargo mais alto)')),
    bbe("div", { style: { display: 'flex', flexDirection: 'column', gap: 7 } }, rotulo('DEIXAR DE FORA'),
      check('excluirClientes', 'clientes ativos'), check('excluirComOportunidade', 'quem já tem oportunidade aberta'),
      bbe("div", { style: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' } },
        bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#C9C9D6' } }, 'tocadas há menos de'),
        [0, 15, 30, 60].map(function (d) { return bbChip(d ? d + 'd' : 'não tirar', f.semToqueDias === d, function () { set('semToqueDias', d); }); }))));

  var resumoBar = bbe("div", { style: { display: 'flex', alignItems: 'center', gap: 18, padding: '12px 18px', borderBottom: '.5px solid #1A1A2E', flexWrap: 'wrap' } },
    aberta && bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#60A5FA' } }, 'Lista: ' + aberta.lista.nome),
    [['empresas', rs.empresas, '#F5F5F5'], ['contatos', rs.contatos, '#F5F5F5'], ['com e-mail', rs.comEmail, '#60A5FA'], ['com celular', rs.comCelular, '#34D399']].map(function (x) {
      return bbe("div", { key: x[0], style: { display: 'flex', alignItems: 'baseline', gap: 5 } }, bbe("span", { style: { fontFamily: BB_MONO, fontSize: 22, fontWeight: 700, color: x[2] } }, x[1]), bbe("span", { style: { fontFamily: BB_MONO, fontSize: 9, color: '#6B6B85' } }, x[0]));
    }),
    bbe("span", { style: { flex: 1 } }),
    aberta ? bbe(React.Fragment, null,
        typeof BlitzBotao !== 'undefined' && bbe(BlitzBotao, { lista: aberta.lista, linhas: escolhidas, navTo: props && props.navTo }),
        bbBotao('fechar lista', function () { setAberta(null); setFora({}); }))
      : bbe(React.Fragment, null,
        bbe("input", { value: nome, placeholder: 'nome da lista (ex.: Blitz Educação)', onChange: function (e) { setNome(e.target.value); setMsg(null); }, onKeyDown: function (e) { if (e.key === 'Enter') salvar(); },
          style: { width: 240, background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontFamily: BB_MONO, fontSize: 11, padding: '6px 8px' } }),
        bbBotao(busy ? 'salvando…' : 'Salvar lista', salvar, '#FF6B2B', { cheio: true, disabled: busy || !escolhidas.length })),
    msg && bbe("div", { style: { width: '100%', fontFamily: BB_MONO, fontSize: 10, color: msg.c } }, msg.t));

  var MAX = 300;
  var tabela = bbe("div", { style: { flex: 1, overflow: 'auto' } },
    bbe("table", { style: { width: '100%', borderCollapse: 'collapse', fontFamily: BB_MONO, fontSize: 11 } },
      bbe("thead", null, bbe("tr", { style: { position: 'sticky', top: 0, background: '#0A0A14', color: '#6B6B85', fontSize: 9, textAlign: 'left' } },
        ['', 'EMPRESA', 'SETOR', '★', 'CONTATO', 'CARGO', 'E-MAIL', 'CELULAR', 'ÚLTIMO TOQUE'].map(function (h, i) { return bbe("th", { key: i, style: { padding: '8px 10px', fontWeight: 400, borderBottom: '.5px solid #1A1A2E' } }, h); }))),
      bbe("tbody", null, filtradas.slice(0, MAX).map(function (r) {
        var dentro = !fora[r.decisor_id];
        var td = function (c, k, extra) { return bbe("td", { key: k, style: Object.assign({ padding: '6px 10px', borderBottom: '.5px solid #12121F', color: dentro ? '#C9C9D6' : '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }, extra) }, c); };
        return bbe("tr", { key: r.decisor_id },
          td(bbe("input", { type: 'checkbox', checked: dentro, onChange: function () { setFora(function (p) { var n = Object.assign({}, p); if (n[r.decisor_id]) delete n[r.decisor_id]; else n[r.decisor_id] = 1; return n; }); } }), 'c'),
          td(r.empresa, 'e', { color: dentro ? '#F5F5F5' : '#444', fontWeight: 600 }), td(r.setor || '—', 's'), td(r.estrelas ? Math.round(r.estrelas) : '', 'st', { color: '#FBBF24' }),
          td(r.nome, 'n'), td(r.cargo || '—', 'g'), td(r.email ? '✓' : '—', 'm', { color: r.email ? '#60A5FA' : '#444' }), td(r.wa ? '✓' : '—', 'w', { color: r.wa ? '#34D399' : '#444' }),
          td(r.empresa_ultimo_toque_em ? new Date(r.empresa_ultimo_toque_em).toLocaleDateString('pt-BR') : 'nunca', 't'));
      }))),
    filtradas.length > MAX && bbe("div", { style: { padding: 12, fontFamily: BB_MONO, fontSize: 10, color: '#6B6B85' } }, 'Mostrando ' + MAX + ' de ' + filtradas.length + '. A lista salva leva todos.'),
    !filtradas.length && bbe("div", { style: { padding: 24, fontFamily: BB_MONO, fontSize: 11, color: '#555' } }, 'Nenhum contato com esses filtros.'));

  var painelListas = listas.length > 0 && bbe("div", { style: { borderTop: '.5px solid #1A1A2E', padding: '10px 18px', maxHeight: 160, overflow: 'auto' } },
    rotulo('LISTAS SALVAS'),
    listas.map(function (l) {
      var n = l.crm_lista_itens && l.crm_lista_itens[0] ? l.crm_lista_itens[0].count : 0;
      return bbe("div", { key: l.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' } },
        bbe("span", { style: { fontSize: 12, color: '#F5F5F5', flex: 1 } }, l.nome),
        bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#6B6B85' } }, n + ' contatos · ' + new Date(l.criado_em).toLocaleDateString('pt-BR')),
        bbBotao('Abrir', function () { abrirLista(l); }, '#60A5FA'), bbBotao('Arquivar', function () { apagarLista(l); }));
    }));

  return bbe("div", { style: { flex: 1, display: 'flex', overflow: 'hidden' } },
    colunaFiltros,
    bbe("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }, resumoBar, tabela, painelListas));
}
