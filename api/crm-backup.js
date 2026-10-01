// api/crm-backup.js — exporta tabelas crm_ para Supabase Storage (bucket "backups")
// GET (sem params)      : cron Vercel 02h UTC — grava CSV, JSON e ZIP no bucket
// GET ?zip=1            : baixa ZIP do bucket (segundos); se ainda não houver, dispara geração e retorna 202
// GET ?zip=1&dia=AAAA-MM-DD : baixa ZIP de um dia já salvo no bucket
// POST                  : alias do cron (trigger manual via CRON_SECRET ou service key)

export const config = { maxDuration: 60 };

import { deflateRawSync } from 'node:zlib';

const SUPA_URL    = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_SVC    = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const BUCKET      = 'backups';
const RETENTION   = 30; // dias

const CRM_TABLES = [
  'crm_oportunidades','crm_empresas','crm_decisores','crm_agencias',
  'crm_usuarios','crm_toques','crm_fila','crm_oportunidade_eventos',
  'crm_auditoria','crm_logs'
];

// ── ZIP builder (sem dependências externas) ───────────────────────────────────

function _crc32Table() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}
const CRC_TABLE = _crc32Table();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8));
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime() {
  const d = new Date();
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

function buildZip(entries) {
  const { date, time } = dosDateTime();
  const locals   = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const raw  = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const comp = deflateRawSync(raw, { level: 6 });
    const crc  = crc32(raw);
    const nb   = Buffer.from(name, 'utf8');

    const lhdr = Buffer.alloc(30 + nb.length);
    lhdr.writeUInt32LE(0x04034b50, 0);
    lhdr.writeUInt16LE(20, 4);
    lhdr.writeUInt16LE(0, 6);
    lhdr.writeUInt16LE(8, 8);
    lhdr.writeUInt16LE(time, 10);
    lhdr.writeUInt16LE(date, 12);
    lhdr.writeUInt32LE(crc, 14);
    lhdr.writeUInt32LE(comp.length, 18);
    lhdr.writeUInt32LE(raw.length, 22);
    lhdr.writeUInt16LE(nb.length, 26);
    lhdr.writeUInt16LE(0, 28);
    nb.copy(lhdr, 30);

    locals.push(lhdr, comp);

    const chdr = Buffer.alloc(46 + nb.length);
    chdr.writeUInt32LE(0x02014b50, 0);
    chdr.writeUInt16LE(20, 4);
    chdr.writeUInt16LE(20, 6);
    chdr.writeUInt16LE(0, 8);
    chdr.writeUInt16LE(8, 10);
    chdr.writeUInt16LE(time, 12);
    chdr.writeUInt16LE(date, 14);
    chdr.writeUInt32LE(crc, 16);
    chdr.writeUInt32LE(comp.length, 20);
    chdr.writeUInt32LE(raw.length, 24);
    chdr.writeUInt16LE(nb.length, 28);
    chdr.writeUInt16LE(0, 30);
    chdr.writeUInt16LE(0, 32);
    chdr.writeUInt16LE(0, 34);
    chdr.writeUInt16LE(0, 36);
    chdr.writeUInt32LE(0, 38);
    chdr.writeUInt32LE(offset, 42);
    nb.copy(chdr, 46);
    centrals.push(chdr);

    offset += lhdr.length + comp.length;
  }

  const cd  = Buffer.concat(centrals);
  const eod = Buffer.alloc(22);
  eod.writeUInt32LE(0x06054b50, 0);
  eod.writeUInt16LE(0, 4);
  eod.writeUInt16LE(0, 6);
  eod.writeUInt16LE(entries.length, 8);
  eod.writeUInt16LE(entries.length, 10);
  eod.writeUInt32LE(cd.length, 12);
  eod.writeUInt32LE(offset, 16);
  eod.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cd, eod]);
}

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

async function storageDownloadBinary(path) {
  const r = await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    headers: storageHeaders()
  });
  if (!r.ok) return null;
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
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

// ── Auth helpers ───────────────────────────────────────────────────────────────

function isCronOrService(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return (CRON_SECRET && auth === CRON_SECRET) || auth === SUPA_SVC;
}

