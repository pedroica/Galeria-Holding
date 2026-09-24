// Teste de integração — Bloco 2: crm_templates de prospecção
// Execução: node tests/bloco2-templates.test.js
// Requer: SUPA_CRM_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente

import assert from 'node:assert/strict';
import { test } from 'node:test';

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;

async function sg(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function interpolar(txt, vars) {
  return (txt || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : `{${k}}`);
}

function setorStr(emp) {
  const raw = (emp.setor || '').trim();
  if (!raw) return 'marketing';
  if (raw === raw.toUpperCase() && raw.length <= 5) return 'marketing';
  if (raw.length <= 2) return 'marketing';
  return raw.toLowerCase();
}

test('crm_templates: 35 templates de prospecção existem no banco', async () => {
  const rows = await sg('crm_templates?tipo=eq.prospeccao&select=id,agencia_id,canal,etapa');
  assert.equal(rows.length, 35, `Esperava 35, got ${rows.length}`);
});

test('crm_templates: cada uma das 7 agências tem 5 templates', async () => {
  const agencias = [
    '3409ab82-f0cd-4d95-b6e2-398995425411',
    '960142b5-a688-41f8-8719-d516eeb843c6',
    '14a057af-31c6-4606-8236-4c97d8067335',
    'e8d734ba-b3e9-425b-942e-b8b56c98f56b',
    '74886b76-2650-41e1-8d46-3c742681fadd',
    'b0473d79-afd9-404e-8784-04b4556a5a2c',
    'a8aecdac-1001-4643-bcd4-e818307b6d92',
  ];
  const rows = await sg('crm_templates?tipo=eq.prospeccao&select=agencia_id');
  const counts = {};
  rows.forEach(r => counts[r.agencia_id] = (counts[r.agencia_id] || 0) + 1);
  agencias.forEach(id => assert.equal(counts[id], 5, `Agência ${id} tem ${counts[id]} templates, esperava 5`));
});

test('crm_templates: template WhatsApp E1 da Galeria Holding tem texto exato', async () => {
  const rows = await sg('crm_templates?agencia_id=eq.3409ab82-f0cd-4d95-b6e2-398995425411&canal=eq.whatsapp&etapa=eq.1&tipo=eq.prospeccao&select=corpo');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].corpo.includes('sou Pedro, da Galeria Holding'), 'Falta "sou Pedro, da Galeria Holding"');
  assert.ok(rows[0].corpo.includes('América Latina'), 'Falta "América Latina"');
  assert.ok(rows[0].corpo.includes('{empresa}'), 'Falta variável {empresa}');
  assert.ok(rows[0].corpo.includes('{setor}'), 'Falta variável {setor}');
});

test('interpolar: substitui variáveis simples corretamente', () => {
  const corpo = '{primeiro_nome}, sou Pedro, da {agencia}. A {empresa} atua em {setor}.';
  const vars = { primeiro_nome: 'Ana', agencia: 'Galeria Holding', empresa: 'Acme', setor: 'varejo' };
  const result = interpolar(corpo, vars);
  assert.equal(result, 'Ana, sou Pedro, da Galeria Holding. A Acme atua em varejo.');
});

test('interpolar: setor vazio cai para "marketing"', () => {
  const emp = { setor: '' };
  assert.equal(setorStr(emp), 'marketing');
});

test('interpolar: setor sigla cai para "marketing"', () => {
  assert.equal(setorStr({ setor: 'TI' }), 'marketing');
  assert.equal(setorStr({ setor: 'RH' }), 'marketing');
  assert.equal(setorStr({ setor: 'B2B' }), 'marketing');
});

test('interpolar: setor normal em minúsculas', () => {
  assert.equal(setorStr({ setor: 'Varejo Alimentar' }), 'varejo alimentar');
  assert.equal(setorStr({ setor: 'Tecnologia' }), 'tecnologia');
});

test('interpolar: variável ausente mantém placeholder', () => {
  const result = interpolar('Olá {primeiro_nome}, empresa: {empresa}', { primeiro_nome: 'João' });
  assert.equal(result, 'Olá João, empresa: {empresa}');
});

test('crm_fila: coluna template_id existe', async () => {
  const rows = await sg('crm_fila?select=template_id&limit=1');
  assert.ok(Array.isArray(rows), 'Deveria retornar array');
  if (rows.length > 0) assert.ok('template_id' in rows[0], 'template_id deveria existir no objeto');
});
