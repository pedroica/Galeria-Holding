// C6 — Renderizador HTML de credenciais por token
// Identidade: Cinema P&B — #000 fundo, branco, Helvetica Neue, números hero
// Rota pública: /c/{token} — sem auth, lê crm_credenciais_geradas + blocos

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY;

async function supaGet(path) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) return null;
  return res.json();
}

function renderBloco(b) {
  const tipo = b.tipo || 'livre';
  const titulo = b.titulo || '';
  const corpo = b.corpo || '';
  const dados = b.dados || b.bloco || {};

  const TIPO_STYLE = {
    capa: 'page-capa',
    manifesto: 'page-manifesto',
    numeros: 'page-numeros',
    ecossistema: 'page-ecossistema',
    servicos: 'page-servicos',
    metodologia: 'page-metodologia',
    case: 'page-case',
    time: 'page-time',
    clientes: 'page-clientes',
    premios: 'page-premios',
    fechamento: 'page-fechamento',
    livre: 'page-livre'
  };

  const cls = TIPO_STYLE[tipo] || 'page-livre';
  let inner = '';

  if (tipo === 'capa') {
    inner = `
      <div class="capa-wrapper">
        <div class="capa-agencia">${escHtml(dados.agencia || titulo)}</div>
        ${dados.subtitulo ? `<div class="capa-sub">${escHtml(dados.subtitulo)}</div>` : ''}
        ${dados.empresa ? `<div class="capa-empresa">para ${escHtml(dados.empresa)}</div>` : ''}
      </div>`;
  } else if (tipo === 'numeros') {
    const nums = Array.isArray(dados.numeros) ? dados.numeros : [];
    inner = `
      <div class="numeros-titulo">${escHtml(titulo)}</div>
      <div class="numeros-grid">
        ${nums.map(n => `
          <div class="numero-item">
            <div class="numero-hero">${escHtml(String(n.valor || ''))}</div>
            <div class="numero-label">${escHtml(n.label || '')}</div>
          </div>`).join('')}
      </div>
      ${corpo ? `<div class="corpo-texto">${md2html(corpo)}</div>` : ''}`;
  } else if (tipo === 'case') {
    inner = `
      <div class="case-titulo">${escHtml(titulo)}</div>
      ${dados.marca ? `<div class="case-marca">${escHtml(dados.marca)}</div>` : ''}
      ${corpo ? `<div class="corpo-texto">${md2html(corpo)}</div>` : ''}
      ${dados.resultado ? `<div class="case-resultado">${escHtml(dados.resultado)}</div>` : ''}
      ${b.midia ? `<div class="case-midia"><a href="${escAttr(b.midia)}" target="_blank" rel="noopener" class="btn-link">▶ Ver case</a></div>` : ''}`;
  } else if (tipo === 'fechamento') {
    inner = `
      <div class="fechamento-wrapper">
        <div class="fechamento-titulo">${escHtml(titulo)}</div>
        ${corpo ? `<div class="corpo-texto">${md2html(corpo)}</div>` : ''}
        ${dados.contato ? `<div class="fechamento-contato">${escHtml(dados.contato)}</div>` : ''}
      </div>`;
  } else {
    inner = `
      <div class="bloco-titulo">${escHtml(titulo)}</div>
      ${corpo ? `<div class="corpo-texto">${md2html(corpo)}</div>` : ''}
      ${b.midia ? `<div class="bloco-midia"><img src="${escAttr(b.midia)}" alt="" loading="lazy"></div>` : ''}`;
  }

  return `<section class="page ${cls}" data-tipo="${escAttr(tipo)}">${inner}</section>`;
}

