// api/crm-backup.js — exports all crm_ tables to Google Drive "CRM Galeria/backups"
// Triggered: POST /api/crm-backup (manual or cron)
// Env: SUPA_CRM_URL, SUPA_CRM_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY),
//      GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_FOLDER_ID, CRON_SECRET

export const config = { maxDuration: 60 };

const SUPA_URL   = process.env.SUPA_CRM_URL   || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_SVC   = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Tables to export (public schema, production only — no crm_test_)
const CRM_TABLES = [
  'crm_oportunidades', 'crm_empresas', 'crm_decisores', 'crm_agencias',
  'crm_usuarios', 'crm_toques', 'crm_fila', 'crm_oportunidade_eventos',
  'crm_auditoria', 'crm_logs'
];
const RETENTION_DAYS = 30;

// ── Google Drive helpers ──────────────────────────────────────────────────────

async function getGoogleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const claim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  // Import private key and sign
  const pemBody = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const keyDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const payload = header + '.' + claim;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(payload)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = payload + '.' + sigB64;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });
  const t = await r.json();
  return t.access_token || null;
}

async function findOrCreateFolder(token, name, parentId) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder'` +
            (parentId ? ` and '${parentId}' in parents` : '') + ` and trashed=false`;
  const list = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await list.json();
  if (data.files && data.files.length > 0) return data.files[0].id;

  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const f = await cr.json();
  return f.id || null;
}

async function uploadFile(token, folderId, filename, content, mimeType) {
  const meta = JSON.stringify({ name: filename, parents: [folderId] });
  const boundary = 'crm_backup_boundary';
  const body = [
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta,
    '\r\n--' + boundary + '\r\nContent-Type: ' + mimeType + '\r\n\r\n' + content,
    '\r\n--' + boundary + '--'
  ].join('');
  const r = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    }
  );
  return r.ok ? r.json() : null;
}

async function deleteOldBackups(token, folderId, prefix, keepAfterIso) {
  const q = `name contains '${prefix}' and '${folderId}' in parents and trashed=false and createdTime < '${keepAfterIso}'`;
  const list = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await list.json();
  for (const f of (data.files || [])) {
    await fetch('https://www.googleapis.com/drive/v3/files/' + f.id, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
    });
  }
  return (data.files || []).length;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchTable(table) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + table + '?select=*&limit=10000', {
    headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC, Accept: 'application/json' }
  });
  return r.ok ? r.json() : [];
}

function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\n');
}

async function logRun(descricao, detalhes) {
  await fetch(SUPA_URL + '/rest/v1/crm_logs', {
    method: 'POST',
    headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ descricao, detalhes: JSON.stringify(detalhes), criado_em: new Date().toISOString() })
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Auth: accept CRON_SECRET header or service key
  const auth = req.headers.authorization || '';
  const isValidAuth = (CRON_SECRET && auth === 'Bearer ' + CRON_SECRET) ||
                      (SUPA_SVC && auth === 'Bearer ' + SUPA_SVC);
  if (!isValidAuth) return res.status(401).json({ error: 'unauthorized' });

  if (!SUPA_SVC) return res.status(500).json({ error: 'SUPA_CRM_SERVICE_KEY not set' });

  const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!SA_JSON) return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not set' });

  let sa;
  try { sa = JSON.parse(SA_JSON); } catch { return res.status(500).json({ error: 'invalid GOOGLE_SERVICE_ACCOUNT_JSON' }); }

  const token = await getGoogleToken(sa);
  if (!token) return res.status(500).json({ error: 'failed to get Google token' });

  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
  const crmFolder = await findOrCreateFolder(token, 'CRM Galeria', rootId);
  const backupsFolder = await findOrCreateFolder(token, 'backups', crmFolder);

  const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  const results = [];
  const errors = [];

  for (const table of CRM_TABLES) {
    try {
      const rows = await fetchTable(table);
      const [csv, json] = [toCSV(rows), JSON.stringify(rows, null, 2)];
      const [csvFile, jsonFile] = await Promise.all([
        uploadFile(token, backupsFolder, `${ts}_${table}.csv`, csv, 'text/csv'),
        uploadFile(token, backupsFolder, `${ts}_${table}.json`, json, 'application/json')
      ]);
      results.push({ table, rows: rows.length, csvId: csvFile?.id, jsonId: jsonFile?.id });
    } catch (e) {
      errors.push({ table, error: String(e) });
    }
  }

  // Purge backups older than retention period
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400 * 1000).toISOString();
  const deleted = await deleteOldBackups(token, backupsFolder, ts.slice(0, 10).replace(/-/g, ''), cutoff).catch(() => 0);

  const summary = { ts, tables: results, errors, deletedOld: deleted };
  await logRun('crm-backup', summary);

  return res.status(200).json(summary);
}
