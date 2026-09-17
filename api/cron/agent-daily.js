// Stub — a rotina real do agente roda no Mac local (agent/worker.ts).
// Esta função só valida o CRON_SECRET e retorna ok.
// Schedule: "30 10 * * *"
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (CRON_SECRET && auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.status(200).json({ ok: true, msg: 'Agent runs locally — stub on Vercel' });
}
