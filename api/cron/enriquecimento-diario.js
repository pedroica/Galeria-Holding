// D4 — Cron diário: enriquecimento Lusha
// 1.400 revelações/dia máx; 1 email em empresas estrelas>=3; 2 telefone nas estrelas=5
// Schedule: "30 13 * * *" (13h30 UTC = 10h30 BRT)

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY;
const LUSHA_KEY = process.env.LUSHA_KEY;

async function sg(path) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
  });
  return r.ok ? r.json() : [];
}
async function sp(path, body) {
  await fetch(SUPA_URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function lushaEmail(decisor) {
  if (!LUSHA_KEY || !decisor.nome) return null;
  try {
    const [fn, ...ln] = decisor.nome.split(' ');
    const r = await fetch('https://api.lusha.com/person', {
      method: 'POST',
      headers: { api_key: LUSHA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: fn, lastName: ln.join(' '), company: decisor.empresa_nome || '' })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.emailAddresses?.[0]?.emailAddress || null;
  } catch (e) { return null; }
}

async function lushaPhone(decisor) {
  if (!LUSHA_KEY || !decisor.nome) return null;
  try {
    const [fn, ...ln] = decisor.nome.split(' ');
    const r = await fetch('https://api.lusha.com/person', {
      method: 'POST',
      headers: { api_key: LUSHA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: fn, lastName: ln.join(' '), company: decisor.empresa_nome || '' })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.phoneNumbers?.[0]?.internationalNumber || null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!LUSHA_KEY) return res.status(200).json({ ok: true, msg: 'LUSHA_KEY não configurada' });

  // 1 email em estrelas>=3 sem email
  const semEmail = await sg(
    'crm_decisores?email=is.null&select=id,nome,empresa_id,crm_empresas!empresa_id(nome,estrelas)&limit=20'
  );
  let revelados = 0;
  for (const d of (semEmail || [])) {
    if (revelados >= 1400) break;
    const emp = d.crm_empresas || {};
    if ((emp.estrelas || 0) < 3) continue;
    const email = await lushaEmail({ ...d, empresa_nome: emp.nome });
    if (email) {
      await sp('crm_decisores?id=eq.' + d.id, { email, fonte: 'lusha', atualizado_em: new Date().toISOString() });
      revelados++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // 2 telefones em estrelas=5 sem WA
  const semWA = await sg(
    'crm_decisores?wa=is.null&select=id,nome,empresa_id,crm_empresas!empresa_id(nome,estrelas)&limit=10'
  );
  for (const d of (semWA || [])) {
    if (revelados >= 1400) break;
    const emp = d.crm_empresas || {};
    if ((emp.estrelas || 0) < 5) continue;
    const tel = await lushaPhone({ ...d, empresa_nome: emp.nome });
    if (tel) {
      await sp('crm_decisores?id=eq.' + d.id, { wa: tel, fonte: 'lusha', atualizado_em: new Date().toISOString() });
      revelados++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('[cron:enriquecimento-diario]', revelados, 'revelações Lusha');
  return res.status(200).json({ ok: true, revelados });
}
