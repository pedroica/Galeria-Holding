// lib/gmail-token.js — Gmail (Google OAuth) server-side. Usado por api/enrich.js
// (conectar, rascunho, envio) e por api/cron.js (rascunhos de madrugada e
// leitura de respostas). Tokens só em crm_oauth_tokens (provider='google',
// RLS restritivo); nunca são logados nem devolvidos ao frontend.

export const GMAIL_SCOPE = [
  'https://www.googleapis.com/auth/gmail.compose',   // criar rascunho e enviar
  'https://www.googleapis.com/auth/gmail.readonly',  // ler respostas e a assinatura
  'openid', 'email'
].join(' ');
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Credenciais do app Google: env da Vercel; se faltar, Vault do Supabase
// (google_client_id / google_client_secret, RPC sdr_google_oauth só service_role).
let _cred = { v: undefined, ate: 0 };
export async function credenciaisGoogle({ supaUrl, serviceKey }) {
  const id = (process.env.GOOGLE_CLIENT_ID || '').trim(), sec = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (id && sec) return { id, sec };
  if (_cred.ate > Date.now()) return _cred.v;
  let v = null;
  try {
    const r = await fetch(supaUrl + '/rest/v1/rpc/sdr_google_oauth', { method: 'POST', headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.ok) { const j = await r.json().catch(() => null); if (j && j.client_id && j.client_secret) v = { id: j.client_id, sec: j.client_secret }; }
  } catch (_) {}
  _cred = { v, ate: Date.now() + 5 * 60 * 1000 };
  return v;
}
export function _limparCacheGoogle() { _cred = { v: undefined, ate: 0 }; }

function H(serviceKey) { return { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' }; }

// Token válido do Gmail (renova pelo refresh_token quando perto de expirar).
export async function obterTokenGmail({ supaUrl, serviceKey }) {
  const r = await fetch(supaUrl + '/rest/v1/crm_oauth_tokens?provider=eq.google&refresh_token=not.is.null&order=updated_at.desc&limit=1&select=id,access_token,refresh_token,expires_at,account_email', { headers: H(serviceKey) });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  const row = rows && rows[0];
  if (!row) return null;
  if (row.access_token && new Date(row.expires_at || 0) > new Date(Date.now() + 60000)) return { token: row.access_token, email: row.account_email };
  const cred = await credenciaisGoogle({ supaUrl, serviceKey });
  if (!cred) return null;
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cred.id, client_secret: cred.sec, grant_type: 'refresh_token', refresh_token: row.refresh_token }).toString()
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.access_token) return null;
  await fetch(supaUrl + '/rest/v1/crm_oauth_tokens?id=eq.' + row.id, {
    method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, H(serviceKey)),
    body: JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token || row.refresh_token, expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(), updated_at: new Date().toISOString() })
  });
  return { token: data.access_token, email: row.account_email };
}

export async function gmailReq(method, path, body, token) {
  const r = await fetch(GMAIL + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : {}; } catch (_) { j = { raw: t }; }
  if (!r.ok) { const e = new Error((j && j.error && j.error.message) || ('gmail ' + r.status)); e.status = r.status; throw e; }
  return j;
}

// Assinatura padrão do Gmail (HTML). Rascunho criado pela API não recebe a
// assinatura sozinho, então ela é colada no fim do corpo.
const _assin = new Map();
export async function assinaturaGmail(token) {
  const c = _assin.get(token); if (c !== undefined) return c;
  let sig = '';
  try {
    const j = await gmailReq('GET', '/settings/sendAs', null, token);
    const lista = (j && j.sendAs) || [];
    const padrao = lista.find(s => s.isDefault) || lista.find(s => s.isPrimary) || lista[0];
    sig = (padrao && padrao.signature) || '';
  } catch (_) {}
  _assin.set(token, sig);
  return sig;
}

// Texto do corpo -> HTML simples (parágrafos), escapado.
export function textoParaHtml(t) {
  const esc = String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split(/\r?\n\r?\n/).map(p => '<p style="margin:0 0 12px 0">' + p.replace(/\r?\n/g, '<br>') + '</p>').join('');
}

// Tira "Pedro Ica" (e a linha da agência / "Abraço,") do fim: a assinatura vem do Gmail.
export function semAssinaturaTexto(corpo) {
  const lines = String(corpo || '').split('\n');
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const t = lines[i].trim().replace(/^(abra[çc]o|abs|att)[,.]?\s*/i, '');
    if (/^pedro ica\b/i.test(t)) {
      let end = i;
      if (end > 0 && /^(abra[çc]o|abs|att)[,.]?$/i.test(lines[end - 1].trim())) end--;
      while (end > 0 && !lines[end - 1].trim()) end--;
      return lines.slice(0, end).join('\n');
    }
  }
  return String(corpo || '');
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cabecalhoUtf8 = (s) => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';

