// api/cron.js — handler unificado de crons
//
// Roteamento: GET ou POST /api/cron?job=<nome>
//   gerar-fila-diario      → chama /api/fila (antigo /api/gerar-fila)
//   enriquecimento-diario  → Lusha enrichment diário
//   noticias-semanal       → Google News para empresas estrelas>=3
//   fechamento-sexta       → relatório semanal
//
// vercel.json crons apontam para /api/cron?job=<nome>

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeBlocklist } from '../lib/blocklist.js';
import { selecionarLote } from '../lib/sdr-selecao.js';
import { montarDossie } from '../lib/sdr-dossie.js';
import { escolherCase, construirPromptRedacao, construirPromptAvaliacao, mesclarCases } from '../lib/sdr-redacao.js';
import { checagensCodigo, decisao } from '../lib/sdr-qualidade.js';
import { classificarResposta, extrairEmails } from '../lib/sdr-respostas.js';
import { aplicarResposta } from '../lib/sdr-acoes.js';
import { podeEnviar, slotsDoDia, proximoPasso, corpoFinal, htmlDeTexto, horaBRT, tetoEmailHoje } from '../lib/sdr-envio.js';
import { enviarEmailGraph, enviarWhatsAppTemplate, normalizarWa, parametrosTemplate } from '../lib/canais-envio.js';
import { obterTokenGraph } from '../lib/graph-token.js';
import { MODELOS_WA, payloadMeta } from '../lib/wa-templates.js';
import { crossSell, sinaisDeCompra } from '../lib/sdr-topo.js';

// Base de conhecimento (agências, cases com números exatos). Carregada no cold start.
let KNOWLEDGE = { agencias: [], cases_destaque: [] };
try {
  const __dirCron = dirname(fileURLToPath(import.meta.url));
  KNOWLEDGE = JSON.parse(readFileSync(join(__dirCron, '..', 'data', 'galeria-holding-knowledge.json'), 'utf8'));
} catch (_) {}
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODELO_SDR = 'claude-opus-5-5';

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;
const LUSHA_KEY = process.env.LUSHA_API_KEY || process.env.LUSHA_KEY;
// Domínio de produção estável para chamadas internas (VERCEL_URL é o deploy
// específico, sujeito à proteção de deployment e quebra as chamadas internas).
const BASE_URL = process.env.PROD_BASE_URL || 'https://galeria-holding-sage.vercel.app';

