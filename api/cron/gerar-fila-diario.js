// D4 — Cron diário 6h BRT: gerar fila email + WA + LinkedIn automaticamente
// Auth: CRON_SECRET (sem CRON_EMAIL/CRON_PASSWORD)
// Schedule: "0 9 * * *" (9h UTC = 6h BRT)

const BASE_URL = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://galeria-holding.vercel.app';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const r = await fetch(BASE_URL + '/api/gerar-fila', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (process.env.CRON_SECRET || SUPA_KEY || '')
      },
      body: JSON.stringify({ canais: ['email', 'whatsapp', 'linkedin_convite'], limite: 40 })
    });

    const data = await r.json();
    console.log('[cron:gerar-fila-diario]', data.gerados, 'gerados', data.erros?.length || 0, 'erros');
    return res.status(200).json({ ok: true, ...data });
  } catch (e) {
    console.error('[cron:gerar-fila-diario] erro:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
