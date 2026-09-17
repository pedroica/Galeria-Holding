// D4 — Cron diário: enriquecimento Lusha
// Usa crm_empresa_agencia_estrelas; estrelas_manual vence estrelas_calculadas
// 1.400 revelações/dia máx; 1 email em empresas estrelas>=3; 2 telefone em estrelas=5
// Schedule: "30 13 * * *" (13h30 UTC = 10h30 BRT)

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;
const LUSHA_KEY = process.env.LUSHA_API_KEY || process.env.LUSHA_KEY;

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

async function lushaCall(nome, empresa_nome) {
  if (!LUSHA_KEY || !nome) return null;
  try {
    const [fn, ...ln] = nome.split(' ');
    const r = await fetch('https://api.lusha.com/person', {
      method: 'POST',
      headers: { api_key: LUSHA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: fn, lastName: ln.join(' '), company: empresa_nome || '' })
    });
    if (!r.ok) return null;
    return r.json();
  } catch (e) { return null; }
}

// Retorna empresa_ids com estrelas efetivas >= threshold (via crm_empresa_agencia_estrelas)
async function empIdsComEstrelas(threshold) {
  const rows = await sg(
    `crm_empresa_agencia_estrelas?or=(estrelas_manual.gte.${threshold},estrelas_calculadas.gte.${threshold})&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=500`
  );
  const ids = new Set();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const eff = r.estrelas_manual != null ? Number(r.estrelas_manual) : Number(r.estrelas_calculadas || 0);
    if (eff >= threshold) ids.add(r.empresa_id);
  }
  return [...ids];
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!LUSHA_KEY) return res.status(200).json({ ok: true, msg: 'LUSHA_API_KEY não configurada' });

  let revelados = 0;

  // 1 email em empresas estrelas>=3 sem email
  const ids3 = await empIdsComEstrelas(3);
  if (ids3.length > 0) {
    const inClause = ids3.slice(0, 100).join(',');
    const semEmail = await sg(
      `crm_decisores?email=is.null&empresa_id=in.(${inClause})&select=id,nome,empresa_id&limit=20`
    );
    // Busca nomes de empresa para contexto
    const empNomes = await sg(`crm_empresas?id=in.(${ids3.slice(0,50).join(',')})&select=id,nome`);
    const empNomeMap = {};
    for (const e of (Array.isArray(empNomes) ? empNomes : [])) empNomeMap[e.id] = e.nome;

    for (const d of (Array.isArray(semEmail) ? semEmail : [])) {
      if (revelados >= 1400) break;
      const data = await lushaCall(d.nome, empNomeMap[d.empresa_id] || '');
      const email = data?.emailAddresses?.[0]?.emailAddress;
      if (email) {
        await sp('crm_decisores?id=eq.' + d.id, { email, fonte: 'lusha', atualizado_em: new Date().toISOString() });
        revelados++;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 2 telefones em empresas estrelas=5 sem WA
  const ids5 = await empIdsComEstrelas(5);
  if (ids5.length > 0) {
    const inClause = ids5.slice(0, 50).join(',');
    const semWA = await sg(
      `crm_decisores?wa=is.null&empresa_id=in.(${inClause})&select=id,nome,empresa_id&limit=10`
    );
    const empNomes5 = await sg(`crm_empresas?id=in.(${ids5.slice(0,50).join(',')})&select=id,nome`);
    const empNomeMap5 = {};
    for (const e of (Array.isArray(empNomes5) ? empNomes5 : [])) empNomeMap5[e.id] = e.nome;

    for (const d of (Array.isArray(semWA) ? semWA : [])) {
      if (revelados >= 1400) break;
      const data = await lushaCall(d.nome, empNomeMap5[d.empresa_id] || '');
      const tel = data?.phoneNumbers?.[0]?.internationalNumber;
      if (tel) {
        await sp('crm_decisores?id=eq.' + d.id, { wa: tel, fonte: 'lusha', atualizado_em: new Date().toISOString() });
        revelados++;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('[cron:enriquecimento-diario]', revelados, 'revelações Lusha; ids3=', ids3.length, 'ids5=', ids5.length);
  return res.status(200).json({ ok: true, revelados, empresas_gte3: ids3.length, empresas_e5: ids5.length });
}
