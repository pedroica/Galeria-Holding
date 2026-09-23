// api/cron.js — handler unificado de crons
//
// Roteamento: GET ou POST /api/cron?job=<nome>
//   gerar-fila-diario      → chama /api/fila (antigo /api/gerar-fila)
//   enriquecimento-diario  → Lusha enrichment diário
//   noticias-semanal       → Google News para empresas estrelas>=3
//   fechamento-sexta       → relatório semanal
//
// vercel.json crons apontam para /api/cron?job=<nome>

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;
const LUSHA_KEY = process.env.LUSHA_API_KEY || process.env.LUSHA_KEY;
const BASE_URL = process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://galeria-holding-sage.vercel.app';

function authCheck(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer '+process.env.CRON_SECRET) {
    res.status(401).json({ error: 'unauthorized' }); return false;
  }
  return true;
}

async function sg(path) {
  const r = await fetch(SUPA_URL+'/rest/v1/'+path, { headers: { apikey:SUPA_KEY, Authorization:'Bearer '+SUPA_KEY } });
  return r.ok ? r.json() : [];
}
async function sp(path, body, method='POST') {
  const r = await fetch(SUPA_URL+'/rest/v1/'+path, { method, headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'}, body:JSON.stringify(body) });
  return r.ok;
}
async function logCron(job, nivel, mensagem, contexto) {
  try {
    const r = await fetch(SUPA_URL+'/rest/v1/crm_logs', {
      method:'POST',
      headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({origem:'cron:'+job, nivel, mensagem, contexto:contexto||null})
    });
    if (!r.ok) {
      const body = await r.text();
      console.error('[logCron] HTTP', r.status, body.slice(0,200));
    }
  } catch(e) { console.error('[logCron]', e.message); }
}

// ── job: gerar-fila-diario ───────────────────────────────────────────────────
async function jobGerarFila(req, res) {
  const inicio = Date.now();
  await logCron('gerar-fila-diario', 'info', 'início', null);
  const r = await fetch(BASE_URL+'/api/fila', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization:'Bearer '+(process.env.CRON_SECRET||SUPA_KEY||'') },
    body: JSON.stringify({ canais:['email','whatsapp','linkedin_convite'], limite:40 })
  });
  const data = await r.json();
  const ctx = {gerados:data.gerados||0, erros:data.erros?.length||0, ms:Date.now()-inicio};
  console.log('[cron:gerar-fila-diario]', ctx.gerados, 'gerados', ctx.erros, 'erros');
  await logCron('gerar-fila-diario', 'info', 'fim', ctx);
  return res.status(200).json({ ok:true, ...data });
}

