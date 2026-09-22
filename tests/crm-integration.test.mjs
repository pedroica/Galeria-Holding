/**
 * Teste de integração CRM — valida fluxo completo de empresa + decisores
 * Empresa de teste: "ZZ Teste Galeria" (criada e limpa neste script)
 *
 * Uso:
 *   SUPA_CRM_SERVICE_KEY=<service_role_key> node tests/crm-integration.test.mjs
 *
 * Não requer pacotes extras — usa fetch nativo do Node 18+.
 */

const SUPA_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_KEY) {
  console.error('\nERRO: SUPA_CRM_SERVICE_KEY não definida.');
  console.error('Exporte antes de rodar: export SUPA_CRM_SERVICE_KEY=<service_role_key>\n');
  process.exit(1);
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + SUPA_KEY,
  'apikey': SUPA_KEY,
  'Prefer': 'return=representation',
};

async function q(path, opts = {}) {
  const r = await fetch(SUPA_URL + '/rest/v1' + path, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  if (r.status === 204 || r.headers.get('content-length') === '0') return null;
  return r.json();
}

const TEST_NOME = 'ZZ Teste Galeria';
const TEST_DOMINIO = 'zztesteintegration.com.br';
let empresaId = null;
let decisorId = null;

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✅', label); passed++; }
  else       { console.error('  ❌', label); failed++; }
}

async function cleanup() {
  const emps = await q(`/crm_empresas?nome=eq.${encodeURIComponent(TEST_NOME)}&select=id`);
  if (!Array.isArray(emps)) { console.log('  [cleanup] emps raw:', JSON.stringify(emps)); return; }
  for (const row of emps) {
    await q(`/crm_fila?empresa_id=eq.${row.id}`, { method:'DELETE', headers:{'Prefer':'return=minimal'} });
    await q(`/crm_decisores?empresa_id=eq.${row.id}`, { method:'DELETE', headers:{'Prefer':'return=minimal'} });
    await q(`/crm_logs?empresa_id=eq.${row.id}`, { method:'DELETE', headers:{'Prefer':'return=minimal'} });
    await q(`/crm_empresas?id=eq.${row.id}`, { method:'DELETE', headers:{'Prefer':'return=minimal'} });
  }
}

// ── SUITE ──────────────────────────────────────────────────────────────────

console.log('\n=== CRM Integration Test Suite ===\n');

console.log('[ setup ] Limpeza prévia...');
await cleanup();
console.log('  ok\n');

// 1. Criar empresa
console.log('[ 1 ] Criar empresa de teste');
{
  const now = new Date().toISOString();
  const data = await q('/crm_empresas', {
    method: 'POST',
    body: JSON.stringify({ nome: TEST_NOME, setor: 'Teste', dominio: TEST_DOMINIO, website: 'https://'+TEST_DOMINIO, fonte: 'teste', criado_em: now, atualizado_em: now })
  });
  const row = Array.isArray(data) ? data[0] : data;
  assert(row && row.id, 'empresa inserida sem erro');
  if (row) empresaId = row.id;
}

// 2. Sem duplicata
console.log('\n[ 2 ] Não criar duplicata de empresa');
{
  const data = await q(`/crm_empresas?nome=eq.${encodeURIComponent(TEST_NOME)}&select=id`);
  assert(Array.isArray(data) && data.length === 1, 'apenas 1 registro com o nome');
}

// 3. Criar decisor
console.log('\n[ 3 ] Criar decisor vinculado');
{
  const now = new Date().toISOString();
  const data = await q('/crm_decisores', {
    method: 'POST',
    body: JSON.stringify({ empresa_id: empresaId, nome: 'Ana Teste', cargo: 'CMO', email: 'ana@'+TEST_DOMINIO, wa: '+5511999990000', fonte: 'lusha', status: 'ativo', temperatura: 0, wa_verificado: false, criado_em: now, atualizado_em: now })
  });
  const row = Array.isArray(data) ? data[0] : data;
  assert(row && row.id, 'decisor inserido sem erro');
  if (row) decisorId = row.id;
}

// 4. E.164 armazenado corretamente
console.log('\n[ 4 ] Formato E.164 no campo wa');
{
  const data = await q(`/crm_decisores?id=eq.${decisorId}&select=wa`);
  const wa = data && data[0] && data[0].wa;
  assert(wa && /^\+55\d{10,11}$/.test(wa), 'wa em E.164 (+55XXXXXXXXXX) — encontrado: ' + (wa||'null'));
}

// 5. Atualizar enriquecido_em (PATCH → 204)
console.log('\n[ 5 ] PATCH enriquecido_em → 204 sem crash');
{
  const now = new Date().toISOString();
  const r = await fetch(SUPA_URL + '/rest/v1/crm_empresas?id=eq.' + empresaId, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ enriquecido_em: now, atualizado_em: now })
  });
  assert(r.status === 204, 'PATCH retornou 204 (Prefer: return=minimal)');

  const check = await q(`/crm_empresas?id=eq.${empresaId}&select=enriquecido_em`);
  assert(check && check[0] && check[0].enriquecido_em, 'enriquecido_em gravado no banco');
}

// 6. crm_logs write
console.log('\n[ 6 ] Gravar log em crm_logs');
{
  const now = new Date().toISOString();
  const data = await q('/crm_logs', {
    method: 'POST',
    body: JSON.stringify({ origem: 'lusha', nivel: 'info', mensagem: 'teste integração', contexto: { test: true }, empresa_id: empresaId, decisor_id: decisorId, criado_em: now })
  });
  const row = Array.isArray(data) ? data[0] : data;
  assert(row && row.id, 'log inserido em crm_logs com id retornado');
}

// 7. crm_fila auto-insert
console.log('\n[ 7 ] Inserir rascunhos em crm_fila (email + whatsapp)');
{
  const now = new Date().toISOString();
  const data = await q('/crm_fila', {
    method: 'POST',
    body: JSON.stringify([
      { empresa_id: empresaId, decisor_id: decisorId, canal: 'email',    etapa_cadencia: 1, etapa: 'etapa1', status: 'rascunho', gerado_em: now },
      { empresa_id: empresaId, decisor_id: decisorId, canal: 'whatsapp', etapa_cadencia: 1, etapa: 'etapa1', status: 'rascunho', gerado_em: now },
    ])
  });
  assert(Array.isArray(data) && data.length === 2, 'dois rascunhos criados em crm_fila');
}

// 8. Sem duplicata de decisor (mesma empresa + email)
console.log('\n[ 8 ] Nenhum decisor duplicado por email na empresa');
{
  const data = await q(`/crm_decisores?empresa_id=eq.${empresaId}&email=eq.ana%40${TEST_DOMINIO}&select=id`);
  assert(Array.isArray(data) && data.length === 1, 'exatamente 1 decisor com esse email');
}

// 9. crm_configuracoes
console.log('\n[ 9 ] crm_configuracoes.lusha_daily_reveal_limit');
{
  const data = await q('/crm_configuracoes?chave=eq.lusha_daily_reveal_limit&select=valor');
  const val = data && data[0] && Number(data[0].valor);
  assert(val > 0, 'lusha_daily_reveal_limit = ' + (val ?? 'ausente'));
}

// Limpeza
console.log('\n[ teardown ] Removendo dados de teste...');
await cleanup();
console.log('  ok');

// ── Resultado ──────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`RESULTADO: ${passed} ok  |  ${failed} falha(s)`);
console.log('──────────────────────────────────────────\n');
if (failed > 0) process.exit(1);
