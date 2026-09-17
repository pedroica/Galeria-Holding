// D4 — Cron semanal: Google News RSS para empresas com estrelas >= 3
// Usa crm_empresa_agencia_estrelas (estrelas_manual vence estrelas_calculadas)
// Schedule: "0 10 * * 1" (segunda 10h UTC = 7h BRT)

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;

async function sg(path) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
  });
  return r.ok ? r.json() : [];
}

async function sp(path, body, method = 'POST') {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    method, headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  });
  return r.ok;
}

async function buscarNoticias(empresa) {
  const q = encodeURIComponent('"' + empresa.nome + '"');
  const url = `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419&num=3`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    return items.slice(0, 3).map(m => {
      const get = (tag) => { const x = m[1].match(new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + tag + '>|<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return x ? (x[1] || x[2] || '').trim() : ''; };
      return { titulo: get('title'), url: get('link'), fonte: get('source'), publicado_em: get('pubDate') };
    }).filter(n => n.titulo);
  } catch (e) { return []; }
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Buscar empresa_ids com estrelas >= 3 via crm_empresa_agencia_estrelas
  // or=(estrelas_manual.gte.3,estrelas_calculadas.gte.3) cobre ambos os campos
  const scoreRows = await sg(
    'crm_empresa_agencia_estrelas?or=(estrelas_manual.gte.3,estrelas_calculadas.gte.3)&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=1000'
  );

  // Deduplica por empresa_id; usa maior valor
  const empMap = {};
  for (const r of (Array.isArray(scoreRows) ? scoreRows : [])) {
    const eff = r.estrelas_manual != null ? Number(r.estrelas_manual) : Number(r.estrelas_calculadas || 0);
    if (eff >= 3 && (!empMap[r.empresa_id] || eff > empMap[r.empresa_id])) {
      empMap[r.empresa_id] = eff;
    }
  }
  const empresaIds = Object.keys(empMap);
  if (empresaIds.length === 0) return res.status(200).json({ ok: true, processadas: 0, inseridas: 0, msg: 'Nenhuma empresa com estrelas >= 3' });

  // Busca nomes em lotes de 50
  const lotes = [];
  for (let i = 0; i < Math.min(empresaIds.length, 200); i += 50) {
    const slice = empresaIds.slice(i, i + 50);
    const rows = await sg(`crm_empresas?id=in.(${slice.join(',')})&select=id,nome`);
    if (Array.isArray(rows)) lotes.push(...rows);
  }
  const empresas = lotes;

  let inseridas = 0;
  for (const emp of empresas) {
    const noticias = await buscarNoticias(emp);
    for (const n of noticias) {
      const ok = await sp('crm_noticias', {
        empresa_id: emp.id,
        titulo: n.titulo.slice(0, 500),
        url: n.url || null,
        fonte: n.fonte || 'Google News',
        publicado_em: n.publicado_em ? new Date(n.publicado_em).toISOString() : null
      });
      if (ok) inseridas++;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('[cron:noticias-semanal]', inseridas, 'notícias para', empresas.length, 'empresas (de', empresaIds.length, 'com estrelas>=3)');
  return res.status(200).json({ ok: true, empresas: empresas.length, inseridas });
}