// ── job: enriquecimento-diario ───────────────────────────────────────────────
async function lushaCall(nome, empresa_nome) {
  if (!LUSHA_KEY || !nome) return null;
  try {
    const [fn,...ln] = nome.split(' ');
    const r = await fetch('https://api.lusha.com/person', { method:'POST', headers:{api_key:LUSHA_KEY,'Content-Type':'application/json'}, body:JSON.stringify({firstName:fn,lastName:ln.join(' '),company:empresa_nome||''}) });
    if (!r.ok) return null;
    return r.json();
  } catch(e) { return null; }
}
async function empIdsComEstrelas(threshold) {
  const rows = await sg(`crm_empresa_agencia_estrelas?or=(estrelas_manual.gte.${threshold},estrelas_calculadas.gte.${threshold})&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=500`);
  const ids = new Set();
  for (const r of (Array.isArray(rows)?rows:[])) { const eff=r.estrelas_manual!=null?Number(r.estrelas_manual):Number(r.estrelas_calculadas||0); if(eff>=threshold)ids.add(r.empresa_id); }
  return [...ids];
}
async function jobEnriquecimento(req, res) {
  const inicio = Date.now();
  await logCron('enriquecimento-diario', 'info', 'início', null);
  if (!LUSHA_KEY) return res.status(200).json({ ok:true, msg:'LUSHA_API_KEY não configurada' });
  let revelados = 0;
  const ids3 = await empIdsComEstrelas(3);
  if (ids3.length > 0) {
    const inClause = ids3.slice(0,100).join(',');
    const semEmail = await sg(`crm_decisores?email=is.null&empresa_id=in.(${inClause})&select=id,nome,empresa_id&limit=20`);
    const empNomes = await sg(`crm_empresas?id=in.(${ids3.slice(0,50).join(',')})&select=id,nome`);
    const empNomeMap = {}; for (const e of (Array.isArray(empNomes)?empNomes:[])) empNomeMap[e.id]=e.nome;
    for (const d of (Array.isArray(semEmail)?semEmail:[])) {
      if (revelados >= 1400) break;
      const data = await lushaCall(d.nome, empNomeMap[d.empresa_id]||'');
      const email = data?.emailAddresses?.[0]?.emailAddress;
      if (email) { await sp('crm_decisores?id=eq.'+d.id, {email,fonte:'lusha',atualizado_em:new Date().toISOString()}, 'PATCH'); revelados++; }
      await new Promise(r=>setTimeout(r,500));
    }
  }
  const ids5 = await empIdsComEstrelas(5);
  if (ids5.length > 0) {
    const inClause = ids5.slice(0,50).join(',');
    const semWA = await sg(`crm_decisores?wa=is.null&empresa_id=in.(${inClause})&select=id,nome,empresa_id&limit=10`);
    const empNomes5 = await sg(`crm_empresas?id=in.(${ids5.slice(0,50).join(',')})&select=id,nome`);
    const empNomeMap5 = {}; for (const e of (Array.isArray(empNomes5)?empNomes5:[])) empNomeMap5[e.id]=e.nome;
    for (const d of (Array.isArray(semWA)?semWA:[])) {
      if (revelados >= 1400) break;
      const data = await lushaCall(d.nome, empNomeMap5[d.empresa_id]||'');
      const tel = data?.phoneNumbers?.[0]?.internationalNumber;
      if (tel) { await sp('crm_decisores?id=eq.'+d.id, {wa:tel,fonte:'lusha',atualizado_em:new Date().toISOString()}, 'PATCH'); revelados++; }
      await new Promise(r=>setTimeout(r,500));
    }
  }
  const ctx_enrich = {revelados, empresas_gte3:ids3.length, empresas_gte5:ids5.length, ms:Date.now()-inicio};
  console.log('[cron:enriquecimento-diario]', revelados, 'revelações');
  await logCron('enriquecimento-diario', 'info', 'fim', ctx_enrich);
  return res.status(200).json({ ok:true, revelados, empresas_gte3:ids3.length, empresas_e5:ids5.length });
}

// ── job: noticias-semanal ────────────────────────────────────────────────────
async function buscarNoticias(empresa) {
  const q = encodeURIComponent('"'+empresa.nome+'"');
  const url = `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419&num=3`;
  try {
    const r = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'} }); if(!r.ok)return[];
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    return items.slice(0,3).map(m=>{
      const get=(tag)=>{ const x=m[1].match(new RegExp('<'+tag+'[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></'+tag+'>|<'+tag+'[^>]*>([\\s\\S]*?)</'+tag+'>')); return x?(x[1]||x[2]||'').trim():''; };
      return {titulo:get('title'),url:get('link'),fonte:get('source'),publicado_em:get('pubDate')};
    }).filter(n=>n.titulo);
  } catch(e){return[];}
}
async function jobNoticias(req, res) {
  const inicio = Date.now();
  await logCron('noticias-semanal', 'info', 'início', null);
  const scoreRows = await sg('crm_empresa_agencia_estrelas?or=(estrelas_manual.gte.3,estrelas_calculadas.gte.3)&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=1000');
  const empMap = {};
  for (const r of (Array.isArray(scoreRows)?scoreRows:[])) {
    const eff=r.estrelas_manual!=null?Number(r.estrelas_manual):Number(r.estrelas_calculadas||0);
    if(eff>=3&&(!empMap[r.empresa_id]||eff>empMap[r.empresa_id]))empMap[r.empresa_id]=eff;
  }
  const empresaIds = Object.keys(empMap);
  if (empresaIds.length===0) return res.status(200).json({ok:true,processadas:0,inseridas:0});
  const empresas = [];
  for (let i=0; i<Math.min(empresaIds.length,200); i+=50) {
    const rows = await sg(`crm_empresas?id=in.(${empresaIds.slice(i,i+50).join(',')})&select=id,nome`);
    if(Array.isArray(rows))empresas.push(...rows);
  }
  let inseridas = 0;
  for (const emp of empresas) {
    const noticias = await buscarNoticias(emp);
    for (const n of noticias) {
      const ok = await sp('crm_noticias', {empresa_id:emp.id,titulo:n.titulo.slice(0,500),url:n.url||null,fonte:n.fonte||'Google News',data:n.publicado_em?new Date(n.publicado_em).toISOString():null});
      if(ok)inseridas++;
    }
    await new Promise(r=>setTimeout(r,200));
  }
  const ctx_noticias = {inseridas, empresas:empresas.length, ms:Date.now()-inicio};
  console.log('[cron:noticias-semanal]', inseridas, 'notícias para', empresas.length, 'empresas');
  await logCron('noticias-semanal', 'info', 'fim', ctx_noticias);
  return res.status(200).json({ok:true,empresas:empresas.length,inseridas});
}

