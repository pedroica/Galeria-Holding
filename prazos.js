// prazos.js — regras de prazos e reuniões (puras, sem rede). Carregado como script
// clássico pelo index.html (window.Prazos) e importado pelos testes (globalThis.Prazos).
//
// Prazo = próximo passo de uma oportunidade aberta (crm_oportunidades.proximo_passo /
// proximo_passo_em, coluna date). Reunião = linha de crm_reunioes_v.
// Datas de calendário sempre como texto 'AAAA-MM-DD' no fuso de São Paulo.
(function (root) {
  var FUSO = 'America/Sao_Paulo';
  var ENCERRADOS = { 'Perdido': 1, 'Cliente ativo': 1, 'Pausado': 1 };
  // Mais perto de fechar primeiro (para ordenar o que está sem prazo).
  var RANK = { 'Negociação': 6, 'Negociando direto': 5, 'Concorrências': 5, 'Primeira reunião': 4, 'Contato direto': 3, 'Wishlist': 1 };

  function dataBRT(d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: FUSO }); }
  function hojeBRT(agora) { return dataBRT(agora || Date.now()); }
  function somaDias(dataStr, n) { var d = new Date(dataStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diaSemana(dataStr) { return new Date(dataStr + 'T12:00:00Z').getUTCDay(); } // 0 = domingo
  // n dias úteis depois (pula sábado e domingo).
  function somaDiasUteis(dataStr, n) { var d = dataStr; var falta = n; while (falta > 0) { d = somaDias(d, 1); var w = diaSemana(d); if (w !== 0 && w !== 6) falta--; } return d; }
  function segundaDaSemana(dataStr) { var w = diaSemana(dataStr); return somaDias(dataStr, w === 0 ? -6 : 1 - w); }
  function domingoDaSemana(dataStr) { return somaDias(segundaDaSemana(dataStr), 6); }
  function precisaPrazo(estagio) { return !ENCERRADOS[estagio]; }

  // ops: oportunidades (já filtradas ou não). Só as abertas entram.
  function agruparPrazos(ops, hojeStr) {
    var fim = domingoDaSemana(hojeStr);
    var g = { vencidos: [], hoje: [], semana: [], depois: [], semPrazo: [] };
    (ops || []).forEach(function (o) {
      if (!o || o.apagado_em || !precisaPrazo(o.estagio)) return;
      var d = o.proximo_passo_em ? String(o.proximo_passo_em).slice(0, 10) : null;
      if (!d) g.semPrazo.push(o);
      else if (d < hojeStr) g.vencidos.push(o);
      else if (d === hojeStr) g.hoje.push(o);
      else if (d <= fim) g.semana.push(o);
      else g.depois.push(o);
    });
    var porData = function (a, b) { return String(a.proximo_passo_em).localeCompare(String(b.proximo_passo_em)); };
    g.vencidos.sort(porData); g.hoje.sort(porData); g.semana.sort(porData); g.depois.sort(porData);
    g.semPrazo.sort(function (a, b) { return (RANK[b.estagio] || 0) - (RANK[a.estagio] || 0) || String(a.atualizado_em || '').localeCompare(String(b.atualizado_em || '')); });
    return g;
  }
  function diasDeAtraso(dataStr, hojeStr) { return Math.round((new Date(hojeStr + 'T12:00:00Z') - new Date(String(dataStr).slice(0, 10) + 'T12:00:00Z')) / 864e5); }

  // Reuniões conseguidas na semana (meta semanal): uma por empresa.
  function reunioesDaSemana(linhas, hojeStr) {
    var seg = segundaDaSemana(hojeStr); var vistos = {}; var out = [];
    (linhas || []).forEach(function (r) {
      if (!r || !r.marcada_em || dataBRT(r.marcada_em) < seg) return;
      var k = r.empresa_id || r.id; if (vistos[k]) return; vistos[k] = 1; out.push(r);
    });
    return out;
  }
  // Próximas reuniões com data: a partir de agora, uma por empresa e dia, em ordem.
  function proximasReunioes(linhas, agora) {
    var t = agora ? new Date(agora).getTime() : Date.now(); var vistos = {};
    return (linhas || []).filter(function (r) { return r && r.reuniao_em && new Date(r.reuniao_em).getTime() >= t - 2 * 3600e3; })
      .sort(function (a, b) { return new Date(a.reuniao_em) - new Date(b.reuniao_em); })
      .filter(function (r) { var k = (r.empresa_id || r.id) + '|' + dataBRT(r.reuniao_em); if (vistos[k]) return false; vistos[k] = 1; return true; });
  }
  // Ao mudar de etapa / salvar: oportunidade aberta precisa de próximo passo com data.
  function validarProximoPasso(form) {
    if (!form || !precisaPrazo(form.estagio)) return null;
    if (!String(form.proximo_passo || '').trim()) return 'Escreva o próximo passo (o que você vai fazer).';
    if (!form.proximo_passo_em) return 'Defina a data do próximo passo.';
    return null;
  }

  var api = { FUSO: FUSO, RANK: RANK, dataBRT: dataBRT, hojeBRT: hojeBRT, somaDias: somaDias, somaDiasUteis: somaDiasUteis,
    segundaDaSemana: segundaDaSemana, domingoDaSemana: domingoDaSemana, precisaPrazo: precisaPrazo, agruparPrazos: agruparPrazos,
    diasDeAtraso: diasDeAtraso, reunioesDaSemana: reunioesDaSemana, proximasReunioes: proximasReunioes, validarProximoPasso: validarProximoPasso };
  root.Prazos = api;
})(typeof window !== 'undefined' ? window : globalThis);
