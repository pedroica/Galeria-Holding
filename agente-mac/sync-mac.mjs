#!/usr/bin/env node
// agente-mac/sync-mac.mjs — leva o WhatsApp do Mac e os Contatos do Pedro para o CRM.
// Roda no Mac do Pedro a cada 15 min (launchd: com.galeriaholding.sync-mac). Só LÊ os
// bancos locais (sqlite em modo somente leitura); nunca envia nada pelo WhatsApp.
// Config em ~/.galeria-sync/config.json: { url, token, cursor_msg, hash_contatos, hash_conversas }.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const CFG_PATH = join(HOME, '.galeria-sync', 'config.json');
const WA = join(HOME, 'Library/Group Containers/group.net.whatsapp.WhatsApp.shared');
const CHAT = join(WA, 'ChatStorage.sqlite');
const CONTATOS_WA = join(WA, 'ContactsV2.sqlite');
const EPOCH = 978307200; // Core Data → Unix
const log = (...a) => console.log(new Date().toISOString(), ...a);

const TESTE = process.argv.includes('--teste');   // só conta o que leria, sem enviar
const cfg = TESTE && !existsSync(CFG_PATH) ? {} : JSON.parse(readFileSync(CFG_PATH, 'utf8'));
const salvar = () => writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });

function sql(db, query, anexos = []) {
  const pre = anexos.map(([alias, f]) => `ATTACH 'file:${f.replace(/'/g, "''")}?mode=ro' AS ${alias};`).join(' ');
  const out = execFileSync('/usr/bin/sqlite3', ['-readonly', '-json', `file:${db}?mode=ro`, pre + query], { maxBuffer: 512 * 1024 * 1024 }).toString();
  return out.trim() ? JSON.parse(out) : [];
}
async function enviar(acao, dados) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const r = await fetch(cfg.url + '/api/enrich?provider=mac-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-token': cfg.token }, body: JSON.stringify(Object.assign({ acao }, dados)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    } catch (e) {
      if (tentativa >= 3) throw e;
      await new Promise(ok => setTimeout(ok, 3000 * tentativa));
    }
  }
}
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso = (s) => (s == null ? null : new Date((Number(s) + EPOCH) * 1000).toISOString());

// ── Contatos (app Contatos do Mac, sincronizado com o iPhone pelo iCloud) ──
function lerContatos() {
  const base = join(HOME, 'Library/Application Support/AddressBook');
  const dbs = [join(base, 'AddressBook-v22.abcddb')];
  const src = join(base, 'Sources');
  if (existsSync(src)) for (const d of readdirSync(src)) { const f = join(src, d, 'AddressBook-v22.abcddb'); if (existsSync(f)) dbs.push(f); }
  const porId = new Map();
  for (const db of dbs) {
    const linhas = sql(db, `SELECT r.ZUNIQUEID id, r.ZFIRSTNAME nome, r.ZLASTNAME sobrenome, r.ZNICKNAME apelido, r.ZORGANIZATION empresa, r.ZJOBTITLE cargo,
      (SELECT group_concat(p.ZFULLNUMBER, '|') FROM ZABCDPHONENUMBER p WHERE p.ZOWNER = r.Z_PK) tels,
      (SELECT group_concat(e.ZADDRESS, '|') FROM ZABCDEMAILADDRESS e WHERE e.ZOWNER = r.Z_PK) emails
      FROM ZABCDRECORD r WHERE r.ZUNIQUEID IS NOT NULL AND (r.ZFIRSTNAME IS NOT NULL OR r.ZLASTNAME IS NOT NULL OR r.ZORGANIZATION IS NOT NULL);`);
    for (const l of linhas) {
      const c = { id: l.id, nome: l.nome || null, sobrenome: l.sobrenome || null, apelido: l.apelido || null, empresa: l.empresa || null, cargo: l.cargo || null,
        telefones: (l.tels || '').split('|').filter(Boolean), emails: (l.emails || '').split('|').filter(Boolean) };
      if (!c.telefones.length && !c.emails.length) continue;
      porId.set(c.id, c);
    }
  }
  return [...porId.values()];
}