// Message-ID determinístico por item da fila: é a chave de idempotência. Se o
// rascunho foi criado e a gravação do id falhou, a próxima tentativa o encontra
// por rfc822msgid: e adota, em vez de criar outro.
export function messageIdDaFila(filaId) { return filaId ? '<fila-' + String(filaId).replace(/[^a-zA-Z0-9-]/g, '') + '@agente.galeriaholding.crm>' : null; }

const b64linhas = (t) => Buffer.from(String(t || ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

// Mensagem MIME (RFC 2822) em base64url para users.drafts.create/update.
// multipart/alternative: texto puro + HTML (o cliente escolhe).
export function montarMime({ para, cco, cc, assunto, html, texto, inReplyTo, messageId }) {
  const fronteira = 'gh_' + Buffer.from(String(messageId || assunto || 'x')).toString('hex').slice(0, 24);
  const cab = [
    'To: ' + para,
    cc ? 'Cc: ' + cc : null,
    cco ? 'Bcc: ' + cco : null,
    'Subject: ' + cabecalhoUtf8(String(assunto || '')),
    messageId ? 'Message-ID: ' + messageId : null,
    inReplyTo ? 'In-Reply-To: ' + inReplyTo : null,
    inReplyTo ? 'References: ' + inReplyTo : null,
    'MIME-Version: 1.0'
  ].filter(l => l !== null);
  if (texto === undefined || texto === null) {
    return b64url(cab.concat(['Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64linhas(html)]).join('\r\n'));
  }
  return b64url(cab.concat([
    'Content-Type: multipart/alternative; boundary="' + fronteira + '"', '',
    '--' + fronteira, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64linhas(texto),
    '--' + fronteira, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64linhas(html),
    '--' + fronteira + '--', ''
  ]).join('\r\n'));
}

// Versão em texto da assinatura HTML (sem tags).
export function textoDaAssinatura(sigHtml) {
  return String(sigHtml || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
}

// Corpo final do rascunho: texto sem a assinatura em texto + assinatura do Gmail.
export function htmlDoRascunho(corpo, assinaturaHtml) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">' + textoParaHtml(semAssinaturaTexto(corpo)) + '</div>' +
    (assinaturaHtml ? '<br><div class="gmail_signature">' + assinaturaHtml + '</div>' : '');
}

// Cria o rascunho no Gmail. Devolve { id, messageId, link }.
// Link do Gmail na conta certa (authuser), não na primeira conta logada (u/0).
export function linkGmail(conta, hash) {
  return 'https://mail.google.com/mail/' + (conta ? '?authuser=' + encodeURIComponent(conta) : 'u/0/') + '#' + hash;
}

function rawDoRascunho({ para, cco, cc, assunto, corpo, sig, filaId }) {
  const textoSig = textoDaAssinatura(sig);
  const texto = semAssinaturaTexto(corpo) + (textoSig ? '\n\n--\n' + textoSig : '');
  return montarMime({ para, cco, cc, assunto, html: htmlDoRascunho(corpo, sig), texto, messageId: messageIdDaFila(filaId) });
}

// Procura um rascunho já criado para este item (pelo Message-ID determinístico).
export async function rascunhoExistenteGmail(token, filaId) {
  const mid = messageIdDaFila(filaId);
  if (!mid) return null;
  const q = 'rfc822msgid:' + mid.slice(1, -1);
  const l = await gmailReq('GET', '/drafts?maxResults=5&q=' + encodeURIComponent(q), null, token);
  const d = l && l.drafts && l.drafts[0];
  return d ? { id: d.id, messageId: d.message && d.message.id, threadId: d.message && d.message.threadId } : null;
}

// Cria o rascunho (users.drafts.create). Com filaId, é idempotente: se já houver
// rascunho deste item, devolve o existente com adotado=true.
// Devolve { id, messageId, link, adotado }. Só conta como sucesso com o id da API.
export async function criarRascunhoGmail(token, { para, cco, cc, assunto, corpo, conta, filaId }) {
  if (filaId) {
    const ja = await rascunhoExistenteGmail(token, filaId).catch(() => null);
    if (ja && ja.id) return { id: ja.id, messageId: ja.messageId, threadId: ja.threadId || null, link: linkGmail(conta, 'drafts?compose=' + (ja.messageId || '')), adotado: true };
  }
  const sig = await assinaturaGmail(token);
  const raw = rawDoRascunho({ para, cco, cc, assunto, corpo, sig, filaId });
  const d = await gmailReq('POST', '/drafts', { message: { raw } }, token);
  const msgId = d && d.message && d.message.id;
  if (!d || !d.id) throw new Error('Gmail não devolveu o id do rascunho');
  return { id: d.id, messageId: msgId, threadId: (d.message && d.message.threadId) || null, link: linkGmail(conta, 'drafts?compose=' + (msgId || '')), adotado: false };
}

// Atualiza o rascunho existente (users.drafts.update) com o texto editado no CRM.
// 404 = o rascunho não existe mais no Gmail (apagado ou enviado).
export async function atualizarRascunhoGmail(token, draftId, { para, cco, cc, assunto, corpo, conta, filaId }) {
  const sig = await assinaturaGmail(token);
  const raw = rawDoRascunho({ para, cco, cc, assunto, corpo, sig, filaId });
  const d = await gmailReq('PUT', '/drafts/' + encodeURIComponent(draftId), { id: draftId, message: { raw } }, token);
  const msgId = d && d.message && d.message.id;
  return { id: d.id || draftId, messageId: msgId, link: linkGmail(conta, 'drafts?compose=' + (msgId || '')) };
}

export async function enviarRascunhoGmail(token, draftId) {
  return gmailReq('POST', '/drafts/send', { id: draftId }, token);
}

// Mensagens da caixa de entrada desde um instante (para sdr-respostas).
// Devolve [{ id, threadId, remetente, assunto, preview, recebidoEm }].
export async function lerEntradaGmail(token, { desdeISO, max }) {
  const desde = Math.floor(new Date(desdeISO || Date.now() - 2 * 86400000).getTime() / 1000);
  const q = encodeURIComponent('in:inbox after:' + desde);
  const lista = await gmailReq('GET', '/messages?maxResults=' + (max || 50) + '&q=' + q, null, token);
  const out = [];
  for (const m of (lista.messages || [])) {
    const d = await gmailReq('GET', '/messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject', null, token);
    const hs = (d.payload && d.payload.headers) || [];
    const h = (n) => (hs.find(x => String(x.name).toLowerCase() === n) || {}).value || '';
    const from = h('from'); const em = (from.match(/<([^>]+)>/) || [null, from])[1];
    out.push({ id: d.id, threadId: d.threadId, remetente: String(em || '').trim().toLowerCase(), assunto: h('subject'), preview: d.snippet || '', recebidoEm: new Date(Number(d.internalDate || 0)).toISOString() });
  }
  out.sort((a, b) => a.recebidoEm.localeCompare(b.recebidoEm));
  return out;
}

// Gmail cria ids de rascunho no formato "r123..." (o Graph usa "AAMk..."): só os
// do Gmail são conferidos aqui.
export function ehRascunhoGmail(id) { return /^r-?\d+$/.test(String(id || '')); }

// O que aconteceu com um rascunho criado pelo SDR:
//  'rascunho' (ainda está lá), 'enviado' (sumiu e há e-mail no Enviados para o
//  destinatário depois da criação) ou 'apagado' (sumiu e não foi enviado).
export async function estadoDoRascunhoGmail(token, { draftId, para, desdeISO }) {
  try {
    await gmailReq('GET', '/drafts/' + encodeURIComponent(draftId) + '?format=minimal', null, token);
    return { estado: 'rascunho' };
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const after = Math.floor(new Date(desdeISO || Date.now() - 30 * 86400000).getTime() / 1000) - 120;
  const q = 'in:sent to:' + para + ' after:' + after;
  const l = await gmailReq('GET', '/messages?maxResults=3&q=' + encodeURIComponent(q), null, token);
  const m = l && l.messages && l.messages[0];
  if (!m) return { estado: 'apagado' };
  const d = await gmailReq('GET', '/messages/' + m.id + '?format=metadata&metadataHeaders=Subject', null, token);
  const hs = (d.payload && d.payload.headers) || [];
  const assunto = (hs.find(x => String(x.name).toLowerCase() === 'subject') || {}).value || '';
  return { estado: 'enviado', messageId: d.id, threadId: d.threadId, assunto, enviadoEm: new Date(Number(d.internalDate || Date.now())).toISOString() };
}
