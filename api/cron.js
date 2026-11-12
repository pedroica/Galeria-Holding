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

async function authCheck(req, res, job) {
  const auth = req.headers.authorization || '';
  const secret = (process.env.CRON_SECRET || '').trim();
  // Falha fechado: sem CRON_SECRET configurado, só a service key passa.
  // Antes, `if (secret && ...)` deixava o endpoint aberto a qualquer um quando
  // a variável estava vazia — e este endpoint gasta créditos Lusha.
  const aceitos = [secret, (SUPA_KEY || '').trim()].filter(Boolean).map(v => 'Bearer ' + v);
  if (!aceitos.length || !aceitos.includes(auth)) {
    const hint = !secret
      ? 'CRON_SECRET ausente — configure a variável na Vercel'
      : (auth ? `bearer present, prefix=${auth.slice(0, 15)}` : 'no Authorization header');
    try {
      await fetch(SUPA_URL+'/rest/v1/crm_logs', {
        method:'POST',
        headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({origem:'cron:'+(job||'unknown'), nivel:'error', mensagem:'401 unauthorized — authCheck failed', contexto:{hint, job:job||null}})
      });
    } catch(_) {}
    res.status(401).json({ error: 'unauthorized' });
    return false;
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
// Um job que termina sem fazer nada não pode registrar 'info'.
// Era por isso que 30 dias de no-op passaram como sucesso.
function nivelTrabalho(unidades) { return unidades > 0 ? 'info' : 'aviso'; }

async function logCron(job, nivel, mensagem, contexto) {
  try {
    await fetch(SUPA_URL+'/rest/v1/crm_logs', {
      method:'POST',
      headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({origem:'cron:'+job, nivel, mensagem, contexto:contexto||null})
    });
  } catch(e) { console.error('[logCron]', e.message); }
}

// ── higiene da fila ──────────────────────────────────────────────────────────
// Rascunho que envelhece sem aprovação tem data vencida e texto velho: não serve
// mais para envio e ainda trava o gerar-fila-diario pelo pré-check de fila cheia.
// Era esse o impasse: 22 execuções seguidas pularam por 'fila_cheia' enquanto os
// mesmos 31 rascunhos apodreciam, e o texto era reescrito por LLM mais tarde.
// Arquiva como 'pulado' (não apaga). Para reverter:
//   UPDATE crm_fila SET status='rascunho', motivo_pulo=NULL
//   WHERE motivo_pulo LIKE 'arquivado automaticamente%';
const HIGIENE_MAX_POR_RODADA = 300;

async function higienizarFila() {
  const cfg = await sg('crm_configuracoes?chave=eq.higiene_fila_dias&select=valor&limit=1');
  const dias = Array.isArray(cfg) && cfg[0]?.valor ? Number(cfg[0].valor) : 7;
  const corte = new Date(Date.now() - dias*24*60*60*1000).toISOString();

  const vencidos = await sg(
    'crm_fila?status=eq.rascunho&apagado_em=is.null&gerado_em=lt.' + corte +
    '&select=id&order=gerado_em.asc&limit=' + HIGIENE_MAX_POR_RODADA
  );
  const ids = (Array.isArray(vencidos) ? vencidos : []).map(r => r.id).filter(Boolean);
  if (!ids.length) return { arquivados: 0, dias };

  const ok = await sp(
    'crm_fila?id=in.(' + ids.join(',') + ')',
    { status: 'pulado', motivo_pulo: 'arquivado automaticamente: rascunho venceu sem aprovação (' + dias + ' dias)' },
    'PATCH'
  );
  return { arquivados: ok ? ids.length : 0, dias, falhou: !ok };
}

// ── job: gerar-fila-diario ───────────────────────────────────────────────────
async function jobGerarFila(req, res) {
  const inicio = Date.now();
  await logCron('gerar-fila-diario', 'info', 'início', null);

  // Limpa os vencidos ANTES do pré-check, senão a fila nunca desafoga sozinha.
  const higiene = await higienizarFila();

  // Pré-check: menos de 30 rascunhos vivos na fila
  const rascRows = await sg('crm_fila?status=eq.rascunho&apagado_em=is.null&select=id&limit=31');
  const qtdRascunhos = Array.isArray(rascRows) ? rascRows.length : 0;
  if (qtdRascunhos >= 30) {
    const ctx = { motivo: 'fila_cheia', qtdRascunhos, higiene, ms: Date.now()-inicio };
    // 'aviso': fila cheia sem nada gerado é um problema a resolver, não um sucesso.
    await logCron('gerar-fila-diario', 'aviso', 'fim — pulado', ctx);
    return res.status(200).json({ ok:true, pulado:true, ...ctx });
  }

  // Agências com ≥3 templates ativos por canal
  const templates = await sg('crm_templates?ativo=eq.true&select=agencia_id,canal&limit=500');
  const agCanalCount = {};
  for (const t of (Array.isArray(templates) ? templates : [])) {
    const key = t.agencia_id + ':' + t.canal;
    agCanalCount[key] = (agCanalCount[key] || 0) + 1;
  }
  const agElegiveis = new Set();
  for (const [key, cnt] of Object.entries(agCanalCount)) {
    if (cnt >= 3) agElegiveis.add(key.split(':')[0]);
  }
  if (agElegiveis.size === 0) {
    const ctx = { motivo: 'sem_agencias_elegiveis', qtdRascunhos, higiene, ms: Date.now()-inicio };
    await logCron('gerar-fila-diario', 'info', 'fim — pulado', ctx);
    return res.status(200).json({ ok:true, pulado:true, ...ctx });
  }

  // Gerar por canal com limites: email=25, whatsapp=10, linkedin_convite=10
  const canaisConfig = [
    { canal: 'email',            limite: 25 },
    { canal: 'whatsapp',         limite: 10 },
    { canal: 'linkedin_convite', limite: 10 }
  ];
  let totalGerados = 0;
  const porCanal   = {};
  const descartes  = {};

  for (const { canal, limite } of canaisConfig) {
    const agParaCanal = [...agElegiveis].filter(id => (agCanalCount[id + ':' + canal] || 0) >= 3);
    if (agParaCanal.length === 0) {
      descartes[canal] = 'sem_agencia_com_3_templates';
      continue;
    }
    try {
      const r = await fetch(BASE_URL + '/api/fila', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.CRON_SECRET || '') },
        body: JSON.stringify({ canais: [canal], limite, sem_ia: true })
      });
      const data = r.ok ? await r.json().catch(() => ({})) : {};
      const gerados = data.gerados || 0;
      porCanal[canal] = gerados;
      totalGerados += gerados;
      if (data.erros?.length) descartes[canal] = data.erros.slice(0, 3).map(String).join('; ');
    } catch (e) {
      descartes[canal] = e.message;
    }
  }

  // Resumo por agência: conta rascunhos gerados hoje
  const hojeISO = new Date().toISOString().slice(0, 10);
  const novosFila = await sg('crm_fila?status=eq.rascunho&gerado_em=gte.' + hojeISO + 'T00:00:00&select=agencia_id,canal&limit=500');
  const porAgencia = {};
  for (const item of (Array.isArray(novosFila) ? novosFila : [])) {
    if (!item.agencia_id) continue;
    if (!porAgencia[item.agencia_id]) porAgencia[item.agencia_id] = {};
    porAgencia[item.agencia_id][item.canal] = (porAgencia[item.agencia_id][item.canal] || 0) + 1;
  }

  const ctx = { gerados: totalGerados, qtdRascunhos, porCanal, porAgencia, descartes, ms: Date.now()-inicio };
  console.log('[cron:gerar-fila-diario]', totalGerados, 'gerados', JSON.stringify(porCanal));
  await logCron('gerar-fila-diario', 'info', 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── job: enriquecimento-diario ───────────────────────────────────────────────

// Preço real da Lusha (confirmado em /v3/account/usage): revealEmail = 1 crédito,
// revealPhone = 5 créditos. O código antigo contabilizava 2 por contato — 3x menos
// que o custo real de um reveal com e-mail + telefone.
const CUSTO_EMAIL = 1;
const CUSTO_TELEFONE = 5;
const PISO_CREDITOS = 200; // abaixo disso o job para e avisa

// crm_empresas tem três campos de web preenchidos de forma inconsistente
// (dominio, website, site). O job antigo só olhava `dominio` e por isso
// considerava "sem domínio" quase toda a base.
function dominioDe(emp) {
  const bruto = emp && (emp.dominio || emp.website || emp.site) || '';
  if (!bruto) return null;
  const limpo = String(bruto).trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[\/?#].*$/, '')
    .toLowerCase();
  return limpo || null;
}

// Descobre o domínio pelo provider que já existe em api/enrich.js.
// Ele grava crm_empresas.website sozinho e devolve { domain, source }.
async function descobrirDominio(empresaId, nome) {
  if (!nome) return null;
  try {
    const r = await fetch(BASE_URL + '/api/enrich?provider=lusha-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: nome, empresaId })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.domain ? d.domain : null;
  } catch (_) { return null; }
}

// Lusha V3: busca contatos por domínio.
// Só busca com domínio: o filtro por nome que havia aqui mandava
// `companies.include.name` como string, formato que a API não aceita, e o
// `if (!r.ok) return []` engolia o erro — era o caminho de ~88% das empresas.
async function lushaSearchV3(dominio, falhas) {
  if (!LUSHA_KEY || !dominio) return [];
  try {
    const r = await fetch('https://api.lusha.com/v3/contacts/prospecting', {
      method: 'POST',
      headers: { api_key: LUSHA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: {
          contacts: { include: { seniority: [9,10,8,6], departments: ['Marketing','General Management'] } },
          companies: { include: { domains: [dominio] } }
        },
        pagination: { page: 0, size: 5 }
      })
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      falhas.push({ etapa: 'search', dominio, status: r.status, corpo: corpo.slice(0, 200) });
      return [];
    }
    const d = await r.json();
    return Array.isArray(d.contacts) ? d.contacts : [];
  } catch (e) {
    falhas.push({ etapa: 'search', dominio, erro: e.message });
    return [];
  }
}

// Telefone custa 5x o e-mail, então só é revelado onde vale: empresas 4-5 estrelas.
async function lushaRevealV3(contacts, comTelefone, falhas) {
  if (!LUSHA_KEY || !contacts.length) return [];
  const reveal = comTelefone ? ['emails', 'phones'] : ['emails'];
  try {
    const r = await fetch('https://api.lusha.com/v3/contacts/enrich', {
      method: 'POST',
      headers: { api_key: LUSHA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: contacts.slice(0, 2), reveal })
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      falhas.push({ etapa: 'reveal', status: r.status, corpo: corpo.slice(0, 200) });
      return [];
    }
    const d = await r.json();
    return Array.isArray(d.results) ? d.results : [];
  } catch (e) {
    falhas.push({ etapa: 'reveal', erro: e.message });
    return [];
  }
}

async function lushaCreditsV3(falhas) {
  if (!LUSHA_KEY) return null;
  try {
    const r = await fetch('https://api.lusha.com/v3/account/usage', { headers: { api_key: LUSHA_KEY } });
    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      if (falhas) falhas.push({ etapa: 'usage', status: r.status, corpo: corpo.slice(0, 200) });
      return null;
    }
    return await r.json();
  } catch (e) {
    if (falhas) falhas.push({ etapa: 'usage', erro: e.message });
    return null;
  }
}

async function jobEnriquecimento(req, res) {
  const inicio = Date.now();
  const falhas = [];
  await logCron('enriquecimento-diario', 'info', 'início', null);
  if (!LUSHA_KEY) {
    await logCron('enriquecimento-diario', 'aviso', 'fim — pulado', { motivo: 'LUSHA_KEY_ausente' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'LUSHA_KEY_ausente' });
  }

  // Saldo antes: sem isso o job gasta às cegas.
  const saldoAntes = await lushaCreditsV3(falhas);
  const creditosDisponiveis = saldoAntes?.credits?.remaining ?? saldoAntes?.credits?.balance ?? null;
  if (creditosDisponiveis !== null && creditosDisponiveis < PISO_CREDITOS) {
    const ctx = { motivo: 'creditos_baixos', creditos_restantes: creditosDisponiveis, piso: PISO_CREDITOS, ms: Date.now()-inicio };
    await logCron('enriquecimento-diario', 'aviso', 'fim — pulado', ctx);
    return res.status(200).json({ ok: true, pulado: true, ...ctx });
  }

  const cfgRows = await sg('crm_configuracoes?chave=eq.enriquecimento_diario_max&select=valor&limit=1');
  const teto = Array.isArray(cfgRows) && cfgRows[0]?.valor ? Number(cfgRows[0].valor) : 10;

  const kanbanReunioes = await sg('crm_kanban?col=eq.reuniao&select=empresa_id&limit=500');
  const reunioesPorEmpresa = {};
  for (const k of (Array.isArray(kanbanReunioes) ? kanbanReunioes : [])) {
    if (k.empresa_id) reunioesPorEmpresa[k.empresa_id] = (reunioesPorEmpresa[k.empresa_id] || 0) + 1;
  }

  // Candidatos: decisores ativos sem e-mail. O filtro apagado_em faltava.
  const semEmail = await sg('crm_decisores?email=is.null&apagado_em=is.null&select=id,nome,empresa_id,linkedin_url&order=ultimo_toque_em.desc.nullslast&limit=50');
  const decisoresSemEmail = Array.isArray(semEmail) ? semEmail : [];
  if (decisoresSemEmail.length === 0) {
    const ctx = { revelados: 0, teto, motivo: 'nenhum_decisor_sem_email', ms: Date.now()-inicio };
    await logCron('enriquecimento-diario', 'aviso', 'fim', ctx);
    return res.status(200).json({ ok: true, ...ctx });
  }

  const empIds = [...new Set(decisoresSemEmail.map(d => d.empresa_id).filter(Boolean))].slice(0, 50);
  const empRows = empIds.length > 0
    ? await sg(`crm_empresas?id=in.(${empIds.join(',')})&select=id,nome,dominio,website,site,setor&limit=50`)
    : [];
  const empMap = {};
  for (const e of (Array.isArray(empRows) ? empRows : [])) empMap[e.id] = e;

  // Estrelas por empresa: decide se vale gastar 5 créditos em telefone.
  const estrelasRows = empIds.length > 0
    ? await sg(`crm_empresa_agencia_estrelas?empresa_id=in.(${empIds.join(',')})&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=500`)
    : [];
  const estrelasPorEmpresa = {};
  for (const r of (Array.isArray(estrelasRows) ? estrelasRows : [])) {
    const v = Number(r.estrelas_manual ?? r.estrelas_calculadas ?? 0) || 0;
    if (v > (estrelasPorEmpresa[r.empresa_id] || 0)) estrelasPorEmpresa[r.empresa_id] = v;
  }

  decisoresSemEmail.sort((a, b) => {
    const ra = reunioesPorEmpresa[a.empresa_id] || 0;
    const rb = reunioesPorEmpresa[b.empresa_id] || 0;
    if (rb !== ra) return rb - ra;
    return (estrelasPorEmpresa[b.empresa_id] || 0) - (estrelasPorEmpresa[a.empresa_id] || 0);
  });

  let revelados = 0;
  let creditosUsados = 0;
  let dominiosDescobertos = 0;
  let empresasTentadas = 0;
  let semDominio = 0;
  const reveladosPorEmpresa = {};
  const empresasVistas = new Set();
  const LIMITE_MS = 45000;

  for (const dec of decisoresSemEmail) {
    if (revelados >= teto) break;
    if (Date.now() - inicio > LIMITE_MS) break;
    if ((reveladosPorEmpresa[dec.empresa_id] || 0) >= 2) continue;

    const emp = empMap[dec.empresa_id] || {};
    let dominio = dominioDe(emp);

    // Sem domínio o search não funciona. Descobre antes em vez de desistir calado.
    if (!dominio && emp.nome) {
      dominio = await descobrirDominio(dec.empresa_id, emp.nome);
      if (dominio) { dominiosDescobertos++; emp.website = 'https://' + dominio; }
      await new Promise(r => setTimeout(r, 200));
    }
    if (!dominio) { semDominio++; continue; }

    if (!empresasVistas.has(dec.empresa_id)) { empresasVistas.add(dec.empresa_id); empresasTentadas++; }

    const contacts = await lushaSearchV3(dominio, falhas);
    await new Promise(r => setTimeout(r, 200));
    if (!contacts.length) continue;

    const comTelefone = (estrelasPorEmpresa[dec.empresa_id] || 0) >= 4;
    const results = await lushaRevealV3(contacts, comTelefone, falhas);
    await new Promise(r => setTimeout(r, 200));

    for (const result of results) {
      const email = result.email || result.emailAddresses?.[0]?.emailAddress || null;
      const tel   = result.phoneNumber || result.phoneNumbers?.[0]?.internationalNumber || null;
      const linkedinUrl = result.linkedin_url || result.linkedinUrl || null;

      if (email) creditosUsados += CUSTO_EMAIL;
      if (tel)   creditosUsados += CUSTO_TELEFONE;
      if (!email && !tel) continue;

      const nomeCompleto = [result.firstName, result.lastName].filter(Boolean).join(' ');
      const decCorrespondente = decisoresSemEmail.find(d =>
        d.empresa_id === dec.empresa_id &&
        nomeCompleto && d.nome && result.lastName &&
        d.nome.toLowerCase().includes(result.lastName.toLowerCase())
      ) || dec;

      const patch = { atualizado_em: new Date().toISOString(), fonte: 'lusha_v3' };
      if (email) patch.email = email;
      if (tel)   patch.wa   = tel;
      if (linkedinUrl && !decCorrespondente.linkedin_url) patch.linkedin_url = linkedinUrl;

      const gravou = await sp('crm_decisores?id=eq.' + decCorrespondente.id, patch, 'PATCH');
      if (!gravou) { falhas.push({ etapa: 'patch_decisor', decisor_id: decCorrespondente.id }); continue; }
      revelados++;
      reveladosPorEmpresa[dec.empresa_id] = (reveladosPorEmpresa[dec.empresa_id] || 0) + 1;
      if (revelados >= teto) break;
    }
  }

  const saldoDepois = await lushaCreditsV3(falhas);
  const ctx_enrich = {
    revelados, teto,
    creditos_usados: creditosUsados,
    creditos_restantes: saldoDepois?.credits?.remaining ?? saldoDepois?.credits?.balance ?? null,
    empresas_tentadas: empresasTentadas,
    dominios_descobertos: dominiosDescobertos,
    sem_dominio: semDominio,
    falhas: falhas.slice(0, 10),
    ms: Date.now()-inicio
  };
  console.log('[cron:enriquecimento-diario]', revelados, 'revelações,', creditosUsados, 'créditos');
  // 'aviso' quando não revelou nada: um no-op deixa de parecer sucesso.
  await logCron('enriquecimento-diario', nivelTrabalho(revelados), 'fim', ctx_enrich);
  return res.status(200).json({ ok: true, ...ctx_enrich });
}

// ── job: noticias-semanal ────────────────────────────────────────────────────
function inicioSemanaISO() {
  const brt = new Date(new Date().toLocaleString('en-US', {timeZone:'America/Sao_Paulo'}));
  const dia = brt.getDay();
  const seg = new Date(brt);
  seg.setDate(brt.getDate() - (dia===0?6:dia-1));
  seg.setHours(0,0,0,0);
  return seg.toISOString();
}
async function buscarNoticias(empresa) {
  const q = encodeURIComponent('"'+empresa.nome+'"');
  const url = `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419&num=3`;
  try {
    const r = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(4000) }); if(!r.ok)return[];
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

  // O cron dispara de segunda a sexta, mas este job é semanal. Sem esta guarda
  // ele rodava 5x por semana sobre as mesmas 20 empresas, e era isso que gerava
  // a duplicata em massa em crm_noticias.
  const jaRodou = await sg(
    'crm_logs?origem=eq.cron:noticias-semanal&mensagem=eq.fim&criado_em=gte.' +
    inicioSemanaISO() + '&select=id&limit=1'
  );
  if (Array.isArray(jaRodou) && jaRodou.length > 0) {
    const ctx = { motivo: 'ja_rodou_esta_semana', ms: Date.now()-inicio };
    await logCron('noticias-semanal', 'info', 'fim — pulado', ctx);
    return res.status(200).json({ ok: true, pulado: true, ...ctx });
  }

  // Todas as empresas com ≥3 estrelas
  const scoreRows = await sg('crm_empresa_agencia_estrelas?or=(estrelas_manual.gte.3,estrelas_calculadas.gte.3)&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=1000');
  const empMap = {};
  for (const r of (Array.isArray(scoreRows)?scoreRows:[])) {
    const eff=r.estrelas_manual!=null?Number(r.estrelas_manual):Number(r.estrelas_calculadas||0);
    if(eff>=3&&(!empMap[r.empresa_id]||eff>empMap[r.empresa_id]))empMap[r.empresa_id]=eff;
  }
  const todosIds = Object.keys(empMap);
  if (todosIds.length===0) {
    await logCron('noticias-semanal', 'info', 'fim', {inseridas:0, empresas:0, faltam:0, ms:Date.now()-inicio});
    return res.status(200).json({ok:true, processadas:0, inseridas:0, faltam:0});
  }

  // Prioridade 1: empresas na fila desta semana
  const filaRows = await sg(`crm_fila?gerado_em=gte.${inicioSemanaISO()}&select=empresa_id&limit=500`);
  const filaSet = new Set((Array.isArray(filaRows)?filaRows:[]).map(r=>r.empresa_id).filter(Boolean));

  // Já processadas recentemente → excluir da rotação.
  // Eram 7 dias: com 2.287 empresas na base e 20 por rodada, a janela curta
  // fazia as mesmas empresas voltarem sempre e o resto nunca ser coberto.
  const cutoffRotacao = new Date(Date.now()-30*86400000).toISOString();
  const recentRows = await sg(`crm_noticias?criado_em=gte.${cutoffRotacao}&select=empresa_id&limit=2000`);
  const recentSet = new Set((Array.isArray(recentRows)?recentRows:[]).map(r=>r.empresa_id).filter(Boolean));

  // Lista priorizada: fila da semana primeiro, depois rotação geral
  const prio1 = todosIds.filter(id => filaSet.has(id) && !recentSet.has(id));
  const prio2 = todosIds.filter(id => !filaSet.has(id) && !recentSet.has(id));
  const candidatos = [...prio1, ...prio2];
  const selecionados = candidatos.slice(0, 20);
  const faltam = Math.max(0, candidatos.length - 20);

  if (selecionados.length===0) {
    await logCron('noticias-semanal', 'info', 'fim', {inseridas:0, empresas:0, faltam:0, ms:Date.now()-inicio});
    return res.status(200).json({ok:true, processadas:0, inseridas:0, faltam:0});
  }

  const empresaRows = await sg(`crm_empresas?id=in.(${selecionados.join(',')})&select=id,nome`);
  const empresas = Array.isArray(empresaRows) ? empresaRows : [];

  const LIMITE_NOTICIAS_MS = 45000;
  // URLs que a empresa já tem: o insert não tinha dedupe nenhum.
  const urlsExistentes = new Set();
  if (selecionados.length) {
    const jaTem = await sg(`crm_noticias?empresa_id=in.(${selecionados.join(',')})&select=empresa_id,url&limit=2000`);
    for (const r of (Array.isArray(jaTem)?jaTem:[])) if (r.url) urlsExistentes.add(r.empresa_id + '|' + r.url);
  }

  let inseridas = 0;
  let duplicadas = 0;
  for (const emp of empresas) {
    if (Date.now() - inicio > LIMITE_NOTICIAS_MS) break;
    const noticias = await buscarNoticias(emp);
    for (const n of noticias) {
      const chave = emp.id + '|' + (n.url || '');
      if (n.url && urlsExistentes.has(chave)) { duplicadas++; continue; }
      const ok = await sp('crm_noticias', {
        empresa_id: emp.id,
        titulo: n.titulo.slice(0,500),
        url: n.url || null,
        fonte: n.fonte || 'Google News',
        data: n.publicado_em ? new Date(n.publicado_em).toISOString() : null,
        // explícito: a exclusão da rotação filtra por criado_em e dependia de um default
        criado_em: new Date().toISOString()
      });
      if (ok) { inseridas++; if (n.url) urlsExistentes.add(chave); }
    }
  }
  const ctx_noticias = {inseridas, duplicadas_evitadas:duplicadas, empresas:empresas.length, faltam, ms:Date.now()-inicio};
  console.log('[cron:noticias-semanal]', inseridas, 'notícias,', empresas.length, 'empresas,', faltam, 'faltam');
  await logCron('noticias-semanal', nivelTrabalho(inseridas), 'fim', ctx_noticias);
  return res.status(200).json({ok:true, processadas:empresas.length, ...ctx_noticias});
}

// ── job: fechamento-sexta ────────────────────────────────────────────────────
function semanaInicio(ref) {
  const d = new Date(ref||Date.now()); d.setDate(d.getDate()-(d.getDay()===0?6:d.getDay()-1)); d.setHours(0,0,0,0); return d;
}

function ptDate(iso) {
  const [y,m,d] = (iso||'').slice(0,10).split('-');
  return d+'/'+m+'/'+y;
}

function gerarResumoTexto(dados) {
  const linhas = [];
  const sem = ptDate(dados.semana_inicio);
  linhas.push('Semana de ' + sem + '.');
  linhas.push('Foram enviados ' + dados.enviados_total + ' toques no total, com ' +
    dados.respostas_total + ' resposta(s) e taxa de resposta de ' + dados.taxa_resposta_pct + '%.');
  linhas.push((dados.reunioes_total || 0) + ' reuniao(oes) agendada(s) na semana.');

  if (dados.empresas_novas > 0) {
    linhas.push(dados.empresas_novas + ' empresa(s) nova(s) foram abordadas pela primeira vez.');
  }

  if (dados.por_agencia) {
    const ativas = Object.entries(dados.por_agencia).filter(([,n]) => n.enviados > 0);
    for (const [ag, nums] of ativas) {
      linhas.push('Agencia ' + ag + ': ' + nums.enviados + ' enviado(s), ' +
        nums.respostas + ' resposta(s), ' + nums.reunioes + ' reuniao(oes).');
    }
  }

  if (dados.top5?.length) {
    linhas.push('As cinco empresas com maior temperatura na semana: ' + dados.top5.join(', ') + '.');
  }

  if (dados.oportunidades_criadas > 0) {
    linhas.push('Pipeline: ' + dados.oportunidades_criadas + ' oportunidade(s) criada(s) na semana' +
      (dados.oportunidades_ganhas > 0 ? ', ' + dados.oportunidades_ganhas + ' ganha(s)' : '') +
      (dados.oportunidades_perdidas > 0 ? ', ' + dados.oportunidades_perdidas + ' perdida(s)' : '') + '.');
  }

  if (dados.aviso) linhas.push('Aviso: ' + dados.aviso + '.');

  return linhas.join('\n');
}

async function jobFechamento(req, res) {
  const inicio = Date.now();
  await logCron('fechamento-sexta', 'info', 'início', null);
  const now = new Date();
  const diaBRT = new Date(now.toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));
  const isSexta = diaBRT.getDay()===5;
  const semSeg = semanaInicio(now);

  const [kanbanRows, filaRows, agencias, empresasNovas, toquesSem, oportRows] = await Promise.all([
    sg(`crm_kanban?select=id,col,agencia_id,atualizado_em&atualizado_em=gte.${semSeg.toISOString()}&limit=500`),
    sg(`crm_fila?select=id,canal,status,agencia_id,empresa_id&enviado_em=gte.${semSeg.toISOString()}&limit=2000`),
    sg('crm_agencias?select=id,nome&limit=20'),
    sg(`crm_empresas?criado_em=gte.${semSeg.toISOString()}&select=id,nome&limit=50`),
    sg(`crm_toques?data=gte.${semSeg.toISOString().slice(0,10)}&select=empresa_id,resultado&limit=2000`),
    sg(`crm_oportunidades?criado_em=gte.${semSeg.toISOString()}&select=id,estagio,agencia_id&limit=500`)
  ]);

  const reunioesSem = (Array.isArray(kanbanRows)?kanbanRows:[]).filter(c=>c.col==='reuniao');
  const fila = Array.isArray(filaRows)?filaRows:[];

  // Top 5 empresas mais quentes: soma de toques na semana + reuniões
  const scoreEmpresa = {};
  for (const f of fila) {
    if (f.empresa_id) scoreEmpresa[f.empresa_id] = (scoreEmpresa[f.empresa_id]||0) + 1;
  }
  for (const t of (Array.isArray(toquesSem)?toquesSem:[])) {
    if (t.empresa_id) scoreEmpresa[t.empresa_id] = (scoreEmpresa[t.empresa_id]||0) + 2;
  }
  for (const k of reunioesSem) {
    if (k.agencia_id) scoreEmpresa[k.agencia_id] = (scoreEmpresa[k.agencia_id]||0) + 5;
  }
  const top5EmpIds = Object.entries(scoreEmpresa).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id])=>id);
  let top5Nomes = [];
  if (top5EmpIds.length > 0) {
    const top5Rows = await sg(`crm_empresas?id=in.(${top5EmpIds.join(',')})&select=id,nome`);
    const nomeMap = {};
    for (const e of (Array.isArray(top5Rows)?top5Rows:[])) nomeMap[e.id]=e.nome;
    top5Nomes = top5EmpIds.map(id => nomeMap[id]||id);
  }

  const toques = Array.isArray(toquesSem) ? toquesSem : [];
  const respostasTotal = toques.filter(t=>['respondeu','resposta','reuniao_marcada','reuniao'].includes(t.resultado)).length;
  const byAg = {};
  for (const ag of (Array.isArray(agencias)?agencias:[])) {
    const agFila = fila.filter(f=>f.agencia_id===ag.id);
    byAg[ag.nome||ag.id] = {
      reunioes: reunioesSem.filter(c=>c.agencia_id===ag.id).length,
      enviados: agFila.length,
      respostas: respostasTotal
    };
  }

  // Por canal
  const porCanal = {};
  for (const f of fila) {
    if (f.canal) porCanal[f.canal] = (porCanal[f.canal]||0)+1;
  }

  const oportArr = Array.isArray(oportRows) ? oportRows : [];
  const oportGanhas = oportArr.filter(o=>o.estagio==='Ganho').length;
  const oportPerdidas = oportArr.filter(o=>o.estagio==='Perdido').length;

  const dados = {
    semana_inicio:       semSeg.toISOString().slice(0,10),
    gerado_em:           now.toISOString(),
    reunioes_total:      reunioesSem.length,
    enviados_total:      fila.length,
    respostas_total:     fila.filter(x=>x.status==='respondido').length,
    taxa_resposta_pct:   fila.length>0 ? Math.round(fila.filter(x=>x.status==='respondido').length/fila.length*100) : 0,
    empresas_novas:      Array.isArray(empresasNovas) ? empresasNovas.length : 0,
    por_canal:           porCanal,
    por_agencia:         byAg,
    top5:                top5Nomes,
    oportunidades_criadas: oportArr.length,
    oportunidades_ganhas:  oportGanhas,
    oportunidades_perdidas: oportPerdidas,
    aviso:               isSexta ? null : 'Gerado fora de sexta (manual)'
  };
  dados.resumo_texto = gerarResumoTexto(dados);

  const semanaStr = semSeg.toISOString().slice(0,10);
  const existentes = await sg(`crm_relatorios?tipo=eq.semanal&semana_inicio=eq.${semanaStr}&select=id,token&order=criado_em.desc&limit=1`);
  const existente = Array.isArray(existentes) && existentes[0] ? existentes[0] : null;
  let token = null;
  if (existente) {
    const patchRes = await fetch(SUPA_URL+'/rest/v1/crm_relatorios?id=eq.'+existente.id, {
      method:'PATCH',
      headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({gerado_em:now.toISOString(), dados})
    });
    token = existente.token;
  } else {
    const insertRes = await fetch(SUPA_URL+'/rest/v1/crm_relatorios', {
      method:'POST',
      headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify({tipo:'semanal', semana_inicio:semanaStr, gerado_em:now.toISOString(), dados})
    });
    if (insertRes.ok) { const rows=await insertRes.json(); token=Array.isArray(rows)&&rows[0]?rows[0].token:null; }
  }
  const linkRelatorio = token ? `${BASE_URL}/api/relatorio/${token}` : null;
  const ctx_fech = {reunioes:dados.reunioes_total,enviados:dados.enviados_total,respostas:dados.respostas_total,top5:top5Nomes,token,ms:Date.now()-inicio};
  console.log('[cron:fechamento-sexta]', ctx_fech);
  await logCron('fechamento-sexta', 'info', 'fim', ctx_fech);
  return res.status(200).json({ok:true,token,link:linkRelatorio,...dados});
}

// ── handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { job } = req.query;
  if (!await authCheck(req, res, job)) return;
  try {
    if (job === 'higiene-fila') {
      const h = await higienizarFila();
      await logCron('higiene-fila', nivelTrabalho(h.arquivados), 'fim', h);
      return res.status(200).json({ ok: true, ...h });
    }
    if (job === 'gerar-fila-diario')     return await jobGerarFila(req, res);
    if (job === 'enriquecimento-diario') return await jobEnriquecimento(req, res);
    if (job === 'noticias-semanal')      return await jobNoticias(req, res);
    if (job === 'fechamento-sexta')      return await jobFechamento(req, res);
    return res.status(400).json({ error: 'job inválido. Use: gerar-fila-diario, enriquecimento-diario, noticias-semanal, fechamento-sexta, higiene-fila' });
  } catch(e) {
    console.error('[cron:'+job+']', e.message);
    try { await logCron(job||'unknown', 'error', 'erro: '+e.message, null); } catch(_) {}
    return res.status(500).json({ error: e.message });
  }
}
