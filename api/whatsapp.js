// Stub — webhook WhatsApp. A lógica real roda no Mac local (agent/worker.ts).
// Esta função só faz o handshake de verificação da Meta e retorna 200.
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'forbidden' });
  }
  if (req.method === 'POST') {
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'method not allowed' });
}
