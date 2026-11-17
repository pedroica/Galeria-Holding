// Garante que TODA chamada do front que chega a um provider protegido do
// /api/enrich leva o JWT da sessão — inclusive as que o interceptor reescreve
// (api.anthropic.com, api.hunter.io, api.lusha.com). Sem isso o gate do
// BLOCO 2 devolveria 401 para toda a IA e o Lusha do app.
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../gh-core.js', import.meta.url), 'utf8');
let falhas = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log('  ✓ ' + m); else { falhas++; console.log('  ✗ ' + m); } };

function montar(jwt) {
  const chamadas = [];
  const fakeFetch = async (url, opts) => {
    chamadas.push({ url: String(url), opts: opts || {} });
    if (String(url).includes('health=1')) return { ok: true, json: async () => ({ claude: true, hunter: true, lusha: true }) };
    return { ok: true, json: async () => ({}) };
  };
  const store = {};
  const window = {
    fetch: fakeFetch,
    location: { href: 'https://galeria-holding-sage.vercel.app/', origin: 'https://galeria-holding-sage.vercel.app' },
    __supaSession: jwt ? { access_token: jwt } : null,
  };
  const ctx = {
    window, Headers, URL, console,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    document: { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }, body: { appendChild() {} } },
    setTimeout, clearTimeout, setInterval: () => 0,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(code, ctx); } catch (e) { /* código posterior ao interceptor pode depender do DOM real */ }
  return { f: ctx.window.fetch, chamadas };
}
const authDe = c => { const h = c.opts.headers || {}; const k = Object.keys(h).find(k => k.toLowerCase() === 'authorization'); return k ? h[k] : undefined; };
const ultima = (ch, pedaco) => [...ch].reverse().find(c => c.url.includes(pedaco));

const JWT = 'jwt-da-sessao';
{
  const { f, chamadas } = montar(JWT);
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: '{}' });
  let c = ultima(chamadas, 'provider=claude');
  ok(c && authDe(c) === 'Bearer ' + JWT, 'Anthropic reescrita para /api/enrich?provider=claude leva o JWT');
  ok(c && !('x-api-key' in c.opts.headers) && c.opts.headers['Content-Type'] === 'application/json', 'Anthropic: remove x-api-key e preserva Content-Type');

  await f('https://api.hunter.io/v2/domain-search?domain=x.com&api_key=K&limit=10');
  c = ultima(chamadas, 'provider=hunter');
  ok(c && authDe(c) === 'Bearer ' + JWT, 'Hunter reescrito leva o JWT');
  ok(c && !c.url.includes('api_key=K'), 'Hunter: chave removida da URL');

  await f('https://api.lusha.com/v2/person?firstName=a&lastName=b&company=c', { headers: { api_key: 'L' } });
  c = ultima(chamadas, 'provider=lusha&');
  ok(c && authDe(c) === 'Bearer ' + JWT && !('api_key' in c.opts.headers), 'Lusha reescrito leva o JWT e não vaza api_key');

  await f('/api/enrich?provider=crawl&url=x');
  ok(authDe(ultima(chamadas, 'provider=crawl')) === 'Bearer ' + JWT, '/api/enrich relativo sem header recebe o JWT');

  await f('https://galeria-holding-sage.vercel.app/api/enrich?provider=lusha-search&domain=x');
  ok(authDe(ultima(chamadas, 'lusha-search')) === 'Bearer ' + JWT, '/api/enrich com URL absoluta do próprio domínio recebe o JWT');

  await f('/api/enrich?provider=lusha-reveal', { method: 'POST', headers: { Authorization: 'Bearer undefined' } });
  ok(authDe(ultima(chamadas, 'lusha-reveal')) === 'Bearer ' + JWT, 'Bearer undefined é substituído pelo JWT real');

  await f('/api/enrich?provider=lusha-domain', { method: 'POST', headers: new Headers({ 'Content-Type': 'application/json' }) });
  c = ultima(chamadas, 'lusha-domain');
  ok(authDe(c) === 'Bearer ' + JWT && c.opts.headers['content-type'] === 'application/json', 'Headers() é convertido sem perder Content-Type');

  await f('/api/enrich?provider=hunter', { headers: { Authorization: 'Bearer outro-token' } });
  ok(authDe(ultima(chamadas, 'provider=hunter') ) === 'Bearer outro-token', 'Authorization válido já presente é mantido');

  const antes = chamadas.length;
  await f('https://uetltlnjmobeiunxfsqi.supabase.co/rest/v1/crm_empresas', { headers: { apikey: 'a' } });
  const sup = chamadas[chamadas.length - 1];
  ok(chamadas.length === antes + 1 && authDe(sup) === undefined, 'Chamadas externas não recebem o JWT (sem vazamento)');
}
{
  const { f, chamadas } = montar(null);
  await f('/api/enrich?provider=crawl');
  ok(authDe(ultima(chamadas, 'provider=crawl')) === undefined, 'Sem sessão: não inventa header');
}
console.log(`\n${total - falhas}/${total} ok`);
process.exit(falhas ? 1 : 0);
