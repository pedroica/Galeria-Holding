// api/fila.js — handler unificado de fila de prospecção e credenciais
//
// Roteamento por req.query.action ou req.query.token:
//   GET  /api/fila?token=<hex32>     → renderiza HTML da credencial (antigo /c/[token])
//   POST /api/fila                    → gerar fila (antigo /api/gerar-fila)
//   POST /api/fila?action=credencial  → criar credencial (antigo /api/gerar-credencial)
//
// Migração: vercel.json redireciona /c/:token → /api/fila?token=:token
//           e os callers em block3.js foram atualizados para /api/fila

import Anthropic from '@anthropic-ai/sdk';
import { promises as dnsPromises } from 'dns';
import { makeBlocklist } from '../lib/blocklist.js';
import { tokenSdrValido } from '../lib/sdr-auth.js';

// Checagem de MX do domínio do e-mail antes de enfileirar. Retorna:
//   { ok:true }                    tem servidor de e-mail
//   { ok:false, definitivo:true }  domínio não existe ou não tem MX → marcar inválido
//   { ok:false, definitivo:false } falha transitória de DNS → não marcar, não bloquear
// Testes injetam globalThis.__mxResolver para não depender de DNS real.
async function checarMX(dominio) {
  if (!dominio) return { ok: false, definitivo: true };
  const resolver = globalThis.__mxResolver || ((d) => dnsPromises.resolveMx(d));
  try {
    const mx = await resolver(dominio);
    if (Array.isArray(mx) && mx.length > 0) return { ok: true };
    return { ok: false, definitivo: true };
  } catch (e) {
    const code = e && e.code;
    const semRegistro = code === 'ENOTFOUND' || code === 'ENODATA';
    return { ok: false, definitivo: semRegistro };
  }
}

const SUPA_URL  = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;
const SUPA_ANON = process.env.SUPA_CRM_ANON_KEY || 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET   = (process.env.CRON_SECRET || '').trim();
const SDR_CRON_SECRET = (process.env.SDR_CRON_SECRET || '').trim();

// ── helpers Supabase ─────────────────────────────────────────────────────────
async function sg(path) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }
  });
  return r.ok ? r.json() : null;
}
async function sp(path, body, method = 'POST') {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    method, headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  return r.ok ? r.json() : null;
}
async function verifyJWT(jwt) {
  const r = await fetch(SUPA_URL + '/auth/v1/user', { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + jwt } });
  return r.ok;
}

// ── gerar-fila helpers ───────────────────────────────────────────────────────
const DEFAULT_LIMITES = { email: 50, whatsapp: 80, linkedin_convite: 20, linkedin_mensagem: 20 };
// Tetos diários lidos de crm_configuracoes (email_daily_max=15, whatsapp_daily_max=10, ...)
async function limitesConfig() {
  const rows = await sg('crm_configuracoes?chave=in.(email_daily_max,whatsapp_daily_max,linkedin_daily_max)&select=chave,valor');
  const m = {}; for (const r of (Array.isArray(rows) ? rows : [])) m[r.chave] = Number(r.valor);
  const pick = (k, def) => Number.isFinite(m[k]) ? m[k] : def;
  return {
    email: pick('email_daily_max', DEFAULT_LIMITES.email),
    whatsapp: pick('whatsapp_daily_max', DEFAULT_LIMITES.whatsapp),
    linkedin_convite: pick('linkedin_daily_max', DEFAULT_LIMITES.linkedin_convite),
    linkedin_mensagem: pick('linkedin_daily_max', DEFAULT_LIMITES.linkedin_mensagem),
  };
}
function inicioSemana() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dia = now.getDay();
  const seg = new Date(now);
  seg.setDate(now.getDate() - (dia === 0 ? 6 : dia - 1));
  seg.setHours(0, 0, 0, 0);
  return seg.toISOString();
}
async function contadosHoje(canal) {
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); hoje.setHours(0, 0, 0, 0);
  const rows = await sg(`crm_fila?canal=eq.${canal}&status=in.(aprovado,enviado)&enviado_em=gte.${hoje.toISOString()}&select=id`);
  return Array.isArray(rows) ? rows.length : 0;
}
function elegivel(d) {
  if (!d) return false;
  if (d.status && ['inativo', 'removido', 'descadastrado'].includes(d.status)) return false;
  if (d.email_valido === false && !d.wa) return false;
  if (d.pausa_ate_em && new Date(d.pausa_ate_em) > new Date()) return false;
  if (d.etapa_cadencia === 'off') return false;
  return true;
}
function canaisDisponiveis(d) {
  const cs = [];
  if (d.email && d.email_valido !== false) cs.push('email');
  if (d.wa) cs.push('whatsapp');
  if (d.linkedin_url) { cs.push('linkedin_convite'); cs.push('linkedin_mensagem'); }
  return cs;
}
function interpolar(txt, vars) {
  return (txt || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : '{'+k+'}');
}
function setorStr(emp) {
  const raw = (emp.setor || emp.segmento_detalhe || '').trim();
  if (!raw) return 'marketing';
  if (raw === raw.toUpperCase() && raw.length <= 5) return 'marketing';
  if (raw.length <= 2) return 'marketing';
  return raw.toLowerCase();
}
const FALLBACK_TEMPLATES = {
  email:             { assunto:'Uma oportunidade para {empresa}', corpo:'{primeiro_nome},\n\nAcompanho o trabalho da {empresa} e acredito que há uma proposta que pode fazer sentido para vocês.\n\nPoderíamos conversar 20 minutos esta semana?\n\nAbraço,' },
  whatsapp:          { assunto:null, corpo:'{primeiro_nome}, vi o trabalho da {empresa} e queria apresentar uma oportunidade da {agencia}. Posso mandar mais detalhes?' },
  linkedin_convite:  { assunto:null, corpo:'{primeiro_nome}, acompanho a {empresa} e queria explorar uma parceria com a {agencia}.' },
  linkedin_mensagem: { assunto:null, corpo:'{primeiro_nome}, queria continuar nossa conversa sobre uma parceria entre {agencia} e {empresa}.' },
};

