// ── block_regua.js ────────────────────────────────────────────────────────────
// Carregado via loadScript() antes dos blocos React (s0 no index.html).
// Fase 1: modelo decisores/3-slots + migração idempotente + helpers de cobertura.
// Fases 2–5 usarão getCoberturaEmpresa, setDecisoresSlot e REGUA_CONFIG.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. CONFIG ─────────────────────────────────────────────────────────────────

var REGUA_CONFIG = {
  intervalo: 30,               // dias entre toques por decisor
  prioSlots: ["cmo", "gerencia", "ceo"], // ordem de disparo mensal padrão
  pesos: { potencial: 0.35, gap: 0.20, recencia: 0.25, fit: 0.20 },
};
window.REGUA_CONFIG = REGUA_CONFIG;

var SLOTS_DECISORES = ["ceo", "cmo", "gerencia"];
window.SLOTS_DECISORES = SLOTS_DECISORES;

var SLOT_LABELS = { ceo: "CEO", cmo: "CMO", gerencia: "Gerência de Mkt" };
window.SLOT_LABELS = SLOT_LABELS;

// ── 2. MAPEAMENTO CARGO → SLOT ────────────────────────────────────────────────
// Ordem importa: CEO é verificado antes de CMO antes de Gerência.
// Se um cargo caber em mais de um slot, o mais sênior vence.

var SLOT_KEYWORDS = {
  ceo: [
    "CEO", "C.E.O", "PRESIDENTE", "FUNDADOR", "CO-FUNDADOR", "COFUNDADOR",
    "SOCIO FUNDADOR", "DIRETOR EXECUTIVO", "DIRETORA EXECUTIVA",
    "DIRETOR GERAL", "DIRETORA GERAL", "MANAGING DIRECTOR", "GENERAL MANAGER",
    "OWNER", "SOCIO PROPRIETARIO", "PARTNER"
  ],
  cmo: [
    "CMO", "C.M.O", "CHIEF MARKETING", "DIRETOR DE MARKETING",
    "DIRETORA DE MARKETING", "VP MARKETING", "VP DE MARKETING",
    "VICE-PRESIDENTE DE MARKETING", "VICE PRESIDENTE DE MARKETING",
    "HEAD OF MARKETING", "HEAD DE MARKETING",
    "DIRETOR COMERCIAL", "DIRETORA COMERCIAL", "VP COMERCIAL"
  ],
  gerencia: [
    "GERENTE DE MARKETING", "GERENTE MARKETING", "GERENTE DE COMUNICACAO",
    "GERENTE COMERCIAL DE MARKETING", "HEAD MARKETING",
    "COORDENADOR DE MARKETING", "COORDENADORA DE MARKETING",
    "SUPERVISOR DE MARKETING", "GESTORA DE MARKETING", "GESTOR DE MARKETING",
    "ANALISTA SENIOR DE MARKETING", "GERENCIA DE MARKETING",
    "GERENTE DE MARCA", "GERENTE DE COMUNICACAO E MARKETING"
  ]
};
window.SLOT_KEYWORDS = SLOT_KEYWORDS;

function _rNorm(str) {
  return (str || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_.]/g, " ");
}

function mapCargoToSlot(cargo) {
  if (!cargo) return null;
  var up = _rNorm(cargo);
  for (var i = 0; i < SLOTS_DECISORES.length; i++) {
    var slot = SLOTS_DECISORES[i];
    var kws = SLOT_KEYWORDS[slot];
    for (var j = 0; j < kws.length; j++) {
      if (up.indexOf(kws[j]) !== -1) return slot;
    }
  }
  return null;
}
window.mapCargoToSlot = mapCargoToSlot;

// ── 3. MIGRAÇÃO IDEMPOTENTE ────────────────────────────────────────────────────
// Percorre gh_decisores_v3 e cria campo `decisores` onde não existe.
// Tenta mapear decisors[] e sugeridos[] existentes para os 3 slots por cargo.
// Retorna o nº de entradas recém-migradas (0 se já estava tudo migrado).

