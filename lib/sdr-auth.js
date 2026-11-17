// lib/sdr-auth.js — valida o Bearer do relógio (pg_cron) contra o segredo do
// Vault, sem depender de variável na Vercel. A comparação acontece no banco
// (RPC sdr_cron_token_valido, só service_role): o segredo nunca chega aqui.
// Cache curto em memória: só de tokens JÁ validados (sha256), 5 minutos.
// Um token recusado não é cacheado, para não travar a rotação do segredo.
import { createHash } from 'crypto';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // sha256(token) -> expira_em

export function _limparCache() { cache.clear(); }

export async function tokenSdrValido(token, { supaUrl, serviceKey }) {
  const t = String(token || '').trim();
  if (t.length < 16 || !supaUrl || !serviceKey) return false;
  const h = createHash('sha256').update(t).digest('hex');
  const exp = cache.get(h);
  if (exp && exp > Date.now()) return true;
  try {
    const r = await fetch(supaUrl + '/rest/v1/rpc/sdr_cron_token_valido', {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t })
    });
    if (!r.ok) return false;
    const ok = (await r.json().catch(() => false)) === true;
    if (ok) cache.set(h, Date.now() + TTL_MS);
    return ok;
  } catch (_) { return false; }
}
