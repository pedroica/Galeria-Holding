// C7 — Gerar credencial: cria registro em crm_credenciais_geradas e retorna token + html_url
// POST /api/gerar-credencial
// Body: { empresa_id?, agencia_ids, idioma, blocos, cases, titulo }
// Auth: Bearer Supabase JWT (autenticado)

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY;

async function supaPost(path, body) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function supaVerifyJWT(jwt) {
  const res = await fetch(SUPA_URL + '/auth/v1/user', {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + jwt }
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const jwt = auth.replace('Bearer ', '').trim();
  if (!jwt || !(await supaVerifyJWT(jwt))) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { empresa_id, agencia_ids, idioma = 'pt', blocos = [], cases = [], titulo } = req.body || {};
  if (!Array.isArray(blocos) || !Array.isArray(agencia_ids)) {
    return res.status(400).json({ error: 'blocos e agencia_ids são obrigatórios' });
  }

  const record = {
    empresa_id: empresa_id || null,
    agencia_ids: agencia_ids,
    idioma,
    blocos,
    cases,
    titulo: titulo || 'Galeria Holding',
    criado_por: jwt.slice(0, 8)
  };

  const rows = await supaPost('crm_credenciais_geradas', record);
  if (!Array.isArray(rows) || !rows[0]) {
    return res.status(500).json({ error: 'Erro ao criar credencial' });
  }

  const cred = rows[0];
  const baseUrl = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://galeria-holding.vercel.app';
  const html_url = baseUrl + '/c/' + cred.token;

  // Salvar html_url no registro
  await fetch(SUPA_URL + '/rest/v1/crm_credenciais_geradas?id=eq.' + cred.id, {
    method: 'PATCH',
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ html_url })
  });

  return res.status(200).json({
    id: cred.id,
    token: cred.token,
    html_url,
    expira_em: cred.expira_em
  });
}
