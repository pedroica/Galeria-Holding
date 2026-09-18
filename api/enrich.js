// Proxy unificado: Hunter.io, Lusha (individual + empresa) e health check.
// Consolida múltiplos handlers num único arquivo para respeitar o limite de
// 12 Serverless Functions do plano Hobby da Vercel.
const HUNTER_KEY = process.env.HUNTER_KEY;
const LUSHA_KEY = process.env.LUSHA_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const LUSHA_BASE = 'https://api.lusha.com';

// ── Prioridade de cargo para prospecção ───────────────────────────────────────
const TIERS = [
  ['cmo','chief marketing','vp marketing','vp de marketing','vice president marketing','vice president of marketing'],
  ['diretor de marketing','diretora de marketing','director of marketing','marketing director',
   'diretor de marca','diretora de marca','diretor de comunicacao','diretor de comunicação',
   'brand director','director of communications','head of marketing','head de marketing'],
  ['head de growth','head growth','head de performance','head performance','head de digital',
   'head de brand','growth director','performance director'],
  ['gerente de marketing','gerente de marca','marketing manager','brand manager',
   'gerente de performance','gerente de growth','manager marketing'],
  ['social media','conteudo','conteúdo','content manager','content creator','midia social','mídia social'],
  ['ceo','chief executive','diretor comercial','diretor geral','coo','diretor de vendas'],
];

function tierOf(cargo) {
  if (!cargo) return 99;
  const c = cargo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i].map(t => t.normalize('NFD').replace(/[̀-ͯ]/g,''));
    if (tier.some(kw => c.includes(kw))) return i;
  }
  return 99;
}

function normName(n) {
  return (n||'').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'');
}

function isDup(contact, existentes) {
  const nome  = normName(contact.fullName||contact.full_name||contact.name||'');
  const email = (contact.email||'').toLowerCase().trim();
  const li    = normName(contact.linkedinUrl||contact.linkedin_url||contact.linkedin||'');
  return existentes.some(e =>
    (email && e.email && email === e.email) ||
    (li    && e.li    && li    === e.li)    ||
    (nome  && e.nome  && nome  === e.nome)
  );
}

function mapExistentes(arr) {
  return (arr||[]).map(e => ({
    nome:  normName(e.nome),
    email: (e.email||'').toLowerCase().trim(),
    li:    normName(e.linkedin||e.li||''),
  }));
}

function extractDecidor(p) {
  const phones = p.phoneNumbers||p.phone_numbers||p.phones||[];
  const emails = p.emails||[];
  return {
    nome:          p.fullName||p.full_name||p.name||'',
    cargo:         p.jobTitle||p.job_title||p.title||'',
    email:         typeof p.email==='string' ? p.email : (emails[0]?.emailAddress||emails[0]?.value||emails[0]||''),
    wa:            phones[0]?.internationalNumber||phones[0]?.number||phones[0]||'',
    linkedin:      p.linkedinUrl||p.linkedin_url||p.linkedin||'',
    fonte:         'lusha',
    enriquecido_em: new Date().toISOString(),
  };
}

function pickDecisores(contacts, normExistentes) {
  const candidates = contacts
    .filter(c => !isDup(c, normExistentes))
    .map(c => ({ ...c, _tier: tierOf(c.jobTitle||c.job_title||c.title||'') }))
    .sort((a,b) => a._tier - b._tier);
  const mkt      = candidates.filter(c => c._tier < 5).slice(0,5);
  const fallback = candidates.filter(c => c._tier === 5).slice(0, 5 - mkt.length);
  return mkt.length < 5 ? [...mkt, ...fallback] : mkt;
}