async function authCheck(req, res, job) {
  const auth = req.headers.authorization || '';
  const secret = (process.env.CRON_SECRET || '').trim();
  // Falha fechado: sem CRON_SECRET configurado, só a service key passa.
  // Antes, `if (secret && ...)` deixava o endpoint aberto a qualquer um quando
  // a variável estava vazia — e este endpoint gasta créditos Lusha.
  // SDR_CRON_SECRET autentica as chamadas vindas do pg_cron/pg_net do Supabase.
  const aceitos = [secret, (process.env.SDR_CRON_SECRET || '').trim(), (SUPA_KEY || '').trim()].filter(Boolean);
  const recebido = auth.replace(/^Bearer\s+/i, '').trim();
  if (!aceitos.length || !recebido || !aceitos.includes(recebido)) {
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

// Retorna null em falha (NÃO [] — senão uma leitura que falhou vira "sem dados"
// e o job segue sobre uma base vazia). Quem não distingue continua coagindo p/ [].
async function sg(path) {
  try {
    const r = await fetch(SUPA_URL+'/rest/v1/'+path, { headers: { apikey:SUPA_KEY, Authorization:'Bearer '+SUPA_KEY } });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}
// Encerra o job quando uma leitura crítica falha: registra 'error' e para.
async function erroLeitura(job, res, inicio, detalhe) {
  const ctx = { erro: 'leitura_banco_falhou', detalhe: detalhe || null, ms: Date.now()-inicio };
  await logCron(job, 'error', 'fim — leitura do banco falhou', ctx);
  return res.status(500).json({ ok: false, ...ctx });
}
async function sp(path, body, method='POST') {
  const r = await fetch(SUPA_URL+'/rest/v1/'+path, { method, headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'}, body:JSON.stringify(body) });
  return r.ok;
}
// Insert que devolve a representação (p/ pegar o id gerado).
async function spRet(path, body) {
  const r = await fetch(SUPA_URL+'/rest/v1/'+path, { method:'POST', headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=representation'}, body:JSON.stringify(body) });
  if (!r.ok) return null;
  const j = await r.json().catch(()=>null);
  return Array.isArray(j) && j[0] ? j[0] : null;
}
// Upsert por conflito (idempotente): merge-duplicates no índice único indicado.
async function spUpsert(path, body, onConflict) {
  const r = await fetch(SUPA_URL+'/rest/v1/'+path+(path.includes('?')?'&':'?')+'on_conflict='+onConflict, {
    method:'POST', headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify(body)
  });
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
// uuid tem 36 chars; `id=in.(...)` com 300 deles gera ~11KB de URL e o gateway
// corta em 8KB (414). Vai em lotes de 80 (~3KB), que passa com folga.
const HIGIENE_LOTE = 80;

async function higienizarFila(budgetMs = 20000) {
  const cfg = await sg('crm_configuracoes?chave=eq.higiene_fila_dias&select=valor&limit=1');
  const dias = Array.isArray(cfg) && cfg[0]?.valor ? Number(cfg[0].valor) : 7;
  const corte = new Date(Date.now() - dias*24*60*60*1000).toISOString();
  const motivo = 'arquivado automaticamente: rascunho venceu sem aprovação (' + dias + ' dias)';
  const t0 = Date.now();

  // Repete até esgotar os vencidos (uma só leva de 300 deixava milhares para trás)
  // ou até acabar o orçamento de tempo da função. Cada leva muda status→'pulado',
  // então a leva seguinte só traz vencidos ainda não arquivados.
  let arquivados = 0, lotes = 0, lotesFalhos = 0, rodadas = 0;
  while (Date.now() - t0 <= budgetMs) {
    const vencidos = await sg(
      'crm_fila?status=eq.rascunho&apagado_em=is.null&gerado_em=lt.' + corte +
      '&select=id&order=gerado_em.asc&limit=' + HIGIENE_MAX_POR_RODADA
    );
    const ids = (Array.isArray(vencidos) ? vencidos : []).map(r => r.id).filter(Boolean);
    if (!ids.length) break;
    rodadas++;
    let arquivadosRodada = 0;
    for (let i = 0; i < ids.length && Date.now() - t0 <= budgetMs; i += HIGIENE_LOTE) {
      const lote = ids.slice(i, i + HIGIENE_LOTE);
      const ok = await sp(
        'crm_fila?id=in.(' + lote.join(',') + ')',
        { status: 'pulado', motivo_pulo: motivo },
        'PATCH'
      );
      lotes++;
      if (ok) { arquivados += lote.length; arquivadosRodada += lote.length; } else lotesFalhos++;
    }
    // Leva menor que o teto = não há mais vencidos. Rodada que não arquivou nada
    // (PATCH falhando) não deve girar em falso: encerra para não esgotar o tempo.
    if (ids.length < HIGIENE_MAX_POR_RODADA || arquivadosRodada === 0) break;
  }
  return { arquivados, dias, lotes, lotes_falhos: lotesFalhos, rodadas };
}

// ── job: gerar-fila-diario ───────────────────────────────────────────────────
async function jobGerarFila(req, res) {
  const inicio = Date.now();
  await logCron('gerar-fila-diario', 'info', 'início', null);

  // Limpa os vencidos ANTES do pré-check, senão a fila nunca desafoga sozinha.
  const higiene = await higienizarFila();

  // Contagem total de rascunhos vivos — só observabilidade. A trava real é por
  // canal (abaixo), para que um canal cheio não impeça a geração nos outros.
  const rascRows = await sg('crm_fila?status=eq.rascunho&apagado_em=is.null&select=id&limit=200');
  const qtdRascunhos = Array.isArray(rascRows) ? rascRows.length : 0;

  // Pré-check por canal: no máx. 30 rascunhos vivos por canal, contando só os
  // gerados nos últimos 7 dias (rascunho antigo que escapou da higiene não pode
  // travar o canal para sempre).
  const corte7d = new Date(Date.now() - 7*24*60*60*1000).toISOString();
  async function rascunhosRecentes(canal) {
    const rows = await sg('crm_fila?status=eq.rascunho&apagado_em=is.null&canal=eq.' + canal +
      '&gerado_em=gte.' + corte7d + '&select=id&limit=31');
    return Array.isArray(rows) ? rows.length : 0;
  }

  // Agências com ≥3 templates ativos por canal
  const templates = await sg('crm_templates?ativo=eq.true&select=agencia_id,canal&limit=500');
  if (templates === null) return erroLeitura('gerar-fila-diario', res, inicio, 'crm_templates');
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

  // Limites por canal lidos de crm_configuracoes (email_daily_max, whatsapp_daily_max, linkedin_daily_max)
  const cfgRows = await sg('crm_configuracoes?chave=in.(email_daily_max,whatsapp_daily_max,linkedin_daily_max)&select=chave,valor');
  const cfg = {}; for (const r of (Array.isArray(cfgRows) ? cfgRows : [])) cfg[r.chave] = Number(r.valor);
  const lim = (k, def) => Number.isFinite(cfg[k]) ? cfg[k] : def;
  const canaisConfig = [
    { canal: 'email',            limite: lim('email_daily_max', 25) },
    { canal: 'whatsapp',         limite: lim('whatsapp_daily_max', 10) },
    { canal: 'linkedin_convite', limite: lim('linkedin_daily_max', 10) }
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
    const jaVivos = await rascunhosRecentes(canal);
    if (jaVivos >= 30) {
      descartes[canal] = 'fila_cheia (' + jaVivos + '+ rascunhos vivos < 7d)';
      porCanal[canal] = 0;
      continue;
    }
    try {
      const credGerar = (process.env.CRON_SECRET || '').trim() || (SUPA_KEY || '').trim();
      const r = await fetch(BASE_URL + '/api/fila', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credGerar },
        body: JSON.stringify({ canais: [canal], limite, sem_ia: true })
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        const gerados = data.gerados || 0;
        porCanal[canal] = gerados;
        totalGerados += gerados;
        if (data.erros?.length) {
          descartes[canal] = data.erros.slice(0, 3)
            .map(e => (e && e.err) ? e.err : (typeof e === 'string' ? e : JSON.stringify(e)))
            .join('; ');
        }
      } else {
        // Antes virava {} e o erro sumia: agora vai para o descarte e para o log.
        const txt = await r.text().catch(() => '');
        porCanal[canal] = 0;
        descartes[canal] = 'HTTP ' + r.status + (txt ? ': ' + txt.slice(0, 160) : '');
      }
    } catch (e) {
      porCanal[canal] = 0;
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

  const ctx = { gerados: totalGerados, qtdRascunhos, higiene, porCanal, porAgencia, descartes, ms: Date.now()-inicio };
  console.log('[cron:gerar-fila-diario]', totalGerados, 'gerados', JSON.stringify(porCanal));
  // Zero gerados é um aviso (algo travou), não um sucesso silencioso.
  await logCron('gerar-fila-diario', totalGerados === 0 ? 'aviso' : 'info', 'fim', ctx);
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
    const credencial = (process.env.CRON_SECRET || '').trim() || (SUPA_KEY || '').trim();
    const r = await fetch(BASE_URL + '/api/enrich?provider=lusha-domain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + credencial
      },
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
  // País = Brasil (código ISO-2 'BR') para não revelar xarás de fora. O envelope
  // de país pode variar entre versões da API; se der 400, refaz sem o filtro de
  // país em vez de deixar o enriquecimento morrer calado.
  const corpo = (comPais) => ({
    filters: {
      contacts: {
        include: Object.assign(
          { seniority: [9,10,8,6], departments: ['Marketing','General Management'] },
          comPais ? { locations: [{ country: 'BR' }] } : {}
        )
      },
      companies: { include: { domains: [dominio] } }
    },
    pagination: { page: 0, size: 5 }
  });
  const busca = (comPais) => fetch('https://api.lusha.com/v3/contacts/prospecting', {
    method: 'POST',
    headers: { api_key: LUSHA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo(comPais))
  });
  try {
    let r = await busca(true);
    if (r.status === 400) r = await busca(false);
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      falhas.push({ etapa: 'search', dominio, status: r.status, corpo: txt.slice(0, 200) });
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

// Upsert de uma config (chave única). valor vai como JSONB.
async function upsertConfig(chave, valor) {
  try {
    await fetch(SUPA_URL + '/rest/v1/crm_configuracoes?on_conflict=chave', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ chave, valor })
    });
  } catch (_) {}
}

// Lê uma lista de uma config que pode vir como array JSONB ou string JSON.
function lerListaConfig(rows) {
  const v = Array.isArray(rows) && rows[0] ? rows[0].valor : null;
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(Boolean) : []; } catch { return []; } }
  return [];
}

// Classifica um contato por cargo: 'gestao' (diretoria/C-level) ou 'marketing'.
function departamentoDoContato(c) {
  const t = String(c.title || c.jobTitle || '').toLowerCase();
  if (/market|mkt|cmo|growth|brand|comunica|digital/.test(t)) return 'marketing';
  if (/ceo|founder|s[óo]cio|owner|president|diretor|director|head|gerente geral|general manager|managing|coo|chief/.test(t)) return 'gestao';
  return 'outro';
}

// Seleciona no máximo 1 de gestão + 1 de marketing (nunca 2 do mesmo).
// Antes o reveal pegava os 2 primeiros da busca, podendo gastar em 2 do mesmo time.
function selecionarContatos(contacts) {
  const escolhidos = [];
  const quero = { gestao: 1, marketing: 1 };
  for (const c of contacts) {
    const dep = departamentoDoContato(c);
    const chave = dep === 'outro' ? (quero.gestao > 0 ? 'gestao' : 'marketing') : dep;
    if (quero[chave] > 0) { escolhidos.push(c); quero[chave]--; }
    if (escolhidos.length >= 2) break;
  }
  return escolhidos;
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

  // Teto diário de CRÉDITO (não de revelações), medido contra o saldo real.
  // Um reveal com telefone custa 6 créditos (1 e-mail + 5 telefone).
  const cfgLim = await sg('crm_configuracoes?chave=eq.lusha_daily_limit&select=valor&limit=1');
  const tetoCreditos = Array.isArray(cfgLim) && cfgLim[0]?.valor ? Number(cfgLim[0].valor) : 60;

  // Empresas que a Lusha já respondeu "sem contato": não reconsultar todo dia.
  const cfgSemContato = await sg('crm_configuracoes?chave=eq.lusha_sem_contato&select=valor&limit=1');
  const semContatoSet = new Set(lerListaConfig(cfgSemContato));
  const semContatoNovos = [];

  const kanbanReunioes = await sg('crm_kanban?col=eq.reuniao&select=empresa_id&limit=500');
  const reunioesPorEmpresa = {};
  for (const k of (Array.isArray(kanbanReunioes) ? kanbanReunioes : [])) {
    if (k.empresa_id) reunioesPorEmpresa[k.empresa_id] = (reunioesPorEmpresa[k.empresa_id] || 0) + 1;
  }

  // Candidatos: decisores ativos sem e-mail. O filtro apagado_em faltava.
  // Rotação: os menos recentemente tentados vêm primeiro (nullsfirst = nunca
  // tentados). Antes a mesma janela de 50 era reconsultada todo dia.
  const semEmail = await sg('crm_decisores?email=is.null&apagado_em=is.null&select=id,nome,empresa_id,linkedin_url,enriquecimento_tentado_em&order=enriquecimento_tentado_em.asc.nullsfirst,ultimo_toque_em.desc.nullslast&limit=50');
  if (semEmail === null) return erroLeitura('enriquecimento-diario', res, inicio, 'crm_decisores');
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
    if (creditosUsados >= tetoCreditos) break;          // teto diário de crédito
    if (Date.now() - inicio > LIMITE_MS) break;
    if ((reveladosPorEmpresa[dec.empresa_id] || 0) >= 2) continue;
    if (semContatoSet.has(dec.empresa_id)) continue;    // empresa já marcada sem contato
    if (empresasVistas.has(dec.empresa_id)) continue;   // uma busca por empresa por rodada

    const emp = empMap[dec.empresa_id] || {};
    let dominio = dominioDe(emp);

    // Sem domínio o search não funciona. Descobre antes em vez de desistir calado.
    if (!dominio && emp.nome) {
      dominio = await descobrirDominio(dec.empresa_id, emp.nome);
      if (dominio) { dominiosDescobertos++; emp.website = 'https://' + dominio; }
      await new Promise(r => setTimeout(r, 200));
    }
    if (!dominio) { semDominio++; continue; }

    empresasVistas.add(dec.empresa_id); empresasTentadas++;

    const contacts = await lushaSearchV3(dominio, falhas);
    await new Promise(r => setTimeout(r, 200));
    // Rotação: marca a empresa como tentada hoje (vai para o fim da fila amanhã).
    await sp('crm_decisores?id=eq.' + dec.id, { enriquecimento_tentado_em: new Date().toISOString() }, 'PATCH');
    if (!contacts.length) {
      // Sem contato: registra para não reconsultar todo dia (item b).
      if (!semContatoSet.has(dec.empresa_id)) { semContatoSet.add(dec.empresa_id); semContatoNovos.push(dec.empresa_id); }
      continue;
    }

    const comTelefone = (estrelasPorEmpresa[dec.empresa_id] || 0) >= 4;
    // Máx. 1 de gestão + 1 de marketing (não 2 do mesmo time), waterfall off.
    const selecionados = selecionarContatos(contacts);
    const results = await lushaRevealV3(selecionados, comTelefone, falhas);
    await new Promise(r => setTimeout(r, 200));

    for (const result of results) {
      const email = result.email || result.emailAddresses?.[0]?.emailAddress || null;
      const tel   = result.phoneNumber || result.phoneNumbers?.[0]?.internationalNumber || null;
      const linkedinUrl = result.linkedin_url || result.linkedinUrl || null;

      if (email) creditosUsados += CUSTO_EMAIL;
      if (tel)   creditosUsados += CUSTO_TELEFONE;
      if (!email && !tel) continue;

      // E-mail já usado por outro decisor → não duplica, não regrava.
      if (email) {
        const jaExiste = await sg('crm_decisores?email=eq.' + encodeURIComponent(email) + '&apagado_em=is.null&select=id&limit=1');
        if (Array.isArray(jaExiste) && jaExiste.length) { falhas.push({ etapa: 'email_duplicado', empresa_id: dec.empresa_id }); continue; }
      }

      // Só grava num decisor cujo SOBRENOME bate com o do contato revelado.
      // Sem correspondência, cria um NOVO decisor — jamais escreve o e-mail de
      // uma pessoa em cima de outra (o antigo "|| dec" fazia exatamente isso).
      const nomeCompleto = [result.firstName, result.lastName].filter(Boolean).join(' ');
      const match = (nomeCompleto && result.lastName) ? decisoresSemEmail.find(d =>
        d.empresa_id === dec.empresa_id && d.nome && !d.email &&
        d.nome.toLowerCase().includes(result.lastName.toLowerCase())
      ) : null;

      let gravou;
      if (match) {
        const patch = { atualizado_em: new Date().toISOString(), fonte: 'lusha_v3' };
        if (email) patch.email = email;
        if (tel)   patch.wa   = tel;
        if (linkedinUrl && !match.linkedin_url) patch.linkedin_url = linkedinUrl;
        gravou = await sp('crm_decisores?id=eq.' + match.id, patch, 'PATCH');
        if (gravou && email) match.email = email;        // não reusar o mesmo match
      } else if (nomeCompleto) {
        gravou = await sp('crm_decisores', {
          empresa_id: dec.empresa_id, nome: nomeCompleto,
          cargo: result.title || result.jobTitle || null,
          email: email || null, wa: tel || null, linkedin_url: linkedinUrl || null,
          fonte: 'lusha_v3', atualizado_em: new Date().toISOString()
        }, 'POST');
      } else {
        falhas.push({ etapa: 'reveal_sem_nome', empresa_id: dec.empresa_id });
        continue;
      }

      if (!gravou) { falhas.push({ etapa: 'grava_decisor', empresa_id: dec.empresa_id }); continue; }
      revelados++;
      reveladosPorEmpresa[dec.empresa_id] = (reveladosPorEmpresa[dec.empresa_id] || 0) + 1;
      if (revelados >= teto) break;
    }
  }

  // Persiste as empresas recém-marcadas "sem contato" (item b).
  if (semContatoNovos.length) await upsertConfig('lusha_sem_contato', [...semContatoSet]);

  const saldoDepois = await lushaCreditsV3(falhas);
  const saldoDepoisNum = saldoDepois?.credits?.remaining ?? saldoDepois?.credits?.balance ?? null;
  const creditosReais = (creditosDisponiveis != null && saldoDepoisNum != null) ? (creditosDisponiveis - saldoDepoisNum) : null;
  const ctx_enrich = {
    revelados, teto, teto_creditos: tetoCreditos,
    creditos_usados: creditosUsados,
    creditos_reais_gastos: creditosReais,
    creditos_restantes: saldoDepoisNum,
    empresas_tentadas: empresasTentadas,
    dominios_descobertos: dominiosDescobertos,
    sem_dominio: semDominio,
    sem_contato_novos: semContatoNovos.length,
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
  // Só conta como "já rodou" a execução que de fato inseriu alguma notícia.
  // Senão uma rodada estéril (Google News fora do ar, timeout de 4s) trancaria
  // o job pelo resto da semana.
  const rodadas = await sg(
    'crm_logs?origem=eq.cron:noticias-semanal&mensagem=eq.fim&criado_em=gte.' +
    inicioSemanaISO() + '&select=contexto&limit=20'
  );
  const jaRodou = (Array.isArray(rodadas) ? rodadas : [])
    .filter(l => Number(l?.contexto?.inseridas || 0) > 0);
  if (jaRodou.length > 0) {
    const ctx = { motivo: 'ja_rodou_esta_semana', ms: Date.now()-inicio };
    await logCron('noticias-semanal', 'info', 'fim — pulado', ctx);
    return res.status(200).json({ ok: true, pulado: true, ...ctx });
  }

  // Todas as empresas com ≥3 estrelas
  const scoreRows = await sg('crm_empresa_agencia_estrelas?or=(estrelas_manual.gte.3,estrelas_calculadas.gte.3)&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=1000');
  if (scoreRows === null) return erroLeitura('noticias-semanal', res, inicio, 'crm_empresa_agencia_estrelas');
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
  const semSeg = new Date(inicioSemanaISO());   // início da semana em horário de São Paulo

  const [filaRows, agencias, empresasNovas, toquesSem, oportRows] = await Promise.all([
    sg(`crm_fila?select=id,canal,status,agencia_id,empresa_id&enviado_em=gte.${semSeg.toISOString()}&limit=2000`),
    sg('crm_agencias?select=id,nome&limit=20'),
    sg(`crm_empresas?criado_em=gte.${semSeg.toISOString()}&select=id,nome&limit=50`),
    sg(`crm_toques?data=gte.${semSeg.toISOString().slice(0,10)}&select=empresa_id,resultado&limit=2000`),
    sg(`crm_oportunidades?criado_em=gte.${semSeg.toISOString()}&select=id,estagio,agencia_id&limit=500`)
  ]);

  if (filaRows === null || toquesSem === null) return erroLeitura('fechamento-sexta', res, inicio, 'crm_fila/crm_toques');
  const fila = Array.isArray(filaRows) ? filaRows : [];
  const toques = Array.isArray(toquesSem) ? toquesSem : [];

  // Reuniões e respostas vêm de crm_toques (crm_kanban é legada), por resultado.
  const RESP = ['respondeu','resposta','reuniao_marcada','reuniao'];
  const REU  = ['reuniao_marcada','reuniao'];
  const respostasTouches = toques.filter(t => RESP.includes(t.resultado));
  const reunioesTouches  = toques.filter(t => REU.includes(t.resultado));

  // Mapa empresa→agência a partir da fila (o toque não carrega agência).
  const empAg = {};
  for (const f of fila) { if (f.empresa_id && f.agencia_id && !empAg[f.empresa_id]) empAg[f.empresa_id] = f.agencia_id; }

  // Top 5 empresas mais quentes: toques (+2), itens de fila (+1), reunião (+5).
  // Sempre por empresa_id — nunca somando agencia_id como se fosse empresa.
  const scoreEmpresa = {};
  const bump = (id, n) => { if (id) scoreEmpresa[id] = (scoreEmpresa[id]||0) + n; };
  for (const f of fila) bump(f.empresa_id, 1);
  for (const t of toques) bump(t.empresa_id, 2);
  for (const t of reunioesTouches) bump(t.empresa_id, 5);
  const top5EmpIds = Object.entries(scoreEmpresa).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id])=>id);
  let top5Nomes = [];
  if (top5EmpIds.length > 0) {
    const top5Rows = await sg(`crm_empresas?id=in.(${top5EmpIds.join(',')})&select=id,nome`);
    const nomeMap = {};
    for (const e of (Array.isArray(top5Rows)?top5Rows:[])) nomeMap[e.id]=e.nome;
    top5Nomes = top5EmpIds.map(id => nomeMap[id]||id);
  }

  const respostasTotal = respostasTouches.length;
  const reunioesTotal  = reunioesTouches.length;

  // Por agência: enviados pela fila; respostas e reuniões pelo mapa empresa→agência.
  const respPorAg = {}, reuPorAg = {};
  for (const t of respostasTouches) { const ag = empAg[t.empresa_id]; if (ag) respPorAg[ag] = (respPorAg[ag]||0)+1; }
  for (const t of reunioesTouches)  { const ag = empAg[t.empresa_id]; if (ag) reuPorAg[ag]  = (reuPorAg[ag]||0)+1; }
  const byAg = {};
  for (const ag of (Array.isArray(agencias)?agencias:[])) {
    const agFila = fila.filter(f=>f.agencia_id===ag.id);
    byAg[ag.nome||ag.id] = {
      reunioes: reuPorAg[ag.id] || 0,
      enviados: agFila.length,
      respostas: respPorAg[ag.id] || 0
    };
  }

  // Por canal
  const porCanal = {};
  for (const f of fila) { if (f.canal) porCanal[f.canal] = (porCanal[f.canal]||0)+1; }

  const oportArr = Array.isArray(oportRows) ? oportRows : [];
  const oportGanhas = oportArr.filter(o=>o.estagio==='Ganho').length;
  const oportPerdidas = oportArr.filter(o=>o.estagio==='Perdido').length;

  const dados = {
    semana_inicio:       semSeg.toISOString().slice(0,10),
    gerado_em:           now.toISOString(),
    reunioes_total:      reunioesTotal,
    enviados_total:      fila.length,
    respostas_total:     respostasTotal,
    taxa_resposta_pct:   fila.length>0 ? Math.round(respostasTotal/fila.length*100) : 0,
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

// ── job: rascunhos-matinais ──────────────────────────────────────────────────
// Cria no Outlook os rascunhos dos itens já aprovados, de madrugada, para que
// o dia comece com tudo pronto para revisar e enviar.
// NÃO envia nada: usa graph-draft, nunca graph-send. O envio continua atrás do
// JWT do usuário, por desenho.
// Antes disso, criar rascunho era um clique manual ("📥 Criar rascunhos do lote")
// e só 2 de 1.293 itens da fila chegaram a ter rascunho criado.
async function jobRascunhosMatinais(req, res) {
  const inicio = Date.now();
  const falhas = [];
  await logCron('rascunhos-matinais', 'info', 'início', null);

  const credencial = (process.env.CRON_SECRET || '').trim() || (SUPA_KEY || '').trim();
  if (!credencial) {
    const ctx = { motivo: 'sem_credencial_para_chamar_enrich' };
    await logCron('rascunhos-matinais', 'aviso', 'fim — pulado', ctx);
    return res.status(200).json({ ok: true, pulado: true, ...ctx });
  }

  const cfgTeto = await sg('crm_configuracoes?chave=eq.rascunhos_matinais_max&select=valor&limit=1');
  const teto = Array.isArray(cfgTeto) && cfgTeto[0]?.valor ? Number(cfgTeto[0].valor) : 25;

  // Respeita a pausa de primeiros contatos: ela existe por decisão de negócio.
  // Follow-up (etapa >= 2) continua, porque é conversa já iniciada.
  const cfgPausa = await sg('crm_configuracoes?chave=eq.pausar_primeiros_contatos&select=valor&limit=1');
  const pausado = String(Array.isArray(cfgPausa) && cfgPausa[0]?.valor).toLowerCase() === 'true';

  // rascunho_tentativas<3: item que falhou 3x sai da frente (e da fila de tentativas).
  // Ordena por tentativas asc: os que nunca falharam vêm primeiro.
  const itens = await sg(
    'crm_fila?status=eq.aprovado&canal=eq.email&outlook_message_id=is.null&apagado_em=is.null&rascunho_tentativas=lt.3' +
    '&select=id,assunto,corpo,etapa_cadencia,thread_ref,rascunho_tentativas,crm_decisores(email,nome)' +
    '&order=rascunho_tentativas.asc,aprovado_em.asc&limit=' + teto
  );
  if (itens === null) return erroLeitura('rascunhos-matinais', res, inicio, 'crm_fila');
  const lista = (Array.isArray(itens) ? itens : []).filter(it => {
    const email = it.crm_decisores && it.crm_decisores.email;
    if (!email) return false;
    if (pausado && Number(it.etapa_cadencia || 1) <= 1) return false;
    return true;
  });

  if (!lista.length) {
    const ctx = { criados: 0, candidatos: Array.isArray(itens) ? itens.length : 0, pausado, teto, ms: Date.now()-inicio };
    await logCron('rascunhos-matinais', 'aviso', 'fim', ctx);
    return res.status(200).json({ ok: true, ...ctx });
  }

  let criados = 0, pulados = 0;
  const LIMITE_MS = 45000;
  for (const item of lista) {
    if (Date.now() - inicio > LIMITE_MS) break;
    const tentativa = (Number(item.rascunho_tentativas) || 0) + 1;
    try {
      const r = await fetch(BASE_URL + '/api/enrich?provider=graph-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credencial },
        body: JSON.stringify({
          fila_id: item.id,
          assunto: item.assunto || '',
          corpo: item.corpo || '',
          decisor: { email: item.crm_decisores.email, nome: item.crm_decisores.nome || '' },
          etapa_cadencia: item.etapa_cadencia,
          thread_ref: item.thread_ref || ''
        })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.outlook_message_id) { criados++; continue; }
      if (r.ok && d.skipped) { pulados++; continue; }   // 'skipped' não é criado
      const erro = d.error || ('HTTP ' + r.status);
      falhas.push({ fila_id: item.id, erro: String(erro).slice(0, 200) });
      // Conta a tentativa: na 3ª falha o item deixa de ser candidato (filtro lt.3).
      await sp('crm_fila?id=eq.' + item.id, { rascunho_erro: String(erro).slice(0, 500), rascunho_tentativas: tentativa }, 'PATCH');
    } catch (e) {
      falhas.push({ fila_id: item.id, erro: e.message });
      await sp('crm_fila?id=eq.' + item.id, { rascunho_tentativas: tentativa }, 'PATCH');
    }
    await new Promise(r => setTimeout(r, 150));
  }

  const ctx = {
    criados, pulados, candidatos: lista.length, pausado, teto,
    falhas: falhas.slice(0, 10), ms: Date.now()-inicio
  };
  console.log('[cron:rascunhos-matinais]', criados, 'rascunhos de', lista.length, 'candidatos');
  await logCron('rascunhos-matinais', nivelTrabalho(criados), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── job: oportunidades-paradas ───────────────────────────────────────────────
// 109 de 109 oportunidades estavam paradas há mais de 14 dias sem nenhum evento,
// 21 delas no fundo do funil. Ninguém era avisado porque nada olhava para isso.
// O agente marca a oportunidade parada com um evento 'pedido_atualizacao' — tipo
// que já existe e já é usado na tela — e resume no log.
// NÃO reescreve proximo_passo: aquele texto é do Pedro.
const ESTAGIOS_FORA = ['Perdido', 'Cliente ativo', 'Wishlist'];

async function jobOportunidadesParadas(req, res) {
  const inicio = Date.now();
  await logCron('oportunidades-paradas', 'info', 'início', null);

  const cfg = await sg('crm_configuracoes?chave=eq.oportunidade_parada_dias&select=valor&limit=1');
  const dias = Array.isArray(cfg) && cfg[0]?.valor ? Number(cfg[0].valor) : 14;
  const corte = Date.now() - dias*24*60*60*1000;

  const opps = await sg('crm_oportunidades?apagado_em=is.null&select=id,titulo,estagio,empresa_id,valor_estimado,proximo_passo,proximo_passo_em,aberta_em&limit=500');
  if (opps === null) return erroLeitura('oportunidades-paradas', res, inicio, 'crm_oportunidades');
  const ativas = (Array.isArray(opps) ? opps : []).filter(o => !ESTAGIOS_FORA.includes(o.estagio));
  if (!ativas.length) {
    const ctx = { marcadas: 0, motivo: 'nenhuma_oportunidade_ativa', ms: Date.now()-inicio };
    await logCron('oportunidades-paradas', 'aviso', 'fim', ctx);
    return res.status(200).json({ ok: true, ...ctx });
  }

  // Último evento por oportunidade + quando foi o último pedido de atualização.
  const eventos = await sg('crm_oportunidade_eventos?apagado_em=is.null&select=oportunidade_id,tipo,criado_em&order=criado_em.desc&limit=5000');
  const ultimoEvento = {};
  const ultimoPedido = {};
  for (const e of (Array.isArray(eventos) ? eventos : [])) {
    const t = new Date(e.criado_em).getTime();
    if (e.tipo === 'pedido_atualizacao') {
      // O próprio pedido do cron NÃO conta como atividade: senão a cobrança de
      // ontem zera o relógio de dias-parado e a oportunidade "destrava" sozinha.
      if (!ultimoPedido[e.oportunidade_id] || t > ultimoPedido[e.oportunidade_id]) ultimoPedido[e.oportunidade_id] = t;
      continue;
    }
    if (!ultimoEvento[e.oportunidade_id] || t > ultimoEvento[e.oportunidade_id]) ultimoEvento[e.oportunidade_id] = t;
  }

  const agora = Date.now();
  const paradas = [];
  for (const o of ativas) {
    const ultima = ultimoEvento[o.id] || new Date(o.aberta_em || 0).getTime();
    if (ultima > corte) continue;
    // Não cobra de novo quem já foi cobrado dentro da janela.
    if (ultimoPedido[o.id] && ultimoPedido[o.id] > corte) continue;
    paradas.push({ ...o, diasParado: Math.floor((agora - ultima) / 86400000), semEvento: !ultimoEvento[o.id] });
  }

  // Fundo do funil primeiro, depois valor.
  const PESO = { 'Negociação': 5, 'Negociando direto': 4, 'Concorrências': 3, 'Primeira reunião': 2, 'Contato direto': 1 };
  paradas.sort((a, b) => {
    const pa = PESO[a.estagio] || 0, pb = PESO[b.estagio] || 0;
    if (pb !== pa) return pb - pa;
    return (Number(b.valor_estimado) || 0) - (Number(a.valor_estimado) || 0);
  });

  let marcadas = 0;
  const falhas = [];
  const porEstagio = {};
  const LIMITE_MS = 45000;
  const MAX_COBRANCAS = 10;   // no máximo 10 cobranças por rodada (fundo do funil primeiro)
  for (const o of paradas) {
    if (marcadas >= MAX_COBRANCAS) break;
    if (Date.now() - inicio > LIMITE_MS) break;
    const passoVencido = o.proximo_passo_em && new Date(o.proximo_passo_em).getTime() < agora;
    const texto = [
      `Parada há ${o.diasParado} dias em "${o.estagio}".`,
      o.semEvento ? 'Nunca teve evento registrado.' : null,
      passoVencido ? `Próximo passo venceu em ${o.proximo_passo_em}: ${o.proximo_passo || '(sem descrição)'}.` : null,
      !o.proximo_passo ? 'Sem próximo passo definido.' : null,
      'Atualize o estágio ou registre o que aconteceu.'
    ].filter(Boolean).join(' ');

    const ok = await sp('crm_oportunidade_eventos', {
      oportunidade_id: o.id,
      tipo: 'pedido_atualizacao',
      texto: texto.slice(0, 1000),
      autor_email: 'cron@galeriaholding.co',
      criado_em: new Date().toISOString()
    });
    if (!ok) { falhas.push({ oportunidade_id: o.id }); continue; }
    marcadas++;
    porEstagio[o.estagio] = (porEstagio[o.estagio] || 0) + 1;
  }

  const ctx = {
    marcadas, paradas: paradas.length, ativas: ativas.length, dias,
    por_estagio: porEstagio,
    fundo_funil: paradas.filter(o => (PESO[o.estagio] || 0) >= 3).length,
    sem_evento: paradas.filter(o => o.semEvento).length,
    falhas: falhas.slice(0, 10),
    ms: Date.now()-inicio
  };
  console.log('[cron:oportunidades-paradas]', marcadas, 'marcadas de', paradas.length, 'paradas');
  // nivelTrabalho sobre `marcadas`, não sobre `paradas`: se nenhum evento foi
  // gravado o job não fez trabalho nenhum, por mais que tenha detectado muita coisa.
  await logCron('oportunidades-paradas', nivelTrabalho(marcadas), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: job sdr-selecao (seção 4.2) ──────────────────────────────────────────
// Escolhe o lote do dia e por qual agência cada abordagem sai; grava em
// crm_sdr_estado (etapa 'selecionado'). Não envia nada. Idempotente (upsert).
async function jobSdrSelecao(req, res) {
  const inicio = Date.now();
  await logCron('sdr-selecao', 'info', 'início', null);

  // Follow-ups vencidos (D3/D7/D14 criados pelo sdr-envio) entram no fluxo de hoje.
  const hojeFu = new Date().toISOString().slice(0, 10);
  await sp(`crm_sdr_estado?etapa=eq.aguardando&status=eq.ativo&data_lote=lte.${hojeFu}`, { etapa: 'selecionado', atualizado_em: new Date().toISOString() }, 'PATCH');
  const cfg = await sg('crm_configuracoes?chave=eq.sdr_lote_max&select=valor&limit=1');
  const loteMax = Array.isArray(cfg) && cfg[0]?.valor ? Number(cfg[0].valor) : 30;

  const decisores = await sg('crm_decisores?etapa_cadencia=neq.off&status=neq.inativo&apagado_em=is.null&select=id,nome,cargo,empresa_id,email,wa,email_valido,status,etapa_cadencia,ultimo_toque_em,opt_out,respondeu,pausa_ate_em,crm_empresas!empresa_id(id,nome,setor,segmento_detalhe,dominio,cliente_ativo)&order=ultimo_toque_em.asc.nullsfirst&limit=800');
  if (decisores === null) return erroLeitura('sdr-selecao', res, inicio, 'crm_decisores');
  const candidatos = (Array.isArray(decisores) ? decisores : []).map(d => ({ ...d, empresa: d.crm_empresas || {} }));

  const empIds = [...new Set(candidatos.map(d => d.empresa_id).filter(Boolean))].slice(0, 300);
  const estrelas = {};
  if (empIds.length) {
    const er = await sg(`crm_empresa_agencia_estrelas?empresa_id=in.(${empIds.join(',')})&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=2000`);
    for (const r of (Array.isArray(er) ? er : [])) { const v = Number(r.estrelas_manual ?? r.estrelas_calculadas ?? 0) || 0; if (v > (estrelas[r.empresa_id] || 0)) estrelas[r.empresa_id] = v; }
  }
  const blRows = await sg('crm_blocklist?ativo=eq.true&apagado_em=is.null&select=nome_canonico,aliases,dominios,grupo_economico,ativo&limit=2000');
  const blocklist = makeBlocklist(blRows || []);

  // Empresa tocada por qualquer agência nos últimos 30 dias (via crm_fila, que tem agencia_id).
  const corte30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const filaTocou = await sg(`crm_fila?status=in.(aprovado,enviado)&enviado_em=gte.${corte30}&select=empresa_id,agencia_id&limit=4000`);
  const toquesEmpresa30d = {};
  for (const t of (Array.isArray(filaTocou) ? filaTocou : [])) { if (t.empresa_id) (toquesEmpresa30d[t.empresa_id] ||= []).push({ agencia_id: t.agencia_id }); }

  const dossies = {};
  if (empIds.length) {
    const dr = await sg(`crm_dossies?empresa_id=in.(${empIds.join(',')})&apagado_em=is.null&expira_em=gte.${new Date().toISOString()}&select=empresa_id,sinais&limit=1000`);
    for (const r of (Array.isArray(dr) ? dr : [])) dossies[r.empresa_id] = { sinais: r.sinais || [], tem_sinal: (r.sinais || []).length > 0 };
  }
  const agencias = await sg('crm_agencias?select=id,slug,nome&limit=30') || [];

  const semanaISO = inicioSemanaISO();
  const filaSemana = await sg(`crm_fila?status=in.(aprovado,enviado)&gerado_em=gte.${semanaISO}&select=empresa_id&limit=1000`);
  const primeirosContatoSemana = [...new Set((Array.isArray(filaSemana) ? filaSemana : []).map(r => r.empresa_id).filter(Boolean))];

  // Bloco G: candidatos de topo de funil aceitos pelo Pedro passam à frente.
  const topoRows = await sg('crm_sdr_topo?status=eq.aceito&empresa_id=not.is.null&select=empresa_id,fonte,agencia_slug,motivo&limit=1000');
  const topoAceitos = {};
  for (const t of (Array.isArray(topoRows) ? topoRows : [])) topoAceitos[t.empresa_id] = t;

  const { lote, upsell, excluidos, total_elegiveis } = selecionarLote({
    candidatos, estrelas, blocklist, toquesEmpresa30d, dossies, agencias, topoAceitos,
    primeirosContatoSemana, config: { lote_max: loteMax }, agora: Date.now()
  });

  const dataLote = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toISOString().slice(0, 10);
  let gravados = 0;
  for (const item of lote) {
    const ok = await spUpsert('crm_sdr_estado', {
      decisor_id: item.decisor_id, empresa_id: item.empresa_id, agencia_id: item.agencia_id || null,
      agencia_motivo: item.agencia_motivo || null, data_lote: dataLote, dia_cadencia: item.dia_cadencia || 0,
      canal: null, etapa: 'selecionado', status: 'ativo', atualizado_em: new Date().toISOString()
    }, 'decisor_id,data_lote,dia_cadencia');
    if (ok) gravados++;
  }

  const ctx = { selecionados: lote.length, gravados, upsell: upsell.length, excluidos: excluidos.length, total_elegiveis, lote_max: loteMax, ms: Date.now() - inicio };
  await logCron('sdr-selecao', nivelTrabalho(gravados), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// Coleta fontes públicas do dossiê (4.3). Ordem: crm_noticias (120d), Google News
// por empresa e por decisor, imprensa de marketing (busca site-scoped via News).
async function coletarFontes(emp, decisorNome) {
  const itens = [];
  const corte = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  if (emp.id) {
    const nots = await sg(`crm_noticias?empresa_id=eq.${emp.id}&data=gte.${corte}&apagado_em=is.null&select=titulo,url,fonte,data,resumo&limit=30`);
    for (const n of (Array.isArray(nots) ? nots : [])) itens.push({ ...n, origem: 'crm_noticias' });
  }
  if (emp.nome) {
    for (const n of await buscarNoticias({ nome: emp.nome })) itens.push({ ...n, data: n.publicado_em, origem: 'google_news' });
    for (const n of await buscarNoticias({ nome: emp.nome + ' marketing' })) itens.push({ ...n, data: n.publicado_em, origem: 'imprensa' });
    if (decisorNome) for (const n of await buscarNoticias({ nome: decisorNome + ' ' + emp.nome })) itens.push({ ...n, data: n.publicado_em, origem: 'google_news_decisor' });
  }
  return itens;
}

// ── SDR: job sdr-dossie (seção 4.3) ───────────────────────────────────────────
// Monta e cacheia (14 dias) o dossiê das empresas do lote selecionado, em lotes
// pequenos que cabem no tempo da função. Avança o estado do lead para 'dossie'.
async function jobSdrDossie(req, res) {
  const inicio = Date.now();
  const lote = Math.max(1, Math.min(10, Number(req.query.lote) || 5));
  await logCron('sdr-dossie', 'info', 'início', { lote });
  const LIMITE_MS = 50000;

  const estados = await sg(`crm_sdr_estado?etapa=eq.selecionado&status=eq.ativo&select=id,empresa_id,decisor_id,crm_empresas:empresa_id(id,nome,dominio),crm_decisores:decisor_id(nome)&order=criado_em.asc&limit=${lote * 3}`);
  if (estados === null) return erroLeitura('sdr-dossie', res, inicio, 'crm_sdr_estado');
  const porEmpresa = {};
  for (const e of (Array.isArray(estados) ? estados : [])) { if (e.empresa_id && !porEmpresa[e.empresa_id]) porEmpresa[e.empresa_id] = e; }
  const empresas = Object.values(porEmpresa).slice(0, lote);

  let montados = 0, semSinal = 0, reusados = 0;
  const agora = new Date().toISOString();
  for (const est of empresas) {
    if (Date.now() - inicio > LIMITE_MS) break;
    const emp = est.crm_empresas || {};
    const existe = await sg(`crm_dossies?empresa_id=eq.${est.empresa_id}&apagado_em=is.null&expira_em=gte.${agora}&select=id&order=criado_em.desc&limit=1`);
    let dossieId = (Array.isArray(existe) && existe[0]) ? existe[0].id : null;
    if (dossieId) {
      reusados++;
    } else {
      const itens = await coletarFontes({ id: est.empresa_id, nome: emp.nome, dominio: emp.dominio }, est.crm_decisores && est.crm_decisores.nome);
      const dossie = montarDossie({ id: est.empresa_id, nome: emp.nome }, itens, { janelaDias: 120 });
      const row = await spRet('crm_dossies', { empresa_id: est.empresa_id, sinais: dossie.sinais, fontes: dossie.fontes, resumo: dossie.resumo });
      dossieId = row ? row.id : null;
      if (!dossie.tem_sinal) semSinal++;
      montados++;
    }
    if (dossieId) await sp(`crm_sdr_estado?empresa_id=eq.${est.empresa_id}&etapa=eq.selecionado`, { etapa: 'dossie', dossie_id: dossieId, atualizado_em: agora }, 'PATCH');
    await new Promise(r => setTimeout(r, 120));
  }

  const ctx = { empresas: empresas.length, montados, reusados, sem_sinal: semSinal, ms: Date.now() - inicio };
  await logCron('sdr-dossie', nivelTrabalho(montados + reusados), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: modelo (redação e controle de qualidade) ─────────────────────────────
// Structured outputs garantem o JSON no formato do schema (sem parse frágil).
// Fallback de recusa no servidor ligado: se o modelo declinar, a própria API
// tenta o modelo de fallback na mesma chamada.
let _anthropic = null;
function clienteLLM() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY, timeout: 45000, maxRetries: 1 });
  return _anthropic;
}
const SCHEMA_MSG = {
  type: 'object',
  properties: { assunto: { type: 'string' }, corpo: { type: 'string' } },
  required: ['assunto', 'corpo'], additionalProperties: false
};
const SCHEMA_AVAL = {
  type: 'object',
  properties: {
    aderencia: { type: 'integer' }, especificidade: { type: 'integer' }, naturalidade: { type: 'integer' },
    clareza: { type: 'integer' }, risco: { type: 'integer' }, motivo: { type: 'string' }
  },
  required: ['aderencia', 'especificidade', 'naturalidade', 'clareza', 'risco', 'motivo'], additionalProperties: false
};
// Preço do modelo (US$ por token) para registrar custo por mensagem.
const PRECO_IN = 4 / 1e6, PRECO_OUT = 20 / 1e6;

async function gerarJSON({ system, user, schema, effort }) {
  // Gancho de teste: permite simular o modelo sem rede (nunca definido em produção).
  if (typeof globalThis.__SDR_LLM_MOCK === 'function') return globalThis.__SDR_LLM_MOCK({ system, user, schema });
  try {
    const r = await clienteLLM().beta.messages.create({
      model: MODELO_SDR,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: effort || 'medium', format: { type: 'json_schema', schema } }
    });
    const usage = r.usage || {};
    const custo = (usage.input_tokens || 0) * PRECO_IN + (usage.output_tokens || 0) * PRECO_OUT;
    if (r.stop_reason === 'refusal') return { obj: null, erro: 'refusal', usage, custo, modelo: r.model };
    const txt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let obj = null;
    try { obj = JSON.parse(txt); } catch (_) {}
    return { obj, erro: obj ? null : 'json_invalido', usage, custo, modelo: r.model };
  } catch (e) {
    return { obj: null, erro: String(e && e.message || e).slice(0, 200), usage: {}, custo: 0, modelo: MODELO_SDR };
  }
}

async function configSdr() {
  const rows = await sg('crm_configuracoes?chave=in.(sdr_expressoes_proibidas,sdr_aprendizados,sdr_angulos,sdr_cadencia,sdr_qualidade_nota_minima)&select=chave,valor');
  const m = {}; for (const r of (Array.isArray(rows) ? rows : [])) m[r.chave] = r.valor;
  return {
    proibidas: Array.isArray(m.sdr_expressoes_proibidas) ? m.sdr_expressoes_proibidas : null,
    aprendizados: typeof m.sdr_aprendizados === 'string' ? m.sdr_aprendizados : '',
    angulos: Array.isArray(m.sdr_angulos) && m.sdr_angulos.length ? m.sdr_angulos : ['fato', 'ideia', 'case'],
    cadencia: Array.isArray(m.sdr_cadencia) ? m.sdr_cadencia : [{ dia: 0, canal: 'email' }],
    notaMinima: Number(m.sdr_qualidade_nota_minima) || 8
  };
}

// Canal do toque: o da cadência para o dia; se a pessoa não tem aquele canal, usa o outro.
function canalDoToque(diaCadencia, cadencia, decisor) {
  const passo = cadencia.find(c => Number(c.dia) === Number(diaCadencia)) || cadencia[0] || { canal: 'email' };
  let canal = passo.canal;
  if (canal === 'email' && !(decisor && decisor.email)) canal = (decisor && decisor.wa) ? 'whatsapp' : null;
  if (canal === 'whatsapp' && !(decisor && decisor.wa)) canal = (decisor && decisor.email) ? 'email' : null;
  return canal;
}
const ETAPA_POR_DIA = { 0: 'etapa1', 3: 'etapa2', 7: 'etapa3', 14: 'etapa4' };

// Conhecimento + cases liberados em crm_cases (lido uma vez por execução).
async function knowledgeVivo() {
  const ags = await sg('crm_agencias?select=id,slug&limit=50');
  const slugPorId = {}; for (const a of (Array.isArray(ags) ? ags : [])) slugPorId[a.id] = a.slug;
  const rows = await sg('crm_cases?apagado_em=is.null&permitido_em_prospeccao=eq.true&select=titulo,marca,categoria_da_marca,resultado,tags,destaque,agencia_id,agencias_secundarias,crm_agencias:agencia_id(slug)&limit=500');
  return Array.isArray(rows) ? mesclarCases(KNOWLEDGE, rows, slugPorId) : KNOWLEDGE;
}

// ── SDR: job sdr-redacao (seção 4.4) ──────────────────────────────────────────
// Para cada lead com dossiê pronto, escreve 3 versões (ângulos fato/ideia/case)
// a partir de um fato do dossiê. Lead sem sinal público não gasta modelo: fica
// retido para pesquisa manual (sem lastro não há mensagem que passe no QC).
async function jobSdrRedacao(req, res) {
  const inicio = Date.now();
  const lote = Math.max(1, Math.min(6, Number(req.query.lote) || 4));
  await logCron('sdr-redacao', 'info', 'início', { lote });
  if (!ANTHROPIC_KEY) {
    await logCron('sdr-redacao', 'aviso', 'fim — pulado', { motivo: 'ANTHROPIC_API_KEY ausente' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'ANTHROPIC_API_KEY ausente' });
  }
  const estados = await sg(`crm_sdr_estado?etapa=eq.dossie&status=eq.ativo&select=id,decisor_id,empresa_id,agencia_id,agencia_motivo,dia_cadencia,dossie_id,crm_decisores:decisor_id(nome,cargo,email,wa),crm_empresas:empresa_id(id,nome,setor),crm_agencias:agencia_id(id,nome,slug),crm_dossies:dossie_id(sinais)&order=criado_em.asc&limit=${lote}`);
  if (estados === null) return erroLeitura('sdr-redacao', res, inicio, 'crm_sdr_estado');
  const cfg = await configSdr();
  const KV = await knowledgeVivo();
  const agora = new Date().toISOString();

  let redigidos = 0, versoes = 0, semSinal = 0, semCanal = 0, falhas = 0, custo = 0;
  await Promise.all((Array.isArray(estados) ? estados : []).map(async (est) => {
    const decisor = est.crm_decisores || {};
    const empresa = est.crm_empresas || {};
    const agencia = Object.assign({ motivo: est.agencia_motivo }, est.crm_agencias || {});
    const sinais = (est.crm_dossies && est.crm_dossies.sinais) || [];
    const canal = canalDoToque(est.dia_cadencia || 0, cfg.cadencia, decisor);
    if (!canal) {
      semCanal++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { etapa: 'avaliado', motivo: 'sem canal válido (nem e-mail nem WhatsApp)', atualizado_em: agora }, 'PATCH');
      return;
    }
    const sinal = sinais[0] || null;
    if (!sinal || !sinal.url) {
      semSinal++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { etapa: 'avaliado', canal, motivo: 'sem sinal público com fonte: precisa de pesquisa manual', atualizado_em: agora }, 'PATCH');
      return;
    }
    const caso = escolherCase(KV, { setor: empresa.setor, sinalTipo: sinal.tipo, agenciaSlug: agencia.slug });
    const etapa = ETAPA_POR_DIA[est.dia_cadencia || 0] || 'etapa1';

    const resultados = await Promise.all(cfg.angulos.map(async (angulo, i) => {
      const { system, user } = construirPromptRedacao({
        dossie: { sinais }, nome: decisor.nome, cargo: decisor.cargo, empresa, agencia, caso,
        etapa: 'D' + (est.dia_cadencia || 0), canal, angulo, sinal,
        historicoToques: [], aprendizados: cfg.aprendizados, expressoesProibidas: cfg.proibidas
      });
      const r = await gerarJSON({ system, user, schema: SCHEMA_MSG, effort: 'medium' });
      return { angulo, versao: i + 1, ...r };
    }));

    let gravadas = 0;
    for (const r of resultados) {
      custo += r.custo || 0;
      if (!r.obj || !r.obj.corpo) { falhas++; continue; }
      const ok = await sp('crm_sdr_mensagens', {
        estado_id: est.id, decisor_id: est.decisor_id, empresa_id: est.empresa_id, agencia_id: est.agencia_id,
        dossie_id: est.dossie_id, sinal_tipo: sinal.tipo, sinal_url: sinal.url, canal, etapa,
        dia_cadencia: est.dia_cadencia || 0, angulo: r.angulo, versao: r.versao,
        assunto: canal === 'email' ? (r.obj.assunto || '') : '', corpo: r.obj.corpo,
        case_titulo: caso ? caso.titulo : null, modelo: r.modelo || MODELO_SDR,
        tokens_prompt: r.usage.input_tokens || 0, tokens_resposta: r.usage.output_tokens || 0, custo_usd: r.custo || 0
      });
      if (ok) { gravadas++; versoes++; }
    }
    if (gravadas > 0) {
      redigidos++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { etapa: 'redigido', canal, atualizado_em: agora }, 'PATCH');
    } else {
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { tentativas: 1, ultimo_erro: (resultados.find(x => x.erro) || {}).erro || 'sem versão válida', atualizado_em: agora }, 'PATCH');
    }
  }));

  const ctx = { leads: (estados || []).length, redigidos, versoes, sem_sinal: semSinal, sem_canal: semCanal, falhas, custo_usd: Math.round(custo * 10000) / 10000, ms: Date.now() - inicio };
  await logCron('sdr-redacao', nivelTrabalho(redigidos), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: job sdr-qualidade (seção 4.6) ────────────────────────────────────────
// Segundo passe (outro prompt) dá nota às versões; checagens por código conferem
// lastro, números do case, forma e personalização. Escolhe a melhor e cria o
// rascunho em crm_fila. Com o Piloto desligado, TUDO para no rascunho para o
// toque do Pedro; a nota e o motivo ficam visíveis em contexto_para_aprovacao.
async function jobSdrQualidade(req, res) {
  const inicio = Date.now();
  const lote = Math.max(1, Math.min(8, Number(req.query.lote) || 5));
  await logCron('sdr-qualidade', 'info', 'início', { lote });
  if (!ANTHROPIC_KEY) {
    await logCron('sdr-qualidade', 'aviso', 'fim — pulado', { motivo: 'ANTHROPIC_API_KEY ausente' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'ANTHROPIC_API_KEY ausente' });
  }
  const estados = await sg(`crm_sdr_estado?etapa=eq.redigido&status=eq.ativo&select=id,decisor_id,empresa_id,agencia_id,canal,dia_cadencia,crm_decisores:decisor_id(nome,cargo),crm_empresas:empresa_id(id,nome,setor),crm_agencias:agencia_id(id,nome,slug),crm_dossies:dossie_id(sinais)&order=atualizado_em.asc&limit=${lote}`);
  if (estados === null) return erroLeitura('sdr-qualidade', res, inicio, 'crm_sdr_estado');
  const cfg = await configSdr();
  const KV = await knowledgeVivo();
  const agora = new Date().toISOString();

  let avaliados = 0, aprovadosAuto = 0, retidos = 0, notas = [], custo = 0;
  await Promise.all((Array.isArray(estados) ? estados : []).map(async (est) => {
    const msgs = await sg(`crm_sdr_mensagens?estado_id=eq.${est.id}&nota_media=is.null&select=id,assunto,corpo,sinal_url,canal,angulo,versao,case_titulo,etapa,tokens_prompt,tokens_resposta,custo_usd,modelo&order=versao.asc`);
    if (!Array.isArray(msgs) || !msgs.length) return;
    const decisor = est.crm_decisores || {};
    const empresa = est.crm_empresas || {};
    const sinais = (est.crm_dossies && est.crm_dossies.sinais) || [];

    const avaliacoes = await Promise.all(msgs.map(async (m) => {
      const { system, user } = construirPromptAvaliacao({ mensagem: m, dossie: { sinais }, empresa, cargo: decisor.cargo, nome: decisor.nome });
      const r = await gerarJSON({ system, user, schema: SCHEMA_AVAL, effort: 'low' });
      custo += r.custo || 0;
      const caso = m.case_titulo ? (KV.cases_destaque || []).find(c => c.titulo === m.case_titulo) || null : null;
      const chec = checagensCodigo({ mensagem: m, dossie: { sinais }, caso, decisor, empresa, canal: m.canal, expressoesProibidas: cfg.proibidas });
      const aval = r.obj || { aderencia: 0, especificidade: 0, naturalidade: 0, clareza: 0, risco: 10, motivo: 'avaliador falhou: ' + (r.erro || '?') };
      const dec = decisao(aval, chec, cfg.notaMinima);
      await sp(`crm_sdr_mensagens?id=eq.${m.id}`, {
        nota_aderencia: aval.aderencia, nota_especificidade: aval.especificidade, nota_naturalidade: aval.naturalidade,
        nota_clareza: aval.clareza, nota_risco: aval.risco, nota_media: dec.nota_media,
        aprovado_autonomo: dec.aprovado_autonomo, motivo_qc: (aval.motivo ? aval.motivo + ' || ' : '') + dec.motivo
      }, 'PATCH');
      return { m, dec, aval };
    }));
    avaliados++;

    // Melhor versão: aprovada primeiro, depois maior nota média.
    avaliacoes.sort((a, b) => (Number(b.dec.aprovado_autonomo) - Number(a.dec.aprovado_autonomo)) || (b.dec.nota_media - a.dec.nota_media));
    const melhor = avaliacoes[0];
    notas.push(melhor.dec.nota_media);
    await sp(`crm_sdr_mensagens?id=eq.${melhor.m.id}`, { escolhida: true }, 'PATCH');

    const agencia = est.crm_agencias || {};
    const sinal = sinais.find(s => s.url === melhor.m.sinal_url) || sinais[0] || {};
    const contexto = `${empresa.nome || ''} · ${decisor.nome || ''} · ${decisor.cargo || ''} · nota ${melhor.dec.nota_media} · ` +
      (melhor.dec.aprovado_autonomo ? 'QC aprovado' : 'QC retido: ' + melhor.dec.motivo.slice(0, 180)) +
      ` · fato: ${(sinal.fato || '').slice(0, 120)} (${sinal.url || 's/fonte'})`;
    const fila = await spRet('crm_fila', {
      agencia_id: est.agencia_id, agencia_slug: agencia.slug || null, empresa_id: est.empresa_id, decisor_id: est.decisor_id,
      canal: melhor.m.canal, etapa: melhor.m.etapa || 'etapa1', status: 'rascunho',
      etapa_cadencia: ({ 0: 1, 3: 2, 7: 3, 14: 4 })[est.dia_cadencia || 0] || 1,
      assunto: melhor.m.assunto || null, corpo: melhor.m.corpo,
      tokens_prompt: melhor.m.tokens_prompt, tokens_resposta: melhor.m.tokens_resposta, custo_usd: melhor.m.custo_usd,
      modelo: melhor.m.modelo || MODELO_SDR, contexto_para_aprovacao: contexto.slice(0, 900)
    });
    if (melhor.dec.aprovado_autonomo) aprovadosAuto++; else retidos++;
    await sp(`crm_sdr_estado?id=eq.${est.id}`, {
      etapa: melhor.dec.aprovado_autonomo ? 'rascunho' : 'avaliado',
      fila_id: fila ? fila.id : null,
      motivo: melhor.dec.aprovado_autonomo ? 'QC aprovado (aguarda Piloto ou toque do Pedro)' : melhor.dec.motivo.slice(0, 500),
      atualizado_em: agora
    }, 'PATCH');
  }));

  const notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
  const ctx = { leads: (estados || []).length, avaliados, aprovados_qc: aprovadosAuto, retidos, nota_media: notaMedia, custo_usd: Math.round(custo * 10000) / 10000, ms: Date.now() - inicio };
  await logCron('sdr-qualidade', nivelTrabalho(avaliados), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: job sdr-respostas (Bloco E) ──────────────────────────────────────────
// Lê a caixa de entrada pelo Graph, reconhece respostas de decisores, bounces e
// pedidos de saída. NUNCA responde ninguém: só registra, para a cadência,
// atualiza o CRM e deixa a resposta para o Pedro ler (crm_sdr_respostas).
// E-mails que não são de decisores do CRM são ignorados e não ficam gravados.
async function spNovo(path, body) {
  const r = await fetch(SUPA_URL+'/rest/v1/'+path, { method:'POST', headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'}, body:JSON.stringify(body) });
  if (!r.ok) return null;
  const j = await r.json().catch(()=>null);
  return Array.isArray(j) && j[0] ? j[0] : null;   // vazio = já existia
}

const DB_ADAPT = { get: (p) => sg(p), send: (p, b, m) => sp(p, b, m), insertRet: (p, b) => spRet(p, b), insertNovo: (p, b) => spNovo(p, b) };

async function jobSdrRespostas(req, res) {
  const inicio = Date.now();
  const lote = Math.max(1, Math.min(100, Number(req.query.lote) || 50));
  await logCron('sdr-respostas', 'info', 'início', { lote });
  const t = await obterTokenGraph({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY });
  if (!t) {
    await logCron('sdr-respostas', 'aviso', 'fim — pulado', { motivo: 'Outlook não conectado (crm_oauth_tokens sem refresh_token)' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'Outlook não conectado' });
  }
  const cur = await sg('crm_configuracoes?chave=eq.sdr_inbox_cursor&select=valor&limit=1');
  const desde = (Array.isArray(cur) && cur[0] && typeof cur[0].valor === 'string') ? cur[0].valor : new Date(Date.now() - 2 * 86400000).toISOString();
  const url = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=' + lote +
    '&$orderby=receivedDateTime asc&$select=id,conversationId,subject,from,receivedDateTime,bodyPreview' +
    '&$filter=' + encodeURIComponent('receivedDateTime gt ' + desde);
  let msgs = [];
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t.token } });
    if (!r.ok) {
      await logCron('sdr-respostas', 'error', 'fim — Graph recusou a leitura', { status: r.status });
      return res.status(502).json({ ok: false, erro: 'graph_' + r.status });
    }
    msgs = ((await r.json()) || {}).value || [];
  } catch (e) {
    await logCron('sdr-respostas', 'error', 'fim — Graph indisponível', { erro: String(e.message || e).slice(0, 200) });
    return res.status(502).json({ ok: false, erro: 'graph_indisponivel' });
  }

  const proprio = String(t.email || '').toLowerCase();
  const agora = new Date().toISOString();
  const cont = { lidas: msgs.length, de_decisores: 0, bounce: 0, opt_out: 0, interesse: 0, indicacao: 0, nao_agora: 0, auto_resposta: 0, indefinido: 0, oportunidades: 0, ignoradas: 0 };
  let ultimo = desde;

  for (const m of msgs) {
    if (m.receivedDateTime && m.receivedDateTime > ultimo) ultimo = m.receivedDateTime;
    const remetente = String(m.from && m.from.emailAddress && m.from.emailAddress.address || '').toLowerCase();
    const cls = classificarResposta({ remetente, assunto: m.subject, preview: m.bodyPreview });

    // Quem é o decisor? Bounce: o endereço que falhou está no corpo. Senão: o remetente.
    let alvos = cls.tipo === 'bounce' ? extrairEmails(m.bodyPreview + ' ' + (m.subject || '')).filter(e => e !== proprio && !/mailer-daemon|postmaster/.test(e)) : [remetente];
    alvos = alvos.filter(Boolean).slice(0, 5);
    if (!alvos.length) { cont.ignoradas++; continue; }
    const ds = await sg('crm_decisores?apagado_em=is.null&email=in.(' + alvos.map(e => '"' + encodeURIComponent(e) + '"').join(',') + ')&select=id,nome,email,wa,empresa_id,crm_empresas!empresa_id(nome)&limit=1');
    const d = Array.isArray(ds) && ds[0];
    if (!d) { cont.ignoradas++; continue; }

    const r = await aplicarResposta(DB_ADAPT, {
      decisor: d, cls, canal: 'email', externalId: m.id, conversationId: m.conversationId, remetente,
      assunto: m.subject, texto: m.bodyPreview, recebidoEm: m.receivedDateTime
    });
    if (!r) continue;   // já processada antes (idempotente)
    cont.de_decisores++; cont[cls.tipo] = (cont[cls.tipo] || 0) + 1;
    if (r.oportunidade_criada) cont.oportunidades++;
  }

  if (ultimo !== desde) await spUpsert('crm_configuracoes', { chave: 'sdr_inbox_cursor', valor: ultimo }, 'chave');
  const paraPedro = cont.interesse + cont.indicacao + cont.nao_agora + cont.indefinido + cont.opt_out;
  const ctx = { ...cont, para_o_pedro_ler: paraPedro, ms: Date.now() - inicio };
  await logCron('sdr-respostas', paraPedro > 0 ? 'aviso' : nivelTrabalho(msgs.length), paraPedro > 0 ? `fim — ${paraPedro} resposta(s) para o Pedro ler` : 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: envio (Bloco D) ──────────────────────────────────────────────────────
// Regra 3 do CLAUDE.md: só envia com sdr_piloto_automatico=true E QC aprovado E
// dentro da janela/dia útil/fora de feriado E abaixo do teto/aquecimento. A guarda
// é conferida ao agendar e de novo, relida do banco, no instante de cada envio.
async function cfgEnvio() {
  const rows = await sg('crm_configuracoes?chave=in.(sdr_piloto_automatico,sdr_feriados,sdr_janelas,sdr_email_aquecimento,sdr_aquecimento_desde,email_daily_max,whatsapp_daily_max,sdr_envio_intervalo_min,sdr_wa_template,sdr_cadencia)&select=chave,valor');
  if (!Array.isArray(rows)) return null;
  const m = {}; for (const r of rows) m[r.chave] = r.valor;
  return {
    piloto: m.sdr_piloto_automatico === true || m.sdr_piloto_automatico === 'true',
    feriados: Array.isArray(m.sdr_feriados) ? m.sdr_feriados : [],
    janela: (m.sdr_janelas && m.sdr_janelas.envios) || '07:30-11:00',
    aquecimento: m.sdr_email_aquecimento || { inicio: 15, passo_semanal: 5, bounce_max_pct: 2 },
    aquecimentoDesde: typeof m.sdr_aquecimento_desde === 'string' ? m.sdr_aquecimento_desde : null,
    emailDailyMax: Number(m.email_daily_max) || 50,
    waDailyMax: Number(m.whatsapp_daily_max) || 10,
    intervalo: m.sdr_envio_intervalo_min || { min: 3, max: 9 },
    waTemplate: (m.sdr_wa_template && m.sdr_wa_template.nome) ? m.sdr_wa_template : null,
    cadencia: Array.isArray(m.sdr_cadencia) ? m.sdr_cadencia : [{ dia: 0, canal: 'email' }]
  };
}
async function enviadosHojePorCanal(agora) {
  const { data } = horaBRT(agora);
  const inicioDiaUtc = new Date(new Date(data + 'T03:00:00Z')).toISOString();
  const rows = await sg(`crm_fila?status=in.(enviado,respondido)&enviado_em=gte.${inicioDiaUtc}&select=canal&limit=2000`);
  const c = { email: 0, whatsapp: 0 };
  for (const r of (Array.isArray(rows) ? rows : [])) if (c[r.canal] !== undefined) c[r.canal]++;
  return c;
}
async function bouncePct7d() {
  const desde = new Date(Date.now() - 7 * 86400000).toISOString();
  const env = await sg(`crm_toques?canal=eq.email&direcao=eq.enviado&data=gte.${desde}&select=id&limit=5000`);
  const bnc = await sg(`crm_toques?canal=eq.email&resultado=eq.bounce&data=gte.${desde}&select=id&limit=5000`);
  const n = Array.isArray(env) ? env.length : 0;
  return n ? Math.round(((Array.isArray(bnc) ? bnc.length : 0) / n) * 1000) / 10 : 0;
}

// sdr-agendar: de manhã, distribui os rascunhos aprovados no QC em horários da janela.
async function jobSdrAgendar(req, res) {
  const inicio = Date.now();
  const agora = new Date();
  await logCron('sdr-agendar', 'info', 'início', null);
  const cfg = await cfgEnvio();
  if (!cfg) return erroLeitura('sdr-agendar', res, inicio, 'crm_configuracoes');
  const { data } = horaBRT(agora);
  if (!cfg.piloto) {
    const prontos = await sg(`crm_sdr_estado?etapa=eq.rascunho&status=eq.ativo&select=id&limit=500`);
    const ctx = { piloto: false, rascunhos_aguardando_pedro: Array.isArray(prontos) ? prontos.length : 0, ms: Date.now() - inicio };
    await logCron('sdr-agendar', 'aviso', 'fim — piloto desligado: rascunhos aguardam o Pedro', ctx);
    return res.status(200).json({ ok: true, ...ctx });
  }
  if (!cfg.aquecimentoDesde) await spUpsert('crm_configuracoes', { chave: 'sdr_aquecimento_desde', valor: agora.toISOString() }, 'chave');
  const estados = await sg(`crm_sdr_estado?etapa=eq.rascunho&status=eq.ativo&data_lote=lte.${data}&select=id,canal,fila_id&order=criado_em.asc&limit=200`);
  if (estados === null) return erroLeitura('sdr-agendar', res, inicio, 'crm_sdr_estado');
  const env = await enviadosHojePorCanal(agora);
  const tetos = { email: tetoEmailHoje({ aquecimento: cfg.aquecimento, desde: cfg.aquecimentoDesde || agora.toISOString(), tetoGlobal: cfg.emailDailyMax, agora }), whatsapp: cfg.waDailyMax };
  const porCanal = { email: [], whatsapp: [] };
  for (const e of estados) {
    const c = e.canal === 'whatsapp' ? 'whatsapp' : 'email';
    if (c === 'whatsapp' && !cfg.waTemplate) continue;
    if (porCanal[c].length + env[c] < tetos[c]) porCanal[c].push(e);
  }
  let agendados = 0;
  for (const c of ['email', 'whatsapp']) {
    const slots = slotsDoDia({ n: porCanal[c].length, dataISO: data, janela: cfg.janela, intervalo: cfg.intervalo });
    for (let i = 0; i < slots.length; i++) {
      const e = porCanal[c][i];
      const ok = await sp(`crm_sdr_estado?id=eq.${e.id}&etapa=eq.rascunho`, { etapa: 'agendado', agendado_para: slots[i].toISOString(), atualizado_em: agora.toISOString() }, 'PATCH');
      if (ok && e.fila_id) await sp(`crm_fila?id=eq.${e.fila_id}&status=eq.rascunho`, { status: 'aprovado', aprovado_em: agora.toISOString() }, 'PATCH');
      if (ok) agendados++;
    }
  }
  const ctx = { piloto: true, candidatos: estados.length, agendados, tetos, ja_enviados_hoje: env, ms: Date.now() - inicio };
  await logCron('sdr-agendar', nivelTrabalho(agendados), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// sdr-envio: a cada 5 min na janela, envia o que venceu. Relê tudo a cada item.
async function jobSdrEnvio(req, res) {
  const inicio = Date.now();
  const lote = Math.max(1, Math.min(10, Number(req.query.lote) || 3));
  await logCron('sdr-envio', 'info', 'início', { lote });
  const agoraIso = new Date().toISOString();
  const devidos = await sg(`crm_sdr_estado?etapa=eq.agendado&status=eq.ativo&agendado_para=lte.${agoraIso}&select=id,decisor_id,empresa_id,agencia_id,agencia_motivo,dossie_id,canal,dia_cadencia,fila_id&order=agendado_para.asc&limit=${lote}`);
  if (devidos === null) return erroLeitura('sdr-envio', res, inicio, 'crm_sdr_estado');
  let enviados = 0, barrados = 0, erros = 0; const motivos = {};
  let graph = null;

  for (const e of devidos) {
    const agora = new Date();
    const cfg = await cfgEnvio();                        // segunda guarda: relida agora
    const ds = await sg(`crm_decisores?id=eq.${e.decisor_id}&select=id,nome,email,wa,email_valido,opt_out,respondeu`);
    const msgs = await sg(`crm_sdr_mensagens?estado_id=eq.${e.id}&escolhida=eq.true&select=id,assunto,corpo,aprovado_autonomo&limit=1`);
    const fila = e.fila_id ? await sg(`crm_fila?id=eq.${e.fila_id}&select=id,assunto,corpo,status`) : null;
    const decisor = Array.isArray(ds) && ds[0];
    const msg = Array.isArray(msgs) && msgs[0];
    const f = Array.isArray(fila) && fila[0];
    const canal = e.canal === 'whatsapp' ? 'whatsapp' : 'email';
    const env = await enviadosHojePorCanal(agora);
    const g = cfg ? podeEnviar({ cfg, agora, canal, enviadosHoje: env[canal], bouncePct7d: canal === 'email' ? await bouncePct7d() : 0, msg, decisor }) : { ok: false, motivos: ['configuração ilegível'] };
    if (f && f.status !== 'aprovado') { g.ok = false; g.motivos.push('item da fila não está aprovado (' + f.status + ')'); }
    if (!g.ok) {
      barrados++; for (const mo of g.motivos) motivos[mo] = (motivos[mo] || 0) + 1;
      // Fora da janela/teto: volta para rascunho (amanhã reagenda). Piloto desligado: idem.
      await sp(`crm_sdr_estado?id=eq.${e.id}`, { etapa: 'rascunho', agendado_para: null, motivo: 'envio barrado: ' + g.motivos.join('; ').slice(0, 400), atualizado_em: agora.toISOString() }, 'PATCH');
      continue;
    }
    // Texto final: o que está na fila (o Pedro pode ter editado) ou a versão escolhida.
    const assunto = (f && f.assunto) || msg.assunto || '';
    const corpo = corpoFinal((f && f.corpo) || msg.corpo, canal);
    let r;
    if (canal === 'email') {
      if (!graph) graph = await obterTokenGraph({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY });
      r = graph ? await enviarEmailGraph(graph.token, { para: decisor.email, assunto, html: htmlDeTexto(corpo) }) : { ok: false, erro: 'Outlook não conectado' };
    } else {
      const tk = process.env.WHATSAPP_CLOUD_TOKEN, ph = process.env.WHATSAPP_PHONE_NUMBER_ID;
      r = (tk && ph) ? await enviarWhatsAppTemplate({ token: tk, phoneId: ph, para: normalizarWa(decisor.wa), template: cfg.waTemplate.nome, idioma: cfg.waTemplate.idioma,
        parametros: parametrosTemplate(String(decisor.nome || '').split(/\s+/)[0], (f && f.corpo) || msg.corpo) }) : { ok: false, erro: 'WhatsApp Cloud API não configurada' };
    }
    const ts = new Date().toISOString();
    if (!r.ok) {
      erros++;
      await sp(`crm_sdr_estado?id=eq.${e.id}`, { etapa: 'erro', ultimo_erro: r.erro, atualizado_em: ts }, 'PATCH');
      if (f) await sp(`crm_fila?id=eq.${f.id}`, { rascunho_erro: r.erro }, 'PATCH');
      continue;
    }
    enviados++;
    if (f) await sp(`crm_fila?id=eq.${f.id}`, { status: 'enviado', enviado_em: ts, rascunho_erro: null }, 'PATCH');
    await sp('crm_toques', { decisor_id: e.decisor_id, empresa_id: e.empresa_id, canal, direcao: 'enviado', assunto: assunto.slice(0, 500),
      resumo: ('SDR D' + (e.dia_cadencia || 0)).slice(0, 500), texto_enviado: corpo.slice(0, 4000), data: ts, fonte: 'sistema', resultado: 'enviado', agencia_id: e.agencia_id ? String(e.agencia_id) : null });
    await sp(`crm_decisores?id=eq.${e.decisor_id}`, { ultimo_toque_em: ts }, 'PATCH');
    await sp(`crm_sdr_estado?id=eq.${e.id}`, { etapa: 'enviado', enviado_em: ts, atualizado_em: ts }, 'PATCH');
    const prox = proximoPasso({ cadencia: cfg.cadencia, diaAtual: e.dia_cadencia || 0, dataEnvioISO: horaBRT(new Date(ts)).data, feriados: cfg.feriados });
    if (prox) await spUpsert('crm_sdr_estado', { decisor_id: e.decisor_id, empresa_id: e.empresa_id, agencia_id: e.agencia_id, agencia_motivo: e.agencia_motivo,
      dossie_id: e.dossie_id, dia_cadencia: prox.dia, data_lote: prox.data, etapa: 'aguardando', status: 'ativo' }, 'decisor_id,data_lote,dia_cadencia');
  }
  const ctx = { devidos: devidos.length, enviados, barrados, erros, motivos, ms: Date.now() - inicio };
  await logCron('sdr-envio', erros ? 'error' : (devidos.length ? nivelTrabalho(enviados) : 'info'), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// sdr-wa-modelos: submete os modelos de WhatsApp à Meta (idempotente) e, quando o
// primeiro-contato for APROVADO, grava sdr_wa_template para o envio poder usá-lo.
// Precisa de WHATSAPP_CLOUD_TOKEN e WHATSAPP_WABA_ID. Não envia mensagem a ninguém.
async function jobSdrWaModelos(req, res) {
  const inicio = Date.now();
  const tk = process.env.WHATSAPP_CLOUD_TOKEN, waba = process.env.WHATSAPP_WABA_ID;
  if (!tk || !waba) {
    const ctx = { faltando: [!tk && 'WHATSAPP_CLOUD_TOKEN', !waba && 'WHATSAPP_WABA_ID'].filter(Boolean) };
    await logCron('sdr-wa-modelos', 'aviso', 'fim — pulado: falta configuração', ctx);
    return res.status(200).json({ ok: true, pulado: true, ...ctx });
  }
  const base = 'https://graph.facebook.com/v21.0/' + waba + '/message_templates';
  const H = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
  const lista = await fetch(base + '?fields=name,status,language&limit=200', { headers: H }).then(r => r.ok ? r.json() : null).catch(() => null);
  const existentes = {}; for (const t of ((lista && lista.data) || [])) existentes[t.name + '|' + t.language] = t.status;
  const resultado = [];
  for (const m of MODELOS_WA) {
    const st = existentes[m.name + '|' + m.language];
    if (st) { resultado.push({ nome: m.name, status: st }); continue; }
    const r = await fetch(base, { method: 'POST', headers: H, body: JSON.stringify(payloadMeta(m)) });
    const j = await r.json().catch(() => ({}));
    resultado.push({ nome: m.name, status: r.ok ? (j.status || 'PENDING') : 'ERRO', erro: r.ok ? undefined : JSON.stringify(j.error || j).slice(0, 200) });
  }
  const aprovado = resultado.find(x => x.nome === 'sdr_primeiro_contato' && x.status === 'APPROVED');
  if (aprovado) await spUpsert('crm_configuracoes', { chave: 'sdr_wa_template', valor: { nome: 'sdr_primeiro_contato', idioma: 'pt_BR' } }, 'chave');
  const ctx = { modelos: resultado, primeiro_contato_aprovado: !!aprovado, ms: Date.now() - inicio };
  await logCron('sdr-wa-modelos', resultado.some(x => x.status === 'ERRO') ? 'error' : 'info', 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: job sdr-topo (Bloco G) ───────────────────────────────────────────────
// Gera candidatos de topo de funil em crm_sdr_topo (status 'novo') para o Pedro
// aceitar ou descartar. Não cria contato nem fila. Reexecutar não sobrescreve a
// decisão já tomada (ignore-duplicates pela chave).
async function jobSdrTopo(req, res) {
  const inicio = Date.now();
  await logCron('sdr-topo', 'info', 'início', null);
  const ops = await sg('crm_oportunidades?estagio=eq.Cliente%20ativo&apagado_em=is.null&select=empresa_id,crm_agencias:agencia_id(slug),crm_empresas:empresa_id(id,nome,setor,segmento_detalhe)&limit=2000');
  const ags = await sg('crm_agencias?select=slug,nome&limit=50');
  if (ops === null || ags === null) return erroLeitura('sdr-topo', res, inicio, 'crm_oportunidades/crm_agencias');
  const porEmp = {};
  for (const o of ops) {
    const e = o.crm_empresas; if (!e) continue;
    porEmp[e.id] = porEmp[e.id] || { empresa_id: e.id, nome: e.nome, setor: e.setor, segmento_detalhe: e.segmento_detalhe, agencias_ativas: [] };
    if (o.crm_agencias && o.crm_agencias.slug) porEmp[e.id].agencias_ativas.push(o.crm_agencias.slug);
  }
  // Não sugerir cross-sell onde já existe oportunidade aberta daquela agência.
  const abertas = await sg('crm_oportunidades?apagado_em=is.null&estagio=not.in.(Perdido,Pausado)&select=empresa_id,crm_agencias:agencia_id(slug)&limit=5000');
  const temAberta = new Set((Array.isArray(abertas) ? abertas : []).map(o => o.empresa_id + '|' + (o.crm_agencias && o.crm_agencias.slug)));
  const cross = crossSell(Object.values(porEmp), ags, await knowledgeVivo()).filter(c => !temAberta.has(c.empresa_id + '|' + c.agencia_slug));

  const corte = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const nots = await sg(`crm_noticias?data=gte.${corte}&apagado_em=is.null&select=empresa_id,titulo,resumo,url,data&limit=5000`);
  const ids = [...new Set((Array.isArray(nots) ? nots : []).map(n => n.empresa_id).filter(Boolean))];
  const emps = {};
  for (let i = 0; i < ids.length; i += 150) {
    const r = await sg(`crm_empresas?id=in.(${ids.slice(i, i + 150).join(',')})&select=id,nome&limit=150`);
    for (const e of (Array.isArray(r) ? r : [])) emps[e.id] = e;
  }
  const sinais = sinaisDeCompra(Array.isArray(nots) ? nots : [], emps);

  const linhas = [...cross, ...sinais].map(l => ({ ...l, dados: l.dados || null }));
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += 200) {
    const r = await fetch(SUPA_URL + '/rest/v1/crm_sdr_topo?on_conflict=chave', { method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(linhas.slice(i, i + 200)) });
    if (r.ok) gravadas += ((await r.json().catch(() => [])) || []).length;
  }
  const ctx = { clientes_ativos: Object.keys(porEmp).length, cross_sell: cross.length, sinais_compra: sinais.length, novas: gravadas, ms: Date.now() - inicio };
  await logCron('sdr-topo', nivelTrabalho(cross.length + sinais.length), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
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
    if (job === 'rascunhos-matinais')    return await jobRascunhosMatinais(req, res);
    if (job === 'oportunidades-paradas') return await jobOportunidadesParadas(req, res);
    if (job === 'gerar-fila-diario')     return await jobGerarFila(req, res);
    if (job === 'enriquecimento-diario') return await jobEnriquecimento(req, res);
    if (job === 'noticias-semanal')      return await jobNoticias(req, res);
    if (job === 'fechamento-sexta')      return await jobFechamento(req, res);
    if (job === 'sdr-selecao')           return await jobSdrSelecao(req, res);
    if (job === 'sdr-dossie')            return await jobSdrDossie(req, res);
    if (job === 'sdr-redacao')           return await jobSdrRedacao(req, res);
    if (job === 'sdr-qualidade')         return await jobSdrQualidade(req, res);
    if (job === 'sdr-respostas')         return await jobSdrRespostas(req, res);
    if (job === 'sdr-agendar')           return await jobSdrAgendar(req, res);
    if (job === 'sdr-envio')             return await jobSdrEnvio(req, res);
    if (job === 'sdr-wa-modelos')        return await jobSdrWaModelos(req, res);
    if (job === 'sdr-topo')              return await jobSdrTopo(req, res);
    return res.status(400).json({ error: 'job inválido. Use: gerar-fila-diario, enriquecimento-diario, noticias-semanal, fechamento-sexta, higiene-fila, rascunhos-matinais, oportunidades-paradas, sdr-selecao, sdr-dossie, sdr-redacao, sdr-qualidade, sdr-respostas, sdr-agendar, sdr-envio, sdr-wa-modelos, sdr-topo' });
  } catch(e) {
    console.error('[cron:'+job+']', e.message);
    try { await logCron(job||'unknown', 'error', 'erro: '+e.message, null); } catch(_) {}
    return res.status(500).json({ error: e.message });
  }
}
