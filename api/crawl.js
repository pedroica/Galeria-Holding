// /api/crawl.js — Crawler de decisores em fontes públicas brasileiras
// Fontes (sem chave de API):
//   1. Brasil API / Receita Federal — QSA (quadro de sócios e administradores)
//   2. Website da empresa — JSON-LD Person + padrões de texto nas páginas de equipe
// Uso: GET /api/crawl?cnpj=47508411000156&domain=natura.com.br&nome=Natura

export const config = { maxDuration: 30 };

// Páginas de equipe/liderança a tentar (ordem de preferência)
const PATHS = [
  '/equipe', '/time', '/lideranca', '/liderança',
  '/sobre', '/quem-somos', '/sobre-nos', '/a-empresa',
  '/about', '/team', '/leadership', '/about-us',
  '/',
];

// Termos que indicam cargo executivo relevante
const CARGOS_RX = [
  'CEO', 'C\\.E\\.O', 'CMO', 'C\\.M\\.O', 'CFO', 'CTO', 'COO',
  'Presidente', 'Fundador', 'Co-?Fundador',
  'Diretor[a]?(?:\\s+\\w+){0,3}', 'Diretora?(?:\\s+\\w+){0,3}',
  'Head\\s+(?:de\\s+)?\\w+(?:\\s+\\w+){0,2}',
  'VP\\s+(?:de\\s+)?\\w+(?:\\s+\\w+){0,2}',
  'Vice-?Presidente(?:\\s+\\w+){0,3}',
  'Gerente\\s+(?:de\\s+)?\\w+(?:\\s+\\w+){0,2}',
  'Coordenador[a]?\\s+(?:de\\s+)?\\w+(?:\\s+\\w+){0,2}',
  'S[oó]cio-?Administrador', 'Administrador', 'S[oó]cio',
  'Managing Director', 'General Manager', 'Partner', 'Owner',
];
const CARGO_PATTERN = new RegExp(CARGOS_RX.join('|'), 'i');

// Padrão de nome brasileiro: Primeiro + (preposição?) + Sobrenome
const NOME_PT = '[A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜ][a-záéíóúàâêôãõçü]{1,20}' +
  '(?:\\s+(?:de|da|do|das|dos|e|van|von|del|della)?\\s*)?' +
  '[A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜ][a-záéíóúàâêôãõçü]{1,20}' +
  '(?:\\s+[A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜ][a-záéíóúàâêôãõçü]{1,20}){0,3}';

function normNome(n) {
  if (!n) return '';
  // Receita Federal retorna em CAPS — converte para Title Case
  return n.trim()
    .toLowerCase()
    .replace(/\b(\w)/g, c => c.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E|Van|Von)\b/g, m => m.toLowerCase());
}

function deduplicar(pessoas) {
  const vistos = {};
  return pessoas.filter(p => {
    const k = (p.nome || '').toLowerCase().replace(/\s+/g, '');
    if (!k || vistos[k]) return false;
    vistos[k] = true;
    return true;
  });
}

// ── 1. Brasil API / CNPJ ──────────────────────────────────────────────────────
async function buscarQSA(cnpj) {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return [];
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'GaleriaHolding-CRM/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const qsa = data.qsa || [];
    return qsa
      .filter(s => s.nome_socio && s.identificador_de_socio !== 3) // 3 = PJ
      .map(s => ({
        nome:       normNome(s.nome_socio),
        cargo:      s.qualificacao_socio || 'Sócio/Administrador',
        email:      null,
        linkedin:   null,
        fonte:      'receita_federal',
        confianca:  85,
      }));
  } catch (e) {
    return [];
  }
}

// ── 2. Extração de JSON-LD ────────────────────────────────────────────────────
function extrairJsonLD(html) {
  const pessoas = [];
  const rx = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      const items = Array.isArray(obj) ? obj.flat() : [obj];
      for (const item of items) {
        const candidates = [
          item['@type'] === 'Person' ? [item] : [],
          item.member      || [],
          item.employee    || [],
          item.founders    || [],
          item.knowsAbout  || [],
          (item.memberOf   || []),
        ].flat();
        for (const p of candidates) {
          if (p && p['@type'] === 'Person' && p.name) {
            pessoas.push({
              nome:       normNome(p.name),
              cargo:      p.jobTitle || p.description || '',
              email:      p.email    || null,
              linkedin:   Array.isArray(p.sameAs) ? p.sameAs.find(u => u.includes('linkedin')) : (p.sameAs || null),
              fonte:      'website_jsonld',
              confianca:  80,
            });
          }
        }
      }
    } catch (e) {}
  }
  return pessoas.filter(p => !p.cargo || CARGO_PATTERN.test(p.cargo) || p.cargo === '');
}

