// Proxy unificado: Hunter.io, Lusha, Microsoft Graph e health check.
// Consolida múltiplas integrações num único handler para respeitar
// o limite de 12 Serverless Functions do plano Hobby da Vercel.
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HUNTER_KEY      = process.env.HUNTER_KEY;
const LUSHA_KEY       = process.env.LUSHA_KEY;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const MS_CLIENT_ID    = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET= process.env.MS_CLIENT_SECRET;
const MS_TENANT_ID    = process.env.MS_TENANT_ID;
const SUPA_URL        = 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_SVC        = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPA_ANON       = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';

// Carrega imagem de assinatura uma vez no cold start
const __dir = dirname(fileURLToPath(import.meta.url));
let SIG_B64 = null;
try {
  const buf = readFileSync(join(__dir, '..', 'assinatura_galeria_holding.png'));
  SIG_B64 = buf.toString('base64');
} catch {}

// ─── helpers ────────────────────────────────────────────────────────────────
function generateState() {
  return 'graphoauth_' + randomBytes(24).toString('hex');
}

function supaReq(path, opts) {
  return fetch(SUPA_URL + path, Object.assign({}, opts, {
    headers: Object.assign({
      'apikey': SUPA_SVC,
      'Authorization': 'Bearer ' + SUPA_SVC,
      'Content-Type': 'application/json'
    }, opts && opts.headers)
  })).then(function(r) { return r.ok ? r.json() : r.json().then(function(e){throw e;}); });
}

async function verifyUserJwt(token) {
  if (!token || token === 'undefined') return false;
  const r = await fetch(SUPA_URL + '/auth/v1/user', {
    headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + token }
  });
  return r.ok;
}

// ─── Graph token management ─────────────────────────────────────────────────
const MS_SCOPE     = 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';
const REDIRECT_URI = 'https://galeria-holding-sage.vercel.app/api/enrich';
function msTokenUrl() {
  const tid = MS_TENANT_ID || 'common';
  return `https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`;
}
function msAuthUrl() {
  const tid = MS_TENANT_ID || 'common';
  return `https://login.microsoftonline.com/${tid}/oauth2/v2.0/authorize`;
}

async function getGraphToken() {
  const rows = await supaReq(
    '/rest/v1/crm_oauth_tokens?provider=eq.microsoft' +
    '&not.refresh_token=is.null&order=updated_at.desc&limit=1' +
    '&select=id,access_token,refresh_token,expires_at,account_email'
  );
  const row = rows && rows[0];
  if (!row) return null;

  const expiresAt = new Date(row.expires_at || 0);
  const needsRefresh = expiresAt < new Date(Date.now() + 60000);

  if (!needsRefresh) return { token: row.access_token, email: row.account_email };

  // Refresh
  const refreshParams = {
    client_id:     MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: row.refresh_token,
    scope:         MS_SCOPE
  };
  const resp = await fetch(msTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(refreshParams).toString()
  });
  const data = await resp.json();
  if (data.error) return null;

  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supaReq('/rest/v1/crm_oauth_tokens?id=eq.' + row.id, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token || row.refresh_token,
      expires_at:    newExpiry,
      updated_at:    new Date().toISOString()
    })
  });
  return { token: data.access_token, email: row.account_email };
}

function graphReq(method, path, body, token) {
  return fetch('https://graph.microsoft.com/v1.0' + path, {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) {
    if (r.status === 204) return {};
    return r.json();
  });
}

// ─── HTML body builder ───────────────────────────────────────────────────────
function textToHtml(text) {
  return (text || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\r?\n\r?\n/g,'</p><p>')
    .replace(/\r?\n/g,'<br>');
}

function buildHtmlBody(corpo) {
  const content = textToHtml(corpo);
  const sigHtml = SIG_B64
    ? '<br><br><img src="cid:assinatura001" width="520" alt="Galeria Holding" style="max-width:520px;display:block;">'
    : '<br><br><span style="color:#666;font-size:12px;">— Galeria Holding</span>';
  return '<html><body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#222;line-height:1.5;">'
       + '<p>' + content + '</p>' + sigHtml + '</body></html>';
}

