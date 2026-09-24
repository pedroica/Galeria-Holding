// Testes de integração — Bloco 3: botão Abordar + crm_toques
// Execução: node tests/bloco3-abordar.test.js
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
  if (r.status === 204 || r.headers.get('content-length') === '0') return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ── Helpers locais (espelham block2.js) ───────────────────────────────────────

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

function sugerirEtapa(toques, decisorId) {
  const decTqs = toques.filter(t => t.decisor_id === decisorId);
  if (!decTqs.length) return '1';
  const last = decTqs[0];
  const days = (Date.now() - new Date(last.data).getTime()) / 86400000;
  if (days >= 5 && days <= 10 && !['resposta', 'reuniao_marcada', 'reuniao'].includes(last.resultado || '')) return '2';
  return '1';
}

// ── Testes de estrutura do banco ──────────────────────────────────────────────

test('crm_toques: colunas do Bloco 3 existem', async () => {
  const rows = await sg('crm_toques?select=agencia_id,etapa,template_id,texto_enviado,nota,reuniao_em,criado_em,origem&limit=1');
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  // Se houver linha, as colunas devem existir como chaves
  if (rows.length > 0) {
    ['agencia_id', 'etapa', 'texto_enviado', 'nota', 'origem'].forEach(col => {
      assert.ok(col in rows[0], `Coluna '${col}' ausente em crm_toques`);
    });
  }
});

test('crm_empresas: coluna ultimo_toque_em existe', async () => {
  const rows = await sg('crm_empresas?select=ultimo_toque_em&limit=1');
  assert.ok(Array.isArray(rows), 'Deve retornar array');
  if (rows.length > 0) assert.ok('ultimo_toque_em' in rows[0], 'Coluna ultimo_toque_em ausente');
});

// ── Testes de gravação + leitura ──────────────────────────────────────────────

test('crm_toques: grava abordagem_direta e lê de volta', async () => {
  // Busca um decisor e empresa reais
  const decs = await sg('crm_decisores?status=eq.ativo&select=id,empresa_id&limit=1');
  assert.ok(decs.length > 0, 'Precisa de ao menos um decisor ativo');
  const dec = decs[0];
  const now = new Date().toISOString();

  const row = {
    decisor_id: dec.id,
    empresa_id: dec.empresa_id,
    agencia_id: '3409ab82-f0cd-4d95-b6e2-398995425411', // Galeria Holding
    canal: 'whatsapp',
    etapa: '1',
    texto_enviado: 'Texto de teste Bloco 3',
    resultado: 'enviado',
    origem: 'abordagem_direta',
    direcao: 'enviado',
    fonte: 'manual',
    data: now,
    criado_em: now
  };

  await sg('crm_toques', { method: 'POST', body: JSON.stringify(row) });

  // Lê de volta
  const inserted = await sg(`crm_toques?decisor_id=eq.${dec.id}&origem=eq.abordagem_direta&order=criado_em.desc&select=canal,etapa,origem,agencia_id&limit=1`);
  assert.ok(Array.isArray(inserted) && inserted.length > 0, 'Deve encontrar o toque inserido');
  assert.equal(inserted[0].canal, 'whatsapp');
  assert.equal(inserted[0].etapa, '1');
  assert.equal(inserted[0].origem, 'abordagem_direta');
});

// ── Testes de sugestão de etapa ────────────────────────────────────────────────

test('sugerirEtapa: sem toques → etapa 1', () => {
  assert.equal(sugerirEtapa([], 'dec-abc'), '1');
});

test('sugerirEtapa: último toque 7 dias sem resposta → etapa 2', () => {
  const dec = 'dec-123';
  const ago7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const toques = [{ decisor_id: dec, data: ago7, resultado: '' }];
  assert.equal(sugerirEtapa(toques, dec), '2');
});

test('sugerirEtapa: último toque 12 dias → etapa 1 (reinício)', () => {
  const dec = 'dec-456';
  const ago12 = new Date(Date.now() - 12 * 86400000).toISOString();
  const toques = [{ decisor_id: dec, data: ago12, resultado: '' }];
  assert.equal(sugerirEtapa(toques, dec), '1');
});

test('sugerirEtapa: último toque com resultado "resposta" → etapa 1', () => {
  const dec = 'dec-789';
  const ago7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const toques = [{ decisor_id: dec, data: ago7, resultado: 'resposta' }];
  assert.equal(sugerirEtapa(toques, dec), '1');
});

// ── Teste de início de semana São Paulo ────────────────────────────────────────

test('semanaInicio: retorna ISO string de segunda-feira', () => {
  const s = semanaInicio();
  assert.ok(typeof s === 'string', 'Deve ser string');
  const d = new Date(s);
  assert.ok(!isNaN(d.getTime()), 'Deve ser data válida');
  // Convertido para São Paulo deve ser segunda-feira (1) ou domingo (0 em UTC-3)
  const dayUtc = d.getUTCDay();
  assert.ok([0, 1].includes(dayUtc), 'Segunda SP pode ser domingo ou segunda UTC, got '+dayUtc);
});
