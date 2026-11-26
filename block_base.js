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
    bbe("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }, resumoBar, tabela, painelListas, bbe(BlitzAnteriores, { navTo: props && props.navTo })));
}

// ── Blitz ─────────────────────────────────────────────────────────────────────
// Lista aberta → "⚡ Blitz" → tema + quem assina → a IA escreve e-mail e WhatsApp
// por contato (job blitz-redacao) → revisar/editar → aprovar em lote → rascunhos no
// Gmail → "Enviar e-mails" (clique, com confirmação) e WhatsApps em sequência.
function bbApi(path, opts) {
  var jwt = (window.__supaSession && window.__supaSession.access_token) || '';
  return fetch(path, Object.assign({}, opts, { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt } })).then(function (r) { return r.json().catch(function () { return null; }); });
}
function bbRpc(nome, args) { return supaFetch('/rest/v1/rpc/' + nome, { method: 'POST', body: JSON.stringify(args || {}) }); }

function BlitzBotao(props) {
  var _o = React.useState(false); var aberto = _o[0]; var setAberto = _o[1];
  var rs = window.BaseFiltros ? window.BaseFiltros.resumo(props.linhas || []) : { comEmail: 0, comCelular: 0 };
  return bbe(React.Fragment, null,
    bbBotao('⚡ Blitz com esta lista', function () { setAberto(true); }, '#FF6B2B', { cheio: true, title: rs.comEmail + ' com e-mail, ' + rs.comCelular + ' com celular' }),
    aberto && bbe(BlitzPainel, { lista: props.lista, linhas: props.linhas, navTo: props.navTo, onClose: function () { setAberto(false); } }));
}

