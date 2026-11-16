// tests/enrich-auth.test.mjs — gate de autenticação do api/enrich.js (BLOCO 2b).
// Providers que gastam crédito (hunter, lusha*, claude, crawl) exigem JWT de
// usuário logado OU credencial de cron (CRON_SECRET / service key). Fecham por
// padrão. health segue aberto. A chave pública (SUPA_ANON) NÃO autentica.
// Rodar: node tests/enrich-auth.test.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.CRON_SECRET = 'cron-secret-xyz';
process.env.HUNTER_KEY  = 'hunter-fake';
process.env.LUSHA_KEY   = 'lusha-fake';

const SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
const JWT_VALIDO = 'jwt-usuario-logado';

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });
  // verifyUserJwt: só o JWT_VALIDO é aceito pelo /auth/v1/user.
  if (u.includes('/auth/v1/user')) {
    const tok = (opts.headers?.Authorization || '').replace('Bearer ', '');
    return json({}, tok === JWT_VALIDO, tok === JWT_VALIDO ? 200 : 401);
  }
  if (u.includes('api.hunter.io')) return json({ data: { emails: [] } });
  if (u.includes('api.lusha.com')) return json({ contacts: [] });
  return json({}, false, 404);
};

const { default: handler } = await import(new URL('../api/enrich.js', import.meta.url).href);

function res() {
  const r = { code: 200, payload: null };
  r.setHeader = () => {};
  r.status = c => { r.code = c; return r; };
  r.json = p => { r.payload = p; return r; };
  return r;
}
const call = (provider, auth, method = 'GET', body = null) => {
  const r = res();
  const headers = auth ? { authorization: auth } : {};
  return handler({ query: { provider }, headers, method, body }, r).then(() => r);
};

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

console.log('Gate de autenticação — api/enrich.js');

// 1. Sem auth → 401, nenhum crédito gasto.
let r = await call('hunter', null);
ok(r.code === 401, 'hunter sem auth → 401');

// 2. Credencial de cron (service key) → passa o gate.
r = await call('hunter', 'Bearer service-key-fake');
ok(r.code !== 401, 'hunter com service key → passa (código ' + r.code + ')');

// 3. Credencial de cron (CRON_SECRET) → passa o gate.
r = await call('hunter', 'Bearer cron-secret-xyz');
ok(r.code !== 401, 'hunter com CRON_SECRET → passa (código ' + r.code + ')');

// 4. JWT de usuário logado → passa o gate.
r = await call('hunter', 'Bearer ' + JWT_VALIDO);
ok(r.code !== 401, 'hunter com JWT válido → passa (código ' + r.code + ')');

// 5. Chave pública do frontend (anon) NÃO autentica → 401.
r = await call('hunter', 'Bearer ' + SUPA_ANON);
ok(r.code === 401, 'hunter com SUPA_ANON (chave pública) → 401');

// 6. JWT inválido/expirado → 401.
r = await call('lusha-reveal', 'Bearer jwt-que-nao-existe', 'POST', JSON.stringify({ contacts: [] }));
ok(r.code === 401, 'lusha-reveal com JWT inválido → 401');

// 7. lusha-domain (chamada do cron) sem auth → 401 antes de gastar crédito.
r = await call('lusha-domain', null, 'POST', JSON.stringify({ company: 'Alvo', empresaId: 'x' }));
ok(r.code === 401, 'lusha-domain sem auth → 401');

// 8. lusha-domain com credencial de cron → passa o gate.
r = await call('lusha-domain', 'Bearer cron-secret-xyz', 'POST', JSON.stringify({ company: 'Alvo', empresaId: 'x' }));
ok(r.code !== 401, 'lusha-domain com CRON_SECRET → passa (código ' + r.code + ')');

// 9. health segue aberto (sem auth) → não é 401.
r = await call('health', null);
ok(r.code === 200, 'health sem auth → 200 (aberto)');

// 10. crawl e claude também protegidos.
r = await call('claude', null, 'POST', JSON.stringify({ messages: [] }));
ok(r.code === 401, 'claude sem auth → 401');
r = await call('crawl', null, 'POST', JSON.stringify({ url: 'https://x.com' }));
ok(r.code === 401, 'crawl sem auth → 401');

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
