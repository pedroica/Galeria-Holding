// tests/graph-init.test.mjs — "Conectar Outlook": o graph-init devolve o link da
// Microsoft mesmo quando o Supabase responde 201 sem corpo (Prefer: return=minimal).
process.env.SUPA_CRM_SERVICE_KEY = 'svc'; process.env.MS_CLIENT_ID = 'cid'; process.env.MS_CLIENT_SECRET = 'sec'; process.env.MS_TENANT_ID = 'tid';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };
let gravou = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
  if (u.includes('crm_oauth_tokens') && opts.method === 'POST') { gravou++; return new Response('', { status: 201 }); }
  return new Response('', { status: 204 });
};
const { default: handler } = await import(new URL('../api/enrich.js', import.meta.url).href);
const r = await new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(x) { this._s = x; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, end() { resolve({ status: this._s }); }, redirect() {} };
  handler({ method: 'POST', query: { provider: 'graph-init' }, headers: { authorization: 'Bearer jwt-ok' }, body: {} }, res);
});
ok(r.status === 200 && /login\.microsoftonline\.com\/tid\/oauth2\/v2\.0\/authorize\?client_id=cid/.test(r.body.authUrl || ''), 'devolve o link da Microsoft (' + r.status + ')');
ok(gravou === 1, 'grava o state uma vez');
console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