// Parse JSON from LLM output — handles code fences and literal newlines in string values
function parseAIJson(txt) {
  const clean = txt.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
  // Strategy 1: standard parse after extracting JSON object
  try { const m = clean.match(/\{[\s\S]+\}/); if (m) return JSON.parse(m[0]); } catch(_) {}
  // Strategy 2: escape literal newlines inside JSON strings then parse
  try {
    const m = clean.match(/\{[\s\S]+\}/);
    if (m) {
      const fixed = m[0].replace(/"(?:[^"\\]|\\.|\n)*"/g, s => s.replace(/\n/g, '\\n').replace(/\r/g, ''));
      return JSON.parse(fixed);
    }
  } catch(_) {}
  // Strategy 3: manual extraction
  try {
    const mA = clean.match(/"assunto"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const ci = clean.indexOf('"corpo"');
    if (ci >= 0) {
      const after = clean.slice(ci);
      const qi = after.indexOf('"', after.indexOf(':') + 1);
      if (qi >= 0) {
        const em = after.slice(qi + 1).match(/([\s\S]*?)"\s*\n?\s*\}/);
        if (em) return { assunto: mA ? mA[1] : '', corpo: em[1].replace(/\\n/g, '\n') };
      }
    }
  } catch(_) {}
  return null;
}

async function logWarn(msg, ctx, empresa_id, decisor_id) {
  try {
    await fetch(SUPA_URL + '/rest/v1/crm_logs', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ origem: 'fila/ia', nivel: 'warn', mensagem: msg, contexto: ctx, empresa_id: empresa_id || null, decisor_id: decisor_id || null })
    });
  } catch(_) {}
}

// Returns { assunto, corpo, ... } or null if extraction/validation fails
async function gerarTexto(anthropic, prompt, canal, opts = {}) {
  const maxWords = opts.maxWords || (canal === 'linkedin_convite' ? 40 : canal === 'whatsapp' ? 60 : 90);
  const caseNames = opts.caseNames || [];
  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
    system: `Você gera mensagens de prospecção B2B em português.\nRegras absolutas:\n- Máximo ${maxWords} palavras no corpo\n- Assunto (se email): máximo 8 palavras\n- Sem travessão (—), sem lista, sem jargão corporativo\n- Exatamente 1 pergunta direta no final\n- Tom: direto, humano, sem bajulação, sem pitch\n- Nunca citar cases, clientes, resultados ou números\n- Email termina com "Abraço,"\nFormato: JSON compacto em linha única, sem cercas de código:\n{"assunto":"...","corpo":"..."}\nUse \\n para quebras de linha dentro do campo corpo.`
  });
  const raw = r.content[0]?.text || '';
  const usage = { tokens_prompt: r.usage?.input_tokens || 0, tokens_resposta: r.usage?.output_tokens || 0, custo_usd: ((r.usage?.input_tokens||0)*3+(r.usage?.output_tokens||0)*15)/1_000_000 };
  const obj = parseAIJson(raw);
  if (!obj) return null;
  const assunto = (obj.assunto || '').trim();
  const corpo = (obj.corpo || '').trim();
  // Structural: corpo must not be raw JSON or markdown
  if (!corpo || corpo.startsWith('{') || corpo.includes('```')) return null;
  // Word count
  if (corpo.split(/\s+/).filter(Boolean).length > maxWords) return null;
  // No case or client names in body
  const bodyLow = corpo.toLowerCase();
  if (caseNames.some(n => n && bodyLow.includes(n.toLowerCase()))) return null;
  return { assunto, corpo, ...usage };
}
async function estrelasPorEmpresa(agenciaId) {
  const rows = await sg(`crm_empresa_agencia_estrelas?agencia_id=eq.${agenciaId}&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=500`);
  const map = {};
  for (const r of (Array.isArray(rows) ? rows : [])) map[r.empresa_id] = r.estrelas_manual != null ? Number(r.estrelas_manual) : Number(r.estrelas_calculadas || 0);
  return map;
}