// ── job: fechamento-sexta ────────────────────────────────────────────────────
function semanaInicio(ref) {
  const d = new Date(ref||Date.now()); d.setDate(d.getDate()-(d.getDay()===0?6:d.getDay()-1)); d.setHours(0,0,0,0); return d;
}
async function jobFechamento(req, res) {
  const inicio = Date.now();
  await logCron('fechamento-sexta', 'info', 'início', null);
  const now = new Date();
  const diaBRT = new Date(now.toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));
  const isSexta = diaBRT.getDay()===5;
  const semSeg = semanaInicio(now);
  const kanbanRows = await sg(`crm_kanban?select=id,col,agencia_id,responsavel,atualizado_em&atualizado_em=gte.${semSeg.toISOString()}&limit=500`);
  const reunioesSem = (Array.isArray(kanbanRows)?kanbanRows:[]).filter(c=>c.col==='reuniao');
  const filaRows = await sg(`crm_fila?select=id,canal,status,agencia_id&enviado_em=gte.${semSeg.toISOString()}&limit=2000`);
  const fila = Array.isArray(filaRows)?filaRows:[];
  const agencias = await sg('crm_agencias?select=id,nome&limit=20');
  const byAg = {};
  for (const ag of (Array.isArray(agencias)?agencias:[])) {
    const agFila=fila.filter(f=>f.agencia_id===ag.id);
    byAg[ag.nome||ag.id]={reunioes:reunioesSem.filter(c=>(c.agencia_id||c.responsavel||'').toLowerCase().includes(ag.id.toLowerCase())).length,enviados:agFila.length,respostas:agFila.filter(f=>f.status==='respondido').length};
  }
  const dados = {semana_inicio:semSeg.toISOString().slice(0,10),gerado_em:now.toISOString(),reunioes_total:reunioesSem.length,enviados_total:fila.length,respostas_total:fila.filter(x=>x.status==='respondido').length,taxa_resposta_pct:fila.length>0?Math.round(fila.filter(x=>x.status==='respondido').length/fila.length*100):0,por_agencia:byAg,aviso:isSexta?null:'Gerado fora de sexta (manual)'};
  const upsertRes = await fetch(SUPA_URL+'/rest/v1/crm_relatorios',{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({tipo:'semanal',semana_inicio:semSeg.toISOString().slice(0,10),gerado_em:now.toISOString(),dados})});
  let token = null;
  if (upsertRes.ok) { const rows=await upsertRes.json(); token=Array.isArray(rows)&&rows[0]?rows[0].token:null; }
  const linkRelatorio = token ? `${BASE_URL}/api/relatorio/${token}` : null;
  const ctx_fech = {reunioes:dados.reunioes_total,enviados:dados.enviados_total,respostas:dados.respostas_total,token,ms:Date.now()-inicio};
  console.log('[cron:fechamento-sexta]', ctx_fech);
  await logCron('fechamento-sexta', 'info', 'fim', ctx_fech);
  return res.status(200).json({ok:true,token,link:linkRelatorio,...dados});
}

// ── handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  console.log('[cron] handler start — job:', req.query?.job, '— SUPA_KEY defined:', !!SUPA_KEY, '— SUPA_URL:', SUPA_URL.slice(0,40));
  if (!authCheck(req, res)) return;
  const { job } = req.query;
  try {
    if (job === 'gerar-fila-diario')     return await jobGerarFila(req, res);
    if (job === 'enriquecimento-diario') return await jobEnriquecimento(req, res);
    if (job === 'noticias-semanal')      return await jobNoticias(req, res);
    if (job === 'fechamento-sexta')      return await jobFechamento(req, res);
    return res.status(400).json({ error: 'job inválido. Use: gerar-fila-diario, enriquecimento-diario, noticias-semanal, fechamento-sexta' });
  } catch(e) {
    console.error('[cron:'+job+']', e.message);
    try { await logCron(job||'unknown', 'error', 'erro: '+e.message, null); } catch(_) {}
    return res.status(500).json({ error: e.message });
  }
}