// ── 3. Extração de meta tags ──────────────────────────────────────────────────
function extrairMeta(html) {
  // Algumas páginas de perfil corporativo têm meta og:title com "Nome — Cargo"
  const ogTitle = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || [])[1] || '';
  const rNome = new RegExp(`(${NOME_PT})\\s*[\\-–—|]\\s*(${CARGOS_RX.join('|')})`, 'i');
  const m = rNome.exec(ogTitle);
  if (m) {
    return [{ nome: normNome(m[1]), cargo: m[2], email: null, linkedin: null, fonte: 'website_meta', confianca: 70 }];
  }
  return [];
}

// ── 4. Extração por padrões de texto ─────────────────────────────────────────
function extrairTexto(html) {
  // Limpa HTML para texto puro
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]{2,6};/g, ' ')
    .replace(/\s{2,}/g, ' ');

  const pessoas = [];
  const CARGO_G = `(${CARGOS_RX.join('|')})`;
  const NOME_G  = `(${NOME_PT})`;

  // Padrão: "Nome — Cargo" e variantes
  const rx1 = new RegExp(NOME_G + '\\s*[–—\\-|,]\\s*' + CARGO_G, 'gi');
  // Padrão: "Cargo: Nome" e variantes
  const rx2 = new RegExp(CARGO_G + '\\s*[:\\-–—]\\s*' + NOME_G, 'gi');
  // Padrão: "Cargo\nNome" (comum em cards de equipe)
  const rx3 = new RegExp(CARGO_G + '\\s{1,10}' + NOME_G, 'gi');

  let m;
  while ((m = rx1.exec(texto)) !== null) {
    if (m[1] && m[2]) pessoas.push({ nome: normNome(m[1]), cargo: m[2].trim(), email: null, linkedin: null, fonte: 'website_texto', confianca: 60 });
  }
  while ((m = rx2.exec(texto)) !== null) {
    if (m[1] && m[2]) pessoas.push({ nome: normNome(m[2]), cargo: m[1].trim(), email: null, linkedin: null, fonte: 'website_texto', confianca: 60 });
  }
  while ((m = rx3.exec(texto)) !== null) {
    if (m[1] && m[2]) pessoas.push({ nome: normNome(m[2]), cargo: m[1].trim(), email: null, linkedin: null, fonte: 'website_texto', confianca: 55 });
  }

  return pessoas.filter(p => CARGO_PATTERN.test(p.cargo));
}

// ── 5. Scraping do website ────────────────────────────────────────────────────
async function scrapeWebsite(domain) {
  const dom = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  const todasPessoas = [];
  const fontesEncontradas = [];

  for (const path of PATHS) {
    let html = null;
    for (const proto of ['https', 'http']) {
      try {
        const r = await fetch(`${proto}://${dom}${path}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(7000),
        });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('html')) {
          html = await r.text();
          break;
        }
      } catch (e) { /* timeout ou SSL */ }
    }
    if (!html) continue;

    const fromJsonLD = extrairJsonLD(html);
    const fromMeta   = extrairMeta(html);
    const fromTexto  = extrairTexto(html);
    const total = fromJsonLD.length + fromMeta.length + fromTexto.length;

    if (total > 0) {
      todasPessoas.push(...fromJsonLD, ...fromMeta, ...fromTexto);
      fontesEncontradas.push(`website:${path}`);
      // Se achamos dados estruturados (JSON-LD), paramos na primeira página com resultado
      if (fromJsonLD.length > 0) break;
    }

    // Máximo 3 páginas para não sobrecarregar
    if (fontesEncontradas.length >= 3) break;
  }

  return { pessoas: todasPessoas, fontes: fontesEncontradas };
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { cnpj = '', domain = '', nome = '' } = req.query;

  if (!cnpj && !domain) {
    return res.status(400).json({ erro: 'Forneça cnpj ou domain' });
  }

  const todasPessoas = [];
  const fontesUsadas = [];
  const erros = [];

  // 1. QSA via Brasil API (mais confiável para BR)
  if (cnpj) {
    try {
      const qsa = await buscarQSA(cnpj);
      if (qsa.length) {
        todasPessoas.push(...qsa);
        fontesUsadas.push('receita_federal');
      }
    } catch (e) {
      erros.push('receita_federal: ' + e.message);
    }
  }

  // 2. Website scraping
  if (domain) {
    try {
      const { pessoas, fontes } = await scrapeWebsite(domain);
      if (pessoas.length) {
        todasPessoas.push(...pessoas);
        fontesUsadas.push(...fontes);
      }
    } catch (e) {
      erros.push('website: ' + e.message);
    }
  }

  const pessoas = deduplicar(todasPessoas)
    .sort((a, b) => (b.confianca || 50) - (a.confianca || 50));

  // Cache por 6h — dados mudam pouco
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
  res.json({ pessoas, fontesUsadas, erros, total: pessoas.length });
}
