// Rota api/enrich?provider=estilo (Admin › Meu jeito) com banco simulado.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
process.env.CRON_SECRET = 'cron-x';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
const cfg = {}; let papel = 'admin'; let cronChamado = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  if (u.includes('/auth/v1/user')) return json({ email: 'pedro@galeria.test' });
  if (u.includes('crm_usuarios')) return json([{ email: 'pedro@galeria.test', ativo: true, papel }]);
  if (u.includes('crm_configuracoes') && mt === 'GET') { const k = (u.match(/chave=eq\.(\w+)/) || [])[1]; return json(cfg[k] !== undefined ? [{ valor: cfg[k] }] : []); }
  if (u.includes('crm_configuracoes')) { cfg[body.chave] = body.valor; return new Response(null, { status: 201 }); }
  if (u.includes('/api/cron?job=aprender-estilo')) { cronChamado = opts.headers && opts.headers.Authorization; cfg.estilo_pedro_aprendido = { perfil: { resumo: 'Direto.' }, atualizado_em: 'x' }; return json({ ok: true }); }
  return json([]);
};
const { default: enrich } = await import(new URL('../api/enrich.js', import.meta.url).href);
const chamar = (body) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); }, redirect() {} };
  enrich({ method: 'POST', query: { provider: 'estilo' }, headers: { authorization: 'Bearer jwt', host: 'galeria.test' }, body: JSON.stringify(body) }, res);
});
const conversa = '26/11/2026 13:45 - Pedro Ica: Fala Bia, tudo certo por aí?\n26/11/2026 13:50 - Bia: tudo ótimo\n26/11/2026 13:52 - Pedro Ica: show, bora marcar aquele café semana que vem então';
let r = await chamar({ acao: 'autores', texto: conversa });
ok(r.status === 200 && r.body.autores[0].autor === 'Pedro Ica', 'reconhece quem fala na conversa');
r = await chamar({ acao: 'adicionar', tipo: 'whatsapp', texto: conversa, autor: 'Pedro Ica' });
ok(r.status === 200 && r.body.adicionadas === 2 && cfg.estilo_amostras_manuais.length === 2 && cfg.estilo_amostras_manuais.every(a => a.canal === 'whatsapp'), 'guarda só as falas do Pedro');
r = await chamar({ acao: 'adicionar', tipo: 'whatsapp', texto: conversa, autor: 'Pedro Ica' });
ok(cfg.estilo_amostras_manuais.length === 2, 'não duplica exemplo repetido');
r = await chamar({ acao: 'adicionar', tipo: 'colado', texto: 'Oi Ana, segue a proposta revisada com os ajustes.\n---\nCarlos, valeu pelo papo de hoje cedo, foi ótimo.' });
r = await chamar({ acao: 'ver' });
ok(r.body.exemplos.total === 4 && r.body.exemplos.whatsapp === 2 && r.body.exemplos.email === 2, 'mostra quantos exemplos há');
r = await chamar({ acao: 'aprender' });
ok(r.status === 200 && r.body.perfil.perfil.resumo === 'Direto.' && cronChamado === 'Bearer cron-x', 'Aprender agora roda o job com o segredo do servidor');
papel = 'leitor';
ok((await chamar({ acao: 'ver' })).status === 401, 'só o administrador');
console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
