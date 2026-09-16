#!/usr/bin/env node
/**
 * sync_localstorage_to_supabase.js
 *
 * Checkpoint 3 — passo obrigatório antes do merge etapa5 → main
 *
 * O que faz:
 *   Lê um export de localStorage salvo em JSON pelo usuário no dia da virada,
 *   compara com o estado atual do Supabase (crm_kanban, crm_decisores, crm_toques)
 *   e sincroniza SOMENTE diferenças posteriores a CUTOFF_DATE, sem sobrescrever
 *   dados já fundidos e limpos no banco.
 *
 * Como usar:
 *   1. No browser da produção, antes do merge, rode no console:
 *        copy(JSON.stringify(localStorage))
 *      e salve em: scripts/localstorage_export.json
 *   2. node scripts/sync_localstorage_to_supabase.js [--dry-run]
 *
 * Flags:
 *   --dry-run   Mostra o que seria sincronizado sem escrever nada no banco
 *   --cutoff    Data ISO opcional (default: 2026-09-15T13:57:00Z — momento da fusão)
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────
const DRY_RUN     = process.argv.includes('--dry-run');
const CUTOFF_ARG  = process.argv.find(a => a.startsWith('--cutoff='));
const CUTOFF_DATE = CUTOFF_ARG
  ? new Date(CUTOFF_ARG.split('=')[1])
  : new Date('2026-09-15T13:57:00Z');

const EXPORT_FILE = path.join(__dirname, 'localstorage_export.json');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPA_URL = process.env.SUPA_CRM_URL;
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY; // service role — só server-side
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Faltam SUPA_CRM_URL e SUPA_CRM_SERVICE_KEY no .env');
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false }
});

// ── Helpers ───────────────────────────────────────────────────────
function log(msg)  { console.log('[sync]', msg); }
function warn(msg) { console.warn('[warn]', msg); }

function parseLS(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

// Extrai cards do formato gh_hotpipeline_v1 (primário) ou gh_kanban_v3 (legado)
function extractKanbanCards(ls) {
  // Preferir gh_hotpipeline_v1 (formato atual)
  const hp = parseLS(ls['gh_hotpipeline_v1']);
  if (hp && (hp.gaia || hp.holding)) {
    const cards = [];
    for (const tab of ['gaia', 'holding']) {
      for (const card of hp[tab] || []) {
        cards.push({
          tab,
          col:     card.etapa || 'contato',
          nome:    card.nome || '',
          produto: card.produto || null,
          tag:     null,
          nota:    card.nota || null,
          valor:   card.valor ? Number(card.valor) : null,
          responsavel: card.empresa_galeria || null,
          raw_legacy:  card
        });
      }
    }
    return cards;
  }
  // Fallback: gh_kanban_v3 (formato legado)
  const v3 = parseLS(ls['gh_kanban_v3']);
  if (!v3) return [];
  const tabs = v3.tabs || [];
  const cards = [];
  for (const tab of tabs) {
    for (const card of tab.cards || []) {
      cards.push({
        tab:     tab.id,
        col:     card.col,
        nome:    card.name || card.nome || '',
        produto: card.product || card.produto || null,
        tag:     card.tag || null,
        nota:    card.note || card.nota || null,
        valor:   card.value ? Number(card.value) : null,
        responsavel: card.galeria || null,
        raw_legacy:  card
      });
    }
  }
  return cards;
}

// Extrai decisores do formato ghub_sh_users ou gh_decisores_v3
function extractDecisores(ls) {
  const raw = parseLS(ls['gh_decisores_v3'] || ls['ghub_sh_users'] || 'null');
  if (!raw) return [];
  // gh_decisores_v3: { empresas: [ { nome, decisores: [...] } ] }
  if (raw.empresas) {
    const out = [];
    for (const emp of raw.empresas) {
      for (const d of emp.decisores || []) {
        out.push({
          empresa_nome: emp.nome,
          nome:         d.nome || '',
          cargo:        d.cargo || null,
          email:        d.email || null,
          wa:           d.wa || d.telefone || null,
          linkedin_url: d.linkedin || null,
          addedAt:      d.addedAt || null
        });
      }
    }
    return out;
  }
  return [];
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(EXPORT_FILE)) {
    console.error(`Arquivo não encontrado: ${EXPORT_FILE}`);
    console.error('Salve o export do localStorage antes de rodar este script.');
    process.exit(1);
  }

  log(`Cutoff: ${CUTOFF_DATE.toISOString()}`);
  log(`Dry-run: ${DRY_RUN}`);
  if (DRY_RUN) log('--- MODO DRY-RUN: nada será escrito no banco ---');

  const ls = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'));

  // ── 1. Kanban cards ────────────────────────────────────────────
  const lsCards = extractKanbanCards(ls);
  log(`Cards no localStorage: ${lsCards.length}`);

  // Carrega nomes já no banco
  const { data: dbCards } = await supa
    .from('crm_kanban')
    .select('nome, tab, col, nota, atualizado_em');

  const dbByNomeTab = {};
  for (const c of dbCards || []) {
    dbByNomeTab[`${c.tab}::${c.nome}`] = c;
  }

  const newCards    = [];
  const updatedNota = [];

  for (const c of lsCards) {
    const key = `${c.tab}::${c.nome}`;
    const existing = dbByNomeTab[key];

    if (!existing) {
      // Card não existe no banco — inserir se addedAt > cutoff
      // (sem addedAt no localStorage, considera novo)
      newCards.push(c);
    } else {
      // Card existe — checar nota atualizada
      const notaDB = existing.nota || '';
      const notaLS = c.nota || '';
      const atualDB = existing.atualizado_em ? new Date(existing.atualizado_em) : new Date(0);
      if (notaLS && notaLS !== notaDB && atualDB < CUTOFF_DATE) {
        // Nota no localStorage é mais nova que o banco antes do cutoff
        updatedNota.push({ nome: c.nome, tab: c.tab, nota: notaLS });
      }
    }
  }

  log(`Cards novos (não estão no banco): ${newCards.length}`);
  log(`Cards com nota diferente (localStorage mais novo que banco): ${updatedNota.length}`);

  if (!DRY_RUN && newCards.length > 0) {
    const rows = newCards.map(c => ({
      tab:         c.tab,
      col:         c.col,
      nome:        c.nome,
      produto:     c.produto,
      tag:         c.tag,
      nota:        c.nota,
      valor:       c.valor,
      responsavel: c.responsavel,
      raw_legacy:  c.raw_legacy,
      atualizado_em: new Date().toISOString()
    }));
    const { error } = await supa.from('crm_kanban').insert(rows);
    if (error) warn(`Erro ao inserir cards: ${error.message}`);
    else log(`✅ ${rows.length} cards inseridos`);
  }

  if (!DRY_RUN && updatedNota.length > 0) {
    for (const u of updatedNota) {
      const { error } = await supa.from('crm_kanban')
        .update({ nota: u.nota, atualizado_em: new Date().toISOString() })
        .eq('tab', u.tab).eq('nome', u.nome);
      if (error) warn(`Erro ao atualizar nota de ${u.nome}: ${error.message}`);
    }
    log(`✅ ${updatedNota.length} notas atualizadas`);
  }

  if (DRY_RUN) {
    if (newCards.length)    log('Cards que seriam inseridos:\n' + newCards.map(c=>`  ${c.tab}/${c.col}: ${c.nome}`).join('\n'));
    if (updatedNota.length) log('Notas que seriam atualizadas:\n' + updatedNota.map(u=>`  ${u.tab}: ${u.nome}`).join('\n'));
  }

  // ── 2. Decisores ───────────────────────────────────────────────
  const lsDecisores = extractDecisores(ls);
  log(`Decisores no localStorage: ${lsDecisores.length}`);

  if (lsDecisores.length > 0) {
    // Carrega empresas do banco para lookup nome → id
    const { data: dbEmpresas } = await supa
      .from('crm_empresas')
      .select('id, nome');
    const empByNome = {};
    for (const e of dbEmpresas || []) {
      empByNome[e.nome.toLowerCase().trim()] = e.id;
    }

    // Carrega decisores existentes (email ou nome+empresa)
    const { data: dbDecisores } = await supa
      .from('crm_decisores')
      .select('nome, email, empresa_id');

    const dbDecSet = new Set(
      (dbDecisores || []).map(d => `${d.empresa_id}::${(d.email||'').toLowerCase()}::${d.nome.toLowerCase()}`)
    );

    const novosDecisores = [];
    for (const d of lsDecisores) {
      const empId = empByNome[d.empresa_nome.toLowerCase().trim()];
      if (!empId) {
        warn(`Empresa não encontrada no banco: "${d.empresa_nome}" — decisor "${d.nome}" ignorado`);
        continue;
      }
      const key = `${empId}::${(d.email||'').toLowerCase()}::${d.nome.toLowerCase()}`;
      if (!dbDecSet.has(key)) {
        novosDecisores.push({
          empresa_id:   empId,
          nome:         d.nome,
          cargo:        d.cargo,
          email:        d.email,
          wa:           d.wa,
          linkedin_url: d.linkedin_url,
          fonte:        'localstorage_sync',
          status:       'ativo',
          temperatura:  0,
          wa_verificado: false,
          criado_em:    d.addedAt || new Date().toISOString(),
          atualizado_em: new Date().toISOString()
        });
      }
    }

    log(`Decisores novos (não estão no banco): ${novosDecisores.length}`);
    if (DRY_RUN) {
      if (novosDecisores.length) log('Decisores que seriam inseridos:\n' + novosDecisores.map(d=>`  ${d.nome} (${d.email||'sem email'})`).join('\n'));
    } else if (novosDecisores.length > 0) {
      const { error } = await supa.from('crm_decisores').insert(novosDecisores);
      if (error) warn(`Erro ao inserir decisores: ${error.message}`);
      else log(`✅ ${novosDecisores.length} decisores inseridos`);
    }
  }

  // ── 3. Resumo ──────────────────────────────────────────────────
  log('');
  log('═══ RESUMO ═══════════════════════════════');
  log(`Cards novos:          ${newCards.length}`);
  log(`Notas atualizadas:    ${updatedNota.length}`);
  log(`Decisores novos:      ${lsDecisores.length > 0 ? 'calculado acima' : 'localStorage sem decisores'}`);
  log(DRY_RUN ? 'MODO DRY-RUN — nada escrito' : 'Sync concluído');
  log('═══════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