async function resolveAuth(req) {
  if (isCronOrService(req)) return true;
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth) return false;
  try {
    const uRes = await fetch(SUPA_URL + '/auth/v1/user', {
      headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + auth }
    });
    if (uRes.ok) {
      const { email } = await uRes.json();
      if (email) {
        const uDb = await fetch(
          SUPA_URL + '/rest/v1/crm_usuarios?email=eq.' + encodeURIComponent(email) + '&papel=eq.admin&ativo=eq.true&select=email&limit=1',
          { headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC } }
        );
        const rows = uDb.ok ? await uDb.json() : [];
        return Array.isArray(rows) && rows.length > 0;
      }
    }
  } catch (_) {}
  return false;
}

async function logRun(descricao, detalhes) {
  await fetch(SUPA_URL + '/rest/v1/crm_logs', {
    method: 'POST',
    headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ descricao, detalhes: JSON.stringify(detalhes), criado_em: new Date().toISOString() })
  }).catch(() => {});
}

// ── Backup: busca tabelas, grava CSV/JSON/ZIP no bucket ───────────────────────

async function runBackup() {
  const pasta = new Date().toISOString().slice(0, 10);
  const tabelas = [];
  const erros   = [];
  const entries = [];

  for (const table of CRM_TABLES) {
    try {
      const rows = await fetchTable(table);
      const csv  = toCSV(rows);
      const json = JSON.stringify(rows);
      entries.push(
        { name: pasta + '/' + table + '.csv',  data: csv  },
        { name: pasta + '/' + table + '.json', data: json }
      );
      await Promise.all([
        storageUpload(pasta + '/' + table + '.csv',  csv,  'text/csv'),
        storageUpload(pasta + '/' + table + '.json', json, 'application/json')
      ]);
      tabelas.push({ tabela: table, linhas: rows.length });
    } catch (e) {
      erros.push({ tabela: table, erro: String(e) });
    }
  }

  // Grava ZIP pronto no bucket
  try {
    const zipBuf = buildZip(entries);
    await storageUpload(pasta + '/backup.zip', zipBuf, 'application/zip');
  } catch (e) {
    erros.push({ tabela: '_zip', erro: String(e) });
  }

  // Limpa pastas com mais de RETENTION dias
  let deletados = 0;
  try {
    const cutoff = new Date(Date.now() - RETENTION * 86400 * 1000);
    const allFolders = await storageList('');
    const toDelete = (Array.isArray(allFolders) ? allFolders : [])
      .filter(f => f.name && /^\d{4}-\d{2}-\d{2}$/.test(f.name) && new Date(f.name) < cutoff)
      .map(f => f.name + '/');
    for (const folder of toDelete) {
      const files = await storageList(folder.replace('/', ''));
      const paths = (Array.isArray(files) ? files : []).map(f => folder + f.name);
      deletados += await storageDelete(paths);
    }
  } catch (_) {}

  const result = { ok: true, pasta, tabelas, erros, deletados };
  await logRun('crm-backup diario', result);
  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (!SUPA_SVC) return res.status(500).json({ error: 'SUPA_CRM_SERVICE_KEY not set' });

  const { zip, dia } = req.query || {};

  // ── GET ?zip=1[&dia=AAAA-MM-DD] — baixa ZIP do bucket ────────────────────
  if (req.method === 'GET' && zip === '1') {
    const ok = await resolveAuth(req);
    if (!ok) return res.status(401).json({ error: 'unauthorized' });

    if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
      return res.status(400).json({ error: 'dia inválido' });
    }

    const label  = dia || new Date().toISOString().slice(0, 10);
    const zipBuf = await storageDownloadBinary(label + '/backup.zip');

    if (zipBuf) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="crm-backup-${label}.zip"`);
      res.setHeader('Content-Length', zipBuf.length);
      return res.status(200).end(zipBuf);
    }

    if (dia) {
      return res.status(404).json({ error: `Backup de ${dia} não encontrado no bucket` });
    }

    // ZIP de hoje ainda não existe — dispara geração em segundo plano
    const host  = req.headers.host || 'galeria-holding-sage.vercel.app';
    const proto = host.includes('localhost') ? 'http' : 'https';
    fetch(`${proto}://${host}/api/crm-backup`, {
      headers: { Authorization: 'Bearer ' + (CRON_SECRET || SUPA_SVC) }
    }).catch(() => {});

    return res.status(202).json({ message: 'ZIP ainda não gerado. Produção em andamento — tente novamente em 1 minuto.' });
  }

  // ── GET sem params (cron Vercel) OU POST (trigger manual) — roda backup ──
  if (req.method === 'GET' || req.method === 'POST') {
    if (!isCronOrService(req)) return res.status(401).json({ error: 'unauthorized' });
    const result = await runBackup();
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'método não suportado' });
}