// ── Conversas e mensagens (WhatsApp do Mac) ──
function lerConversas() {
  return sql(CHAT, `SELECT c.ZCONTACTJID jid, c.ZSESSIONTYPE sessao, c.ZPARTNERNAME nome, c.ZARCHIVED arquivada, c.ZLASTMESSAGEDATE ultima,
      (SELECT count(*) FROM ZWAMESSAGE m WHERE m.ZCHATSESSION = c.Z_PK) mensagens,
      COALESCE(a1.ZPHONENUMBER, a2.ZPHONENUMBER) telefone
    FROM ZWACHATSESSION c
    LEFT JOIN k.ZWAADDRESSBOOKCONTACT a1 ON a1.ZLID = c.ZCONTACTJID
    LEFT JOIN k.ZWAADDRESSBOOKCONTACT a2 ON a2.ZWHATSAPPID = c.ZCONTACTJID
    WHERE c.ZCONTACTJID IS NOT NULL AND c.ZREMOVED IS NOT 1;`, [['k', CONTATOS_WA]])
    .map(c => ({ jid: c.jid, sessao: c.sessao, nome: c.nome, arquivada: !!c.arquivada, ultima_em: iso(c.ultima), mensagens: c.mensagens, telefone: c.telefone ? String(c.telefone).replace(/\D/g, '') : null }));
}
const TIPOS_MIDIA = [1, 2, 3, 4, 5, 8, 11, 15, 46];
function lerMensagens(depoisDe, limite) {
  return sql(CHAT, `SELECT m.Z_PK pk, c.ZCONTACTJID jid, COALESCE(m.ZSTANZAID, 'pk' || m.Z_PK) stanza, m.ZISFROMME de_mim, m.ZTEXT texto, m.ZMESSAGETYPE tipo,
      m.ZMESSAGEDATE data, COALESCE(gm.ZCONTACTNAME, gm.ZFIRSTNAME, CAST(m.ZPUSHNAME AS TEXT)) autor_nome,
      COALESCE(a1.ZPHONENUMBER, a2.ZPHONENUMBER) autor_tel
    FROM ZWAMESSAGE m
    JOIN ZWACHATSESSION c ON c.Z_PK = m.ZCHATSESSION
    LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER
    LEFT JOIN k.ZWAADDRESSBOOKCONTACT a1 ON a1.ZLID = gm.ZMEMBERJID
    LEFT JOIN k.ZWAADDRESSBOOKCONTACT a2 ON a2.ZWHATSAPPID = gm.ZMEMBERJID
    WHERE m.Z_PK > ${Number(depoisDe) || 0} AND c.ZCONTACTJID IS NOT NULL AND m.ZMESSAGEDATE IS NOT NULL
    ORDER BY m.Z_PK LIMIT ${limite};`, [['k', CONTATOS_WA]]);
}

async function main() {
  const t0 = Date.now();
  const resumo = { contatos: 0, conversas: 0, mensagens: 0 };
  if (!existsSync(CHAT)) throw new Error('WhatsApp do Mac não encontrado em ' + WA);

  const contatos = lerContatos();
  const hc = hash(contatos);
  if (hc !== cfg.hash_contatos) {
    const tot = {};
    for (let i = 0; i < contatos.length; i += 400) {
      const r = await enviar('contatos', { contatos: contatos.slice(i, i + 400) });
      for (const [k, v] of Object.entries(r)) if (typeof v === 'number') tot[k] = (tot[k] || 0) + v;
    }
    cfg.hash_contatos = hc; salvar(); resumo.contatos = contatos.length; resumo.contatos_detalhe = tot;
    log('contatos', JSON.stringify(tot));
  }

  const conversas = lerConversas();
  const hv = hash(conversas.map(c => [c.jid, c.ultima_em, c.mensagens, c.nome, c.telefone]));
  if (hv !== cfg.hash_conversas) {
    for (let i = 0; i < conversas.length; i += 1000) await enviar('conversas', { conversas: conversas.slice(i, i + 1000) });
    cfg.hash_conversas = hv; salvar(); resumo.conversas = conversas.length;
    log('conversas', conversas.length);
  }

  for (;;) {
    const lote = lerMensagens(cfg.cursor_msg || 0, 2500);
    if (!lote.length) break;
    const msgs = lote.filter(m => m.texto || TIPOS_MIDIA.includes(m.tipo)).map(m => ({
      jid: m.jid, stanza: m.stanza, de_mim: m.de_mim === 1, texto: m.texto || null, tipo: m.tipo, enviada_em: iso(m.data),
      autor_nome: m.de_mim === 1 ? null : (m.autor_nome || null), autor_telefone: m.autor_tel ? String(m.autor_tel).replace(/\D/g, '') : null }));
    if (msgs.length) await enviar('mensagens', { mensagens: msgs });
    cfg.cursor_msg = lote[lote.length - 1].pk; salvar();
    resumo.mensagens += msgs.length;
    if (Date.now() - t0 > 12 * 60 * 1000) break;   // não encavala com a próxima rodada
  }
  log('mensagens', resumo.mensagens, 'cursor', cfg.cursor_msg);
  const fim = await enviar('fim', { resumo });
  log('fim', JSON.stringify(fim), Math.round((Date.now() - t0) / 1000) + 's');
}

if (TESTE) {
  const c = lerContatos(), v = lerConversas(), m = lerMensagens(0, 100000);
  const tipos = {}; v.forEach(x => { const t = /@g\.us$/.test(x.jid) ? 'grupo' : /@(s\.whatsapp\.net|lid)$/.test(x.jid) ? 'pessoa' : 'outro'; tipos[t] = (tipos[t] || 0) + 1; });
  console.log(JSON.stringify({ contatos: c.length, com_empresa: c.filter(x => x.empresa).length, conversas: v.length, por_tipo: tipos, pessoa_com_telefone: v.filter(x => x.telefone || /@s\.whatsapp\.net$/.test(x.jid)).length, mensagens: m.length, com_texto: m.filter(x => x.texto).length, de_mim: m.filter(x => x.de_mim === 1).length }));
  process.exit(0);
}
main().catch(e => { log('ERRO', e && e.message || e); process.exit(1); });