function md2html(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return escHtml(s); }

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--azul:#1F6FE5;--azul-escuro:#002F6C;--vermelho:#F02000;--branco:#FFFFFF;--cinza:#9B9BB4}
body{background:#000;color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;overflow:hidden;width:100vw;height:100vh}
.deck{width:100%;height:100%;position:relative}
.page{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:8vw;opacity:0;transition:opacity .4s;pointer-events:none;overflow:hidden}
.page.active{opacity:1;pointer-events:auto}
/* Capa */
.page-capa{justify-content:flex-end;padding-bottom:10vh}
.capa-agencia{font-size:clamp(36px,6vw,80px);font-weight:700;letter-spacing:-.02em;line-height:1}
.capa-sub{font-size:clamp(14px,2vw,24px);color:var(--cinza);margin-top:1.5rem;font-weight:300}
.capa-empresa{font-size:clamp(12px,1.5vw,18px);color:var(--cinza);margin-top:3rem;letter-spacing:.08em;text-transform:uppercase}
/* Números */
.page-numeros{justify-content:center}
.numeros-titulo{font-size:clamp(12px,1.5vw,20px);letter-spacing:.1em;text-transform:uppercase;color:var(--cinza);margin-bottom:6vh}
.numeros-grid{display:flex;gap:6vw;flex-wrap:wrap;align-items:flex-end}
.numero-item{display:flex;flex-direction:column}
.numero-hero{font-size:clamp(56px,10vw,130px);font-weight:100;letter-spacing:-.04em;line-height:1;color:#fff}
.numero-label{font-size:clamp(10px,1.2vw,16px);color:var(--cinza);margin-top:.5rem;font-weight:300;text-transform:uppercase;letter-spacing:.06em}
/* Genérico */
.bloco-titulo,.case-titulo,.numeros-titulo,.fechamento-titulo{font-size:clamp(16px,2.5vw,36px);font-weight:700;line-height:1.2;margin-bottom:4vh}
.corpo-texto{font-size:clamp(12px,1.4vw,20px);line-height:1.7;color:rgba(255,255,255,.8);font-weight:300;max-width:70ch}
.corpo-texto p{margin-bottom:1.2em}
.case-marca{font-size:clamp(10px,1.2vw,16px);letter-spacing:.08em;text-transform:uppercase;color:var(--cinza);margin-bottom:3vh}
.case-resultado{font-size:clamp(18px,3vw,44px);font-weight:100;color:#fff;margin-top:4vh;letter-spacing:-.02em}
.fechamento-wrapper{text-align:center}
.fechamento-contato{font-size:clamp(12px,1.5vw,20px);color:var(--cinza);margin-top:4vh}
.btn-link{color:var(--azul);text-decoration:none;font-size:clamp(10px,1.2vw,16px);letter-spacing:.06em;text-transform:uppercase;padding:.5rem 1.2rem;border:1px solid var(--azul);display:inline-block;margin-top:3vh;transition:all .2s}
.btn-link:hover{background:var(--azul);color:#fff}
/* Progresso */
.progress{position:fixed;bottom:0;left:0;height:2px;background:var(--azul);transition:width .4s;z-index:10}
.slide-counter{position:fixed;bottom:1.5rem;right:2rem;font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.3);font-family:'Helvetica Neue',sans-serif}
/* Modo apresentação (F) */
.presentation-hint{position:fixed;bottom:1.5rem;left:2rem;font-size:10px;color:rgba(255,255,255,.2);letter-spacing:.06em}
@media(max-width:768px){.page{padding:6vw 5vw}.numero-hero{font-size:clamp(40px,14vw,100px)}}
`;

const JS = `
const pages = document.querySelectorAll('.page');
const progress = document.querySelector('.progress');
const counter = document.querySelector('.slide-counter');
let current = 0;
function go(n){
  n = Math.max(0, Math.min(pages.length-1, n));
  pages[current].classList.remove('active');
  current = n;
  pages[current].classList.add('active');
  if(progress) progress.style.width = ((current+1)/pages.length*100)+'%';
  if(counter) counter.textContent = (current+1)+' / '+pages.length;
}
document.addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' ') go(current+1);
  if(e.key==='ArrowLeft'||e.key==='ArrowUp') go(current-1);
  if(e.key==='Home') go(0);
  if(e.key==='End') go(pages.length-1);
  if(e.key==='f'||e.key==='F') document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();
});
// Touch swipe
let tx=0;
document.addEventListener('touchstart',function(e){tx=e.touches[0].clientX;});
document.addEventListener('touchend',function(e){var d=tx-e.changedTouches[0].clientX;if(Math.abs(d)>50)go(d>0?current+1:current-1);});
go(0);
`;

export default async function handler(req, res) {
  const { token } = req.query;
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    return res.status(404).send('<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:4rem">Credencial não encontrada.</body></html>');
  }

  const rows = await supaGet(`crm_credenciais_geradas?token=eq.${token}&select=*`);
  if (!rows || !rows[0]) {
    return res.status(404).send('<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:4rem">Credencial não encontrada ou expirada.</body></html>');
  }

  const cred = rows[0];
  let blocos = [];

  if (Array.isArray(cred.blocos) && cred.blocos.length > 0) {
    const ids = cred.blocos.map(id => `"${id}"`).join(',');
    const raw = await supaGet(`crm_credenciais_blocos?id=in.(${ids})&ativo=eq.true&idioma=eq.${encodeURIComponent(cred.idioma || 'pt')}&order=ordem.asc`);
    if (Array.isArray(raw)) {
      const order = cred.blocos;
      blocos = raw.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
  }

  const pagesHtml = blocos.map(renderBloco).join('\n');
  const titulo = escHtml(cred.titulo || 'Galeria Holding');

  const html = `<!DOCTYPE html>
<html lang="${escAttr(cred.idioma || 'pt')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>${CSS}</style>
</head>
<body>
<div class="deck">
${pagesHtml || '<section class="page active"><div style="padding:4rem;color:#555">Sem blocos.</div></section>'}
</div>
<div class="progress"></div>
<div class="slide-counter"></div>
<div class="presentation-hint">F = tela cheia · ← → navegar</div>
<script>${JS}</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  res.status(200).send(html);
}
