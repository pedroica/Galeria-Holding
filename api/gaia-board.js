/* ═══════════════════════════════════════════════════════════════════════════
   /api/gaia-board — board GAIA publicado (link fixo para o time)
   Guarda APENAS o texto cifrado (AES-GCM, chave derivada do código de acesso
   no navegador). O servidor e o KV nunca veem os dados em claro.

   GET   → { ok, blob, updatedAt }         público: devolve o cifrado
   POST  → { ok, updatedAt }               exige header x-gaia-token
           body: { blob }

   Env vars (Vercel → Settings → Environment Variables):
     GAIA_PUBLISH_TOKEN   segredo que autoriza publicar (só o Pedro tem)
     KV_REST_API_URL      \ injetadas automaticamente ao conectar um
     KV_REST_API_TOKEN    / Upstash Redis / Vercel KV ao projeto
   Sem KV configurado o endpoint responde 501 e o app cai no modo "link
   com snapshot embutido", que funciona sem nenhuma infraestrutura.
   ═══════════════════════════════════════════════════════════════════════════ */

const KEY = "gaia:board:v1";
const MAX_BLOB = 512 * 1024; // 512KB — muito acima de um board real

function kv() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

async function kvCmd(store, command) {
  const r = await fetch(store.url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + store.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error("KV " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  return j.result;
}

function timingSafeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const store = kv();
  if (!store) {
    return res.status(501).json({
      error: "Link fixo não configurado. Conecte um Upstash Redis / Vercel KV ao projeto (gera KV_REST_API_URL e KV_REST_API_TOKEN) — ou use o link com snapshot embutido, que não exige nada disso."
    });
  }

  try {
    if (req.method === "GET") {
      const raw = await kvCmd(store, ["GET", KEY]);
      if (!raw) return res.status(404).json({ error: "Nenhum board publicado ainda." });
      const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
      return res.status(200).json({ ok: true, blob: rec.blob, updatedAt: rec.updatedAt || 0 });
    }

    if (req.method === "POST") {
      const secret = process.env.GAIA_PUBLISH_TOKEN;
      if (!secret) {
        return res.status(501).json({ error: "GAIA_PUBLISH_TOKEN não configurada no Vercel." });
      }
      if (!timingSafeEqual(req.headers["x-gaia-token"], secret)) {
        return res.status(401).json({ error: "Token de publicação inválido." });
      }
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const blob = body.blob;
      if (typeof blob !== "string" || !blob || !/^[A-Za-z0-9\-_]+$/.test(blob)) {
        return res.status(400).json({ error: "Campo 'blob' ausente ou inválido." });
      }
      if (blob.length > MAX_BLOB) {
        return res.status(413).json({ error: "Board grande demais." });
      }
      const updatedAt = Date.now();
      await kvCmd(store, ["SET", KEY, JSON.stringify({ blob, updatedAt })]);
      return res.status(200).json({ ok: true, updatedAt });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido." });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
