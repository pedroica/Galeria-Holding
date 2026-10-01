// api/crm-backup.js — exporta tabelas crm_ para Supabase Storage (bucket "backups")
// Cron: 02h UTC (23h BRT) via vercel.json
// Manual: POST /api/crm-backup  Authorization: Bearer <CRON_SECRET ou SUPA_CRM_SERVICE_KEY>
// Retorno: { ok, ts, pasta, tabelas:[{tabela,linhas}], erros, deletados }

export const config = { maxDuration: 60 };

const SUPA_URL  = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_SVC  = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const BUCKET    = 'backups';
const RETENTION = 30; // dias

const CRM_TABLES = [
  'crm_oportunidades','crm_empresas','crm_decisores','crm_agencias',
  'crm_usuarios','crm_toques','crm_fila','crm_oportunidade_eventos',
  'crm_auditoria','crm_logs'
];

// ── Supabase Storage helpers ───────────────────────────────────────────────────

function storageHeaders(extra) {
  return Object.assign({ apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC }, extra || {});
}

async function storageUpload(path, body, contentType) {
  const r = await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': contentType, 'x-upsert': 'true' }),
    body
  });
  return r.ok;
}

async function storageList(prefix) {
  const r = await fetch(SUPA_URL + '/storage/v1/object/list/' + BUCKET, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 })
  });
  return r.ok ? r.json() : [];
}

async function storageDelete(paths) {
  if (!paths || paths.length === 0) return 0;
  const r = await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET, {
    method: 'DELETE',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: paths })
  });
  return r.ok ? paths.length : 0;
}

// ── Supabase DB helpers ────────────────────────────────────────────────────────

async function fetchTable(table) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + table + '?select=*&limit=10000', {
    headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC, Accept: 'application/json' }
  });
  return r.ok ? r.json() : [];
}

function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

async function logRun(descricao, detalhes) {
  await fetch(SUPA_URL + '/rest/v1/crm_logs', {
    method: 'POST',
    headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ descricao, detalhes: JSON.stringify(detalhes), criado_em: new Date().toISOString() })
  }).catch(() => {});
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!SUPA_SVC) return res.status(500).json({ error: 'SUPA_CRM_SERVICE_KEY not set' });
  let isValid = (CRON_SECRET && auth === CRON_SECRET) || auth === SUPA_SVC;
  if (!isValid && auth && auth !== SUPA_SVC) {
    // Accept Supabase JWT from admin users
    try {
      const uRes = await fetch(SUPA_URL + '/auth/v1/user', {
        headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + auth }
      });
      if (uRes.ok) {
        const uData = await uRes.json();
        const email = uData?.email;
        if (email) {
          const uDb = await fetch(SUPA_URL + '/rest/v1/crm_usuarios?email=eq.' + encodeURIComponent(email) + '&papel=eq.admin&ativo=eq.true&select=email&limit=1', {
            headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC }
          });
          const uRows = uDb.ok ? await uDb.json() : [];
          isValid = Array.isArray(uRows) && uRows.length > 0;
        }
      }
    } catch (_) {}
  }
  if (!isValid) return res.status(401).json({ error: 'unauthorized' });

  const now = new Date();
  const ts  = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  const pasta = ts.slice(0, 10); // YYYY-MM-DD

  const tabelas = [];
  const erros   = [];

  for (const table of CRM_TABLES) {
    try {
      const rows = await fetchTable(table);
      const csv  = toCSV(rows);
      const json = JSON.stringify(rows);
      await Promise.all([
        storageUpload(pasta + '/' + table + '.csv',  csv,  'text/csv'),
        storageUpload(pasta + '/' + table + '.json', json, 'application/json')
      ]);
      tabelas.push({ tabela: table, linhas: rows.length });
    } catch (e) {
      erros.push({ tabela: table, erro: String(e) });
    }
  }

  // Limpa pastas com mais de RETENTION dias
  let deletados = 0;
  try {
    const cutoff = new Date(Date.now() - RETENTION * 86400 * 1000);
    const allFolders = await storageList('');
    const toDelete = (Array.isArray(allFolders) ? allFolders : [])
      .filter(f => f.name && /^\d{4}-\d{2}-\d{2}$/.test(f.name) && new Date(f.name) < cutoff)
      .map(f => f.name + '/');
    if (toDelete.length > 0) {
      // list files inside each old folder then delete
      for (const folder of toDelete) {
        const files = await storageList(folder.replace('/', ''));
        const paths = (Array.isArray(files) ? files : []).map(f => folder + f.name);
        deletados += await storageDelete(paths);
      }
    }
  } catch (_) {}

  const result = { ok: true, ts, pasta, tabelas, erros, deletados };
  await logRun('crm-backup diario', result);

  return res.status(200).json(result);
}
