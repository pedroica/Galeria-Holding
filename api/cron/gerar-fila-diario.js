// D4 — Cron diário 6h BRT: gerar fila email + WA + LinkedIn automaticamente
// Schedule: "0 9 * * *" (9h UTC = 6h BRT)
// Não requer JWT: usa SERVICE_ROLE_KEY direto

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY;
const BASE_URL = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://galeria-holding.vercel.app';

export default async function handler(req, res) {
  // Vercel cron envia Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // Gerar token de serviço temporário para chamar /api/gerar-fila
    const signRes = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.CRON_EMAIL || '', password: process.env.CRON_PASSWORD || '' })
    });

    let jwt = '';
    if (signRes.ok) {
      const d = await signRes.json();
      jwt = d.access_token || '';
    }

    // Chamar gerar-fila para todos os canais, limite 40 por run
    const r = await fetch(BASE_URL + '/api/gerar-fila', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + jwt
      },
      body: JSON.stringify({ canais: ['email', 'whatsapp', 'linkedin_convite'], limite: 40 })
    });

    const data = await r.json();
    console.log('[cron:gerar-fila-diario]', data.gerados, 'mensagens geradas', data.erros?.length || 0, 'erros');
    return res.status(200).json({ ok: true, ...data });
  } catch (e) {
    console.error('[cron:gerar-fila-diario] erro:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