function migrarDecisoresV1() {
  var raw;
  try { raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}"); }
  catch(e) { return 0; }

  var migradas = 0;
  var keys = Object.keys(raw);

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var entry = raw[key];
    if (!entry || entry.decisores) continue; // já migrado

    var slots = { ceo: null, cmo: null, gerencia: null };
    // decisors (verificados) têm prioridade sobre sugeridos
    var todos = (entry.decisors || []).concat(entry.sugeridos || []);

    for (var j = 0; j < todos.length; j++) {
      var d = todos[j];
      var slot = mapCargoToSlot(d.cargo);
      if (slot && !slots[slot]) {
        slots[slot] = {
          nome:        d.nome       || "",
          cargo:       d.cargo      || "",
          email:       d.email      || "",
          telefone:    d.wa || d.wa2 || "",
          linkedin:    d.li         || "",
          fonte:       "manual",
          status:      d.fromMailing ? "enriquecido"
                       : d.confirmedAt ? "verificado"
                       : "pendente",
          atualizadoEm: d.confirmedAt || d.addedAt
                        || new Date().toLocaleDateString("pt-BR"),
        };
      }
    }

    entry.decisores = slots;
    migradas++;
  }

  if (migradas > 0) {
    try { localStorage.setItem("gh_decisores_v3", JSON.stringify(raw)); }
    catch(e) {}
  }
  return migradas;
}
window.migrarDecisoresV1 = migrarDecisoresV1;

// ── 4. HELPER: COBERTURA ──────────────────────────────────────────────────────
// Retorna { status, faltantes, preenchidos, slots } para uma empresa num grupo.
// status: "completa" | "parcial" | "vazia"

function getCoberturaEmpresa(grupoId, rank, rawAccs) {
  var raw = rawAccs;
  if (!raw) {
    try { raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}"); }
    catch(e) { raw = {}; }
  }
  var entry = raw[grupoId + "_" + rank];
  if (!entry || !entry.decisores) {
    return {
      status: "vazia",
      faltantes: ["ceo", "cmo", "gerencia"],
      preenchidos: 0,
      slots: { ceo: null, cmo: null, gerencia: null },
    };
  }

  var slots = entry.decisores;
  var faltantes = SLOTS_DECISORES.filter(function(s) { return !slots[s]; });
  var preenchidos = 3 - faltantes.length;
  var status = preenchidos === 3 ? "completa"
               : preenchidos > 0 ? "parcial"
               : "vazia";

  return { status: status, faltantes: faltantes, preenchidos: preenchidos, slots: slots };
}
window.getCoberturaEmpresa = getCoberturaEmpresa;

// ── 5. HELPER: ATUALIZAR SLOT ─────────────────────────────────────────────────
// Grava (ou substitui) um slot em gh_decisores_v3.
// Usado pelo enriquecimento Lusha (Fase 3) e pelo formulário manual (Fase 2).
// Retorna a entry completa atualizada.

function setDecisoresSlot(grupoId, rank, slot, dados) {
  if (SLOTS_DECISORES.indexOf(slot) === -1) {
    throw new Error("[block_regua] slot inválido: " + slot);
  }
  var raw;
  try { raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}"); }
  catch(e) { raw = {}; }

  var key = grupoId + "_" + rank;
  var entry = raw[key] || { decisors: [], sugeridos: [], activities: [] };

  if (!entry.decisores) {
    entry.decisores = { ceo: null, cmo: null, gerencia: null };
  }

  entry.decisores[slot] = Object.assign({
    nome: "", cargo: "", email: "", telefone: "", linkedin: "",
    fonte: "manual", status: "pendente",
    atualizadoEm: new Date().toLocaleDateString("pt-BR"),
  }, dados);

  raw[key] = entry;
  try { localStorage.setItem("gh_decisores_v3", JSON.stringify(raw)); }
  catch(e) {}
  return entry;
}
window.setDecisoresSlot = setDecisoresSlot;

