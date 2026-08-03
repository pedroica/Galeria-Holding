// Proxy Lusha — repassa firstName/lastName/company
export default async function handler(req, res) {
  if (!process.env.LUSHA_KEY) return res.status(500).json({ error: "LUSHA_KEY não configurada" });
  const { firstName = "", lastName = "", company = "" } = req.query;
  const url = `https://api.lusha.com/v2/person?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&company=${encodeURIComponent(company)}`;
  try {
    const r = await fetch(url, { headers: { api_key: process.env.LUSHA_KEY } });
    const d = await r.json();
    res.status(r.status).json(d);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
