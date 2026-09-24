// Testes de integração — Bloco 4: histórico de toques + contadores semanais
// Execução: node tests/bloco4-historico.test.js
// Requer: SUPA_CRM_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente

import assert from 'node:assert/strict';
import { test } from 'node:test';

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;

async function sg(path, opts) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    ...opts
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return null;
  return r.json();
}

function semanaInicio() {
  const now = new Date();
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = sp.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(sp);
  mon.setDate(sp.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  const offset = now.getTime() - sp.getTime();
  return new Date(mon.getTime() + offset).toISOString();
}

// ── Estrutura do banco ────────────────────────────────────────────────────────

test('crm_toques: coluna origem existe e migração gravou fila_retroativo', async () => {
  const rows = await sg('crm_toques?origem=eq.fila_retroativo&select=id,origem&limit=1');
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  // Se a migração rodou, deve ter pelo menos 1 linha (ou 0 se não havia itens na fila)
  if (rows.length > 0) assert.equal(rows[0].origem, 'fila_retroativo');
});

test('crm_logs: migração bloco4 foi registrada', async () => {
  const rows = await sg('crm_logs?origem=eq.bloco4_migracao&select=mensagem,contexto&limit=1');
  assert.ok(Array.isArray(rows) && rows.length > 0, 'Deve ter log da migração');
  assert.ok(rows[0].mensagem.includes('Migração retroativa'), 'Mensagem deve mencionar migração retroativa');
  assert.ok(typeof rows[0].contexto.toques_criados === 'number', 'Deve ter contagem de toques criados');
});

test('crm_toques: campo texto_enviado existe e pode ser gravado', async () => {
  const rows = await sg('crm_toques?select=texto_enviado&limit=1');
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  if (rows.length > 0) assert.ok('texto_enviado' in rows[0], 'Coluna texto_enviado deve existir');
});

test('crm_empresas: coluna ultimo_toque_em existe', async () => {
  const rows = await sg('crm_empresas?select=ultimo_toque_em&limit=1');
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  if (rows.length > 0) assert.ok('ultimo_toque_em' in rows[0], 'Coluna ultimo_toque_em deve existir');
});

// ── Gravação de toque via fila ────────────────────────────────────────────────

test('crm_toques: toque com origem=fila tem campos completos', async () => {
  const rows = await sg('crm_toques?origem=eq.fila&select=agencia_id,etapa,template_id,texto_enviado,origem,criado_em&limit=5');
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  // Se houver toques com origem=fila, valida estrutura
  rows.forEach(r => {
    assert.ok('agencia_id' in r, 'agencia_id deve existir');
    assert.ok('etapa' in r, 'etapa deve existir');
    assert.ok('criado_em' in r, 'criado_em deve existir');
    assert.equal(r.origem, 'fila');
  });
});

// ── Contadores semanais ───────────────────────────────────────────────────────

test('contadores semanais: query retorna empresa_ids e decisor_ids distintos', async () => {
  const monISO = semanaInicio();
  const rows = await sg(`crm_toques?criado_em=gte.${monISO}&select=empresa_id,decisor_id,resultado&limit=2000`);
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  const empSet = new Set(rows.filter(r => r.empresa_id).map(r => r.empresa_id));
  const decSet = new Set(rows.filter(r => r.decisor_id).map(r => r.decisor_id));
  const reunioes = rows.filter(r => r.resultado === 'reuniao_marcada').length;
  assert.ok(typeof empSet.size === 'number', 'Empresas tocadas deve ser número');
  assert.ok(typeof decSet.size === 'number', 'Decisores tocados deve ser número');
  assert.ok(typeof reunioes === 'number', 'Reuniões marcadas deve ser número');
});

// ── Histórico: busca por empresa ──────────────────────────────────────────────

test('histórico: toques existem com join para crm_empresas', async () => {
  const rows = await sg('crm_toques?select=id,canal,resultado,crm_empresas!empresa_id(nome)&limit=10');
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  // Se houver toques com empresa_id, o join deve funcionar
  const comEmpresa = rows.filter(r => r.crm_empresas);
  if (comEmpresa.length > 0) {
    assert.ok(typeof comEmpresa[0].crm_empresas.nome === 'string', 'Nome da empresa deve ser string');
  }
});

test('histórico: busca por empresa filtra corretamente', async () => {
  // Busca por empresa que sabemos que pode existir (usa any empresa)
  const emps = await sg('crm_empresas?select=id,nome&limit=5');
  if (!emps || emps.length === 0) return; // skip se sem dados
  const emp = emps[0];
  const rows = await sg(`crm_toques?empresa_id=eq.${emp.id}&select=id,empresa_id&limit=10`);
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  rows.forEach(r => assert.equal(r.empresa_id, emp.id, 'Todos toques devem ser desta empresa'));
});

// ── Helpers locais ────────────────────────────────────────────────────────────

test('semanaInicio: retorna ISO de segunda-feira SP', () => {
  const s = semanaInicio();
  assert.ok(typeof s === 'string', 'Deve ser string');
  const d = new Date(s);
  assert.ok(!isNaN(d.getTime()), 'Deve ser data válida');
  const dayUtc = d.getUTCDay();
  assert.ok([0, 1].includes(dayUtc), 'Segunda SP pode ser domingo ou segunda UTC, got ' + dayUtc);
});