// ── c/[token] helpers ────────────────────────────────────────────────────────
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return escHtml(s); }
function md2html(text) { return escHtml(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>').replace(/^/,'<p>').replace(/$/,'</p>'); }
function renderBloco(b) {
  const tipo = b.tipo || 'livre'; const titulo = b.titulo || ''; const corpo = b.corpo || ''; const dados = b.dados || b.bloco || {};
  let inner = '';
  if (tipo === 'capa') {
    inner = `<div class="capa-wrapper"><div class="capa-agencia">${escHtml(dados.agencia||titulo)}</div>${dados.subtitulo?`<div class="capa-sub">${escHtml(dados.subtitulo)}</div>`:''} ${dados.empresa?`<div class="capa-empresa">para ${escHtml(dados.empresa)}</div>`:''}</div>`;
  } else if (tipo === 'numeros') {
    const nums = Array.isArray(dados.numeros) ? dados.numeros : [];
    inner = `<div class="numeros-titulo">${escHtml(titulo)}</div><div class="numeros-grid">${nums.map(n=>`<div class="numero-item"><div class="numero-hero">${escHtml(String(n.valor||''))}</div><div class="numero-label">${escHtml(n.label||'')}</div></div>`).join('')}</div>${corpo?`<div class="corpo-texto">${md2html(corpo)}</div>`:''}`;
  } else if (tipo === 'case') {
    inner = `<div class="case-titulo">${escHtml(titulo)}</div>${dados.marca?`<div class="case-marca">${escHtml(dados.marca)}</div>`:''} ${corpo?`<div class="corpo-texto">${md2html(corpo)}</div>`:''} ${dados.resultado?`<div class="case-resultado">${escHtml(dados.resultado)}</div>`:''} ${b.midia?`<div class="case-midia"><a href="${escAttr(b.midia)}" target="_blank" rel="noopener" class="btn-link">▶ Ver case</a></div>`:''}`;
  } else if (tipo === 'fechamento') {
    inner = `<div class="fechamento-wrapper"><div class="fechamento-titulo">${escHtml(titulo)}</div>${corpo?`<div class="corpo-texto">${md2html(corpo)}</div>`:''} ${dados.contato?`<div class="fechamento-contato">${escHtml(dados.contato)}</div>`:''}</div>`;
  } else {
    inner = `<div class="bloco-titulo">${escHtml(titulo)}</div>${corpo?`<div class="corpo-texto">${md2html(corpo)}</div>`:''} ${b.midia?`<div class="bloco-midia"><img src="${escAttr(b.midia)}" alt="" loading="lazy"></div>`:''}`;
  }
  return `<section class="page page-${tipo}" data-tipo="${escAttr(tipo)}">${inner}</section>`;
}
const CRED_CSS=`*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--azul:#1F6FE5;--cinza:#9B9BB4}body{background:#000;color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;overflow:hidden;width:100vw;height:100vh}.deck{width:100%;height:100%;position:relative}.page{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:8vw;opacity:0;transition:opacity .4s;pointer-events:none;overflow:hidden}.page.active{opacity:1;pointer-events:auto}.page-capa{justify-content:flex-end;padding-bottom:10vh}.capa-agencia{font-size:clamp(36px,6vw,80px);font-weight:700;letter-spacing:-.02em;line-height:1}.capa-sub{font-size:clamp(14px,2vw,24px);color:var(--cinza);margin-top:1.5rem;font-weight:300}.capa-empresa{font-size:clamp(12px,1.5vw,18px);color:var(--cinza);margin-top:3rem;letter-spacing:.08em;text-transform:uppercase}.page-numeros{justify-content:center}.numeros-titulo{font-size:clamp(12px,1.5vw,20px);letter-spacing:.1em;text-transform:uppercase;color:var(--cinza);margin-bottom:6vh}.numeros-grid{display:flex;gap:6vw;flex-wrap:wrap;align-items:flex-end}.numero-item{display:flex;flex-direction:column}.numero-hero{font-size:clamp(56px,10vw,130px);font-weight:100;letter-spacing:-.04em;line-height:1}.numero-label{font-size:clamp(10px,1.2vw,16px);color:var(--cinza);margin-top:.5rem;font-weight:300;text-transform:uppercase;letter-spacing:.06em}.bloco-titulo,.case-titulo,.numeros-titulo,.fechamento-titulo{font-size:clamp(16px,2.5vw,36px);font-weight:700;line-height:1.2;margin-bottom:4vh}.corpo-texto{font-size:clamp(12px,1.4vw,20px);line-height:1.7;color:rgba(255,255,255,.8);font-weight:300;max-width:70ch}.corpo-texto p{margin-bottom:1.2em}.case-marca{font-size:clamp(10px,1.2vw,16px);letter-spacing:.08em;text-transform:uppercase;color:var(--cinza);margin-bottom:3vh}.case-resultado{font-size:clamp(18px,3vw,44px);font-weight:100;color:#fff;margin-top:4vh;letter-spacing:-.02em}.fechamento-wrapper{text-align:center}.fechamento-contato{font-size:clamp(12px,1.5vw,20px);color:var(--cinza);margin-top:4vh}.btn-link{color:var(--azul);text-decoration:none;font-size:clamp(10px,1.2vw,16px);letter-spacing:.06em;text-transform:uppercase;padding:.5rem 1.2rem;border:1px solid var(--azul);display:inline-block;margin-top:3vh;transition:all .2s}.btn-link:hover{background:var(--azul);color:#fff}.progress{position:fixed;bottom:0;left:0;height:2px;background:var(--azul);transition:width .4s;z-index:10}.slide-counter{position:fixed;bottom:1.5rem;right:2rem;font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.3)}.presentation-hint{position:fixed;bottom:1.5rem;left:2rem;font-size:10px;color:rgba(255,255,255,.2);letter-spacing:.06em}@media(max-width:768px){.page{padding:6vw 5vw}.numero-hero{font-size:clamp(40px,14vw,100px)}}`;
const CRED_JS=`const pages=document.querySelectorAll('.page');const progress=document.querySelector('.progress');const counter=document.querySelector('.slide-counter');let cur=0;function go(n){n=Math.max(0,Math.min(pages.length-1,n));pages[cur].classList.remove('active');cur=n;pages[cur].classList.add('active');if(progress)progress.style.width=((cur+1)/pages.length*100)+'%';if(counter)counter.textContent=(cur+1)+' / '+pages.length;}document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' ')go(cur+1);if(e.key==='ArrowLeft'||e.key==='ArrowUp')go(cur-1);if(e.key==='Home')go(0);if(e.key==='End')go(pages.length-1);if(e.key==='f'||e.key==='F')document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();});let tx=0;document.addEventListener('touchstart',function(e){tx=e.touches[0].clientX;});document.addEventListener('touchend',function(e){var d=tx-e.changedTouches[0].clientX;if(Math.abs(d)>50)go(d>0?cur+1:cur-1);});go(0);`;

// ── Relatório semanal: HTML público por token (rota /api/relatorio/:token) ────
function relatorioErroHtml(msg) {
  return '<html><body style="background:#060606;color:#fff;font-family:sans-serif;padding:4rem">' + escHtml(msg) + '</body></html>';
}
function renderRelatorioHtml(row) {
  const d = (row && row.dados) || {};
  const sem = ptDateRel(d.semana_inicio);
  const kpi = (label, v) => `<div style="background:#0d0d1a;border:1px solid #1A1A2E;border-radius:10px;padding:16px 18px;min-width:140px"><div style="font-size:26px;font-weight:700;color:#FF6B2B">${escHtml(String(v ?? 0))}</div><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9B9BB4;margin-top:4px">${escHtml(label)}</div></div>`;
  const canais = Object.entries(d.por_canal || {}).map(([c, n]) => `<li>${escHtml(c)}: <b>${escHtml(String(n))}</b></li>`).join('') || '<li style="color:#555">sem envios</li>';
  const ags = Object.entries(d.por_agencia || {}).map(([nome, v]) =>
    `<tr><td style="padding:6px 12px">${escHtml(nome)}</td><td style="padding:6px 12px;text-align:right">${escHtml(String(v.enviados||0))}</td><td style="padding:6px 12px;text-align:right">${escHtml(String(v.respostas||0))}</td><td style="padding:6px 12px;text-align:right">${escHtml(String(v.reunioes||0))}</td></tr>`).join('');
  const top5 = (d.top5 || []).map(n => `<li>${escHtml(String(n))}</li>`).join('') || '<li style="color:#555">—</li>';
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório semanal — ${escHtml(sem)}</title>
<style>body{background:#060606;color:#e8e8f0;font-family:'IBM Plex Mono',ui-monospace,monospace;margin:0;padding:32px 18px;max-width:860px;margin:0 auto}h1{font-family:'Syne',sans-serif;font-size:26px;color:#fff;margin:0 0 4px}.sub{color:#9B9BB4;font-size:13px;margin-bottom:24px}.grid{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.resumo{background:#0d0d1a;border:1px solid #1A1A2E;border-radius:10px;padding:18px;line-height:1.6;color:#cfcfe0}h2{font-family:'Syne',sans-serif;font-size:15px;color:#60A5FA;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.06em}table{border-collapse:collapse;width:100%;font-size:13px}th{color:#9B9BB4;font-weight:400;text-align:right;padding:6px 12px;border-bottom:1px solid #1A1A2E}th:first-child{text-align:left}ul{padding-left:18px;line-height:1.8}</style></head>
<body><h1>Relatório semanal</h1><div class="sub">Semana de ${escHtml(sem)} · gerado em ${escHtml(ptDateRel(d.gerado_em))}${d.aviso ? ' · ' + escHtml(d.aviso) : ''}</div>
<div class="resumo">${escHtml(d.resumo_texto || 'Sem resumo.')}</div>
<div class="grid">${kpi('Reuniões', d.reunioes_total)}${kpi('Toques enviados', d.enviados_total)}${kpi('Respostas', d.respostas_total)}${kpi('Taxa resposta', (d.taxa_resposta_pct||0)+'%')}${kpi('Oport. criadas', d.oportunidades_criadas)}${kpi('Ganhas', d.oportunidades_ganhas)}${kpi('Empresas novas', d.empresas_novas)}</div>
<h2>Por canal</h2><ul>${canais}</ul>
<h2>Por agência</h2><table><thead><tr><th>Agência</th><th>Enviados</th><th>Respostas</th><th>Reuniões</th></tr></thead><tbody>${ags || '<tr><td style="padding:6px 12px;color:#555">—</td><td></td><td></td><td></td></tr>'}</tbody></table>
<h2>Top 5 empresas quentes</h2><ul>${top5}</ul>
</body></html>`;
}
function ptDateRel(iso) {
  const s = String(iso || '').slice(0, 10);
  const [y, m, dd] = s.split('-');
  return (dd && m && y) ? `${dd}/${m}/${y}` : s;
}

// ── handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { action, token } = req.query;

  // GET /api/relatorio/:token (via rewrite) — HTML público do relatório semanal
  if (req.method === 'GET' && action === 'relatorio' && token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{8,64}$/.test(token)) {
      return res.status(404).send(relatorioErroHtml('Relatório não encontrado.'));
    }
    const rows = await sg(`crm_relatorios?token=eq.${token}&select=dados,semana_inicio,gerado_em&limit=1`);
    if (!rows || !rows[0]) return res.status(404).send(relatorioErroHtml('Relatório não encontrado ou expirado.'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300,stale-while-revalidate');
    return res.status(200).send(renderRelatorioHtml(rows[0]));
  }

  // GET /api/fila?token=<hex32> — renderiza credencial HTML
  if (req.method === 'GET' && token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
      return res.status(404).send('<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:4rem">Credencial não encontrada.</body></html>');
    }
    const rows = await sg(`crm_credenciais_geradas?token=eq.${token}&select=*`);
    if (!rows || !rows[0]) return res.status(404).send('<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:4rem">Credencial não encontrada ou expirada.</body></html>');
    const cred = rows[0];
    let blocos = [];
    if (Array.isArray(cred.blocos) && cred.blocos.length > 0) {
      const ids = cred.blocos.map(id => `"${id}"`).join(',');
      const raw = await sg(`crm_credenciais_blocos?id=in.(${ids})&ativo=eq.true&idioma=eq.${encodeURIComponent(cred.idioma||'pt')}&order=ordem.asc`);
      if (Array.isArray(raw)) { const order = cred.blocos; blocos = raw.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)); }
    }
    const pagesHtml = blocos.map(renderBloco).join('\n');
    const titulo = escHtml(cred.titulo || 'Galeria Holding');
    const html = `<!DOCTYPE html><html lang="${escAttr(cred.idioma||'pt')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><style>${CRED_CSS}</style></head><body><div class="deck">${pagesHtml||'<section class="page active"><div style="padding:4rem;color:#555">Sem blocos.</div></section>'}</div><div class="progress"></div><div class="slide-counter"></div><div class="presentation-hint">F = tela cheia · ← → navegar</div><script>${CRED_JS}</script></body></html>`;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','s-maxage=300,stale-while-revalidate');
    return res.status(200).send(html);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // POST /api/fila?action=credencial — criar credencial
  if (action === 'credencial') {
    const auth = req.headers.authorization || '';
    const jwt = auth.replace('Bearer ', '').trim();
    if (!jwt || !(await verifyJWT(jwt))) return res.status(401).json({ error: 'Não autenticado' });
    const { empresa_id, agencia_ids, idioma = 'pt', blocos = [], cases = [], titulo } = req.body || {};
    if (!Array.isArray(blocos) || !Array.isArray(agencia_ids)) return res.status(400).json({ error: 'blocos e agencia_ids são obrigatórios' });
    const rows = await sp('crm_credenciais_geradas', { empresa_id: empresa_id || null, agencia_ids, idioma, blocos, cases, titulo: titulo || 'Galeria Holding', criado_por: jwt.slice(0, 8) });
    if (!Array.isArray(rows) || !rows[0]) return res.status(500).json({ error: 'Erro ao criar credencial' });
    const cred = rows[0];
    const baseUrl = process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://galeria-holding-sage.vercel.app';
    const html_url = baseUrl + '/c/' + cred.token;
    await fetch(SUPA_URL+'/rest/v1/crm_credenciais_geradas?id=eq.'+cred.id, { method:'PATCH', headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json'}, body:JSON.stringify({html_url}) });
    return res.status(200).json({ id: cred.id, token: cred.token, html_url, expira_em: cred.expira_em });
  }

  // POST /api/fila — gerar fila de prospecção
  const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  // SUPA_ANON (chave pública do frontend) NÃO autentica cron — só CRON_SECRET,
  // SDR_CRON_SECRET (pg_cron/pg_net) ou a service key.
  const isCron = authHeader && (
    (CRON_SECRET && authHeader === CRON_SECRET) ||
    (SDR_CRON_SECRET && authHeader === SDR_CRON_SECRET) ||
    (SUPA_KEY && authHeader === SUPA_KEY.trim()) ||
    // Relógio do SDR: segredo do Vault (JWT tem pontos; o segredo não).
    (!authHeader.includes('.') && await tokenSdrValido(authHeader, { supaUrl: SUPA_URL, serviceKey: SUPA_KEY }))
  );
  const isJWT = !isCron && authHeader && await verifyJWT(authHeader);
  if (!isCron && !isJWT) return res.status(401).json({ error: 'Não autenticado' });

  const { agencia_slug, canais = ['email', 'whatsapp'], limite = 30, sem_ia = false } = req.body || {};
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY, timeout: 20000 });
  const LIMITE_FILA_MS = 50000;
  const inicioFila = Date.now();
  const semana = inicioSemana();
  const gerados = []; const erros = []; const bloqueados = [];

  let agencias;
  if (agencia_slug) {
    agencias = await sg(`crm_agencias?slug=eq.${agencia_slug}&select=*`);
    if (!Array.isArray(agencias) || agencias.length === 0) agencias = await sg(`crm_agencias?id=eq.${agencia_slug}&select=*`);
  }
  if (!Array.isArray(agencias) || agencias.length === 0) agencias = await sg('crm_agencias?select=*&order=nome.asc&limit=14');
  if (!Array.isArray(agencias) || agencias.length === 0) return res.status(200).json({ gerados: 0, erros: [] });

  const LIMITES = await limitesConfig();
  // Pausa de primeiros contatos: decisão de negócio. Quando ligada, o gerador só
  // cria follow-up (etapa >= 2) — conversa já iniciada —, nunca abordagem nova.
  const cfgPausaRows = await sg('crm_configuracoes?chave=eq.pausar_primeiros_contatos&select=valor&limit=1');
  const pausarPrimeiros = String(Array.isArray(cfgPausaRows) && cfgPausaRows[0]?.valor).toLowerCase() === 'true';
  const blRows = await sg('crm_blocklist?ativo=eq.true&apagado_em=is.null&select=nome_canonico,aliases,dominios,grupo_economico,ativo&limit=2000');
  const blocklist = makeBlocklist(blRows || []);
  const mxCache = new Map();
  const restante = {};
  for (const c of canais) { const usados = await contadosHoje(c); restante[c] = Math.max(0, (LIMITES[c] || 50) - usados); }

  let totalGerado = 0;
  for (const ag of agencias) {
    if (totalGerado >= limite) break;
    const scoreMap = await estrelasPorEmpresa(ag.id);
    const decisores = await sg(`crm_decisores?etapa_cadencia=neq.off&status=neq.inativo&select=*,crm_empresas!empresa_id(id,nome,setor,segmento_detalhe,sinal_recente_em,cliente_ativo,agencia_atendendo,dominio)&order=ultimo_toque_em.asc.nullsfirst&limit=2000`);
    if (!Array.isArray(decisores)) continue;
    const empresasVistas = new Set();
    const elegiveis = decisores.filter(d => {
      if (!elegivel(d)) { bloqueados.push({decisor:d.nome,motivo:'inelegivel'}); return false; }
      if (pausarPrimeiros) {
        const m = String(d.etapa_cadencia || '').match(/\d+/);
        const etapaNum = m ? Number(m[0]) : 1;
        if (etapaNum <= 1) { bloqueados.push({decisor:d.nome,motivo:'primeiros_contatos_pausados'}); return false; }
      }
      if (empresasVistas.has(d.empresa_id)) { bloqueados.push({decisor:d.nome,motivo:'empresa_ja_na_fila'}); return false; }
      if (d.ultimo_toque_em && new Date(d.ultimo_toque_em) > new Date(semana)) { bloqueados.push({decisor:d.nome,motivo:'tocado_esta_semana'}); return false; }
      const emp = d.crm_empresas || {};
      // BLOCKLIST: empresa/domínio/e-mail de cliente da holding → nunca abordar
      const bl = blocklist.check({ name: emp.nome, domain: emp.dominio, email: d.email });
      if (bl.blocked) { bloqueados.push({decisor:d.nome,motivo:'blocklist:'+bl.entryName+'/'+bl.reason}); return false; }
      // Cliente ativo da holding = bloqueado automaticamente (qualquer agência)
      if (emp.cliente_ativo) { bloqueados.push({decisor:d.nome,motivo:'cliente_ativo'}); return false; }
      empresasVistas.add(d.empresa_id);
      return true;
    }).sort((a,b) => {
      const sa = scoreMap[a.empresa_id] || 0; const sb = scoreMap[b.empresa_id] || 0;
      if (sb !== sa) return sb - sa;
      return (new Date(b.sinal_recente_em||0).getTime()) - (new Date(a.sinal_recente_em||0).getTime()) || (b.temperatura||0) - (a.temperatura||0);
    });
    const templates = await sg(`crm_templates?agencia_id=eq.${ag.id}&tipo=eq.prospeccao&ativo=eq.true&select=*`);
    const cases = await sg(`crm_cases?agencia_id=eq.${ag.id}&ativo=eq.true&permitido_em_prospeccao=eq.true&destaque=eq.true&select=id,titulo,marca,resumo,url_pagina&limit=5`);
    for (const d of elegiveis) {
      if (totalGerado >= limite) break;
      if (Date.now() - inicioFila > LIMITE_FILA_MS) { erros.push({empresa:'timeout',decisor:'',err:'wall-clock 50s atingido'}); break; }
      const emp = d.crm_empresas || {};
      // Dupla checagem da blocklist imediatamente antes de inserir em crm_fila
      if (emp.cliente_ativo || blocklist.isBlocked({ name: emp.nome, domain: emp.dominio, email: d.email })) { bloqueados.push({decisor:d.nome,motivo:'blocklist_pre_insert'}); continue; }
      let canalList = canaisDisponiveis(d).filter(c => canais.includes(c) && (restante[c] || 0) > 0);
      // MX: antes de um e-mail entrar na fila, confirma que o domínio recebe e-mail.
      // Sem MX (definitivo) → marca email_valido=false e tira o canal e-mail.
      if (canalList.includes('email') && d.email && d.email.includes('@')) {
        const dom = d.email.split('@')[1].toLowerCase().trim();
        let mx = mxCache.get(dom);
        if (mx === undefined) { mx = await checarMX(dom); mxCache.set(dom, mx); }
        if (!mx.ok) {
          canalList = canalList.filter(c => c !== 'email');
          bloqueados.push({ decisor:d.nome, motivo:(mx.definitivo?'sem_mx:':'mx_indef:')+dom });
          if (mx.definitivo) await sp(`crm_decisores?id=eq.${d.id}`, { email_valido:false }, 'PATCH');
        }
      }
      if (canalList.length === 0) continue;
      const canal = canalList[0]; const etapa = d.etapa_cadencia || 'etapa1';
      const etapaStr = etapa.replace('etapa','');
      const tpl = (templates || []).find(t => t.canal === canal && t.etapa === etapaStr);
      const caso = cases && cases.length > 0 ? cases[Math.floor(Math.random() * cases.length)] : null;
      const estrelas = scoreMap[d.empresa_id] || 0;
      const etapaN = Number(etapa.replace('etapa','')) || 1;
      const isEtapa1 = etapaN === 1;
      const etapaInstr = isEtapa1 ? 'OBJETIVO etapa 1: pedir 20 minutos para entender o marketing da empresa. NÃO mencione cases, clientes, resultados nem faça pitch.' : '';
      const casoStr = (!isEtapa1 && caso) ? `Case disponível (mencionar se relevante): ${caso.titulo} (${caso.marca}) — ${caso.resumo}` : '';
      const prompt = [`Gere uma mensagem de prospecção.`,`Agência: ${ag.nome}`,`Empresa-alvo: ${emp.nome||d.empresa_id}`,`Setor: ${emp.setor||emp.segmento_detalhe||'não especificado'}`,`Decisor: ${d.nome}, ${d.cargo||'cargo desconhecido'}`,`Canal: ${canal}`,`Etapa: ${etapa}`,tpl?`Template base (usar como estrutura, personalizar apenas primeira frase): ${tpl.corpo.slice(0,300)}`:'',etapaInstr,casoStr].filter(Boolean).join('\n');
      const setor = setorStr(emp);
      const vars = {primeiro_nome:(d.nome||'').split(' ')[0],nome:d.nome||'',cargo:d.cargo||'',empresa:emp.nome||'',setor,agencia:ag.nome||'',nome_decisor:d.nome||'',nome_empresa:emp.nome||''};
      try {
        let txt;
        if (sem_ia) {
          const base = tpl || FALLBACK_TEMPLATES[canal] || FALLBACK_TEMPLATES.email;
          txt = {assunto:interpolar(base.assunto||'',vars),corpo:interpolar(base.corpo||'',vars),tokens_prompt:0,tokens_resposta:0,custo_usd:0};
        } else {
          const caseNames = caso ? [caso.titulo, caso.marca].filter(Boolean) : [];
          txt = await gerarTexto(anthropic, prompt, canal, { caseNames });
          if (!txt) {
            await logWarn('texto IA rejeitado, usando template', { empresa: emp.nome, decisor: d.nome, canal, etapa }, d.empresa_id, d.id);
            const base = tpl || FALLBACK_TEMPLATES[canal] || FALLBACK_TEMPLATES.email;
            txt = {assunto:interpolar(base.assunto||'',vars),corpo:interpolar(base.corpo||'',vars),tokens_prompt:0,tokens_resposta:0,custo_usd:0};
          }
        }
        const row = await sp('crm_fila', { agencia_id:ag.id, agencia_slug:ag.slug||ag.nome, empresa_id:d.empresa_id, decisor_id:d.id, canal, etapa, status:'rascunho', assunto:txt.assunto||null, corpo:txt.corpo, case_id:caso?.id||null, template_id:tpl?.id||null, tokens_prompt:txt.tokens_prompt, tokens_resposta:txt.tokens_resposta, custo_usd:txt.custo_usd, modelo:sem_ia?'template':'claude-sonnet-4-6', contexto_para_aprovacao:`${emp.nome||''} · ${d.nome} · ${d.cargo||''} · ${estrelas}★` });
        if (row) { restante[canal]=(restante[canal]||0)-1; totalGerado++; gerados.push({id:row[0]?.id,empresa:emp.nome,decisor:d.nome,canal,estrelas}); await sp(`crm_decisores?id=eq.${d.id}`, {ultimo_toque_em:new Date().toISOString()}, 'PATCH'); }
      } catch(e) { erros.push({empresa:emp.nome,decisor:d.nome,err:e.message}); }
    }
  }
  return res.status(200).json({ gerados: totalGerado, itens: gerados, erros, bloqueados });
}
