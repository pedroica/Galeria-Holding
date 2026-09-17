// Proxy unificado: Hunter.io, Lusha e health check.
// Consolida api/hunter.js + api/lusha.js + api/health.js num único handler
// para respeitar o limite de 12 Serverless Functions do plano Hobby da Vercel.
const HUNTER_KEY = process.env.HUNTER_KEY;
const LUSHA_KEY = process.env.LUSHA_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  const { provider, health } = req.query;

  if (health || provider === 'health') {
    return res.status(200).json({ ok: true, claude: !!ANTHROPIC_KEY, hunter: !!HUNTER_KEY, lusha: !!LUSHA_KEY });
  }

  if (provider === 'hunter') {
    if (!HUNTER_KEY) return res.status(500).json({ error: 'HUNTER_KEY não configurada' });
    const { mode = 'domain', domain = '', email = '', limit = '10' } = req.query;
    const url = mode === 'verify'
      ? `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_KEY}`
      : `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_KEY}&limit=${encodeURIComponent(limit)}`;
    try {
      const r = await fetch(url);
      return res.status(r.status).json(await r.json());
    } catch (e) {
      return res.status(502).json({ error: String(e) });
    }
  }

  if (provider === 'lusha') {
    if (!LUSHA_KEY) return res.status(500).json({ error: 'LUSHA_KEY não configurada' });
    const { firstName = '', lastName = '', company = '' } = req.query;
    const url = `https://api.lusha.com/v2/person?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&company=${encodeURIComponent(company)}`;
    try {
      const r = await fetch(url, { headers: { api_key: LUSHA_KEY } });
      return res.status(r.status).json(await r.json());
    } catch (e) {
      return res.status(502).json({ error: String(e) });
    }
  }

  return res.status(400).json({ error: 'provider inválido. Use: hunter, lusha, health' });
}
