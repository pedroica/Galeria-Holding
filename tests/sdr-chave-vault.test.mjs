// tests/sdr-chave-vault.test.mjs — chave da Anthropic: env recusada (401) → usa a do Vault.
// Anthropic e Supabase simulados. Rodar: node tests/sdr-chave-vault.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.SUPA_CRM_URL = 'https://fake.supabase.co';
process.env.CRON_SECRET = 'cron-vercel';
process.env.ANTHROPIC_API_KEY = 'sk-env-invalida';
const CHAVE_VAULT = 'sk-ant-chave-do-vault-valida-000000';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const chavesUsadas = []; let vaultTem = true; let rpcChamadas = 0;
const corpo = 'Ana, vi que a Acme ' + Array.from({ length: 62 }, (_, i) => 'termo' + i).join(' ') + ' faz sentido?';
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url instanceof Request ? url.url : url);
  const h = opts.headers instanceof Headers ? Object.fromEntries(opts.headers) : (url instanceof Request ? Object.fromEntries(url.headers) : (opts.headers || {}));
  if (u.includes('/v1/messages')) {
    const k = h['x-api-key'];
    chavesUsadas.push(k);
    if (k !== CHAVE_VAULT) return json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
    return json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({ assunto: 'Acme e a linha X', corpo }) }], usage: { input_tokens: 100, output_tokens: 50 } });
  }
  if (u.includes('/rpc/sdr_anthropic_key')) { rpcChamadas++; return json(vaultTem ? CHAVE_VAULT : null); }
  if (u.includes('crm_sdr_estado') && (opts.method || 'GET') === 'GET') return json([{ id: 'e1', decisor_id: 'd1', empresa_id: 'x', agencia_id: 'a', dia_cadencia: 0, dossie_id: 'k',
    crm_decisores: { nome: 'Ana', cargo: 'CMO', email: 'a@acme.com' }, crm_empresas: { id: 'x', nome: 'Acme', setor: 'tecnologia' }, crm_agencias: { slug: '404', nome: '404' },
    crm_dossies: { sinais: [{ tipo: 'lancamento', fato: 'Acme lança X', url: 'https://x/1', trecho: 'Acme lança X' }] } }]);
  return json([], (opts.method || 'GET') === 'POST' ? 201 : 200);
};
const { default: cron } = await import(new URL('../api/cron.js', import.meta.url).href);
const chamar = (job) => new Promise((resolve) => {
  const res = { _s: 200, status(x) { this._s = x; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() {} };
  cron({ method: 'GET', query: { job, lote: 1 }, headers: { authorization: 'Bearer cron-vercel' } }, res);
});

console.log('Chave da Anthropic: env recusada → Vault');
let r = await chamar('sdr-redacao');
ok(r.status === 200 && r.body.redigidos === 1 && r.body.versoes === 3 && r.body.falhas === 0, 'as 3 versões saem com a chave do Vault (' + JSON.stringify(r.body) + ')');
const envTentativas = chavesUsadas.filter(k => k === 'sk-env-invalida').length;
ok(envTentativas <= 3 && chavesUsadas.filter(k => k === CHAVE_VAULT).length === 3, 'env só é tentada na primeira leva paralela (' + envTentativas + 'x)');
const antes = chavesUsadas.length;
r = await chamar('sdr-redacao');
ok(chavesUsadas.slice(antes).every(k => k === CHAVE_VAULT), 'depois de recusada, a env não é tentada de novo');
ok(rpcChamadas === 1, 'chave do Vault fica em cache (1 consulta)');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