async function lushaFetch(path, opts={}) {
  return fetch(`${LUSHA_BASE}${path}`, {
    ...opts,
    headers: { 'api_key': LUSHA_KEY, 'Content-Type': 'application/json', ...(opts.headers||{}) },
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Suporte a GET e POST: provider pode vir de query string ou body
  const body   = req.method === 'POST' ? (req.body || {}) : {};
  const query  = req.query || {};
  const provider = query.provider || body.provider || '';
  const health   = query.health   || body.health;

  // ── Health check ──────────────────────────────────────────────────────────
  if (health || provider === 'health') {
    return res.status(200).json({ ok: true, claude: !!ANTHROPIC_KEY, hunter: !!HUNTER_KEY, lusha: !!LUSHA_KEY });
  }

  // ── Hunter: domain-search ou email-verify ────────────────────────────────
  if (provider === 'hunter') {
    if (!HUNTER_KEY) return res.status(500).json({ error: 'HUNTER_KEY não configurada' });
    const { mode='domain', domain='', email='', limit='10' } = query;
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

  // ── Lusha: enriquecimento individual (por nome + empresa) ────────────────
  if (provider === 'lusha') {
    if (!LUSHA_KEY) return res.status(500).json({ error: 'LUSHA_KEY não configurada' });
    const { firstName='', lastName='', company='' } = query;
    const url = `${LUSHA_BASE}/v2/person?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&company=${encodeURIComponent(company)}`;
    try {
      const r = await fetch(url, { headers: { api_key: LUSHA_KEY } });
      return res.status(r.status).json(await r.json());
    } catch (e) {
      return res.status(502).json({ error: String(e) });
    }
  }

  // ── Lusha: prospecção por empresa (POST /api/enrich?provider=enriquecer) ─
  if (provider === 'enriquecer') {
    if (!LUSHA_KEY) {
      return res.status(500).json({ error: 'LUSHA_KEY não configurada no Vercel (Settings → Environment Variables)' });
    }

    const { nome, dominio, existentes } = body;
    if (!nome) return res.status(400).json({ error: '"nome" da empresa é obrigatório' });

    const normExistentes = mapExistentes(existentes);
    const dominioClean = (dominio||'').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];

    // Estratégia 1: Lusha Prospecting API (Team+)
    try {
      const pbody = {
        filter: {
          company: dominioClean
            ? [{ name: nome, website: dominioClean }]
            : [{ name: nome }],
          department: ['Marketing','Marketing & Communications','Brand','Growth'],
          location: [{ country: 'Brazil' }],
          seniority: ['C-Suite','C-Level','VP','Director','Head','Manager','Senior'],
        },
        size: 30,
      };
      const r = await lushaFetch('/prospecting/contacts/search', { method:'POST', body: JSON.stringify(pbody) });
      const data = await r.json();

      if (r.ok) {
        const contacts = data.contacts||data.data||data.results||[];
        const picked   = pickDecisores(contacts, normExistentes);
        return res.status(200).json({
          decisores:       picked.map(extractDecidor),
          creditos_gastos: picked.length,
          total_encontrados: contacts.length,
          via: 'prospecting',
        });
      }
      if (r.status === 402) {
        return res.status(402).json({ error: 'Créditos Lusha esgotados. Recarregue na plataforma Lusha.' });
      }
      // 401/403 = plano não cobre → tenta estratégia 2
    } catch (_) {}

    // Estratégia 2: Lusha Company API + contatos por company_id
    try {
      const cQuery = dominioClean
        ? `website=${encodeURIComponent(dominioClean)}`
        : `name=${encodeURIComponent(nome)}`;
      const cRes  = await lushaFetch(`/v2/company?${cQuery}`);
      const cData = await cRes.json();

      if (!cRes.ok || !cData.data) {
        return res.status(400).json({
          error: `Empresa não encontrada na Lusha: ${cData.error||cData.message||'tente informar o domínio'}`,
          lusha_status: cRes.status,
        });
      }

      const companyId = cData.data.id||cData.data.companyId;
      if (!companyId) {
        return res.status(400).json({ error: 'Lusha retornou empresa sem ID. Tente informar o domínio.' });
      }

      const pRes  = await lushaFetch(`/v2/company/${companyId}/contacts?department=Marketing&country=Brazil&size=30`);
      const pData = await pRes.json();

      if (!pRes.ok) {
        if (pRes.status === 402) return res.status(402).json({ error: 'Créditos Lusha esgotados.' });
        return res.status(pRes.status).json({ error: `Lusha contacts: ${pData.error||pData.message||pRes.status}` });
      }

      const contacts = pData.contacts||pData.data||pData.results||[];
      const picked   = pickDecisores(contacts, normExistentes);
      return res.status(200).json({
        decisores:       picked.map(extractDecidor),
        creditos_gastos: picked.length,
        total_encontrados: contacts.length,
        via: 'company-api',
      });
    } catch (e) {
      return res.status(502).json({ error: `Erro ao chamar Lusha: ${e.message}` });
    }
  }

  return res.status(400).json({ error: 'provider inválido. Use: hunter, lusha, enriquecer, health' });
}