// ── 6. ENRIQUECIMENTO LUSHA (Fase 3) ─────────────────────────────────────────
// Enriquece um slot que já tem `nome` mas falta email ou telefone.
// Retorna { ok, email, phone, entry } ou { ok:false, erro }.
// Nota: lushaEnrich(fn, ln, company) está em block0_util.js e roteia via proxy.

async function enriquecerSlotLusha(grupoId, rank, slotName, empresaNome) {
  var cob = getCoberturaEmpresa(grupoId, rank);
  var slot = cob.slots[slotName];
  if (!slot || !slot.nome.trim()) {
    return { ok: false, erro: "Slot sem nome — adicione manualmente primeiro" };
  }

  var parts = slot.nome.trim().split(/\s+/);
  var fn = parts[0] || "";
  var ln = parts.slice(1).join(" ") || "";

  try {
    if (typeof lushaEnrich !== "function") {
      return { ok: false, erro: "lushaEnrich não disponível — recarregue a página" };
    }
    var res = await lushaEnrich(fn, ln, empresaNome);
    if (!res.email && !res.phone) {
      return { ok: false, erro: "Não encontrado na Lusha" };
    }
    var atualizado = Object.assign({}, slot, {
      email:       res.email   || slot.email,
      telefone:    res.phone   || slot.telefone,
      fonte:       "lusha",
      status:      "enriquecido",
      atualizadoEm: new Date().toLocaleDateString("pt-BR"),
    });
    var entry = setDecisoresSlot(grupoId, rank, slotName, atualizado);
    return { ok: true, email: res.email, phone: res.phone, entry: entry };
  } catch(e) {
    return { ok: false, erro: String(e) };
  }
}
window.enriquecerSlotLusha = enriquecerSlotLusha;

// Modo lote: percorre todos os leads do grupo, enriquece slots com nome mas sem email/fone.
// onProgress({ total, done, ok, falhas }) é chamado a cada passo.
async function enriquecerBaseLusha(grupoId, leads, onProgress) {
  var lista = leads || (typeof PROSP !== "undefined" ? PROSP : []);

  // montar fila de tarefas (só slots com nome + dados faltando)
  var tarefas = [];
  for (var i = 0; i < lista.length; i++) {
    var lead = lista[i];
    var cob = getCoberturaEmpresa(grupoId, lead.rank);
    for (var si = 0; si < SLOTS_DECISORES.length; si++) {
      var sn = SLOTS_DECISORES[si];
      var sl = cob.slots[sn];
      if (sl && sl.nome.trim() && (!sl.email || !sl.telefone)) {
        tarefas.push({ lead: lead, slotName: sn });
      }
    }
  }

  var total = tarefas.length;
  var done = 0; var ok = 0; var falhas = [];
  if (onProgress) onProgress({ total: total, done: 0, ok: 0, falhas: [] });

  for (var j = 0; j < tarefas.length; j++) {
    var t = tarefas[j];
    var result = await enriquecerSlotLusha(grupoId, t.lead.rank, t.slotName, t.lead.nome);
    done++;
    if (result.ok) {
      ok++;
    } else {
      falhas.push({ empresa: t.lead.nome, slot: SLOT_LABELS[t.slotName] || t.slotName, erro: result.erro });
    }
    if (onProgress) onProgress({ total: total, done: done, ok: ok, falhas: falhas });
    // rate limit: ~2 req/s para não estourar cota Lusha
    await new Promise(function(r) { setTimeout(r, 500); });
  }

  return { total: total, ok: ok, falhas: falhas };
}
window.enriquecerBaseLusha = enriquecerBaseLusha;

// ── 7. FASE 4: SCORE DE PRIORIDADE (0–100) ───────────────────────────────────
// Compõe score com pesos de REGUA_CONFIG.pesos:
//   potencial (rank → porte da empresa)
//   fit       (GRUPO[id].fit(setor))
//   recencia  (dias sem contato de calcularTemperatura)
//   gap       (preenchimento dos 3 slots)

