export default async function handler(req, res) {
  if (!process.env.HUNTER_KEY) return res.status(500).json({ error: "HUNTER_KEY não configurada" });
  const { mode = "domain", domain = "", email = "", limit = "10" } = req.query;
  let url;
  if (mode === "verify") {
    url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${process.env.HUNTER_KEY}`;
  } else {
    url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${process.env.HUNTER_KEY}&limit=${encodeURIComponent(limit)}`;
  }
  try {
    const r = await fetch(url);
    const d = await r.json();
    res.status(r.status).json(d);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