function BlitzPainel(props) {
  var lista = props.lista || {};
  var rs = window.BaseFiltros ? window.BaseFiltros.resumo(props.linhas || []) : { comEmail: 0, comCelular: 0, contatos: 0 };
  var _bid = React.useState(props.blitzId || null); var blitzId = _bid[0]; var setBlitzId = _bid[1];
  var _cfg = React.useState({ nome: lista.nome || 'Blitz', tema: '', agencia: '', email: true, whatsapp: true }); var cfg = _cfg[0]; var setCfg = _cfg[1];
  var _ags = React.useState([]); var ags = _ags[0]; var setAgs = _ags[1];
  var _bz = React.useState(null); var bz = _bz[0]; var setBz = _bz[1];
  var _msgs = React.useState([]); var msgs = _msgs[0]; var setMsgs = _msgs[1];
  var _sel = React.useState({}); var sel = _sel[0]; var setSel = _sel[1];
  var _err = React.useState(null); var erro = _err[0]; var setErro = _err[1];
  var _busy = React.useState(false); var busy = _busy[0]; var setBusy = _busy[1];
  var _envio = React.useState(null); var envio = _envio[0]; var setEnvio = _envio[1];
  var parar = React.useRef(false);

  React.useEffect(function () {
    supaFetch('/rest/v1/crm_agencias?select=id,nome,slug&order=nome.asc').then(function (r) {
      var a = Array.isArray(r) ? r : []; setAgs(a);
      var h = a.find(function (x) { return x.slug === 'holding'; }); if (h) setCfg(function (c) { return c.agencia ? c : Object.assign({}, c, { agencia: h.id }); });
    });
  }, []);
  function recarregar() {
    if (!blitzId) return;
    supaFetch('/rest/v1/crm_blitz?id=eq.' + blitzId + '&select=*').then(function (r) { if (Array.isArray(r) && r[0]) setBz(r[0]); });
    supaFetch('/rest/v1/crm_fila?blitz_id=eq.' + blitzId + '&select=id,canal,assunto,corpo,status,outlook_message_id,decisor_id,empresa_id,contexto_para_aprovacao,rascunho_erro,crm_decisores!decisor_id(nome,cargo,email,wa),crm_empresas!empresa_id(nome)&order=gerado_em.asc&limit=2000')
      .then(function (r) {
        var m = Array.isArray(r) ? r : []; setMsgs(m);
        setSel(function (s) { var n = Object.assign({}, s); m.forEach(function (x) { if (!(x.id in n)) n[x.id] = x.status === 'rascunho' && !/⚠/.test(x.contexto_para_aprovacao || ''); }); return n; });
      });
  }
  React.useEffect(function () { recarregar(); var t = setInterval(recarregar, 4000); return function () { clearInterval(t); }; }, [blitzId]);

  function iniciar() {
    var canais = []; if (cfg.email) canais.push('email'); if (cfg.whatsapp) canais.push('whatsapp');
    if (!cfg.tema.trim()) { setErro('Escreva o tema: sobre o que é a conversa e por que agora.'); return; }
    if (!canais.length) { setErro('Escolha e-mail, WhatsApp ou os dois.'); return; }
    setBusy(true); setErro(null);
    bbRpc('blitz_iniciar', { p_lista: lista.id, p_nome: cfg.nome, p_tema: cfg.tema, p_agencia: cfg.agencia || null, p_canais: canais }).then(function (r) {
      setBusy(false);
      if (r && r.id) setBlitzId(r.id); else setErro((r && r.message) || 'Não começou.');
    }).catch(function (e) { setBusy(false); setErro(e.message); });
  }
  function salvarCampo(m, campo, valor) {
    if (m.status !== 'rascunho' || m[campo] === valor) return;
    supaFetch('/rest/v1/crm_fila?id=eq.' + m.id + '&status=eq.rascunho', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify((function () { var o = {}; o[campo] = valor; return o; })()) }).then(recarregar);
  }
  var rascunhos = msgs.filter(function (m) { return m.status === 'rascunho'; });
  var selecionadas = rascunhos.filter(function (m) { return sel[m.id]; });
  function aprovar() {
    if (!selecionadas.length) return;
    setBusy(true); setErro(null);
    var agora = new Date().toISOString(); var ids = selecionadas.map(function (m) { return m.id; });
    supaFetch('/rest/v1/crm_fila?id=in.(' + ids.join(',') + ')&status=eq.rascunho', { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'aprovado', aprovado_em: agora, decisao: 'aprovado', decisao_em: agora, decisao_por: bbEmail() }) })
      .then(function () { return selecionadas.some(function (m) { return m.canal === 'email'; }) ? bbRpc('blitz_criar_rascunhos', {}) : null; })
      .then(function () { setBusy(false); recarregar(); })
      .catch(function (e) { setBusy(false); setErro('Não aprovou: ' + e.message); });
  }
  function descartarResto() {
    var resto = rascunhos.filter(function (m) { return !sel[m.id]; });
    if (!resto.length || !window.confirm('Descartar ' + resto.length + ' mensagem(ns) não selecionada(s)? Elas não serão enviadas.')) return;
    supaFetch('/rest/v1/crm_fila?id=in.(' + resto.map(function (m) { return m.id; }).join(',') + ')&status=eq.rascunho', { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'pulado', motivo_pulo: 'descartado na blitz', decisao: 'rejeitado', decisao_em: new Date().toISOString(), decisao_por: bbEmail(), decisao_motivo: 'descartado na revisão da blitz' }) }).then(recarregar);
  }
  var emailsAprov = msgs.filter(function (m) { return m.canal === 'email' && m.status === 'aprovado'; });
  var prontos = emailsAprov.filter(function (m) { return m.outlook_message_id; });
  var waAprov = msgs.filter(function (m) { return m.canal === 'whatsapp' && m.status === 'aprovado'; });
  var enviados = msgs.filter(function (m) { return m.status === 'enviado'; });
  function enviarEmails() {
    if (!prontos.length) return;
    if (!window.confirm('Enviar ' + prontos.length + ' e-mail(s) agora pelo seu Gmail, um a cada 1 a 2 minutos? Mantenha esta tela aberta. Você pode parar a qualquer momento.')) return;
    parar.current = false; var i = 0; var lst = prontos.slice(); setEnvio({ feitos: 0, total: lst.length, erros: 0 });
    (function prox() {
      if (parar.current || i >= lst.length) { setEnvio(function (e) { return e ? Object.assign({}, e, { fim: true }) : e; }); recarregar(); return; }
      var it = lst[i++];
      bbApi('/api/enrich?provider=gmail-send', { method: 'POST', body: JSON.stringify({ fila_id: it.id, outlook_message_id: it.outlook_message_id, decisor_id: it.decisor_id, empresa_id: it.empresa_id, assunto: it.assunto }) })
        .then(function (r) { return r && r.enviado; }).catch(function () { return false; })
        .then(function (ok) {
          setEnvio(function (e) { return Object.assign({}, e, { feitos: i, erros: (e.erros || 0) + (ok ? 0 : 1) }); }); recarregar();
          if (i < lst.length && !parar.current) setTimeout(prox, 60000 + Math.random() * 60000); else prox();
        });
    })();
  }
  function abrirWhats() {
    try { localStorage.setItem('gh_fila_tab', 'whatsapp'); } catch (_) {}
    props.onClose && props.onClose(); props.navTo && props.navTo('fila');
  }

  var inp = { width: '100%', boxSizing: 'border-box', background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontFamily: BB_MONO, fontSize: 11, padding: '7px 9px' };
  var titulo = function (t) { return bbe("div", { style: { fontFamily: BB_MONO, fontSize: 9, color: '#6B6B85', letterSpacing: '.5px', margin: '14px 0 6px' } }, t); };

  var config = bbe("div", null,
    bbe("div", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#C9C9D6', lineHeight: 1.6 } },
      'Lista "' + (lista.nome || '') + '": ' + rs.contatos + ' contatos · ' + rs.comEmail + ' com e-mail · ' + rs.comCelular + ' com celular. ',
      'A IA escreve uma mensagem para cada pessoa. Nada é enviado sem você: você revisa, aprova e envia.'),
    titulo('NOME DA BLITZ'), bbe("input", { value: cfg.nome, onChange: function (e) { setCfg(Object.assign({}, cfg, { nome: e.target.value })); }, style: inp }),
    titulo('TEMA: sobre o que é a conversa e por que agora'),
    bbe("textarea", { value: cfg.tema, rows: 4, placeholder: 'Ex.: captação de alunos 2027. A GAIA fez a campanha de matrícula do Colégio X com IA (+20% inscrições). Quero 20 minutos para mostrar como ficaria para eles.',
      onChange: function (e) { setCfg(Object.assign({}, cfg, { tema: e.target.value })); setErro(null); }, style: Object.assign({ resize: 'vertical' }, inp) }),
    titulo('QUEM ASSINA'),
    bbe("select", { value: cfg.agencia, onChange: function (e) { setCfg(Object.assign({}, cfg, { agencia: e.target.value })); }, style: inp },
      ags.map(function (a) { return bbe("option", { key: a.id, value: a.id }, a.nome); })),
    titulo('CANAIS'),
    bbe("div", { style: { display: 'flex', gap: 16 } },
      bbe("label", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#C9C9D6' } }, bbe("input", { type: 'checkbox', checked: cfg.email, onChange: function (e) { setCfg(Object.assign({}, cfg, { email: e.target.checked })); } }), ' E-mail (' + rs.comEmail + ')'),
      bbe("label", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#C9C9D6' } }, bbe("input", { type: 'checkbox', checked: cfg.whatsapp, onChange: function (e) { setCfg(Object.assign({}, cfg, { whatsapp: e.target.checked })); } }), ' WhatsApp (' + rs.comCelular + ')')),
    bbe("div", { style: { marginTop: 18, display: 'flex', gap: 8 } },
      bbBotao(busy ? 'começando…' : 'Escrever as mensagens', iniciar, '#FF6B2B', { cheio: true, grande: true, disabled: busy })));

  function cartao(grupo) {
    var d = grupo.itens[0];
    return bbe("div", { key: grupo.k, style: { border: '.5px solid #1A1A2E', borderRadius: 6, padding: '10px 12px', marginBottom: 8, background: '#0A0A14' } },
      bbe("div", { style: { fontSize: 12, color: '#F5F5F5', fontWeight: 600, marginBottom: 6 } }, ((d.crm_empresas || {}).nome || '—') + ' · ' + ((d.crm_decisores || {}).nome || '') + (((d.crm_decisores || {}).cargo) ? ' (' + d.crm_decisores.cargo + ')' : '')),
      /⚠/.test(d.contexto_para_aprovacao || '') && bbe("div", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#FBBF24', marginBottom: 6 } }, d.contexto_para_aprovacao.split('⚠')[1]),
      grupo.itens.map(function (m) {
        var edit = m.status === 'rascunho';
        var est = { rascunho: 'para revisar', aprovado: m.canal === 'email' ? (m.outlook_message_id ? 'rascunho no Gmail ✓' : 'criando rascunho no Gmail…') : 'aprovado: abrir na Fila', enviado: 'enviado ✓', pulado: 'descartado' }[m.status] || m.status;
        return bbe("div", { key: m.id, style: { display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 } },
          bbe("input", { type: 'checkbox', disabled: !edit, checked: edit ? !!sel[m.id] : m.status !== 'pulado', onChange: function () { setSel(Object.assign({}, sel, (function () { var o = {}; o[m.id] = !sel[m.id]; return o; })())); }, style: { marginTop: 3 } }),
          bbe("div", { style: { flex: 1 } },
            bbe("div", { style: { fontFamily: BB_MONO, fontSize: 9, color: m.canal === 'email' ? '#60A5FA' : '#34D399', marginBottom: 3 } }, (m.canal === 'email' ? 'E-MAIL' : 'WHATSAPP') + ' · ' + est + (m.rascunho_erro ? ' · erro: ' + m.rascunho_erro : '')),
            m.canal === 'email' && bbe("input", { defaultValue: m.assunto || '', disabled: !edit, onBlur: function (e) { salvarCampo(m, 'assunto', e.target.value); }, style: Object.assign({}, inp, { marginBottom: 4, opacity: edit ? 1 : .7 }) }),
            bbe("textarea", { defaultValue: m.corpo || '', disabled: !edit, rows: m.canal === 'email' ? 5 : 3, onBlur: function (e) { salvarCampo(m, 'corpo', e.target.value); }, style: Object.assign({ resize: 'vertical', opacity: edit ? 1 : .7 }, inp) })));
      }));
  }
  var grupos = []; var idx = {};
  msgs.forEach(function (m) { var k = m.decisor_id; if (!(k in idx)) { idx[k] = grupos.length; grupos.push({ k: k, itens: [] }); } grupos[idx[k]].itens.push(m); });
  grupos.forEach(function (g) { g.itens.sort(function (a, b) { return a.canal === 'email' ? -1 : 1; }); });

  var revisao = bz && bbe("div", null,
    bbe("div", { style: { display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 } },
      bbe("span", { style: { fontFamily: BB_MONO, fontSize: 12, color: '#F5F5F5', fontWeight: 700 } }, bz.nome),
      bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: bz.status === 'escrevendo' ? '#FBBF24' : '#34D399' } },
        bz.status === 'escrevendo' ? 'Escrevendo… ' + (bz.escritos || 0) + ' de ' + bz.total + ' contatos' : 'Pronta: ' + (bz.escritos || 0) + ' contatos com mensagem' + (bz.pulados ? ' · ' + bz.pulados + ' fora (sem canal, bloqueado ou inválido)' : '')),
      bbe("span", { style: { fontFamily: BB_MONO, fontSize: 9, color: '#555' } }, 'IA US$ ' + Number(bz.custo_usd || 0).toFixed(2))),
    bbe("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0', borderTop: '.5px solid #1A1A2E', borderBottom: '.5px solid #1A1A2E', marginBottom: 10, alignItems: 'center' } },
      rascunhos.length > 0 && bbBotao(busy ? 'aprovando…' : '✓ Aprovar selecionadas (' + selecionadas.length + ')', aprovar, '#34D399', { cheio: true, disabled: busy || !selecionadas.length }),
      rascunhos.length > selecionadas.length && bbBotao('Descartar não selecionadas', descartarResto, '#E24B4A'),
      emailsAprov.length > 0 && bbBotao(envio && !envio.fim ? 'Enviando ' + envio.feitos + '/' + envio.total + '…' : '✉ Enviar e-mails (' + prontos.length + ' prontos no Gmail)', enviarEmails, '#818CF8', { cheio: true, disabled: !prontos.length || (envio && !envio.fim) }),
      envio && !envio.fim && bbBotao('parar', function () { parar.current = true; }, '#E24B4A'),
      waAprov.length > 0 && bbBotao('💬 Abrir WhatsApps em sequência (' + waAprov.length + ')', abrirWhats, '#34D399'),
      enviados.length > 0 && bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#34D399' } }, enviados.length + ' enviados'),
      envio && envio.fim && bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: envio.erros ? '#FBBF24' : '#34D399' } }, 'Envio terminado: ' + (envio.feitos - (envio.erros || 0)) + ' enviados' + (envio.erros ? ', ' + envio.erros + ' com erro' : ''))),
    emailsAprov.length > prontos.length && bbe("div", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#6B6B85', marginBottom: 8 } }, 'Criando os rascunhos no seu Gmail (' + prontos.length + '/' + emailsAprov.length + ')… leva um minuto.'),
    grupos.length === 0 && bbe("div", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#555', padding: 20 } }, 'A IA está escrevendo as primeiras mensagens…'),
    grupos.map(cartao));

  return bbe("div", { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 900, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflow: 'auto' },
      onClick: function (e) { if (e.target === e.currentTarget && !(envio && !envio.fim)) props.onClose && props.onClose(); } },
    bbe("div", { style: { width: 'min(860px,100%)', background: '#0D0D1A', border: '.5px solid #2D2D44', borderRadius: 10, padding: '18px 22px' } },
      bbe("div", { style: { display: 'flex', alignItems: 'center', marginBottom: 12 } },
        bbe("span", { style: { fontFamily: BB_MONO, fontSize: 12, color: '#FF6B2B', fontWeight: 700, letterSpacing: '.5px', flex: 1 } }, '⚡ BLITZ'),
        bbBotao('fechar', function () { if (envio && !envio.fim && !window.confirm('O envio para se você fechar. Fechar mesmo?')) return; parar.current = true; props.onClose && props.onClose(); })),
      erro && bbe("div", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#E24B4A', marginBottom: 8 } }, erro),
      blitzId ? revisao || bbe("div", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#555' } }, 'Carregando…') : config));
}

// Blitz já feitas (para voltar a uma delas).
function BlitzAnteriores(props) {
  var _b = React.useState([]); var lst = _b[0]; var setLst = _b[1];
  var _a = React.useState(null); var aberta = _a[0]; var setAberta = _a[1];
  React.useEffect(function () { supaFetch('/rest/v1/crm_blitz?apagado_em=is.null&select=id,nome,status,total,escritos,criado_em,crm_listas(nome)&order=criado_em.desc&limit=20').then(function (r) { setLst(Array.isArray(r) ? r : []); }); }, []);
  if (!lst.length) return null;
  return bbe("div", { style: { borderTop: '.5px solid #1A1A2E', padding: '10px 18px', maxHeight: 140, overflow: 'auto' } },
    bbe("div", { style: { fontFamily: BB_MONO, fontSize: 9, color: '#6B6B85', letterSpacing: '.5px', marginBottom: 6 } }, 'BLITZ FEITAS'),
    lst.map(function (b) {
      return bbe("div", { key: b.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' } },
        bbe("span", { style: { fontSize: 12, color: '#F5F5F5', flex: 1 } }, '⚡ ' + b.nome),
        bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#6B6B85' } }, (b.status === 'escrevendo' ? 'escrevendo' : b.escritos + ' contatos') + ' · ' + new Date(b.criado_em).toLocaleDateString('pt-BR')),
        bbBotao('Abrir', function () { setAberta(b); }, '#60A5FA'));
    }),
    aberta && bbe(BlitzPainel, { blitzId: aberta.id, lista: { nome: (aberta.crm_listas || {}).nome }, linhas: [], navTo: props.navTo, onClose: function () { setAberta(null); } }));
}

// ── Cadastro rápido ───────────────────────────────────────────────────────────
// Escreva ("o João Lopes é CMO do Lopes Supermercado") ou anexe lista de evento,
// planilha, PDF ou foto de cartão. A IA separa pessoas e empresas, acha o que já
// existe, você confere e cadastra; o Lusha completa e-mail, cargo e LinkedIn
// (celular só se marcar) dentro do teto diário. Depois: blitz para eles.
function bbArquivoParaEnvio(file) {
  return new Promise(function (ok, erro) {
    var nome = file.name || ''; var tipo = file.type || '';
    var leitor = new FileReader();
    if (/\.(xlsx|xls)$/i.test(nome)) {
      var carregar = window.XLSX ? Promise.resolve() : new Promise(function (r, e) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = r; s.onerror = function () { e(new Error('não carregou o leitor de planilha')); }; document.head.appendChild(s); });
      carregar.then(function () {
        leitor.onload = function () { try { var wb = window.XLSX.read(new Uint8Array(leitor.result), { type: 'array' }); ok({ texto: wb.SheetNames.slice(0, 3).map(function (n) { return window.XLSX.utils.sheet_to_csv(wb.Sheets[n]); }).join('\n').slice(0, 60000) }); } catch (e) { erro(e); } };
        leitor.readAsArrayBuffer(file);
      }).catch(erro);
    } else if (/\.(csv|txt|tsv)$/i.test(nome) || /^text\//.test(tipo)) {
      leitor.onload = function () { ok({ texto: String(leitor.result).slice(0, 60000) }); }; leitor.readAsText(file);
    } else if (/pdf/i.test(tipo) || /\.pdf$/i.test(nome) || /^image\//.test(tipo)) {
      if (file.size > 3e6) { erro(new Error('arquivo grande demais (máx. 3 MB)')); return; }
      leitor.onload = function () { ok({ arquivo: { nome: nome, tipo: /\.pdf$/i.test(nome) ? 'application/pdf' : tipo, base64: String(leitor.result).split(',')[1] } }); }; leitor.readAsDataURL(file);
    } else erro(new Error('formato não aceito: use texto, CSV, XLSX, PDF ou imagem'));
  });
}

function CapturaView(props) {
  var _t = React.useState(''); var texto = _t[0]; var setTexto = _t[1];
  var _a = React.useState(null); var arq = _a[0]; var setArq = _a[1];
  var _it = React.useState(null); var itens = _it[0]; var setItens = _it[1];
  var _s = React.useState(null); var saldo = _s[0]; var setSaldo = _s[1];
  var _b = React.useState(null); var busy = _b[0]; var setBusy = _b[1];
  var _e = React.useState(null); var erro = _e[0]; var setErro = _e[1];
  var _r = React.useState(null); var result = _r[0]; var setResult = _r[1];
  var _bl = React.useState(null); var blitz = _bl[0]; var setBlitz = _bl[1];

  function ler() {
    setErro(null); setResult(null);
    if (!texto.trim() && !arq) { setErro('Escreva algo ou anexe um arquivo.'); return; }
    setBusy('lendo');
    (arq ? bbArquivoParaEnvio(arq) : Promise.resolve({})).then(function (extra) {
      var corpo = { texto: [texto, extra.texto || ''].filter(Boolean).join('\n\n') };
      if (extra.arquivo) corpo.arquivo = extra.arquivo;
      return bbApi('/api/enrich?provider=captura-ler', { method: 'POST', body: JSON.stringify(corpo) });
    }).then(function (r) {
      setBusy(null);
      if (!r || r.error) { setErro((r && r.error) || 'Não consegui ler.'); return; }
      setSaldo(r.saldo);
      setItens((r.itens || []).map(function (x, i) {
        var pm = x.pessoa_match;
        return Object.assign({}, x, { k: i, incluir: !!(x.nome || x.empresa), empresa_id: x.empresa_match && x.empresa_match.confianca !== 'baixa' ? x.empresa_match.id : null,
          decisor_id: pm ? pm.id : null, enriquecer: !(x.email || (pm && pm.email)), celular_lusha: false });
      }));
    }).catch(function (e) { setBusy(null); setErro(e.message); });
  }
  function muda(k, campo, v) { setItens(itens.map(function (x) { if (x.k !== k) return x; var n = Object.assign({}, x); n[campo] = v; return n; })); }
  var escolhidos = (itens || []).filter(function (x) { return x.incluir; });
  var custo = escolhidos.reduce(function (a, x) { return a + (x.enriquecer ? 1 + (x.celular_lusha ? 5 : 0) : 0); }, 0);
  function cadastrar() {
    if (!escolhidos.length) return;
    setBusy('gravando'); setErro(null);
    bbApi('/api/enrich?provider=captura-gravar', { method: 'POST', body: JSON.stringify({ itens: escolhidos.map(function (x) {
      return { nome: x.nome, cargo: x.cargo, empresa: x.empresa, email: x.email, celular: x.celular, linkedin: x.linkedin, observacao: x.observacao,
        empresa_id: x.empresa_id, decisor_id: x.decisor_id, enriquecer: x.enriquecer, celular_lusha: x.celular_lusha };
    }) }) }).then(function (r) {
      setBusy(null);
      if (!r || r.error) { setErro((r && r.error) || 'Não cadastrou.'); return; }
      setResult(r.resultados || []); setSaldo(r.saldo); setItens(null); setTexto(''); setArq(null);
    }).catch(function (e) { setBusy(null); setErro(e.message); });
  }
  function blitzParaEles() {
    var ids = (result || []).filter(function (x) { return x.decisor_id; });
    if (!ids.length) return;
    var nome = 'Cadastro rápido ' + new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    supaFetch('/rest/v1/crm_listas', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ nome: nome, filtros: { origem: 'cadastro rapido' }, criado_por: bbEmail() }) })
      .then(function (r) { var l = r && r[0]; if (!l) throw new Error('não criou a lista');
        return supaFetch('/rest/v1/crm_lista_itens', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(ids.map(function (x) { return { lista_id: l.id, decisor_id: x.decisor_id, empresa_id: x.empresa_id }; })) }).then(function () { return l; }); })
      .then(function (l) { setBlitz({ lista: l }); })
      .catch(function (e) { setErro(e.message); });
  }

  var inp = { background: '#060610', border: '.5px solid #2D2D44', borderRadius: 4, color: '#F5F5F5', fontFamily: BB_MONO, fontSize: 11, padding: '5px 7px', boxSizing: 'border-box', width: '100%' };
  var celula = function (x, campo, w) { return bbe("td", { style: { padding: '4px 6px', minWidth: w } }, bbe("input", { value: x[campo] || '', onChange: function (e) { muda(x.k, campo, e.target.value); }, style: inp })); };
  return bbe("div", { style: { flex: 1, overflow: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 } },
    bbe("div", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#C9C9D6', lineHeight: 1.6 } },
      'Escreva quem você conheceu ou anexe a lista do evento, uma planilha, um PDF ou a foto de um cartão. Eu acho quem já está na base, cadastro o que é novo e completo no Lusha.'),
    bbe("textarea", { value: texto, rows: 5, placeholder: 'Ex.: Fui no evento da ABA. O João Lopes é CMO do Lopes Supermercado (joao.lopes@lopes.com.br). A Marina Costa cuida de marca na Natura.',
      onChange: function (e) { setTexto(e.target.value); setErro(null); }, style: Object.assign({}, inp, { fontSize: 12, padding: '10px 12px', resize: 'vertical' }) }),
    bbe("div", { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
      bbe("label", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#60A5FA', cursor: 'pointer', border: '.5px dashed #2D2D44', borderRadius: 4, padding: '6px 10px' } },
        arq ? '📎 ' + arq.name : '📎 anexar arquivo (CSV, XLSX, PDF, foto)',
        bbe("input", { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xls,.pdf,image/*', style: { display: 'none' }, onChange: function (e) { setArq(e.target.files && e.target.files[0] || null); setErro(null); } })),
      arq && bbBotao('tirar arquivo', function () { setArq(null); }),
      bbBotao(busy === 'lendo' ? 'lendo…' : 'Ler e achar na base', ler, '#FF6B2B', { cheio: true, disabled: !!busy }),
      saldo && bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#6B6B85' } }, 'Lusha hoje: ' + saldo.usados + ' de ' + saldo.teto + ' créditos usados')),
    erro && bbe("div", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#E24B4A' } }, erro),
    itens && bbe("div", null,
      bbe("div", { style: { fontFamily: BB_MONO, fontSize: 10, color: '#6B6B85', marginBottom: 6 } }, itens.length + ' encontrado(s). Confira, corrija o que precisar e cadastre.'),
      bbe("div", { style: { overflow: 'auto' } }, bbe("table", { style: { borderCollapse: 'collapse', fontFamily: BB_MONO, fontSize: 10, width: '100%' } },
        bbe("thead", null, bbe("tr", { style: { color: '#6B6B85', textAlign: 'left' } }, ['', 'NOME', 'CARGO', 'EMPRESA', 'NA BASE', 'E-MAIL', 'CELULAR', 'LINKEDIN', 'LUSHA', 'CELULAR (5 cr.)'].map(function (h, i) { return bbe("th", { key: i, style: { padding: '4px 6px', fontWeight: 400 } }, h); }))),
        bbe("tbody", null, itens.map(function (x) {
          var em = x.empresa_match, pm = x.pessoa_match;
          return bbe("tr", { key: x.k, style: { opacity: x.incluir ? 1 : .45, borderTop: '.5px solid #1A1A2E' } },
            bbe("td", { style: { padding: '4px 6px' } }, bbe("input", { type: 'checkbox', checked: x.incluir, onChange: function (e) { muda(x.k, 'incluir', e.target.checked); } })),
            celula(x, 'nome', 130), celula(x, 'cargo', 110), celula(x, 'empresa', 140),
            bbe("td", { style: { padding: '4px 6px', color: pm ? '#34D399' : em ? '#60A5FA' : '#FBBF24', whiteSpace: 'nowrap' } },
              pm ? 'pessoa já existe' : em ? (x.empresa_id ? 'empresa: ' + em.nome : bbe("label", null, bbe("input", { type: 'checkbox', checked: false, onChange: function () { muda(x.k, 'empresa_id', em.id); } }), ' é "' + em.nome + '"?')) : 'empresa nova'),
            celula(x, 'email', 150), celula(x, 'celular', 110), celula(x, 'linkedin', 120),
            bbe("td", { style: { padding: '4px 6px', textAlign: 'center' } }, bbe("input", { type: 'checkbox', checked: x.enriquecer, onChange: function (e) { muda(x.k, 'enriquecer', e.target.checked); } })),
            bbe("td", { style: { padding: '4px 6px', textAlign: 'center' } }, bbe("input", { type: 'checkbox', checked: x.celular_lusha, disabled: !x.enriquecer, onChange: function (e) { muda(x.k, 'celular_lusha', e.target.checked); } })));
        })))),
      bbe("div", { style: { display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' } },
        bbBotao(busy === 'gravando' ? 'cadastrando e enriquecendo…' : 'Cadastrar (' + escolhidos.length + ')', cadastrar, '#34D399', { cheio: true, disabled: !!busy || !escolhidos.length }),
        bbe("span", { style: { fontFamily: BB_MONO, fontSize: 10, color: saldo && custo > saldo.restantes ? '#FBBF24' : '#6B6B85' } },
          'Lusha: até ' + custo + ' crédito(s)' + (saldo ? ' · restam ' + saldo.restantes + ' hoje' + (custo > saldo.restantes ? ' (o que passar fica para o enriquecimento diário)' : '') : '')))),
    result && bbe("div", { style: { background: '#0A0A14', border: '.5px solid #1A1A2E', borderRadius: 8, padding: '12px 14px' } },
      bbe("div", { style: { fontFamily: BB_MONO, fontSize: 11, color: '#34D399', marginBottom: 8 } },
        '✓ ' + result.filter(function (x) { return x.decisor_id; }).length + ' contato(s) na base · ' + result.filter(function (x) { return x.criou_pessoa; }).length + ' novo(s) · ' + result.filter(function (x) { return x.criou_empresa; }).length + ' empresa(s) nova(s)'),
      result.map(function (x, i) {
        var en = x.enriquecido || {}; var ganhos = ['email', 'celular', 'cargo', 'linkedin'].filter(function (k) { return en[k]; });
        return bbe("div", { key: i, style: { fontFamily: BB_MONO, fontSize: 10, color: '#C9C9D6', padding: '2px 0' } },
          (x.nome || '(só empresa)') + ' · ' + (x.empresa || '') + (ganhos.length ? ' · Lusha trouxe: ' + ganhos.join(', ') : '') + (x.erro ? ' · ' + x.erro : ''));
      }),
      result.some(function (x) { return x.decisor_id; }) && bbe("div", { style: { marginTop: 10 } }, bbBotao('⚡ Escrever mensagens para eles', blitzParaEles, '#FF6B2B', { cheio: true }))),
    blitz && bbe(BlitzPainel, { lista: blitz.lista, linhas: [], navTo: props && props.navTo, onClose: function () { setBlitz(null); } }));
}
