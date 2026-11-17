// lib/graph-token.js — token do Microsoft Graph para os crons (server-side).
// Mesma lógica de getGraphToken em api/enrich.js: lê crm_oauth_tokens com a
// service key e renova pelo refresh_token quando perto de expirar.
// Nunca loga nem devolve o token para fora do servidor.

const MS_SCOPE = 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';

export async function obterTokenGraph({ supaUrl, serviceKey }) {
  const H = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
  const r = await fetch(supaUrl + '/rest/v1/crm_oauth_tokens?provider=eq.microsoft&not.refresh_token=is.null&order=updated_at.desc&limit=1&select=id,access_token,refresh_token,expires_at,account_email', { headers: H });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  const row = rows && rows[0];
  if (!row) return null;
  if (new Date(row.expires_at || 0) > new Date(Date.now() + 60000)) return { token: row.access_token, email: row.account_email };

  const cid = process.env.MS_CLIENT_ID, sec = process.env.MS_CLIENT_SECRET;
  if (!cid || !sec) return null;
  const tid = process.env.MS_TENANT_ID || 'common';
  const resp = await fetch(`https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: sec, grant_type: 'refresh_token', refresh_token: row.refresh_token, scope: MS_SCOPE }).toString()
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.access_token) return null;
  await fetch(supaUrl + '/rest/v1/crm_oauth_tokens?id=eq.' + row.id, {
    method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, H),
    body: JSON.stringify({
      access_token: data.access_token, refresh_token: data.refresh_token || row.refresh_token,
      expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(), updated_at: new Date().toISOString()
    })
  });
  return { token: data.access_token, email: row.account_email };
}
