// base.js — regras puras de filtro da Base (listas, blitz, território). Carregado
// como script clássico pelo index.html (window.BaseFiltros) e importado pelos testes.
// Linhas = crm_base_contatos_v (um contato por linha, com dados da empresa).
(function (root) {
  var sem = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

  // Nível do cargo pelo texto (80% da base tem cargo_categoria = "outro").
  function nivelCargo(cargo) {
    var c = sem(cargo);
    if (!c) return 'sem cargo';
    if (/\b(ceo|cmo|cfo|coo|cto|cdo|cco|chief|presidente|president|founder|fundador|socio|owner|vp|vice[- ]?presidente)\b/.test(c)) return 'C-level';
    if (/(marketing|mkt|marca|brand|comunica|growth|digital|publicidade|midia|conteudo|content|performance|crm)/.test(c)) return 'Marketing';
    if (/(diretor|director|head|gerente geral|general manager|superintendente)/.test(c)) return 'Diretoria';
    return 'Outros';
  }
  var PESO_NIVEL = { 'C-level': 4, 'Marketing': 3, 'Diretoria': 2, 'Outros': 1, 'sem cargo': 0 };

  function diasDesde(iso, agora) { if (!iso) return Infinity; return (agora - new Date(iso).getTime()) / 864e5; }

  // f: { setores:[], estrelasMin, niveis:[], comEmail, comCelular, excluirClientes, excluirComOportunidade,
  //      semToqueDias, busca, umPorEmpresa }
  function filtrar(linhas, f, agora) {
    f = f || {}; agora = agora || Date.now();
    var setores = (f.setores || []).map(sem), niveis = f.niveis || [], q = sem(f.busca).trim();
    var saida = (linhas || []).filter(function (r) {
      if (!r || r.opt_out) return false;
      if (setores.length && setores.indexOf(sem(r.setor || 'Outros')) < 0) return false;
      if (f.estrelasMin && !(Number(r.estrelas) >= f.estrelasMin)) return false;
      if (niveis.length && niveis.indexOf(nivelCargo(r.cargo)) < 0) return false;
      if (f.comEmail && !r.email) return false;
      if (f.comCelular && !r.wa) return false;
      if (f.comEmailOuCelular && !r.email && !r.wa) return false;
      if (f.excluirClientes && r.cliente_ativo) return false;
      if (f.excluirComOportunidade && r.tem_oportunidade) return false;
      if (f.semToqueDias && diasDesde(r.empresa_ultimo_toque_em, agora) < f.semToqueDias) return false;
      if (q && sem([r.empresa, r.nome, r.cargo].join(' ')).indexOf(q) < 0) return false;
      return true;
    });
    if (f.umPorEmpresa) saida = melhorPorEmpresa(saida);
    return saida;
  }
  // Um contato por empresa: o de cargo mais alto; empate: quem tem e-mail e celular.
  function melhorPorEmpresa(linhas) {
    var porEmp = {};
    (linhas || []).forEach(function (r) {
      var k = r.empresa_id; var atual = porEmp[k];
      var nota = function (x) { return PESO_NIVEL[nivelCargo(x.cargo)] * 10 + (x.email ? 2 : 0) + (x.wa ? 1 : 0); };
      if (!atual || nota(r) > nota(atual)) porEmp[k] = r;
    });
    return Object.keys(porEmp).map(function (k) { return porEmp[k]; });
  }
  function resumo(linhas) {
    var emp = {}, email = 0, cel = 0, ambos = 0;
    (linhas || []).forEach(function (r) { emp[r.empresa_id] = 1; if (r.email) email++; if (r.wa) cel++; if (r.email && r.wa) ambos++; });
    return { empresas: Object.keys(emp).length, contatos: (linhas || []).length, comEmail: email, comCelular: cel, comAmbos: ambos };
  }
  // Contagem por setor (para os botões de filtro), maior primeiro.
  function contarSetores(linhas) {
    var c = {};
    (linhas || []).forEach(function (r) { if (r.opt_out) return; var s = r.setor || 'Outros'; c[s] = c[s] || {}; c[s][r.empresa_id] = 1; });
    return Object.keys(c).map(function (s) { return { setor: s, empresas: Object.keys(c[s]).length }; }).sort(function (a, b) { return b.empresas - a.empresas; });
  }
  // Placar: % de cada dado e uma nota geral (média ponderada).
  function notaPlacar(p) {
    if (!p || !p.empresas || !p.contatos) return { nota: 0, itens: [] };
    var pct = function (a, b) { return b ? Math.round(a / b * 100) : 0; };
    var itens = [
      { k: 'setor', label: 'Empresas com setor', v: p.empresas_com_setor, de: p.empresas, peso: 1 },
      { k: 'site', label: 'Empresas com site', v: p.empresas_com_site, de: p.empresas, peso: 1 },
      { k: 'contato', label: 'Empresas com contato', v: p.empresas_com_contato, de: p.empresas, peso: 2 },
      { k: 'email', label: 'Contatos com e-mail', v: p.contatos_com_email, de: p.contatos, peso: 2 },
      { k: 'celular', label: 'Contatos com celular', v: p.contatos_com_celular, de: p.contatos, peso: 2 },
      { k: 'cargo', label: 'Contatos com cargo', v: p.contatos_com_cargo, de: p.contatos, peso: 1 },
      { k: 'linkedin', label: 'Contatos com LinkedIn', v: p.contatos_com_linkedin, de: p.contatos, peso: 1 }
    ].map(function (i) { return Object.assign(i, { pct: pct(i.v, i.de) }); });
    var soma = itens.reduce(function (a, i) { return a + i.pct * i.peso; }, 0), pesos = itens.reduce(function (a, i) { return a + i.peso; }, 0);
    return { nota: Math.round(soma / pesos), itens: itens };
  }
  var api = { nivelCargo: nivelCargo, filtrar: filtrar, melhorPorEmpresa: melhorPorEmpresa, resumo: resumo, contarSetores: contarSetores, notaPlacar: notaPlacar };
  root.BaseFiltros = api;
})(typeof window !== 'undefined' ? window : globalThis);
