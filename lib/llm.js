// lib/llm.js — chamada à IA com resposta em JSON estruturado, para quem não é o
// cron (o cron tem a sua). Chave: env ANTHROPIC_API_KEY; se faltar ou for recusada,
// a do Vault (RPC sdr_anthropic_key, só service key). Aceita conteúdo com PDF/imagem.
import Anthropic from '@anthropic-ai/sdk';

let _cache = { valor: null, ate: 0 }; let _envRecusada = false;
async function chaveVault(supaUrl, serviceKey) {
  if (_cache.ate > Date.now()) return _cache.valor;
  let v = null;
  try {
    const r = await fetch(supaUrl + '/rest/v1/rpc/sdr_anthropic_key', { method: 'POST', headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.ok) { const j = await r.json().catch(() => null); v = typeof j === 'string' && j.length > 20 ? j : null; }
  } catch (_) {}
  _cache = { valor: v, ate: Date.now() + 10 * 60000 };
  return v;
}

// content: string ou blocos [{type:'text'|'document'|'image', ...}]
export async function gerarJSON({ system, content, schema, model = 'claude-sonnet-5-5', effort = 'low', supaUrl, serviceKey, envKey }) {
  if (typeof globalThis.__SDR_LLM_MOCK === 'function') return globalThis.__SDR_LLM_MOCK({ system, user: typeof content === 'string' ? content : JSON.stringify(content), schema, model });
  const chave = (envKey && !_envRecusada) ? envKey : await chaveVault(supaUrl, serviceKey);
  if (!chave) return { obj: null, erro: 'sem chave da Anthropic' };
  try {
    const r = await new Anthropic({ apiKey: chave, timeout: 50000, maxRetries: 1 }).messages.create({
      model, max_tokens: 8000, system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } }
    });
    const txt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let obj = null; try { obj = JSON.parse(txt); } catch (_) {}
    return { obj, erro: obj ? null : 'json_invalido', modelo: r.model };
  } catch (e) {
    if (e && e.status === 401 && chave === envKey) { _envRecusada = true; return gerarJSON({ system, content, schema, model, effort, supaUrl, serviceKey, envKey }); }
    return { obj: null, erro: String(e && e.message || e).slice(0, 200) };
  }
}

// Texto livre com pesquisa na internet (ferramenta de servidor web_search). Segue o
// turno quando a busca pausa (pause_turn). Devolve o texto final e as URLs lidas.
export async function gerarComBusca({ system, content, model = 'claude-sonnet-5-5', maxBuscas = 3, supaUrl, serviceKey, envKey }) {
  if (typeof globalThis.__SDR_LLM_MOCK === 'function') return globalThis.__SDR_LLM_MOCK({ system, user: typeof content === 'string' ? content : JSON.stringify(content), busca: true, model });
  const chave = (envKey && !_envRecusada) ? envKey : await chaveVault(supaUrl, serviceKey);
  if (!chave) return { texto: '', urls: [], erro: 'sem chave da Anthropic' };
  const cli = new Anthropic({ apiKey: chave, timeout: 50000, maxRetries: 1 });
  let msgs = [{ role: 'user', content }]; let texto = ''; const urls = []; let buscas = 0;
  try {
    for (let volta = 0; volta < 4; volta++) {
      const r = await cli.messages.create({
        model, max_tokens: 3000, system, messages: msgs,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxBuscas, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } }]
      });
      for (const b of (r.content || [])) {
        if (b.type === 'text') texto += b.text;
        if (b.type === 'server_tool_use') buscas++;
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const x of b.content) if (x && x.url && !urls.includes(x.url)) urls.push(x.url);
      }
      if (r.stop_reason !== 'pause_turn') return { texto, urls, buscas, modelo: r.model };
      msgs = msgs.concat([{ role: 'assistant', content: r.content }]);
      texto = '';
    }
    return { texto, urls, buscas };
  } catch (e) {
    if (e && e.status === 401 && chave === envKey) { _envRecusada = true; return gerarComBusca({ system, content, model, maxBuscas, supaUrl, serviceKey, envKey }); }
    return { texto: '', urls, erro: String(e && e.message || e).slice(0, 200) };
  }
}