function buildDraftPayload(item) {
  const d = item.decisor || {};
  const corpo = (item.corpo || '').replace(/\nPedro Ica\s*$/, '').trimEnd();
  const payload = {
    subject: item.assunto || '(sem assunto)',
    body: { contentType: 'HTML', content: buildHtmlBody(corpo) },
    toRecipients: [{ emailAddress: { address: d.email, name: d.nome || '' } }]
  };
  if (SIG_B64) {
    payload.attachments = [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: 'assinatura_galeria_holding.png',
      contentType: 'image/png',
      isInline: true,
      contentId: 'assinatura001',
      contentBytes: SIG_B64
    }];
  }
  return payload;
}

// ─── OAuth callback (GET redirect from Microsoft) ────────────────────────────
async function handleOAuthCallback(req, res) {
  const { code, state, error, error_description } = req.query;
  const CRM_ROOT = 'https://galeria-holding-sage.vercel.app';

  if (error) {
    return res.redirect(302, CRM_ROOT + '?graph_error=' + encodeURIComponent(error_description || error));
  }
  if (!code || !state || !String(state).startsWith('graphoauth_')) {
    return res.redirect(302, CRM_ROOT + '?graph_error=invalid_callback');
  }
  if (!SUPA_SVC || !MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    return res.redirect(302, CRM_ROOT + '?graph_error=server_not_configured');
  }

  try {
    // Verifica state no banco
    const rows = await supaReq(
      '/rest/v1/crm_oauth_tokens?pkce_state=eq.' + encodeURIComponent(state) + '&select=id'
    );
    const row = rows && rows[0];
    if (!row) return res.redirect(302, CRM_ROOT + '?graph_error=state_not_found');

    // Troca code por token — confidential client com client_secret
    const tokenResp = await fetch(msTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code:          code,
        redirect_uri:  REDIRECT_URI,
        scope:         MS_SCOPE
      }).toString()
    });
    const tokenData = await tokenResp.json();
    if (tokenData.error) {
      return res.redirect(302, CRM_ROOT + '?graph_error=' + encodeURIComponent(tokenData.error_description || tokenData.error));
    }

    // Descobre e-mail da conta
    const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
    });
    const meData = await meResp.json();
    const email  = meData.mail || meData.userPrincipalName || '';
    const expiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Armazena tokens (nunca chegam ao frontend)
    await supaReq('/rest/v1/crm_oauth_tokens?id=eq.' + row.id, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        account_email:  email,
        access_token:   tokenData.access_token,
        refresh_token:  tokenData.refresh_token,
        expires_at:     expiry,
        pkce_state:     null,
        pkce_verifier:  null,
        updated_at:     new Date().toISOString()
      })
    });

    return res.redirect(302, CRM_ROOT + '?graph_connected=1');
  } catch (e) {
    return res.redirect(302, CRM_ROOT + '?graph_error=' + encodeURIComponent(String(e)));
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { provider, health } = req.query;

  // ── OAuth callback: Microsoft redireciona aqui com code+state ──────────────
  if (req.method === 'GET' && req.query.code && req.query.state) {
    return handleOAuthCallback(req, res);
  }

  // ── Health check ──────────────────────────────────────────────────────────
  if (health || provider === 'health') {
    return res.status(200).json({
      ok: true,
      claude: !!ANTHROPIC_KEY, hunter: !!HUNTER_KEY, lusha: !!LUSHA_KEY,
      graph: !!MS_CLIENT_ID, sig: !!SIG_B64
    });
  }

  // ── Hunter ────────────────────────────────────────────────────────────────
  if (provider === 'hunter') {
    if (!HUNTER_KEY) return res.status(500).json({ error: 'HUNTER_KEY não configurada' });
    const { mode = 'domain', domain = '', email = '', limit = '10' } = req.query;
    const url = mode === 'verify'
      ? `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_KEY}`
      : `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_KEY}&limit=${encodeURIComponent(limit)}`;
    try {
      const r = await fetch(url);
      return res.status(r.status).json(await r.json());
    } catch (e) {
      return res.status(502).json({ error: String(e) });
    }
  }

  // ── Lusha (enriquecimento individual — legado) ────────────────────────────
  if (provider === 'lusha') {
    if (!LUSHA_KEY) return res.status(500).json({ error: 'LUSHA_KEY não configurada' });
    const { firstName = '', lastName = '', company = '' } = req.query;
    const url = `https://api.lusha.com/v2/person?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&company=${encodeURIComponent(company)}`;
    try {
      const r = await fetch(url, { headers: { api_key: LUSHA_KEY } });
      return res.status(r.status).json(await r.json());
    } catch (e) {
      return res.status(502).json({ error: String(e) });
    }
  }

  // ── Lusha Search: busca candidatos por empresa/domínio sem gastar créditos ─
  if (provider === 'lusha-search') {
    if (!LUSHA_KEY) return res.status(500).json({ error: 'LUSHA_KEY não configurada. Variável: LUSHA_KEY. Obtenha em app.lusha.com → Settings → API.' });
    const { domain = '', company = '' } = req.query;
    if (!domain && !company) return res.status(400).json({ error: 'Informe domain ou company.' });

    // Cargos-alvo: C-suite (CEO/equivalente) + Marketing (CMO/equivalente)
    const targetTitles = [
      'CEO','Chief Executive Officer','Presidente','Diretor Geral','Director General',
      'Country Manager','Managing Director','Sócio Fundador','Fundador e CEO',
      'CMO','Chief Marketing Officer','VP Marketing','VP de Marketing',
      'VP of Marketing','Diretor de Marketing','Diretora de Marketing',
      'Director of Marketing','Head de Marketing','Head of Marketing',
      'Head de Growth','Head of Growth','VP Growth','Diretor de Comunicação',
      'VP Comunicação','Head de Comunicação'
    ];

    // Lusha Contacts API (prospecting) — busca sem revelar contatos
    const params = new URLSearchParams();
    if (domain) params.set('companyDomain', domain);
    if (company) params.set('companyName', company);
    params.set('country', 'Brazil');
    params.set('size', '30');
    params.set('page', '0');
    targetTitles.forEach(t => params.append('jobTitle', t));

    try {
      const r = await fetch(`https://api.lusha.com/v2/contacts?${params}`, {
        headers: { api_key: LUSHA_KEY }
      });
      const raw = await r.json();

      if (!r.ok) {
        // Lusha não tem prospecting no plano; tenta via company name search
        return res.status(r.status).json({ error: raw.error || raw.message || JSON.stringify(raw), raw });
      }

      // Normaliza resultado: retorna só preview (sem e-mail/telefone)
      const contacts = (raw.data || raw.contacts || []).map(c => ({
        firstName:  c.firstName  || c.first_name  || '',
        lastName:   c.lastName   || c.last_name   || '',
        title:      c.jobTitle   || c.title       || '',
        company:    c.companyName|| c.company     || company || domain,
        hasEmail:   !!(c.emails  || c.email),
        hasPhone:   !!(c.phones  || c.phone || c.phoneNumbers),
        hasLinkedin:!!(c.linkedinUrl || c.linkedin_url || c.linkedin),
        lushaId:    c.id || null
      }));

      // Filtra só pessoas atuais no Brasil (a maioria já veio filtrada via país)
      const filtered = contacts.filter(c => c.firstName && c.lastName);

      return res.status(200).json({
        contacts: filtered,
        total: raw.total || raw.totalContacts || filtered.length,
        credits: raw.accountInfo || raw.credits || null
      });
    } catch (e) {
      return res.status(502).json({ error: String(e) });
    }
  }

  // ── Lusha Reveal: revela contatos selecionados (gasta créditos) ───────────
  if (provider === 'lusha-reveal') {
    if (!LUSHA_KEY) return res.status(500).json({ error: 'LUSHA_KEY não configurada' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const contacts = Array.isArray(body.contacts) ? body.contacts : [];
    if (!contacts.length) return res.status(400).json({ error: 'Nenhum contato informado.' });
    if (contacts.length > 5) return res.status(400).json({ error: 'Máximo 5 contatos por vez.' });

    const results = [];
    let lastCredits = null;

    for (const c of contacts) {
      const params = new URLSearchParams({
        firstName: c.firstName || '',
        lastName:  c.lastName  || '',
        company:   c.company   || ''
      });
      try {
        const r = await fetch(`https://api.lusha.com/v2/person?${params}`, {
          headers: { api_key: LUSHA_KEY }
        });
        const data = await r.json();

        const phones   = (data.data && data.data.phoneNumbers) || [];
        const emails   = (data.data && data.data.emails)       || [];
        const linkedin = (data.data && (data.data.linkedInUrl || data.data.linkedInURL || data.data.linkedin_url)) || '';
        const currentPos = (data.data && data.data.currentPositions && data.data.currentPositions[0]) || {};

        // Créditos (Lusha retorna em data.accountInfo ou similar)
        if (data.accountInfo) lastCredits = data.accountInfo;
        else if (data.credits)  lastCredits = data.credits;

        // Filtra só celular brasileiro: dígitos, 11 dígitos (DDD + 9XXXXXXXX)
        const mobileWa = phones
          .map(p => (p.internationalNumber || p.localNumber || '').replace(/\D/g, ''))
          .filter(n => {
            // Remove prefixo 55 se tiver
            const local = n.startsWith('55') ? n.slice(2) : n;
            return local.length === 11 && local[2] === '9'; // celular BR
          })
          .map(n => n.startsWith('55') ? n : '55' + n)[0] || '';

        const email = emails.find(e => e.type !== 'risky' && e.emailAddress) || emails[0];

        results.push({
          firstName:   c.firstName,
          lastName:    c.lastName,
          title:       c.title || currentPos.title || '',
          company:     c.company,
          email:       email ? email.emailAddress : '',
          emailType:   email ? email.type : '',
          wa:          mobileWa,
          linkedin_url:linkedin,
          error:       data.error || (!emails.length && !phones.length ? 'sem_dados' : null)
        });
      } catch (e) {
        results.push({ firstName: c.firstName, lastName: c.lastName, error: String(e) });
      }
    }

    return res.status(200).json({ results, credits: lastCredits });
  }

  // ── Microsoft Graph ───────────────────────────────────────────────────────
  if (provider && provider.startsWith('graph')) {
    if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) return res.status(500).json({ error: 'MS_CLIENT_ID / MS_CLIENT_SECRET não configurados.' });
    if (!SUPA_SVC)     return res.status(500).json({ error: 'SUPA_CRM_SERVICE_KEY não configurado.' });

    const authHeader = (req.headers.authorization || '').replace('Bearer ','');
    const authed = await verifyUserJwt(authHeader);
    if (!authed) return res.status(401).json({ error: 'Não autenticado no CRM.' });

    // ── graph-init: gera URL de autenticação ──────────────────────────────
    if (provider === 'graph-init') {
      const state = generateState();
      // Armazena state temporariamente para validação no callback
      await supaReq('/rest/v1/crm_oauth_tokens', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ provider: 'microsoft', pkce_state: state })
      }).catch(async () => {
        await supaReq('/rest/v1/crm_oauth_tokens?pkce_state=eq.' + state, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ pkce_state: state })
        });
      });

      const authUrl = msAuthUrl()
        + '?client_id='     + encodeURIComponent(MS_CLIENT_ID)
        + '&response_type=code'
        + '&redirect_uri='  + encodeURIComponent(REDIRECT_URI)
        + '&scope='         + encodeURIComponent(MS_SCOPE)
        + '&state='         + encodeURIComponent(state)
        + '&prompt=select_account'
        + '&response_mode=query';

      return res.status(200).json({ authUrl });
    }

    // ── graph-status: verifica conexão ─────────────────────────────────────
    if (provider === 'graph-status') {
      try {
        const t = await getGraphToken();
        if (!t) return res.status(200).json({ connected: false });
        return res.status(200).json({ connected: true, email: t.email });
      } catch {
        return res.status(200).json({ connected: false });
      }
    }

    // ── graph-disconnect: remove tokens ────────────────────────────────────
    if (provider === 'graph-disconnect') {
      await supaReq('/rest/v1/crm_oauth_tokens?provider=eq.microsoft&not.refresh_token=is.null', {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ access_token: null, refresh_token: null, expires_at: null, updated_at: new Date().toISOString() })
      });
      return res.status(200).json({ disconnected: true });
    }

    // ── graph-draft: cria rascunho para um item da fila ────────────────────
    if (provider === 'graph-draft') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { fila_id, assunto, corpo, decisor, etapa_cadencia, thread_ref } = body;

      if (!fila_id || !decisor || !decisor.email) {
        return res.status(400).json({ error: 'fila_id e decisor.email obrigatórios' });
      }

      // Checa se já tem rascunho
      const existing = await supaReq('/rest/v1/crm_fila?id=eq.' + fila_id + '&select=outlook_message_id,status');
      if (existing && existing[0] && existing[0].outlook_message_id) {
        return res.status(200).json({ skipped: true, reason: 'Rascunho já existe', outlook_message_id: existing[0].outlook_message_id });
      }
      if (existing && existing[0] && existing[0].status !== 'aprovado') {
        return res.status(400).json({ error: 'Item não está aprovado' });
      }

      const { token } = await getGraphToken() || {};
      if (!token) return res.status(503).json({ error: 'Outlook não conectado. Clique em "Conectar Outlook" primeiro.' });

      const etapaN = Number(etapa_cadencia) || 1;
      let draftId, draftLink, isReply = false, foundThread = false;

      if (etapaN >= 2) {
        // Follow-up: busca mensagem original em Itens Enviados
        const searchQ = (thread_ref || assunto || '').slice(0, 100);
        const searchResp = await graphReq('GET',
          '/me/mailFolders/sentItems/messages?$filter=' +
          encodeURIComponent("contains(subject,'" + searchQ.replace(/'/g,"''") + "')") +
          '&$select=id,subject,sentDateTime&$top=5&$orderby=sentDateTime desc',
          null, token);

        const origMsg = searchResp && searchResp.value && searchResp.value[0];
        if (origMsg) {
          foundThread = true;
          // Cria reply draft
          const replyResp = await graphReq('POST', '/me/messages/' + origMsg.id + '/createReply', {}, token);
          if (replyResp.id) {
            // Atualiza o body do reply
            const item = { assunto, corpo, decisor, etapa_cadencia };
            await graphReq('PATCH', '/me/messages/' + replyResp.id, {
              body: { contentType: 'HTML', content: buildHtmlBody((corpo || '').replace(/\nPedro Ica\s*$/, '').trimEnd()) }
            }, token);
            draftId   = replyResp.id;
            draftLink = replyResp.webLink || ('https://outlook.office.com/mail/drafts');
            isReply   = true;
          }
        }
      }

      if (!draftId) {
        // Primeira mensagem (ou follow-up sem thread encontrada)
        const item = { assunto, corpo, decisor, etapa_cadencia };
        const payload  = buildDraftPayload(item);
        const draftResp = await graphReq('POST', '/me/messages', payload, token);
        if (!draftResp.id) {
          return res.status(502).json({ error: 'Erro ao criar rascunho: ' + JSON.stringify(draftResp) });
        }
        draftId   = draftResp.id;
        draftLink = draftResp.webLink || '';
      }

      const now = new Date().toISOString();
      await supaReq('/rest/v1/crm_fila?id=eq.' + fila_id, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          outlook_message_id: draftId,
          rascunho_criado_em: now,
          outlook_draft_link: draftLink,
          rascunho_erro:      null
        })
      });

      return res.status(200).json({ outlook_message_id: draftId, outlook_draft_link: draftLink, rascunho_criado_em: now, is_reply: isReply, found_thread: foundThread });
    }

    // ── graph-send: envia rascunho pelo Graph ──────────────────────────────
    if (provider === 'graph-send') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { fila_id, outlook_message_id, decisor_id, empresa_id, canal, assunto, contexto } = body;
      if (!outlook_message_id || !fila_id) return res.status(400).json({ error: 'fila_id e outlook_message_id obrigatórios' });

      const t = await getGraphToken();
      if (!t) return res.status(503).json({ error: 'Outlook não conectado' });

      const sendResp = await fetch('https://graph.microsoft.com/v1.0/me/messages/' + outlook_message_id + '/send', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + t.token, 'Content-Length': '0' }
      });
      if (!sendResp.ok && sendResp.status !== 202) {
        const errData = await sendResp.json().catch(() => ({}));
        await supaReq('/rest/v1/crm_fila?id=eq.' + fila_id, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ rascunho_erro: errData.error && errData.error.message || 'Erro ' + sendResp.status })
        });
        return res.status(502).json({ error: errData.error && errData.error.message || 'Erro ao enviar' });
      }

      const now = new Date().toISOString();
      await supaReq('/rest/v1/crm_fila?id=eq.' + fila_id, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'enviado', enviado_em: now, rascunho_erro: null })
      });
      await supaReq('/rest/v1/crm_toques', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          decisor_id, empresa_id, canal: canal || 'email',
          direcao: 'enviado', assunto: (assunto || '').slice(0, 500),
          resumo: (contexto || '').slice(0, 500),
          data: now, fonte: 'graph', resultado: 'sem_resposta'
        })
      });
      if (decisor_id) {
        await supaReq('/rest/v1/crm_decisores?id=eq.' + decisor_id, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ultimo_toque_em: now })
        });
      }
      return res.status(200).json({ enviado: true, enviado_em: now });
    }

    // ── graph-sync: confere quais rascunhos já foram enviados manualmente ──
    if (provider === 'graph-sync') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { ids } = body; // [{fila_id, outlook_message_id}]
      if (!ids || !ids.length) return res.status(200).json({ synced: [] });

      const t = await getGraphToken();
      if (!t) return res.status(503).json({ error: 'Outlook não conectado' });

      const results = [];
      for (const item of ids) {
        try {
          const msg = await graphReq('GET', '/me/messages/' + item.outlook_message_id + '?$select=id,isDraft,sentDateTime', null, t.token);
          if (msg && msg.isDraft === false) {
            const now = new Date().toISOString();
            await supaReq('/rest/v1/crm_fila?id=eq.' + item.fila_id, {
              method: 'PATCH',
              headers: { 'Prefer': 'return=minimal' },
              body: JSON.stringify({ status: 'enviado', enviado_em: msg.sentDateTime || now })
            });
            results.push({ fila_id: item.fila_id, enviado: true, enviado_em: msg.sentDateTime || now });
          } else if (msg && msg.error) {
            results.push({ fila_id: item.fila_id, enviado: false, error: msg.error.code });
          } else {
            results.push({ fila_id: item.fila_id, enviado: false });
          }
        } catch(e) {
          results.push({ fila_id: item.fila_id, enviado: false, error: String(e) });
        }
      }
      return res.status(200).json({ synced: results });
    }

    return res.status(400).json({ error: 'provider graph inválido: ' + provider });
  }

  return res.status(400).json({ error: 'provider inválido. Use: hunter, lusha, health, graph-*' });
}
