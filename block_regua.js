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

function getCoberturaEmpresa(grupoId, rank) {
  var raw;
  try { raw = JSON.parse(localStorage.getItem("gh_decisores_v3") || "{}"); }
  catch(e) { raw = {}; }

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

// ── 7. AUTO-MIGRAÇÃO (1× por sessão) ─────────────────────────────────────────
if (!window._reguaV1Migrated) {
  window._reguaV1Migrated = true;
  var _mc = migrarDecisoresV1();
  if (_mc > 0) {
    console.log("[block_regua] migrarDecisoresV1: " + _mc + " entradas migradas.");
  }
}
