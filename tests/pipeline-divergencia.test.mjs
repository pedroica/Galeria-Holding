/**
 * Teste de integração — falha se crm_kanban e crm_oportunidades divergirem
 * em contagem por empresa e agência.
 *
 * Uso:
 *   SUPA_CRM_SERVICE_KEY=<service_role_key> node tests/pipeline-divergencia.test.mjs
 *
 * Regra: para cada par (empresa_id, agencia_id) presente em crm_kanban,
 * crm_oportunidades deve ter pelo menos o mesmo número de registros
 * não-deletados. Total global também deve ser igual.
 */

const SUPA_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_KEY) {
  console.error('\nERRO: SUPA_CRM_SERVICE_KEY não definida.');
  process.exit(1);
}

const HDR = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + SUPA_KEY,
  apikey: SUPA_KEY,
};

async function q(path) {
  const r = await fetch(SUPA_URL + '/rest/v1' + path, { headers: HDR });
  if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + path);
  return r.json();
}

let passed = 0, failed = 0;
function assert(cond, label, detail) {
  if (cond) { console.log('  ✅', label); passed++; }
  else       { console.error('  ❌', label, detail || ''); failed++; }
}

// Agências: slug → UUID
async function buildAgMap() {
  const rows = await q('/crm_agencias?select=id,slug');
  const m = {};
  rows.forEach(r => { if (r.slug) m[r.slug] = r.id; });
  return m;
}

// Conta por (empresa_id, agencia_id) — retorna Map com chave "empId|agUuid"
function countByPair(rows, agMap, agKeyField) {
  const m = new Map();
  for (const row of rows) {
    const emp = row.empresa_id || '__sem_empresa__';
    // kanban usa slug em agencia_id; oportunidades usa UUID diretamente
    let ag = row.agencia_id || '__sem_agencia__';
    if (agKeyField === 'slug') ag = agMap[ag] || ag;
    const key = emp + '|' + ag;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}

async function main() {
  console.log('\n=== Divergência Pipeline: crm_kanban vs crm_oportunidades ===\n');

  const agMap = await buildAgMap();

  // Carrega todos os registros de ambas as tabelas
  const [kanban, oportunidades] = await Promise.all([
    q('/crm_kanban?select=id,empresa_id,agencia_id&limit=2000'),
    q('/crm_oportunidades?apagado_em=is.null&select=id,empresa_id,agencia_id&limit=2000'),
  ]);

  console.log(`  crm_kanban: ${kanban.length} registros`);
  console.log(`  crm_oportunidades (ativos): ${oportunidades.length} registros\n`);

  assert(
    oportunidades.length >= kanban.length,
    `Total: oportunidades(${oportunidades.length}) >= kanban(${kanban.length})`,
  );

  const kMap = countByPair(kanban, agMap, 'slug');
  const oMap = countByPair(oportunidades, agMap, 'uuid');

  let divergencias = 0;
  for (const [key, kCount] of kMap) {
    const oCount = oMap.get(key) || 0;
    if (oCount < kCount) {
      console.error('  ❌ Divergência em', key, '— kanban:', kCount, 'oportunidades:', oCount);
      divergencias++;
      failed++;
    } else {
      passed++;
    }
  }
  if (divergencias === 0) {
    console.log('  ✅ Nenhuma divergência por par (empresa, agência)');
  }

  console.log(`\n  Pares kanban: ${kMap.size} | Pares oportunidades: ${oMap.size}`);
  console.log(`\n  Resultado: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
