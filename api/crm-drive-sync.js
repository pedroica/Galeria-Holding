// api/crm-drive-sync.js — Copia backup diário do Supabase Storage para o Google Drive
// Cron: segunda 10:00 UTC (07:00 BRT) via vercel.json
// Mantém as últimas 8 semanas no Drive e apaga as mais antigas
// Requer env: SUPA_CRM_SERVICE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_FOLDER_ID

import { createSign } from 'node:crypto';

export const config = { maxDuration: 60 };

const SUPA_URL        = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_SVC        = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET     = process.env.CRON_SECRET;
const SA_JSON         = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; // ID da pasta "CRM Galeria/backups"
const BUCKET          = 'backups';
const KEEP_WEEKS      = 8;

// ── Google OAuth2 (service account) ──────────────────────────────────────────

async function googleToken() {
  const sa  = JSON.parse(SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const pay = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(hdr + '.' + pay);
  const jwt = hdr + '.' + pay + '.' + sign.sign(sa.private_key, 'base64url');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) throw new Error('Google auth: ' + await r.text());
  return (await r.json()).access_token;
}

// ── Google Drive helpers ──────────────────────────────────────────────────────

function driveH(token, extra) {
  return Object.assign({ Authorization: 'Bearer ' + token }, extra || {});
}

async function driveCreateFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: driveH(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!r.ok) throw new Error('Drive createFolder: ' + await r.text());
  return (await r.json()).id;
}

async function driveUpload(token, name, content, mimeType, parentId) {
  const meta = JSON.stringify({ name, parents: [parentId] });
  const bnd  = 'crm_sync_bnd_20261001';
  const body = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bnd}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${bnd}--`;
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: driveH(token, { 'Content-Type': `multipart/related; boundary="${bnd}"` }),
    body,
  });
  return r.ok;
}

async function driveListFolders(token, parentId) {
  const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100`, {
    headers: driveH(token),
  });
  return r.ok ? (await r.json()).files || [] : [];
}

async function driveDelete(token, id) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
    method: 'DELETE', headers: driveH(token),
  });
}

// ── Supabase Storage helpers ──────────────────────────────────────────────────

function supaH() {
  return { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC };
}

async function supaList(prefix) {
  const r = await fetch(SUPA_URL + '/storage/v1/object/list/' + BUCKET, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, supaH()),
    body: JSON.stringify({ prefix, limit: 200, offset: 0 }),
  });
  return r.ok ? r.json() : [];
}

async function supaDownload(path) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`, { headers: supaH() });
  return r.ok ? r.text() : null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!CRON_SECRET || auth !== CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  if (!SUPA_SVC)        return res.status(500).json({ error: 'SUPA_CRM_SERVICE_KEY não configurada' });
  if (!SA_JSON)         return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON não configurada' });
  if (!DRIVE_FOLDER_ID) return res.status(500).json({ error: 'GOOGLE_DRIVE_FOLDER_ID não configurada' });

  // Pasta do dia anterior (formato YYYY-MM-DD)
  const ontem = new Date(Date.now() - 86400_000);
  const pasta  = ontem.toISOString().slice(0, 10);

  // Verifica se a pasta existe no bucket
  const files = await supaList(pasta);
  if (!Array.isArray(files) || files.length === 0) {
    const aviso = `Pasta ${pasta} não encontrada no bucket`;
    await logCrm({ ok: false, pasta, aviso });
    return res.status(200).json({ ok: false, aviso });
  }

  const token = await googleToken();
  const dateFolderId = await driveCreateFolder(token, pasta, DRIVE_FOLDER_ID);

  let totalBytes = 0, totalArquivos = 0;
  const erros = [];

  for (const f of files) {
    if (!f.name) continue;
    const content = await supaDownload(pasta + '/' + f.name);
    if (content === null) { erros.push(f.name); continue; }
    const mime = f.name.endsWith('.json') ? 'application/json' : 'text/csv';
    const ok   = await driveUpload(token, f.name, content, mime, dateFolderId);
    if (ok) { totalArquivos++; totalBytes += Buffer.byteLength(content, 'utf8'); }
    else    { erros.push(f.name); }
  }

  // Apaga pastas com mais de 8 semanas
  const cutoff  = new Date(Date.now() - KEEP_WEEKS * 7 * 86400_000);
  const folders = await driveListFolders(token, DRIVE_FOLDER_ID);
  let deletados = 0;
  for (const f of folders) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.name) && new Date(f.name) < cutoff) {
      await driveDelete(token, f.id);
      deletados++;
    }
  }

  const tamanho = totalBytes < 1_048_576
    ? (totalBytes / 1024).toFixed(1) + ' KB'
    : (totalBytes / 1_048_576).toFixed(1) + ' MB';

  const result = { ok: true, pasta, totalArquivos, tamanho, deletados, erros };
  await logCrm(result);
  return res.status(200).json(result);
}

async function logCrm(detalhes) {
  await fetch(SUPA_URL + '/rest/v1/crm_logs', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, {
      apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC,
    }),
    body: JSON.stringify({ descricao: 'crm-drive-sync', detalhes: JSON.stringify(detalhes), criado_em: new Date().toISOString() }),
  }).catch(() => {});
}