function getScorePrioridade(grupoId, rank, lead, rawAccs) {
  var pesos = REGUA_CONFIG.pesos; // { potencial, gap, recencia, fit }

  // fit
  var grupoObj = (typeof GRUPO !== "undefined" ? GRUPO : []).find(function(g){ return g.id === grupoId; });
  var fitLevel = grupoObj && lead && lead.setor ? grupoObj.fit(lead.setor) : "medio";
  var fitScore = fitLevel === "alto" ? 100 : fitLevel === "medio" ? 60 : 30;

  // potencial (rank como proxy de porte — menor rank = maior empresa)
  var r = rank || 9999;
  var potScore = r <= 50 ? 100 : r <= 200 ? 85 : r <= 1000 ? 70 : r <= 3000 ? 55 : r >= 9000 ? 50 : 40;

  // recencia (dias desde último contato — mais tempo = score maior = mais urgente)
  var raw = rawAccs;
  if (!raw) { try { raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}"); } catch(e) { raw = {}; } }
  var entry = raw[grupoId + "_" + rank];
  var dias = 0;
  if (typeof calcularTemperatura === "function" && entry) {
    var temp = calcularTemperatura(entry);
    dias = temp.diasSemContato || 0;
  }
  var recScore = Math.min(100, Math.round(dias * 100 / 60)); // 60 dias = 100pts

  // gap (qualidade da cobertura) — passa rawAccs para evitar re-parse
  var cob = typeof getCoberturaEmpresa === "function"
    ? getCoberturaEmpresa(grupoId, rank, raw)
    : { preenchidos: 0, status: "vazia" };
  var hasActivities = entry && (entry.activities || []).length > 0;
  var gapScore = cob.preenchidos === 3 ? 100 : cob.preenchidos === 2 ? 85
    : cob.preenchidos === 1 ? 65 : hasActivities ? 40 : 20;

  var score = Math.round(
    pesos.potencial * potScore +
    pesos.fit       * fitScore  +
    pesos.recencia  * recScore  +
    pesos.gap       * gapScore
  );

  return {
    score:    score,
    detalhes: { potencial: potScore, fit: fitScore, recencia: recScore, gap: gapScore },
    fitLevel: fitLevel,
    diasSemContato: dias,
  };
}
window.getScorePrioridade = getScorePrioridade;

// ── 8. FASE 5: ROTAÇÃO DE OFERTAS ────────────────────────────────────────────
// gh_regua_v1: { "{grupoId}_{rank}": { historicoOfertas:[{grupoId,anguloIdx,ofertaEm,decisorNome}], ultimoToqueEm } }

function getProximaOferta(grupoId, rank) {
  var regua = {};
  try { regua = JSON.parse(localStorage.getItem("gh_regua_v1") || "{}"); } catch(e) {}
  var key = grupoId + "_" + rank;
  var hist = (regua[key] && regua[key].historicoOfertas) || [];
  var G = typeof GRUPO !== "undefined" ? GRUPO : [];
  if (!G.length) return null;

  var usados = hist.map(function(h){ return h.grupoId; });
  var candidatos = G.filter(function(g){ return usados.indexOf(g.id) === -1; });
  if (candidatos.length === 0) { candidatos = G; } // ciclo completo → reinicia

  var next = candidatos[0];
  var grupoCount = hist.filter(function(h){ return h.grupoId === next.id; }).length;
  var angles = next.angles || ["Apresentação"];
  var anguloIdx = Math.min(grupoCount, angles.length - 1);

  return { grupo: next, angulo: angles[anguloIdx], anguloIdx: anguloIdx };
}
window.getProximaOferta = getProximaOferta;

// ── 9. DECISORES VENCIDOS (sem toque há N dias) ───────────────────────────────
function getDecisoresVencidos(grupoId, leads, intervaloDias, rawAccs) {
  var dias = intervaloDias || REGUA_CONFIG.intervalo;
  var lista = leads || (typeof PROSP !== "undefined" ? PROSP : []);
  var raw = rawAccs;
  if (!raw) { try { raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}"); } catch(e) { raw = {}; } }
  var regua = {};
  try { regua = JSON.parse(localStorage.getItem("gh_regua_v1") || "{}"); } catch(e) {}
  var agora = Date.now();
  var resultado = [];

  for (var i = 0; i < lista.length; i++) {
    var lead = lista[i];
    var key = grupoId + "_" + lead.rank;
    var entry = raw[key];
    if (!entry) continue;

    // último toque registrado na régua
    var rEntry = regua[key];
    var ultimoMs = rEntry && rEntry.ultimoToqueEm ? new Date(rEntry.ultimoToqueEm).getTime() : 0;

    // comparar com último toque das activities
    if (typeof calcularTemperatura === "function" && entry) {
      var temp = calcularTemperatura(entry);
      if (temp.diasSemContato > 0) {
        var fromAct = agora - temp.diasSemContato * 86400000;
        if (fromAct > ultimoMs) ultimoMs = fromAct;
      }
    }

    var diasDesde = ultimoMs > 0 ? Math.floor((agora - ultimoMs) / 86400000) : 999;
    if (diasDesde < dias) continue; // recentemente contatado

    // decisor prioritário (por prioSlots)
    var prio = REGUA_CONFIG.prioSlots;
    var slots = entry.decisores || { ceo: null, cmo: null, gerencia: null };
    var decisor = null; var slotName = null;
    for (var j = 0; j < prio.length; j++) {
      var sl = slots[prio[j]];
      if (sl && sl.nome) { decisor = sl; slotName = prio[j]; break; }
    }
    // fallback: decisors[] array existente
    if (!decisor && entry.decisors && entry.decisors.length > 0) {
      var d0 = entry.decisors[0];
      decisor = { nome: d0.nome, cargo: d0.cargo || "", email: d0.email || "" };
      slotName = "verificado";
    }
    if (!decisor) continue;

    // Filtrar empresas do seed que nunca foram tocadas: só exibe na régua se teve
    // atividade registrada, um decisor adicionado manualmente ou um toque na régua.
    var hasActivities = (entry.activities || []).length > 0;
    var hasManualDecisor = slots.ceo || slots.cmo || slots.gerencia ||
      (entry.decisors || []).some(function(d){ return !d.fromMailing; });
    if (!hasActivities && !hasManualDecisor && ultimoMs === 0) continue;

    var sd = typeof getScorePrioridade === "function"
      ? getScorePrioridade(grupoId, lead.rank, lead, raw) : { score: 50 };
    var oferta = typeof getProximaOferta === "function"
      ? getProximaOferta(grupoId, lead.rank) : null;

    resultado.push({ lead: lead, decisor: decisor, slotName: slotName,
                     diasDesde: diasDesde, proxOferta: oferta, score: sd.score });
  }

  resultado.sort(function(a, b){ return b.score - a.score; });
  return resultado;
}
window.getDecisoresVencidos = getDecisoresVencidos;

// ── 10. REGISTRAR TOQUE NA RÉGUA ─────────────────────────────────────────────
function registrarToque(grupoId, rank, grupoOfertaId, anguloIdx, decisorNome) {
  var regua = {};
  try { regua = JSON.parse(localStorage.getItem("gh_regua_v1") || "{}"); } catch(e) {}
  var key = grupoId + "_" + rank;
  if (!regua[key]) regua[key] = { historicoOfertas: [], ultimoToqueEm: "" };
  regua[key].historicoOfertas = (regua[key].historicoOfertas || []).concat([{
    grupoId:     grupoOfertaId,
    anguloIdx:   anguloIdx || 0,
    ofertaEm:    new Date().toISOString().slice(0, 10),
    decisorNome: decisorNome || "",
  }]);
  regua[key].ultimoToqueEm = new Date().toISOString();
  try { localStorage.setItem("gh_regua_v1", JSON.stringify(regua)); } catch(e) {}
}
window.registrarToque = registrarToque;

// ── 11. AUTO-MIGRAÇÃO (1× por sessão) ────────────────────────────────────────
if (!window._reguaV1Migrated) {
  window._reguaV1Migrated = true;
  var _mc = migrarDecisoresV1();
  if (_mc > 0) {
    console.log("[block_regua] migrarDecisoresV1: " + _mc + " entradas migradas.");
  }
}
