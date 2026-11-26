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
import { obterTokenGmail, criarRascunhoGmail, lerEntradaGmail, estadoDoRascunhoGmail, ehRascunhoGmail, gmailReq, consultaRascunho, filaIdDaFronteira } from '../lib/gmail-token.js';
import { perfilGmail, historicoGmail, eventosDoHistorico, metadadosMensagem, corpoMensagem, filaIdDoMessageId, textoDoPayload } from '../lib/gmail-sync.js';
import { pessoaLusha, saldoDoDia } from '../lib/lusha.js';
import { CONSULTAS_IMPRENSA, urlImprensa, lerRss, juntarItens, ehCargoAlvo, chaveMovimento, ehAgencia, SCHEMA_EXTRACAO, promptExtracao, SCHEMA_PARABENS, promptParabens, checarParabens } from '../lib/movimentacoes.js';
import { casarEmpresa, casarPessoa, normalizarEmpresa } from '../lib/captura.js';
import { construirPromptBlitz, checarMensagem, casesDoSetor, SCHEMA_BLITZ } from '../lib/blitz.js';
import { SETORES, setorDoAntigo, setorValido, SCHEMA_SETORES, promptSetores } from '../lib/setores.js';
import { montarIndice, casarMensagem, decidirPipeline, construirPromptStatus, SCHEMA_STATUS, semCitacao, respostaReal, substituiSugestao, aplicarPrazoDoEmail } from '../lib/gmail-crm.js';
import { MODELOS_WA, payloadMeta } from '../lib/wa-templates.js';
import { tokenSdrValido } from '../lib/sdr-auth.js';
import { crossSell, sinaisDeCompra } from '../lib/sdr-topo.js';
import { construirPromptEstrategia, validarTese, resumoEcossistema, SCHEMA_ESTRATEGIA, OFERTA_BLITZ_PADRAO } from '../lib/sdr-estrategista.js';
import { inicioDiaBRT, vagasDoDia, gastoDosLogs, orcamentoOk, contextoDoLead, conversaRecente } from '../lib/sdr-meta.js';
import { scoreOportunidade } from '../lib/sdr-score.js';
import { montarMemoriaPrompt, analisarEdicao, propostasDeAprendizado, perfilDeComunicacao } from '../lib/sdr-aprendizado.js';
import { escolherAmostras, promptAprenderEstilo, SCHEMA_ESTILO, linhasEstiloAprendido, textoProprio } from '../lib/estilo-aprendido.js';

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
  // Relógio do SDR: Bearer validado contra o Vault (independe de env na Vercel).
  const okVault = !aceitos.includes(recebido) && recebido ? await tokenSdrValido(recebido, { supaUrl: SUPA_URL, serviceKey: SUPA_KEY }) : false;
  if (!okVault && (!aceitos.length || !recebido || !aceitos.includes(recebido))) {
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
async function spUpsert(path, body, onConflict, ignorar = false) {
  const r = await fetch(SUPA_URL+'/rest/v1/'+path+(path.includes('?')?'&':'?')+'on_conflict='+onConflict, {
    method:'POST', headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:(ignorar?'resolution=ignore-duplicates':'resolution=merge-duplicates')+',return=minimal'}, body:JSON.stringify(body)
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

  // Fase 3: no modo rascunho do SDR, a fila de primeiro contato vem só do SDR
  // (dossiê + estrategista + QC). O gerador antigo, genérico, fica parado para a
  // caixa do Pedro não misturar mensagens sem contexto com as do SDR.
  const mr = await sg('crm_configuracoes?chave=eq.sdr_modo_rascunho&select=valor&limit=1');
  if (Array.isArray(mr) && mr[0] && (mr[0].valor === true || mr[0].valor === 'true')) {
    const ctx = { pulado: true, motivo: 'sdr_modo_rascunho ligado: a fila vem do SDR', ms: Date.now() - inicio };
    await logCron('gerar-fila-diario', 'aviso', 'fim — pulado', ctx);
    return res.status(200).json({ ok: true, ...ctx });
  }

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
  // Reescrito em 26/11: teto de CRÉDITOS do dia compartilhado com o cadastro rápido
  // (crm_configuracoes.lusha_daily_limit; uso em lusha_creditos_dia), só e-mail
  // (1 crédito; celular custa 5 e fica para quando o Pedro pede), pausa de 1,3 s
  // entre consultas (limite de 50/min do Lusha) e prioridade para quem o Pedro vai abordar.
  const inicio = Date.now(); const LIMITE = 45000;
  await logCron('enriquecimento-diario', 'info', 'início', null);
  const chave = LUSHA_KEY;
  if (!chave) { await logCron('enriquecimento-diario', 'aviso', 'fim — pulado', { motivo: 'LUSHA_KEY_ausente' }); return res.status(200).json({ ok: true, pulado: true }); }
  const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const cfg = await sg('crm_configuracoes?chave=in.(lusha_daily_limit,lusha_creditos_dia)&select=chave,valor');
  const c = {}; for (const r of (Array.isArray(cfg) ? cfg : [])) c[r.chave] = r.valor;
  const teto = Number(c.lusha_daily_limit) || 8;
  let { usados, restantes } = saldoDoDia(c.lusha_creditos_dia, hojeStr, teto);
  const cont = { teto, usados_antes: usados, consultados: 0, achados: 0, emails: 0, cargos: 0, linkedins: 0, nao_achados: 0, erros: [] };
  if (restantes < 1) { const ctx = Object.assign(cont, { motivo: 'teto do dia já usado', ms: Date.now() - inicio }); await logCron('enriquecimento-diario', 'aviso', 'fim', ctx); return res.status(200).json({ ok: true, ...ctx }); }

  // Candidatos: sem e-mail, com nome e sobrenome, nunca tentados ou tentados há 60+ dias.
  const corte = new Date(Date.now() - 60 * 864e5).toISOString();
  const decs = await sg(`crm_decisores?email=is.null&apagado_em=is.null&or=(enriquecimento_tentado_em.is.null,enriquecimento_tentado_em.lt.${corte})&select=id,nome,empresa_id,linkedin_url,cargo,wa,fonte,crm_empresas(nome,dominio,website,site,apagado_em)&limit=3000`);
  if (decs === null) return erroLeitura('enriquecimento-diario', res, inicio, 'crm_decisores');
  const listas = await sg('crm_lista_itens?select=decisor_id,crm_listas!inner(apagado_em)&crm_listas.apagado_em=is.null&limit=10000');
  const emLista = new Set((Array.isArray(listas) ? listas : []).map(x => x.decisor_id));
  const est = await sg('crm_empresa_agencia_estrelas?apagado_em=is.null&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=50000');
  const estrelas = {}; for (const e of (Array.isArray(est) ? est : [])) { const v = Number(e.estrelas_manual ?? e.estrelas_calculadas) || 0; if (v > (estrelas[e.empresa_id] || 0)) estrelas[e.empresa_id] = v; }
  const cands = decs.filter(d => d.crm_empresas && !d.crm_empresas.apagado_em && String(d.nome || '').trim().split(/\s+/).length >= 2)
    .map(d => ({ d, prio: (emLista.has(d.id) ? 100 : 0) + (d.fonte === 'captura' ? 50 : 0) + (d.fonte === 'movimentacao' ? 80 : 0) + (estrelas[d.empresa_id] || 0) * 5 }))
    .sort((x, y) => y.prio - x.prio);
  cont.candidatos = cands.length;
  for (const { d } of cands) {
    if (restantes < 1 || Date.now() - inicio > LIMITE) break;
    if (cont.consultados) await new Promise(ok => setTimeout(ok, 1300));
    const emp = d.crm_empresas; const dom = emp.dominio || emp.website || emp.site;
    const p = await pessoaLusha({ chave, nome: d.nome, empresa: emp.nome, linkedin: d.linkedin_url || null,
      dominio: dom ? String(dom).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : null, celular: false });
    cont.consultados++;
    usados += p.creditos || 0; restantes = Math.max(0, teto - usados);
    const patch = { enriquecimento_tentado_em: new Date().toISOString() };
    if (p.achou) {
      cont.achados++;
      if (p.email) {
        // Nunca grava um e-mail que já é de outro contato (base tem duplicatas).
        const dono = await sg(`crm_decisores?email=ilike.${encodeURIComponent(p.email)}&apagado_em=is.null&id=neq.${d.id}&select=id&limit=1`);
        if (Array.isArray(dono) && dono.length) cont.duplicados = (cont.duplicados || 0) + 1;
        else { patch.email = p.email; cont.emails++; }
      }
      if (!d.cargo && p.cargo) { patch.cargo = p.cargo; cont.cargos++; }
      if (!d.linkedin_url && p.linkedin) { patch.linkedin_url = p.linkedin; cont.linkedins++; }
      if (p.site && !dom) await sp(`crm_empresas?id=eq.${d.empresa_id}`, { website: p.site, enriquecido_em: new Date().toISOString() }, 'PATCH');
    } else { cont.nao_achados++; if (p.status === 429 || p.status === 402 || p.status === 403) { cont.erros.push(p.erro); break; } }
    await sp(`crm_decisores?id=eq.${d.id}`, patch, 'PATCH');
  }
  await upsertConfig('lusha_creditos_dia', { data: hojeStr, usados });
  const ctx = Object.assign(cont, { usados_depois: usados, ms: Date.now() - inicio });
  await logCron('enriquecimento-diario', nivelTrabalho(cont.emails + cont.cargos + cont.linkedins), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
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

  // Gmail conectado tem prioridade: o rascunho vai para Rascunhos do Gmail, com a
  // assinatura padrão dele e a cópia (Cco) de crm_configuracoes.email_copia.
  // Só cria rascunho; enviar continua exigindo o clique do Pedro (gmail-send).
  const gmail = await obterTokenGmail({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY }).catch(() => null);
  let copia = null;
  if (gmail) {
    const cc = await sg('crm_configuracoes?chave=in.(email_copia,email_copia_tipo)&select=chave,valor');
    const m = {}; for (const r of (Array.isArray(cc) ? cc : [])) m[r.chave] = r.valor;
    if (typeof m.email_copia === 'string' && m.email_copia.includes('@')) copia = { email: m.email_copia, tipo: m.email_copia_tipo === 'cc' ? 'cc' : 'bcc' };
  }

  const credencial = (process.env.CRON_SECRET || '').trim() || (SUPA_KEY || '').trim();
  if (!gmail && !credencial) {
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
    '&select=id,assunto,corpo,etapa_cadencia,thread_ref,rascunho_tentativas,origem,crm_decisores(email,nome)' +
    '&order=origem.asc.nullslast,rascunho_tentativas.asc,aprovado_em.asc&limit=' + teto
  );
  if (itens === null) return erroLeitura('rascunhos-matinais', res, inicio, 'crm_fila');
  const lista = (Array.isArray(itens) ? itens : []).filter(it => {
    const email = it.crm_decisores && it.crm_decisores.email;
    if (!email) return false;
    // A pausa de primeiros contatos (13/11) vale para a fila genérica antiga. O SDR
    // (dossiê + estrategista + QC) é o que o Pedro pediu para receber todo dia, e
    // criar rascunho não envia nada: o envio continua sendo o clique dele.
    // Blitz também passa: é o Pedro que montou a lista e aprovou cada mensagem.
    if (pausado && Number(it.etapa_cadencia || 1) <= 1 && !['sdr', 'blitz', 'movimentacao'].includes(it.origem)) return false;
    return true;
  });

  if (!lista.length) {
    const ctx = { criados: 0, candidatos: Array.isArray(itens) ? itens.length : 0, pausado, teto, ms: Date.now()-inicio };
    await logCron('rascunhos-matinais', 'aviso', 'fim', ctx);
    return res.status(200).json({ ok: true, ...ctx });
  }

  let criados = 0, pulados = 0, adotados = 0;
  const LIMITE_MS = 45000;
  for (const item of lista) {
    if (Date.now() - inicio > LIMITE_MS) break;
    const tentativa = (Number(item.rascunho_tentativas) || 0) + 1;
    if (gmail) {
      try {
        const args = {
          conta: gmail.email, para: item.crm_decisores.email, assunto: item.assunto || '', corpo: item.corpo || '', filaId: item.id,
          cco: copia && copia.tipo === 'bcc' ? copia.email : null, cc: copia && copia.tipo === 'cc' ? copia.email : null
        };
        // Retry controlado: 1 nova tentativa só para limite de taxa (429) ou erro do
        // Google (5xx). Erro de autenticação ou de dado não é repetido aqui.
        let d;
        try { d = await criarRascunhoGmail(gmail.token, args); }
        catch (e1) {
          if (!(e1.status === 429 || e1.status >= 500)) throw e1;
          await new Promise(r => setTimeout(r, 1500));
          d = await criarRascunhoGmail(gmail.token, args);   // idempotente: adota se o 1º chegou a criar
        }
        // Sucesso = id devolvido pela API E gravado no banco. Sem as duas coisas, não conta.
        const gravou = await sp('crm_fila?id=eq.' + item.id + '&outlook_message_id=is.null', Object.assign({ outlook_message_id: d.id, rascunho_criado_em: new Date().toISOString(), outlook_draft_link: d.link, rascunho_erro: null }, d.threadId ? { thread_ref: d.threadId } : {}), 'PATCH');
        if (!gravou) throw new Error('rascunho criado no Gmail (' + d.id + '), mas o banco não gravou o id; a próxima rodada adota o mesmo rascunho');
        if (d.adotado) adotados++; else criados++;
      } catch (e) {
        falhas.push({ fila_id: item.id, erro: String(e.message).slice(0, 200) });
        await sp('crm_fila?id=eq.' + item.id, { rascunho_erro: ('gmail: ' + String(e.message)).slice(0, 500), rascunho_tentativas: tentativa }, 'PATCH');
      }
      await new Promise(r => setTimeout(r, 150));
      continue;
    }
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
    provedor: gmail ? 'gmail' : 'outlook', criados, adotados, pulados, candidatos: lista.length, pausado, teto,
    falhas: falhas.slice(0, 10), ms: Date.now()-inicio
  };
  console.log('[cron:rascunhos-matinais]', criados, 'rascunhos de', lista.length, 'candidatos');
  await logCron('rascunhos-matinais', falhas.length ? 'error' : nivelTrabalho(criados + adotados), 'fim', ctx);
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
  const loteCfg = Array.isArray(cfg) && cfg[0]?.valor ? Number(cfg[0].valor) : 30;
  // Quem ficou da noite anterior (meta batida) vai primeiro: só completa o lote.
  const pend = await sg('crm_sdr_estado?status=eq.ativo&sombra=eq.false&etapa=in.(selecionado,dossie)&select=id&limit=2000');
  const pendentes = Array.isArray(pend) ? pend.length : 0;
  const loteMax = Math.max(0, loteCfg - pendentes);

  const decisores = await sg('crm_decisores?etapa_cadencia=neq.off&status=neq.inativo&apagado_em=is.null&select=id,nome,cargo,empresa_id,email,wa,email_valido,status,etapa_cadencia,ultimo_toque_em,opt_out,respondeu,pausa_ate_em,crm_empresas!empresa_id(id,nome,setor,setor_sugerido,segmento_detalhe,dominio,cliente_ativo,rank)&order=ultimo_toque_em.asc.nullsfirst&limit=800');
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
  // Conta também os leads reais do SDR desta semana (não só a crm_fila): sem isso,
  // dois decisores da mesma empresa entravam em dias seguidos. Sombra não conta,
  // porque não falou com ninguém.
  const sdrSemana = await sg(`crm_sdr_estado?criado_em=gte.${semanaISO}&sombra=eq.false&dia_cadencia=eq.0&fila_id=not.is.null&select=empresa_id&limit=5000`);   // só quem virou mensagem (26/11: descartados bloqueavam a empresa)
  const primeirosContatoSemana = [...new Set([...(Array.isArray(filaSemana) ? filaSemana : []), ...(Array.isArray(sdrSemana) ? sdrSemana : [])].map(r => r.empresa_id).filter(Boolean))];

  // Bloco G: candidatos de topo de funil aceitos pelo Pedro passam à frente.
  const corteCurso = new Date(Date.now() - 14 * 86400000).toISOString();
  const cursoRows = await sg(`crm_sdr_estado?criado_em=gte.${corteCurso}&etapa=neq.aguardando&or=(etapa.neq.avaliado,motivo.not.like.sem%20sinal*)&select=decisor_id&limit=10000`);
  const emCurso = new Set((Array.isArray(cursoRows) ? cursoRows : []).map(r => r.decisor_id));
  const topoRows = await sg('crm_sdr_topo?status=eq.aceito&empresa_id=not.is.null&select=empresa_id,fonte,agencia_slug,motivo&limit=1000');
  const topoAceitos = {};
  for (const t of (Array.isArray(topoRows) ? topoRows : [])) topoAceitos[t.empresa_id] = t;

  // Contexto do CRM: última conversa real por pessoa e empresas com oportunidade
  // parada. Quem tem contexto e não veio na lista acima (tocado há pouco tempo,
  // por exemplo) é buscado à parte para não ficar de fora.
  const corteConv = new Date(Date.now() - 548 * 86400000).toISOString();
  const conv = await sg(`crm_toques?data=gte.${corteConv}&apagado_em=is.null&decisor_id=not.is.null&or=(direcao.eq.recebido,resultado.in.(respondeu,resposta,reuniao,reuniao_marcada,atendeu))&select=decisor_id,data&order=data.desc&limit=5000`);
  const ultimaConversa = {};
  for (const t of (Array.isArray(conv) ? conv : [])) if (!ultimaConversa[t.decisor_id]) ultimaConversa[t.decisor_id] = t.data;
  const corteOpp = new Date(Date.now() - 30 * 86400000).toISOString();
  const opps = await sg(`crm_oportunidades?apagado_em=is.null&estagio=in.(Wishlist,Pausado)&atualizado_em=lt.${corteOpp}&select=empresa_id&limit=2000`);
  const empresasOppParada = new Set((Array.isArray(opps) ? opps : []).map(o => o.empresa_id).filter(Boolean));
  const jaNaLista = new Set(candidatos.map(d => d.id));
  const faltam = Object.keys(ultimaConversa).filter(id => !jaNaLista.has(id)).slice(0, 300);
  if (faltam.length) {
    const extra = await sg(`crm_decisores?id=in.(${faltam.join(',')})&etapa_cadencia=neq.off&status=neq.inativo&apagado_em=is.null&select=id,nome,cargo,empresa_id,email,wa,email_valido,status,etapa_cadencia,ultimo_toque_em,opt_out,respondeu,pausa_ate_em,crm_empresas!empresa_id(id,nome,setor,setor_sugerido,segmento_detalhe,dominio,cliente_ativo,rank)`);
    for (const d of (Array.isArray(extra) ? extra : [])) candidatos.push({ ...d, empresa: d.crm_empresas || {} });
  }

  // Rejeitado pelo Pedro não volta para a seleção.
  const rej = await sg('crm_fila?decisao=eq.rejeitado&select=decisor_id&limit=5000');
  const rejeitados = new Set((Array.isArray(rej) ? rej : []).map(r => r.decisor_id).filter(Boolean));

  // Insumos do score: setores com case do grupo e setores de clientes ativos.
  const KVs = await knowledgeVivo();
  const setoresComCase = new Set((KVs.cases_destaque || []).flatMap(c => [c.categoria_da_marca, ...(c.tags || [])]).filter(Boolean).map(x => String(x).toLowerCase()));
  const cliAt = await clientesAtivos();
  const setoresClientes = new Set((cliAt.lista || []).map(c => String(c.setor || '').toLowerCase()).filter(Boolean));

  const sombra = await modoSombra();
  const { lote, upsell, excluidos, total_elegiveis } = selecionarLote({
    contexto: { ultimaConversa, empresasOppParada }, rejeitados, setoresComCase, setoresClientes,
    candidatos, estrelas, blocklist, toquesEmpresa30d, dossies, agencias, topoAceitos, emCurso,
    primeirosContatoSemana, config: { lote_max: loteMax }, agora: Date.now()
  });

  const dataLote = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toISOString().slice(0, 10);
  let gravados = 0;
  for (const item of lote) {
    const ok = await spUpsert('crm_sdr_estado', {
      decisor_id: item.decisor_id, empresa_id: item.empresa_id, agencia_id: item.agencia_id || null,
      agencia_motivo: item.agencia_motivo || null, data_lote: dataLote, dia_cadencia: item.dia_cadencia || 0,
      canal: null, etapa: 'selecionado', status: 'ativo', sombra, atualizado_em: new Date().toISOString(),
      score: item.score_oportunidade ?? null, score_detalhe: item.score_detalhe || null, solucao: item.solucao || null
    }, 'decisor_id,data_lote,dia_cadencia', true);   // rodar de novo no mesmo dia não reinicia quem já avançou
    if (ok) gravados++;
  }

  const scs = lote.map(i => i.score_oportunidade).filter(n => typeof n === 'number');
  const ctx = { sombra, score_medio: scs.length ? Math.round(scs.reduce((a, b) => a + b, 0) / scs.length) : null, selecionados: lote.length, gravados, upsell: upsell.length, excluidos: excluidos.length, total_elegiveis, lote_max: loteMax, pendentes_da_noite_anterior: pendentes, ms: Date.now() - inicio };
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
  // Lead sem empresa nunca ganha dossiê e ficava em 'selecionado' para sempre: o
  // relógio chamava este job a cada 3 min a noite toda (148 vezes, sem fazer nada).
  for (const e of (Array.isArray(estados) ? estados : [])) {
    if (!e.empresa_id) await sp(`crm_sdr_estado?id=eq.${e.id}&etapa=eq.selecionado`, { etapa: 'avaliado', motivo: 'sem empresa cadastrada: não há dossiê', atualizado_em: new Date().toISOString() }, 'PATCH');
  }
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
// Chave da Anthropic: a da env da Vercel; se faltar ou for recusada (401), cai
// para a guardada no Vault do Supabase ('anthropic_api_key', RPC só service_role).
// Assim trocar a chave não depende da conta da Vercel. Nunca é logada.
const _clientes = new Map();
let _envRecusada = false, _vaultCache = { valor: undefined, ate: 0 };
function clienteLLM(chave) {
  if (!_clientes.has(chave)) _clientes.set(chave, new Anthropic({ apiKey: chave, timeout: 45000, maxRetries: 1 }));
  return _clientes.get(chave);
}
let _vaultEmCurso = null;
async function chaveVault() {
  if (_vaultCache.ate > Date.now()) return _vaultCache.valor;
  if (_vaultEmCurso) return _vaultEmCurso;            // chamadas paralelas esperam a mesma consulta
  _vaultEmCurso = _lerChaveVault().finally(() => { _vaultEmCurso = null; });
  return _vaultEmCurso;
}
async function _lerChaveVault() {
  let v = null;
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/rpc/sdr_anthropic_key', { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.ok) { const j = await r.json().catch(() => null); v = typeof j === 'string' && j.length > 20 ? j : null; }
  } catch (_) {}
  _vaultCache = { valor: v, ate: Date.now() + 10 * 60 * 1000 };
  return v;
}
async function chaveLLM() {
  if (ANTHROPIC_KEY && !_envRecusada) return ANTHROPIC_KEY;
  return await chaveVault();
}
async function temChaveLLM() { return !!(await chaveLLM()); }
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
// Preço por modelo (US$ por milhão de tokens: entrada, saída) para registrar o
// custo por mensagem. Leitura de cache custa 10% da entrada; escrita, 125%.
const PRECOS = {
  'claude-opus-5-5':   [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5':  [0.1, 0.5]
};
function custoUsage(modelo, usage) {
  const chave = Object.keys(PRECOS).find(k => String(modelo || '').startsWith(k)) || MODELO_SDR;
  const [pin, pout] = PRECOS[chave];
  const u = usage || {};
  return ((u.input_tokens || 0) * pin + (u.cache_read_input_tokens || 0) * pin * 0.1 +
    (u.cache_creation_input_tokens || 0) * pin * 1.25 + (u.output_tokens || 0) * pout) / 1e6;
}

// model: qual modelo usar (padrão Opus). O system vai num bloco com cache_control:
// o prompt fixo (regras + ecossistema) é igual para todos os leads do lote, então
// a partir da segunda chamada ele é lido do cache.
async function gerarJSON({ system, user, schema, effort, model }) {
  const modelo = model || MODELO_SDR;
  // Gancho de teste: permite simular o modelo sem rede (nunca definido em produção).
  if (typeof globalThis.__SDR_LLM_MOCK === 'function') return globalThis.__SDR_LLM_MOCK({ system, user, schema, model: modelo });
  const chave = await chaveLLM();
  if (!chave) return { obj: null, erro: 'sem chave da Anthropic (env e Vault)', usage: {}, custo: 0, modelo };
  try {
    const r = await clienteLLM(chave).beta.messages.create({
      model: modelo,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort: effort || 'medium', format: { type: 'json_schema', schema } }
    });
    const usage = r.usage || {};
    const custo = custoUsage(r.model || modelo, usage);
    if (r.stop_reason === 'refusal') return { obj: null, erro: 'refusal', usage, custo, modelo: r.model };
    const txt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let obj = null;
    try { obj = JSON.parse(txt); } catch (_) {}
    return { obj, erro: obj ? null : 'json_invalido', usage, custo, modelo: r.model };
  } catch (e) {
    // Chave da env recusada: marca e tenta de novo uma vez com a do Vault.
    if (e && e.status === 401 && chave === ANTHROPIC_KEY) {
      _envRecusada = true;   // chamadas paralelas também caem aqui e refazem com a do Vault
      if (await chaveVault()) return gerarJSON({ system, user, schema, effort, model });
    }
    return { obj: null, erro: String(e && e.message || e).slice(0, 200), usage: {}, custo: 0, modelo };
  }
}

// Primeiro item sozinho, o resto em paralelo: a primeira chamada grava o cache do
// system prompt e as outras já o leem (em paralelo puro, todas gravam e nenhuma lê).
async function emOndas(lista, fn) {
  const arr = Array.isArray(lista) ? lista : [];
  if (!arr.length) return;
  await fn(arr[0]);
  await Promise.all(arr.slice(1).map(fn));
}

async function configSdr() {
  const rows = await sg('crm_configuracoes?chave=in.(sdr_expressoes_proibidas,sdr_aprendizados,sdr_angulos,sdr_cadencia,sdr_qualidade_nota_minima,sdr_qualidade_nota_minima_rascunho,sdr_rodada,sdr_estrategista,sdr_modelo_estrategia,sdr_modelo_redacao,sdr_modelo_qc,sdr_oferta_blitz,sdr_nota_encaixe_min,sdr_modo_rascunho,sdr_mix_whatsapp,sdr_refacoes_max,sdr_effort_estrategia,sdr_effort_redacao,sdr_meta_rascunhos_dia,sdr_custo_dia_max_usd,sdr_trilha_contexto,sdr_nota_encaixe_min_contexto)&select=chave,valor');
  const m = {}; for (const r of (Array.isArray(rows) ? rows : [])) m[r.chave] = r.valor;
  return {
    proibidas: Array.isArray(m.sdr_expressoes_proibidas) ? m.sdr_expressoes_proibidas : null,
    aprendizados: typeof m.sdr_aprendizados === 'string' ? m.sdr_aprendizados : '',
    angulos: Array.isArray(m.sdr_angulos) && m.sdr_angulos.length ? m.sdr_angulos : ['fato', 'ideia', 'case'],
    cadencia: Array.isArray(m.sdr_cadencia) ? m.sdr_cadencia : [{ dia: 0, canal: 'email' }],
    notaMinima: Number(m.sdr_qualidade_nota_minima) || 8,
    // Rascunho (o Pedro revisa antes de enviar) aceita 7 em tudo; o Piloto continua exigindo 8.
    notaMinimaRascunho: Number(m.sdr_qualidade_nota_minima_rascunho) || 7,
    rodada: Number(m.sdr_rodada) || 1,
    // Fase 3. Sem a chave no banco, tudo fica como antes (3 versões, sem estrategista).
    estrategista: m.sdr_estrategista === true || m.sdr_estrategista === 'true',
    modeloEstrategia: typeof m.sdr_modelo_estrategia === 'string' ? m.sdr_modelo_estrategia : MODELO_SDR,
    modeloRedacao: typeof m.sdr_modelo_redacao === 'string' ? m.sdr_modelo_redacao : MODELO_SDR,
    modeloQc: typeof m.sdr_modelo_qc === 'string' ? m.sdr_modelo_qc : MODELO_SDR,
    oferta: typeof m.sdr_oferta_blitz === 'string' && m.sdr_oferta_blitz ? m.sdr_oferta_blitz : OFERTA_BLITZ_PADRAO,
    notaEncaixeMin: Number(m.sdr_nota_encaixe_min) || 8,
    modoRascunho: m.sdr_modo_rascunho === true || m.sdr_modo_rascunho === 'true',
    mixWhatsapp: Math.max(0, Math.min(1, Number(m.sdr_mix_whatsapp) || 0)),
    refacoesMax: m.sdr_refacoes_max === undefined ? 1 : Math.max(0, Number(m.sdr_refacoes_max) || 0),
    // Esforço de raciocínio por etapa (o raciocínio é a maior parte do custo).
    effortEstrategia: ['low', 'medium', 'high'].includes(m.sdr_effort_estrategia) ? m.sdr_effort_estrategia : 'medium',
    effortRedacao: ['low', 'medium', 'high'].includes(m.sdr_effort_redacao) ? m.sdr_effort_redacao : 'medium',
    // Meta diária (25/11): 20 rascunhos de e-mail por dia, teto de gasto do modelo
    // e trilha "sem fato" (lead com encaixe e cargo certo, sem notícia com fonte).
    metaDia: m.sdr_meta_rascunhos_dia === undefined ? 20 : Math.max(0, Number(m.sdr_meta_rascunhos_dia) || 0),
    custoDiaMaxUsd: m.sdr_custo_dia_max_usd === undefined ? 5 : Number(m.sdr_custo_dia_max_usd) || 0,
    // Trilha de contexto: sem notícia, só segue quem tem histórico real no CRM.
    semFato: m.sdr_trilha_contexto === undefined ? true : (m.sdr_trilha_contexto === true || m.sdr_trilha_contexto === 'true'),
    notaEncaixeMinSemFato: Number(m.sdr_nota_encaixe_min_contexto) || 7
  };
}

// Memória comercial ATIVA para o prompt (só o que o Pedro ativou ou escreveu).
// Filtra pelo escopo (setor/solução) e limita o tamanho. Cache de 5 min.
let _memCache = { ate: 0, rows: null };
async function memoriaParaPrompt({ setor, solucao, canal } = {}) {
  if (_memCache.ate < Date.now()) {
    const [r, est] = await Promise.all([
      sg('crm_memoria_comercial?status=eq.ativo&select=tipo,texto,escopo,evidencias&order=evidencias.desc&limit=200'),
      sg('crm_configuracoes?chave=eq.estilo_pedro_aprendido&select=valor&limit=1')
    ]);
    _memCache = { ate: Date.now() + 5 * 60000, rows: Array.isArray(r) ? r : [], estilo: Array.isArray(est) && est[0] ? est[0].valor : null };
  }
  // Jeito de escrever aprendido dos e-mails do Pedro (job aprender-estilo) vai junto da memória.
  const estilo = linhasEstiloAprendido(_memCache.estilo, canal).join('\n');
  return [estilo, montarMemoriaPrompt(_memCache.rows, { setor, solucao })].filter(Boolean).join('\n\n');
}

// ── aprender-estilo: o jeito de escrever do Pedro ─────────────────────────────
// Toda segunda (e no botão): lê os e-mails que o Pedro escreveu (Enviados, 12 meses; sai
// o que o agente escreveu) e os follow-ups que ele editou no Pipeline; a IA descreve o
// estilo; o perfil vai em crm_configuracoes.estilo_pedro_aprendido e entra em toda redação.
async function jobAprenderEstilo(req, res) {
  const inicio = Date.now();
  const gm = await obterTokenGmail({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY }).catch(() => null);
  const ids = []; let pageToken = '';
  for (let i = 0; gm && i < 3 && ids.length < 240; i++) {
    const l = await gmailReq('GET', '/messages?maxResults=100&q=' + encodeURIComponent('in:sent newer_than:365d -in:chats') + (pageToken ? '&pageToken=' + pageToken : ''), null, gm.token).catch(() => null);
    for (const m of ((l && l.messages) || [])) ids.push(m.id);
    pageToken = l && l.nextPageToken; if (!pageToken) break;
  }
  const H = (m, n) => (((m && m.payload && m.payload.headers) || []).find(h => h.name.toLowerCase() === n) || {}).value || '';
  const msgs = [];
  for (let i = 0; i < ids.length && Date.now() - inicio < 30000; i += 25) {
    const lote = await Promise.all(ids.slice(i, i + 25).map(id => gmailReq('GET', '/messages/' + id + '?format=full', null, gm.token).catch(() => null)));
    for (const m of lote) if (m && !(m.labelIds || []).includes('DRAFT')) msgs.push({ assunto: H(m, 'subject'), para: [H(m, 'to'), H(m, 'cc')].filter(Boolean).join(','), data: new Date(Number(m.internalDate || 0)).toISOString(), texto: textoDoPayload(m.payload) });
  }
  const desde = new Date(Date.now() - 365 * 86400000).toISOString();
  const [fila, opm, evs, man] = await Promise.all([
    sg(`crm_fila?canal=eq.email&gerado_em=gte.${desde}&select=corpo&order=gerado_em.desc&limit=1500`),
    sg(`crm_oportunidade_mensagens?gerado_em=gte.${desde}&select=canal,corpo,corpo_original,enviado_em&order=gerado_em.desc&limit=500`),
    sg(`crm_aprendizado_eventos?tipo=eq.enviado_com_alteracao&criado_em=gte.${desde}&select=final,diff&order=criado_em.desc&limit=300`),
    sg('crm_configuracoes?chave=eq.estilo_amostras_manuais&select=valor&limit=1')
  ]);
  const opmArr = Array.isArray(opm) ? opm : [];
  const textosAgente = (Array.isArray(fila) ? fila : []).map(f => f.corpo).concat(opmArr.map(m => m.corpo_original || m.corpo));
  // Primeiro o que o Pedro colou ou exportou do WhatsApp (é dele com certeza); depois os
  // rascunhos que ele reescreveu; por último os Enviados do Gmail.
  const manuais = (Array.isArray(man) && man[0] && Array.isArray(man[0].valor) ? man[0].valor : []).slice(-60);
  const reescritos = (Array.isArray(evs) ? evs : []).filter(e => e.diff && e.diff.similaridade != null && e.diff.similaridade < 0.6 && e.final && e.final.corpo)
    .slice(0, 15).map(e => ({ canal: 'email (rascunho do agente reescrito pelo Pedro)', assunto: e.final.assunto || '', texto: textoProprio(e.final.corpo).slice(0, 2000) }));
  const doGmail = escolherAmostras(msgs, textosAgente, { max: 30, eu: gm && gm.email });
  const amostras = manuais.map(a => ({ canal: a.canal || 'email', assunto: '', texto: String(a.texto || '').slice(0, 2000) })).concat(reescritos, doGmail);
  // Follow-ups do Pipeline que o Pedro mexeu antes de mandar: a versão final é a voz dele
  // (é o único jeito de ver como ele escreve no WhatsApp).
  for (const m of opmArr) if (m.enviado_em && m.corpo_original && m.corpo && m.corpo.trim() !== m.corpo_original.trim()) amostras.push({ canal: m.canal, assunto: '', texto: textoProprio(m.corpo).slice(0, 1500) });
  if (amostras.length < 6) {
    await logCron('aprender-estilo', 'info', 'fim — poucas amostras', { enviados: msgs.length, amostras: amostras.length });
    return res.status(200).json({ ok: false, motivo: 'poucas amostras', enviados: msgs.length, amostras: amostras.length });
  }
  const { system, user } = promptAprenderEstilo(amostras.slice(0, 90));
  const r = await gerarJSON({ system, user, schema: SCHEMA_ESTILO, effort: 'high', model: 'claude-opus-5-5' });
  if (!r.obj) { await logCron('aprender-estilo', 'error', 'IA não devolveu o perfil', { erro: r.erro }); return res.status(200).json({ ok: false, erro: r.erro }); }
  const valor = { perfil: r.obj, atualizado_em: new Date().toISOString(), amostras: Math.min(amostras.length, 90), enviados_lidos: msgs.length, fontes: { coladas_ou_whatsapp: manuais.length, rascunhos_reescritos: reescritos.length, gmail: doGmail.length }, whatsapp: amostras.filter(a => a.canal === 'whatsapp').length };
  await spUpsert('crm_configuracoes', { chave: 'estilo_pedro_aprendido', valor }, 'chave');
  _memCache = { ate: 0, rows: [] };
  const ctx = { enviados: msgs.length, amostras: valor.amostras, fontes: valor.fontes, custo_usd: r.custo || 0, ms: Date.now() - inicio };
  await logCron('aprender-estilo', 'info', 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx, perfil: r.obj });
}

// Contexto do CRM por lead (id do estado → itens). 3 consultas para o lote todo.
async function contextoDosLeads(estados, cfg) {
  const out = {};
  const lista = Array.isArray(estados) ? estados : [];
  if (!lista.length || !cfg.semFato) return out;
  const decIds = [...new Set(lista.map(e => e.decisor_id).filter(Boolean))];
  const empIds = [...new Set(lista.map(e => e.empresa_id).filter(Boolean))];
  const corte = new Date(Date.now() - 548 * 86400000).toISOString();   // 18 meses
  const tq = decIds.length ? await sg(`crm_toques?decisor_id=in.(${decIds.join(',')})&data=gte.${corte}&apagado_em=is.null&select=decisor_id,canal,direcao,assunto,resumo,data,resultado&order=data.desc&limit=3000`) : [];
  const op = empIds.length ? await sg(`crm_oportunidades?empresa_id=in.(${empIds.join(',')})&apagado_em=is.null&estagio=in.(Wishlist,Pausado)&select=empresa_id,titulo,oferta,estagio,atualizado_em,criado_em&limit=1000`) : [];
  // 26/11: também vale como contexto o que o Pedro registrou ou escolheu (nota no CRM,
  // cargo novo, lista dele, empresa 4-5 estrelas). A mensagem abre pela pessoa e não
  // finge conversa que não houve (linhasTese).
  const li = decIds.length ? await sg(`crm_lista_itens?decisor_id=in.(${decIds.join(',')})&select=decisor_id,crm_listas!inner(nome,apagado_em)&crm_listas.apagado_em=is.null&limit=3000`) : [];
  const es = empIds.length ? await sg(`crm_empresa_agencia_estrelas?empresa_id=in.(${empIds.join(',')})&apagado_em=is.null&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=5000`) : [];
  const estrelasPor = {}; for (const r of (Array.isArray(es) ? es : [])) { const v = Number(r.estrelas_manual ?? r.estrelas_calculadas) || 0; if (v > (estrelasPor[r.empresa_id] || 0)) estrelasPor[r.empresa_id] = v; }
  for (const e of lista) {
    const d = e.crm_decisores || {};
    out[e.id] = contextoDoLead({
      toques: (Array.isArray(tq) ? tq : []).filter(t => t.decisor_id === e.decisor_id),
      oportunidades: (Array.isArray(op) ? op : []).filter(o => o.empresa_id === e.empresa_id),
      pausaAteEm: d.pausa_ate_em || null,
      observacoes: d.observacoes || null, sinalRecenteEm: d.sinal_recente_em || null,
      listas: (Array.isArray(li) ? li : []).filter(x => x.decisor_id === e.decisor_id).map(x => x.crm_listas && x.crm_listas.nome).filter(Boolean),
      estrelas: estrelasPor[e.empresa_id] || 0,
      cargo: d.cargo || null
    });
  }
  return out;
}

// Situação do dia (BRT): rascunhos de e-mail já produzidos, leads de e-mail entre
// o estrategista e o QC e gasto do modelo. Base da meta e do teto de custo.
async function situacaoDoDia(cfg) {
  const inicio = inicioDiaBRT();
  const prod = await sg(`crm_fila?origem=eq.sdr&canal=eq.email&gerado_em=gte.${inicio}&apagado_em=is.null&select=id&limit=1000`);
  const and = await sg('crm_sdr_estado?status=eq.ativo&sombra=eq.false&canal=eq.email&etapa=in.(estrategia,redigido)&select=id&limit=1000');
  const logs = await sg(`crm_logs?origem=in.(cron:sdr-estrategia,cron:sdr-redacao,cron:sdr-qualidade)&mensagem=eq.fim&criado_em=gte.${inicio}&select=contexto&limit=5000`);
  const produzidos = Array.isArray(prod) ? prod.length : 0;
  const emAndamento = Array.isArray(and) ? and.length : 0;
  const gasto = gastoDosLogs(logs);
  return {
    produzidos, emAndamento, gasto,
    vagas: vagasDoDia({ meta: cfg.metaDia, produzidosHoje: produzidos, emAndamento }),
    orcamento: orcamentoOk({ gastoHoje: gasto, tetoUsd: cfg.custoDiaMaxUsd })
  };
}

// Canal do toque: o da cadência para o dia; se a pessoa não tem aquele canal, usa o outro.
// mixWa (0 a 1): no primeiro toque, a fração de quem tem os dois canais que começa
// pelo WhatsApp (escolha estável por decisor, para não mudar entre execuções).
function canalDoToque(diaCadencia, cadencia, decisor, mixWa) {
  const passo = cadencia.find(c => Number(c.dia) === Number(diaCadencia)) || cadencia[0] || { canal: 'email' };
  let canal = passo.canal;
  if (Number(diaCadencia || 0) === 0 && mixWa > 0 && decisor && decisor.email && decisor.wa && decisor.id) {
    let h = 0; for (const ch of String(decisor.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    if ((h % 100) < Math.round(mixWa * 100)) canal = 'whatsapp';
  }
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

// Modo Sombra explícito: tudo roda e é marcado sombra=true, mas NADA vai para
// crm_fila nem para o agendamento. Lido do banco a cada execução.
async function modoSombra() {
  const r = await sg('crm_configuracoes?chave=eq.sdr_modo_sombra&select=valor&limit=1');
  const v = Array.isArray(r) && r[0] ? r[0].valor : true;   // na dúvida, sombra
  return !(v === false || v === 'false');
}

// Clientes ativos por agência (para o estrategista citar cliente do mesmo setor
// e para saber a relação de cada empresa com o grupo).
async function clientesAtivos() {
  const rows = await sg("crm_oportunidades?estagio=eq.Cliente%20ativo&apagado_em=is.null&select=empresa_id,crm_agencias:agencia_id(slug),crm_empresas:empresa_id(nome,setor,setor_sugerido)&limit=2000");
  const porAgencia = {}, porEmpresa = {}, lista = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const slug = r.crm_agencias && r.crm_agencias.slug; const e = r.crm_empresas || {};
    if (!slug || !e.nome) continue;
    const c = { nome: e.nome, setor: e.setor || e.setor_sugerido || '' };
    (porAgencia[slug] ||= []).push(c); lista.push(c);
    (porEmpresa[r.empresa_id] ||= new Set()).add(slug);
  }
  return { porAgencia, porEmpresa, lista };
}

// ── SDR: job sdr-estrategia (Fase 3) ──────────────────────────────────────────
// Entre o dossiê e a redação. Lead sem fato público ou sem canal não gasta
// modelo. Para os demais, o estrategista decide se vale abordar e com qual tese;
// só segue para a redação quem tem encaixe alto (sdr_nota_encaixe_min).
async function jobSdrEstrategia(req, res) {
  const inicio = Date.now();
  const lote = Math.max(1, Math.min(8, Number(req.query.lote) || 6));
  const cfg = await configSdr();
  // Meta e orçamento antes de tudo: com a meta do dia batida, os leads ficam no
  // dossiê e são os primeiros da próxima noite (sem log a cada 3 minutos).
  const sit = await situacaoDoDia(cfg);
  if (!sit.orcamento || sit.vagas <= 0) {
    return res.status(200).json({ ok: true, pulado: true, motivo: !sit.orcamento ? 'teto de gasto do modelo no dia' : 'meta do dia atingida', ...sit });
  }
  await logCron('sdr-estrategia', 'info', 'início', { lote, vagas: sit.vagas, produzidos_hoje: sit.produzidos });
  if (!(await temChaveLLM())) {
    await logCron('sdr-estrategia', 'aviso', 'fim — pulado', { motivo: 'sem chave da Anthropic (env e Vault)' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'sem chave da Anthropic (env e Vault)' });
  }
  const brutos = await sg(`crm_sdr_estado?etapa=eq.dossie&status=eq.ativo&select=id,decisor_id,empresa_id,agencia_motivo,dia_cadencia,score,crm_decisores:decisor_id(id,nome,cargo,email,email_valido,wa,pausa_ate_em,observacoes,sinal_recente_em,fonte),crm_empresas:empresa_id(id,nome,setor,setor_sugerido,segmento_detalhe,rank),crm_agencias:agencia_id(id,nome,slug),crm_dossies:dossie_id(sinais)&order=criado_em.asc&limit=${lote * 8}`);
  if (brutos === null) return erroLeitura('sdr-estrategia', res, inicio, 'crm_sdr_estado');
  // Contexto verificável do CRM (conversa, oportunidade parada, pausa vencida):
  // é o que permite abordar sem notícia sem virar mensagem artificial.
  const contextoPor = await contextoDosLeads(brutos, cfg);
  const temFato = (e) => ((e.crm_dossies && e.crm_dossies.sinais) || []).some(s => s && s.url);
  const semFatoOk = (e) => cfg.semFato && (contextoPor[e.id] || []).length > 0;
  // Score recalculado com o dossiê fresco (gatilhos públicos) e o contexto real.
  const estrelasE = {};
  const empIdsE = [...new Set(brutos.map(e => e.empresa_id).filter(Boolean))];
  if (empIdsE.length) {
    const er = await sg(`crm_empresa_agencia_estrelas?empresa_id=in.(${empIdsE.join(',')})&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=2000`);
    for (const r of (Array.isArray(er) ? er : [])) { const v = Number(r.estrelas_manual ?? r.estrelas_calculadas ?? 0) || 0; if (v > (estrelasE[r.empresa_id] || 0)) estrelasE[r.empresa_id] = v; }
  }
  const scorePor = {};
  for (const e of brutos) scorePor[e.id] = scoreOportunidade({ decisor: e.crm_decisores || {}, empresa: e.crm_empresas || {}, estrelas: estrelasE[e.empresa_id] || 0,
    sinais: (e.crm_dossies && e.crm_dossies.sinais) || [], contexto: contextoPor[e.id] || [] });
  const porScore = (a, b) => (scorePor[b.id].score - scorePor[a.id].score);
  // Fila da noite: os de maior score primeiro (com notícia ou com contexto);
  // sem fato e sem contexto não gasta modelo e sai já (não conta na meta).
  const comFato = brutos.filter(temFato);
  const semFatoElegiveis = brutos.filter(e => !temFato(e) && semFatoOk(e));
  const descartaveis = brutos.filter(e => !temFato(e) && !semFatoOk(e));
  const estados = [...comFato, ...semFatoElegiveis].sort(porScore).slice(0, Math.min(lote, sit.vagas)).concat(descartaveis);
  const KV = await knowledgeVivo();
  const cli = await clientesAtivos();
  const ecossistema = resumoEcossistema(KV, cli.porAgencia);
  const agsDb = await sg('crm_agencias?select=id,slug&limit=50');
  const idPorSlug = {}; for (const a of (Array.isArray(agsDb) ? agsDb : [])) idPorSlug[a.slug] = a.id;
  const agora = new Date().toISOString();

  let avaliados = 0, seguem = 0, descartados = 0, semSinal = 0, semCanal = 0, falhas = 0, custo = 0;
  await emOndas(estados, async (est) => {
    const decisor = est.crm_decisores || {};
    const empresa = est.crm_empresas || {};
    const sinais = ((est.crm_dossies && est.crm_dossies.sinais) || []).filter(s => s && s.url);
    const canal = canalDoToque(est.dia_cadencia || 0, cfg.cadencia, decisor, cfg.mixWhatsapp);
    if (!canal) {
      semCanal++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { etapa: 'avaliado', motivo: 'sem canal válido (nem e-mail nem WhatsApp)', atualizado_em: agora }, 'PATCH');
      return;
    }
    const semFato = !sinais.length;
    if (semFato && !semFatoOk(est)) {
      semSinal++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { etapa: 'avaliado', canal, motivo: 'sem sinal público com fonte e sem contexto no CRM (conversa, oportunidade ou retomada): não aborda', atualizado_em: agora }, 'PATCH');
      return;
    }
    const agSlugs = cli.porEmpresa[est.empresa_id] ? [...cli.porEmpresa[est.empresa_id]] : [];
    const historico = agSlugs.length ? `já é cliente ativo de: ${agSlugs.join(', ')} (oportunidade de cross-sell com as outras agências)` : '';
    const { system, user } = construirPromptEstrategia({
      ecossistema, oferta: cfg.oferta, empresa, decisor, sinais, historico,
      agenciaSugerida: est.crm_agencias ? { slug: est.crm_agencias.slug, motivo: est.agencia_motivo } : null,
      solucaoSugerida: scorePor[est.id] ? { nome: scorePor[est.id].solucao_nome, motivo: scorePor[est.id].motivo } : null,
      memoria: await memoriaParaPrompt({ setor: empresa.setor || empresa.setor_sugerido, solucao: scorePor[est.id] && scorePor[est.id].solucao }),
      notaMin: semFato ? cfg.notaEncaixeMinSemFato : cfg.notaEncaixeMin, semFato, contexto: contextoPor[est.id] || []
    });
    const r = await gerarJSON({ system, user, schema: SCHEMA_ESTRATEGIA, effort: cfg.effortEstrategia, model: cfg.modeloEstrategia });
    custo += r.custo || 0;
    if (!r.obj) {
      falhas++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { tentativas: 1, ultimo_erro: r.erro || 'estrategista falhou', atualizado_em: agora }, 'PATCH');
      return;
    }
    avaliados++;
    const v = validarTese(r.obj, { sinais, knowledge: KV, clientes: cli.lista, notaMin: semFato ? cfg.notaEncaixeMinSemFato : cfg.notaEncaixeMin, semFato });
    const tese = Object.assign({}, v.tese || {}, { custo_usd: Math.round((r.custo || 0) * 1e5) / 1e5, modelo: r.modelo }, semFato ? { contexto: contextoPor[est.id] || [] } : {});
    // A agência que assina passa a ser a do estrategista, quando ele escolheu uma do grupo.
    let agenciaId = null;
    const slugEsc = (tese.agencias || [])[0];
    if (slugEsc && v.seguir && idPorSlug[slugEsc]) agenciaId = idPorSlug[slugEsc];
    if (v.seguir) seguem++; else descartados++;
    const scE = scorePor[est.id];
    await sp(`crm_sdr_estado?id=eq.${est.id}`, Object.assign({
      score: scE ? scE.score : null, score_detalhe: scE || null, solucao: scE ? scE.solucao : null,
      etapa: v.seguir ? 'estrategia' : 'avaliado', canal, tese, nota_encaixe: Number(tese.nota_encaixe) || 0,
      motivo: v.motivo.slice(0, 500), atualizado_em: agora
    }, agenciaId ? { agencia_id: agenciaId } : {}), 'PATCH');
  });

  const ctx = { leads: (estados || []).length, com_fato: comFato.length, com_contexto: semFatoElegiveis.length, vagas: sit.vagas, avaliados, seguem, descartados, sem_sinal: semSinal, sem_canal: semCanal, falhas, custo_usd: Math.round(custo * 10000) / 10000, ms: Date.now() - inicio };
  await logCron('sdr-estrategia', nivelTrabalho(avaliados + semSinal + semCanal), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: job sdr-redacao (seção 4.4) ──────────────────────────────────────────
// Para cada lead com dossiê pronto, escreve 3 versões (ângulos fato/ideia/case)
// a partir de um fato do dossiê. Lead sem sinal público não gasta modelo: fica
// retido para pesquisa manual (sem lastro não há mensagem que passe no QC).
async function jobSdrRedacao(req, res) {
  const inicio = Date.now();
  const lote = Math.max(1, Math.min(6, Number(req.query.lote) || 4));
  await logCron('sdr-redacao', 'info', 'início', { lote });
  if (!(await temChaveLLM())) {
    await logCron('sdr-redacao', 'aviso', 'fim — pulado', { motivo: 'sem chave da Anthropic (env e Vault)' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'sem chave da Anthropic (env e Vault)' });
  }
  const cfg = await configSdr();
  const sitR = await situacaoDoDia(cfg);
  if (!sitR.orcamento) {
    await logCron('sdr-redacao', 'aviso', 'fim — pulado', { motivo: 'teto de gasto do modelo no dia', gasto_usd: sitR.gasto });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'teto de gasto do modelo no dia' });
  }
  // Com o estrategista ligado, a redação só pega quem já tem tese (etapa 'estrategia').
  const etapaIn = cfg.estrategista ? 'estrategia' : 'dossie';
  const estados = await sg(`crm_sdr_estado?etapa=eq.${etapaIn}&status=eq.ativo&select=id,sombra,decisor_id,empresa_id,agencia_id,agencia_motivo,dia_cadencia,dossie_id,canal,tese,refacoes,motivo,solucao,crm_decisores:decisor_id(id,nome,cargo,email,wa),crm_empresas:empresa_id(id,nome,setor,setor_sugerido,segmento_detalhe),crm_agencias:agencia_id(id,nome,slug),crm_dossies:dossie_id(sinais)&order=criado_em.asc&limit=${lote}`);
  if (estados === null) return erroLeitura('sdr-redacao', res, inicio, 'crm_sdr_estado');
  const KV = await knowledgeVivo();
  const agora = new Date().toISOString();

  let redigidos = 0, versoes = 0, semSinal = 0, semCanal = 0, falhas = 0, custo = 0;
  await emOndas(estados, async (est) => {
    const decisor = est.crm_decisores || {};
    const empresa = est.crm_empresas || {};
    const agencia = Object.assign({ motivo: est.agencia_motivo }, est.crm_agencias || {});
    const sinais = (est.crm_dossies && est.crm_dossies.sinais) || [];
    const tese = cfg.estrategista ? (est.tese || null) : null;
    const canal = (tese && est.canal) || canalDoToque(est.dia_cadencia || 0, cfg.cadencia, decisor, cfg.mixWhatsapp);
    if (!canal) {
      semCanal++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { etapa: 'avaliado', motivo: 'sem canal válido (nem e-mail nem WhatsApp)', atualizado_em: agora }, 'PATCH');
      return;
    }
    const semFato = !!(tese && tese.sem_fato);
    const sinal = semFato ? null : ((tese && sinais.find(s => s.url === tese.fato_url)) || sinais[0] || null);
    if (!semFato && (!sinal || !sinal.url)) {
      semSinal++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, { etapa: 'avaliado', canal, motivo: 'sem sinal público com fonte: precisa de pesquisa manual', atualizado_em: agora }, 'PATCH');
      return;
    }
    const caso = escolherCase(KV, { setor: [empresa.setor, empresa.setor_sugerido, empresa.segmento_detalhe].filter(Boolean).join(' '), sinalTipo: sinal ? sinal.tipo : null, agenciaSlug: agencia.slug });
    const etapa = ETAPA_POR_DIA[est.dia_cadencia || 0] || 'etapa1';

    const caseUsado = tese ? (tese.prova ? (KV.cases_destaque || []).find(c => c.titulo && String(tese.prova).toLowerCase().includes(String(c.titulo).toLowerCase())) || null : null) : caso;
    // Com tese: UMA versão (o ângulo já foi decidido). Na refação, o motivo da
    // reprovação anterior vai junto. Sem tese: as 3 versões por ângulo de antes.
    const angulos = tese ? ['tese'] : cfg.angulos;
    const versaoBase = tese ? (Number(est.refacoes) || 0) : 0;
    const feedback = tese && Number(est.refacoes) > 0 ? String(est.motivo || '').slice(0, 300) : '';
    const resultados = await Promise.all(angulos.map(async (angulo, i) => {
      const { system, user } = construirPromptRedacao({
        dossie: { sinais }, nome: decisor.nome, cargo: decisor.cargo, empresa, agencia, caso: caseUsado,
        etapa: 'D' + (est.dia_cadencia || 0), canal, angulo, sinal, tese, feedback, semFato, contexto: (tese && tese.contexto) || [],
        historicoToques: [], aprendizados: cfg.aprendizados, expressoesProibidas: cfg.proibidas,
        memoria: await memoriaParaPrompt({ setor: empresa.setor || empresa.setor_sugerido, solucao: est.solucao })
      });
      const r = await gerarJSON({ system, user, schema: SCHEMA_MSG, effort: tese ? cfg.effortRedacao : 'medium', model: cfg.modeloRedacao });
      return { angulo, versao: versaoBase + i + 1, ...r };
    }));

    let gravadas = 0;
    for (const r of resultados) {
      custo += r.custo || 0;
      if (!r.obj || !r.obj.corpo) { falhas++; continue; }
      const ok = await sp('crm_sdr_mensagens', {
        estado_id: est.id, sombra: !!est.sombra, rodada: cfg.rodada, decisor_id: est.decisor_id, empresa_id: est.empresa_id, agencia_id: est.agencia_id,
        dossie_id: est.dossie_id, sinal_tipo: sinal ? sinal.tipo : 'sem_fato', sinal_url: sinal ? sinal.url : null, canal, etapa,
        dia_cadencia: est.dia_cadencia || 0, angulo: r.angulo, versao: r.versao,
        assunto: canal === 'email' ? (r.obj.assunto || '') : '', corpo: r.obj.corpo,
        case_titulo: caseUsado ? caseUsado.titulo : null, modelo: r.modelo || MODELO_SDR,
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
  });

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
  if (!(await temChaveLLM())) {
    await logCron('sdr-qualidade', 'aviso', 'fim — pulado', { motivo: 'sem chave da Anthropic (env e Vault)' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'sem chave da Anthropic (env e Vault)' });
  }
  const estados = await sg(`crm_sdr_estado?etapa=eq.redigido&status=eq.ativo&select=id,sombra,decisor_id,empresa_id,agencia_id,canal,dia_cadencia,tese,refacoes,solucao,crm_decisores:decisor_id(nome,cargo),crm_empresas:empresa_id(id,nome,setor),crm_agencias:agencia_id(id,nome,slug),crm_dossies:dossie_id(sinais)&order=atualizado_em.asc&limit=${lote}`);
  if (estados === null) return erroLeitura('sdr-qualidade', res, inicio, 'crm_sdr_estado');
  const cfg = await configSdr();
  const sitQ = await situacaoDoDia(cfg);
  if (!sitQ.orcamento) {
    await logCron('sdr-qualidade', 'aviso', 'fim — pulado', { motivo: 'teto de gasto do modelo no dia', gasto_usd: sitQ.gasto });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'teto de gasto do modelo no dia' });
  }
  const KV = await knowledgeVivo();
  const agora = new Date().toISOString();

  let avaliados = 0, aprovadosAuto = 0, retidos = 0, refeitos = 0, notas = [], custo = 0;
  await emOndas(estados, async (est) => {
    const msgs = await sg(`crm_sdr_mensagens?estado_id=eq.${est.id}&nota_media=is.null&arquivada=eq.false&select=id,assunto,corpo,sinal_url,canal,angulo,versao,case_titulo,etapa,tokens_prompt,tokens_resposta,custo_usd,modelo&order=versao.asc`);
    if (!Array.isArray(msgs) || !msgs.length) return;
    const decisor = est.crm_decisores || {};
    const empresa = est.crm_empresas || {};
    const sinais = (est.crm_dossies && est.crm_dossies.sinais) || [];
    const semFato = !!(est.tese && est.tese.sem_fato);

    const avaliacoes = await Promise.all(msgs.map(async (m) => {
      const { system, user } = construirPromptAvaliacao({ mensagem: m, dossie: { sinais }, empresa, cargo: decisor.cargo, nome: decisor.nome, semFato, contexto: (est.tese && est.tese.contexto) || [] });
      const r = await gerarJSON({ system, user, schema: SCHEMA_AVAL, effort: 'low', model: cfg.modeloQc });
      custo += r.custo || 0;
      const caso = m.case_titulo ? (KV.cases_destaque || []).find(c => c.titulo === m.case_titulo) || null : null;
      const chec = checagensCodigo({ mensagem: m, dossie: { sinais }, caso, decisor, empresa, canal: m.canal, expressoesProibidas: cfg.proibidas, semFato });
      const aval = r.obj || { aderencia: 0, especificidade: 0, naturalidade: 0, clareza: 0, risco: 10, motivo: 'avaliador falhou: ' + (r.erro || '?') };
      const dec = decisao(aval, chec, cfg.notaMinima);
      await sp(`crm_sdr_mensagens?id=eq.${m.id}`, {
        nota_aderencia: aval.aderencia, nota_especificidade: aval.especificidade, nota_naturalidade: aval.naturalidade,
        nota_clareza: aval.clareza, nota_risco: aval.risco, nota_media: dec.nota_media, custo_qc_usd: r.custo || 0,
        aprovado_autonomo: dec.aprovado_autonomo, motivo_qc: (aval.motivo ? aval.motivo + ' || ' : '') + dec.motivo
      }, 'PATCH');
      return { m, dec, aval, chec };
    }));
    avaliados++;

    // Melhor versão: aprovada primeiro, depois maior nota média.
    avaliacoes.sort((a, b) => (Number(b.dec.aprovado_autonomo) - Number(a.dec.aprovado_autonomo)) || (b.dec.nota_media - a.dec.nota_media));
    const melhor = avaliacoes[0];
    // Revisável: 7+ em tudo, risco baixo e checagens ok. Vira RASCUNHO para o Pedro
    // revisar (nunca envio automático: aprovado_autonomo continua exigindo 8).
    // Detalhe de forma (uma palavra a mais no assunto/corpo) não barra rascunho: o Pedro ajusta na revisão.
    const falhasSemForma = ((melhor.chec && melhor.chec.falhas) || []).filter(f => !/^forma:/.test(f));
    const revisavel = !melhor.dec.aprovado_autonomo && decisao(melhor.aval, { ok: falhasSemForma.length === 0, falhas: falhasSemForma }, cfg.notaMinimaRascunho).aprovado_autonomo;
    // Fase 3: com o estrategista, reprovado volta UMA vez para a redação com o
    // motivo do revisor (a tese continua a mesma). Só depois disso fica retido.
    if (!melhor.dec.aprovado_autonomo && !revisavel && cfg.estrategista && est.tese && (Number(est.refacoes) || 0) < cfg.refacoesMax) {
      refeitos++;
      await sp(`crm_sdr_estado?id=eq.${est.id}`, {
        etapa: 'estrategia', refacoes: (Number(est.refacoes) || 0) + 1,
        motivo: (melhor.aval && melhor.aval.motivo ? melhor.aval.motivo + ' | ' : '') + melhor.dec.motivo.slice(0, 300),
        atualizado_em: agora
      }, 'PATCH');
      return;
    }
    notas.push(melhor.dec.nota_media);
    await sp(`crm_sdr_mensagens?id=eq.${melhor.m.id}`, { escolhida: true }, 'PATCH');

    const agencia = est.crm_agencias || {};
    const sinal = sinais.find(s => s.url === melhor.m.sinal_url) || sinais[0] || {};
    const teseTxt = est.tese ? ` · tese: ${String(est.tese.cenario || '').slice(0, 160)} → ${String(est.tese.oportunidade || '').slice(0, 160)} (encaixe ${est.tese.nota_encaixe})` : '';
    const contexto = `${empresa.nome || ''} · ${decisor.nome || ''} · ${decisor.cargo || ''} · nota ${melhor.dec.nota_media} · ` +
      (melhor.dec.aprovado_autonomo ? 'QC aprovado' : revisavel ? 'QC 7+ (revise antes de enviar): ' + melhor.dec.motivo.slice(0, 160) : 'QC retido: ' + melhor.dec.motivo.slice(0, 180)) +
      (semFato ? ' · contexto: ' + ((est.tese && est.tese.contexto) || []).map(c => c.texto).join(' | ').slice(0, 220) : ` · fato: ${(sinal.fato || '').slice(0, 120)} (${sinal.url || 's/fonte'})`) + teseTxt;
    // Sombra: não cria item na fila do Pedro (nada fica disponível para envio).
    // Modo rascunho (Fase 3): o aprovado no QC entra na fila já como 'aprovado',
    // para virar rascunho no Outlook (rascunhos-matinais) e conversa pronta na aba
    // WhatsApp. A aprovação do QC vale para CRIAR o rascunho, nunca para enviar:
    // quem envia é sempre o Pedro (o Piloto continua desligado). Retido não entra.
    const comoAprovado = cfg.modoRascunho && (melhor.dec.aprovado_autonomo || revisavel);
    const tese = est.tese || null;
    const fila = est.sombra || (cfg.modoRascunho && !comoAprovado) ? null : await spRet('crm_fila', {
      agencia_id: est.agencia_id, agencia_slug: agencia.slug || null, empresa_id: est.empresa_id, decisor_id: est.decisor_id,
      canal: melhor.m.canal, etapa: melhor.m.etapa || 'etapa1', status: comoAprovado ? 'aprovado' : 'rascunho',
      aprovado_em: comoAprovado ? agora : null, origem: 'sdr',
      tema: tese ? String(tese.alavanca || '').slice(0, 60) : null,
      etapa_cadencia: ({ 0: 1, 3: 2, 7: 3, 14: 4 })[est.dia_cadencia || 0] || 1,
      assunto: melhor.m.assunto || null, corpo: melhor.m.corpo,
      assunto_original: melhor.m.assunto || null, corpo_original: melhor.m.corpo, solucao: est.solucao || null,
      tokens_prompt: melhor.m.tokens_prompt, tokens_resposta: melhor.m.tokens_resposta, custo_usd: melhor.m.custo_usd,
      modelo: melhor.m.modelo || MODELO_SDR, contexto_para_aprovacao: contexto.slice(0, 900)
    });
    if (melhor.dec.aprovado_autonomo) aprovadosAuto++; else retidos++;
    await sp(`crm_sdr_estado?id=eq.${est.id}`, {
      etapa: (melhor.dec.aprovado_autonomo || revisavel) ? 'rascunho' : 'avaliado',
      fila_id: fila ? fila.id : null,
      motivo: melhor.dec.aprovado_autonomo ? 'QC aprovado (aguarda Piloto ou toque do Pedro)' : revisavel ? 'QC 7+: rascunho para o Pedro revisar' : melhor.dec.motivo.slice(0, 500),
      atualizado_em: agora
    }, 'PATCH');
  });

  const notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
  const ctx = { leads: (estados || []).length, avaliados, aprovados_qc: aprovadosAuto, retidos, refeitos, nota_media: notaMedia, custo_usd: Math.round(custo * 10000) / 10000, ms: Date.now() - inicio };
  await logCron('sdr-qualidade', nivelTrabalho(avaliados), 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}

// ── SDR: job sdr-calibrar-qc (Fase 3) ─────────────────────────────────────────
// Reavalia com um modelo candidato (?modelo=) as mensagens já avaliadas pelo
// Opus e mede a concordância na decisão aprovar/reter. Não grava nada nas
// mensagens: só devolve o resultado e registra em crm_logs. Serve para trocar o
// avaliador por um modelo mais barato sem perder rigor (troca só com >= 90%).
async function jobSdrCalibrarQc(req, res) {
  const inicio = Date.now();
  const modelo = String(req.query.modelo || 'claude-haiku-5-5');
  const lote = Math.max(1, Math.min(40, Number(req.query.lote) || 31));
  const msgs = await sg(`crm_sdr_mensagens?escolhida=eq.true&arquivada=eq.false&nota_media=not.is.null&select=id,assunto,corpo,sinal_url,canal,case_titulo,aprovado_autonomo,decisor_id,crm_sdr_estado:estado_id(crm_decisores:decisor_id(nome,cargo,email,wa),crm_empresas:empresa_id(id,nome,setor),crm_dossies:dossie_id(sinais))&order=criado_em.desc&limit=${lote}`);
  if (msgs === null) return erroLeitura('sdr-calibrar-qc', res, inicio, 'crm_sdr_mensagens');
  const cfg = await configSdr();
  const KV = await knowledgeVivo();
  let iguais = 0, total = 0, custo = 0, falsoAprova = 0, falsoRetem = 0;
  const motivos = {};
  await Promise.all((Array.isArray(msgs) ? msgs : []).map(async (m) => {
    const est = m.crm_sdr_estado || {};
    const decisor = est.crm_decisores || {}; const empresa = est.crm_empresas || {};
    const sinais = (est.crm_dossies && est.crm_dossies.sinais) || [];
    const { system, user } = construirPromptAvaliacao({ mensagem: m, dossie: { sinais }, empresa, cargo: decisor.cargo, nome: decisor.nome });
    const r = await gerarJSON({ system, user, schema: SCHEMA_AVAL, effort: 'low', model: modelo });
    custo += r.custo || 0;
    if (!r.obj) return;
    const caso = m.case_titulo ? (KV.cases_destaque || []).find(c => c.titulo === m.case_titulo) || null : null;
    const chec = checagensCodigo({ mensagem: m, dossie: { sinais }, caso, decisor, empresa, canal: m.canal, expressoesProibidas: cfg.proibidas });
    const dec = decisao(r.obj, chec, cfg.notaMinima);
    total++;
    if (!!dec.aprovado_autonomo === !!m.aprovado_autonomo) iguais++;
    else if (dec.aprovado_autonomo) falsoAprova++;
    else {
      falsoRetem++;
      for (const mm of String(dec.motivo || '').split(' | ')) { const k = mm.replace(/\d+/g, 'N').slice(0, 90); motivos[k] = (motivos[k] || 0) + 1; }
    }
  }));
  const concordancia = total ? Math.round((iguais / total) * 1000) / 10 : null;
  const ctx = { modelo, avaliadas: total, concordancia_pct: concordancia, aprova_o_que_opus_reteve: falsoAprova, retem_o_que_opus_aprovou: falsoRetem, motivos_retencao: Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 8), custo_usd: Math.round(custo * 10000) / 10000, ms: Date.now() - inicio };
  await logCron('sdr-calibrar-qc', 'info', 'fim', ctx);
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
  // Gmail conectado: lê a caixa do Gmail (cursor próprio). Senão, Outlook.
  const gm = await obterTokenGmail({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY }).catch(() => null);
  const t = gm || await obterTokenGraph({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY });
  if (!t) {
    await logCron('sdr-respostas', 'aviso', 'fim — pulado', { motivo: 'nem Gmail nem Outlook conectado' });
    return res.status(200).json({ ok: true, pulado: true, motivo: 'nem Gmail nem Outlook conectado' });
  }
  const chaveCursor = gm ? 'sdr_inbox_cursor_gmail' : 'sdr_inbox_cursor';
  const cur = await sg('crm_configuracoes?chave=eq.' + chaveCursor + '&select=valor&limit=1');
  const desde = (Array.isArray(cur) && cur[0] && typeof cur[0].valor === 'string') ? cur[0].valor : new Date(Date.now() - 2 * 86400000).toISOString();
  const url = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=' + lote +
    '&$orderby=receivedDateTime asc&$select=id,conversationId,subject,from,receivedDateTime,bodyPreview' +
    '&$filter=' + encodeURIComponent('receivedDateTime gt ' + desde);
  let msgs = [];
  if (gm) {
    try {
      const lidas = await lerEntradaGmail(gm.token, { desdeISO: desde, max: lote });
      // Mesmo formato do Graph, para o resto do job não mudar. after: do Gmail é por
      // segundo; o que já foi visto é descartado pela chave única do id.
      msgs = lidas.filter(m => m.recebidoEm > desde).map(m => ({ id: 'gmail:' + m.id, conversationId: m.threadId, subject: m.assunto, from: { emailAddress: { address: m.remetente } }, receivedDateTime: m.recebidoEm, bodyPreview: m.preview }));
    } catch (e) {
      await logCron('sdr-respostas', 'error', 'fim — Gmail recusou a leitura', { erro: String(e.message || e).slice(0, 200) });
      return res.status(502).json({ ok: false, erro: 'gmail_' + (e.status || 'erro') });
    }
  } else try {
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

  if (ultimo !== desde) await spUpsert('crm_configuracoes', { chave: chaveCursor, valor: ultimo }, 'chave');
  // Rascunho enviado pelo Pedro no próprio Gmail (ou marcado como enviado no app):
  // registra o toque e agenda o próximo passo da cadência (D3/D7/D14).
  let envios = null;
  try { envios = await sincronizarEnvios(gm); } catch (e) { envios = { erro: String(e.message || e).slice(0, 200) }; }
  const paraPedro = cont.interesse + cont.indicacao + cont.nao_agora + cont.indefinido + cont.opt_out;
  const ctx = { ...cont, para_o_pedro_ler: paraPedro, envios, ms: Date.now() - inicio };
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
  const estados = await sg(`crm_sdr_estado?etapa=eq.rascunho&status=eq.ativo&sombra=eq.false&data_lote=lte.${data}&select=id,canal,fila_id&order=criado_em.asc&limit=200`);
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
  const devidos = await sg(`crm_sdr_estado?etapa=eq.agendado&status=eq.ativo&sombra=eq.false&agendado_para=lte.${agoraIso}&select=id,decisor_id,empresa_id,agencia_id,agencia_motivo,dossie_id,canal,dia_cadencia,fila_id&order=agendado_para.asc&limit=${lote}`);
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

// ── sdr-vigia: monitor independente do navegador (07h30 BRT, dias úteis) ─────
// Confere se a noite rodou e se as integrações respondem. Havendo falha, grava
// 'error' no crm_logs e deixa UM aviso na pasta Rascunhos do próprio Gmail do
// Pedro (rascunho para ele mesmo: nada é enviado). Uma vez por dia.
async function jobSdrVigia(req, res) {
  const inicio = Date.now();
  const agora = new Date();
  const desde12h = new Date(Date.now() - 12 * 3600000).toISOString();
  const cfgR = await sg('crm_configuracoes?chave=in.(sdr_relogio_ativo,sdr_meta_rascunhos_dia)&select=chave,valor');
  const m = {}; for (const r of (Array.isArray(cfgR) ? cfgR : [])) m[r.chave] = r.valor;
  const relogio = m.sdr_relogio_ativo === true || m.sdr_relogio_ativo === 'true';
  const meta = Number(m.sdr_meta_rascunhos_dia) || 20;
  const problemas = [];
  if (!relogio) problemas.push('O relógio do agente está desligado (sdr_relogio_ativo=false): nada roda de madrugada.');
  const sel = await sg(`crm_logs?origem=eq.cron:sdr-selecao&mensagem=eq.fim&criado_em=gte.${desde12h}&select=contexto,criado_em&order=criado_em.desc&limit=1`);
  if (relogio && !(Array.isArray(sel) && sel.length)) problemas.push('A seleção da noite (23h30) não registrou fim nas últimas 12h: o pg_cron ou a função falhou.');
  const erros = await sg(`crm_logs?nivel=eq.error&criado_em=gte.${desde12h}&origem=neq.cron:sdr-vigia&select=origem,mensagem&order=criado_em.desc&limit=50`);
  const nErros = Array.isArray(erros) ? erros.length : 0;
  if (nErros) {
    const porOrigem = {}; for (const e of erros) porOrigem[e.origem] = (porOrigem[e.origem] || 0) + 1;
    problemas.push(nErros + ' erro(s) nas últimas 12h: ' + Object.entries(porOrigem).map(([o, n]) => o.replace('cron:', '') + ' ×' + n).join(', ') + '.');
  }
  const gm = await obterTokenGmail({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY }).catch(() => null);
  if (!gm) problemas.push('O Gmail não responde (desconectado ou token recusado): nenhum rascunho é criado. Reconecte na aba SDR.');
  if (!(await temChaveLLM())) problemas.push('A chave da Anthropic não está disponível (env e Vault): a redação não roda.');
  const ini = inicioDiaBRT(agora);
  const prod = await sg(`crm_fila?origem=eq.sdr&canal=eq.email&gerado_em=gte.${new Date(new Date(ini).getTime() - 86400000).toISOString()}&apagado_em=is.null&select=id,outlook_message_id,rascunho_erro&limit=500`);
  const lista = Array.isArray(prod) ? prod : [];
  const comRascunho = lista.filter(x => x.outlook_message_id).length;
  const travados = lista.filter(x => !x.outlook_message_id && x.rascunho_erro).length;
  if (travados) problemas.push(travados + ' e-mail(s) aprovados não viraram rascunho no Gmail (erro ao criar).');

  const ctx = { problemas, rascunhos_24h: comRascunho, meta, ms: Date.now() - inicio };
  // Aviso no Gmail: só com problema e só uma vez por dia.
  if (problemas.length && gm) {
    const ja = await sg(`crm_logs?origem=eq.cron:sdr-vigia&mensagem=eq.${encodeURIComponent('fim — alerta no Gmail')}&criado_em=gte.${ini}&select=id&limit=1`);
    if (!(Array.isArray(ja) && ja.length)) {
      try {
        await criarRascunhoGmail(gm.token, { conta: gm.email, para: gm.email, assunto: '⚠ Agente comercial: ' + problemas.length + ' problema(s) esta noite',
          corpo: 'O vigia do agente encontrou:\n\n' + problemas.map(p => '• ' + p).join('\n') + '\n\nRascunhos de e-mail nas últimas 24h: ' + comRascunho + ' (meta ' + meta + ').\nDetalhes na tela Hoje e na Atividade do CRM.\n\n(Este é um aviso para você. Pode apagar este rascunho.)' });
        await logCron('sdr-vigia', 'error', 'fim — alerta no Gmail', ctx);
        return res.status(200).json({ ok: true, alerta: true, ...ctx });
      } catch (e) { ctx.erro_alerta = String(e.message || e).slice(0, 200); }
    }
  }
  await logCron('sdr-vigia', problemas.length ? 'error' : 'info', 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}


// Registra um evento do Gmail uma única vez (índice único gmail_id+tipo).
// Devolve false se já tinha sido aplicado: é a deduplicação de eventos.
async function eventoGmailNovo(gmailId, tipo, filaId, threadId, detalhe) {
  const r = await fetch(SUPA_URL + '/rest/v1/crm_gmail_eventos?on_conflict=gmail_id,tipo', { method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ gmail_id: String(gmailId), tipo, fila_id: filaId || null, thread_id: threadId || null, detalhe: detalhe || null }) });
  if (!r.ok) return false;
  const j = await r.json().catch(() => []);
  return Array.isArray(j) && j.length > 0;
}

// Envio CONFIRMADO pela API do Gmail. Data real; nunca é sobrescrita por estimativa
// (e a real sobrepõe a estimada). Toque, último contato, aprendizado e follow-up.
async function registrarEnvioReal(gm, filaId, { messageId, threadId, enviadoEm, assunto, origem }) {
  const fl = await sg(`crm_fila?id=eq.${filaId}&select=id,status,decisor_id,empresa_id,agencia_id,assunto,corpo,assunto_original,corpo_original,solucao,enviado_real_em,crm_decisores(cargo),crm_empresas(setor,setor_sugerido)`);
  const f = Array.isArray(fl) && fl[0];
  if (!f || f.enviado_real_em) return false;
  const jaEnviado = f.status === 'enviado' || f.status === 'respondido';
  const rows = await spPatchRet(`crm_fila?id=eq.${filaId}&enviado_real_em=is.null`, Object.assign({
    enviado_real_em: enviadoEm, enviado_em: enviadoEm, gmail_message_id: messageId, rascunho_erro: null,
    enviado_obs: 'confirmado pela API do Gmail (' + origem + ')'
  }, threadId ? { thread_ref: threadId } : {}, jaEnviado ? {} : { status: 'enviado' }));
  if (!rows.length) return false;
  if (!jaEnviado) {
    await sp('crm_toques', { decisor_id: f.decisor_id, empresa_id: f.empresa_id, canal: 'email', direcao: 'enviado', assunto: String(assunto || f.assunto || '').slice(0, 500),
      resumo: 'SDR: enviado pelo Gmail (confirmado pela API)', texto_enviado: String(f.corpo || '').slice(0, 4000), data: enviadoEm, fonte: 'sistema', resultado: 'enviado', agencia_id: f.agencia_id ? String(f.agencia_id) : null });
  }
  await sp(`crm_decisores?id=eq.${f.decisor_id}&or=(ultimo_toque_em.is.null,ultimo_toque_em.lt.${enviadoEm})`, { ultimo_toque_em: enviadoEm }, 'PATCH');
  // Aprendizado: o que saiu x o que o agente escreveu.
  try {
    const enviado = await corpoMensagem(gm.token, messageId);
    const orig = { assunto: f.assunto_original || f.assunto, corpo: f.corpo_original || f.corpo };
    const fin = { assunto: assunto || f.assunto, corpo: enviado || f.corpo };
    const diff = analisarEdicao(orig, fin);
    await sp('crm_aprendizado_eventos', {   // índice único parcial: 2º registro do mesmo envio é recusado (409)
 fila_id: f.id, decisor_id: f.decisor_id, empresa_id: f.empresa_id,
      tipo: diff.sem_alteracao ? 'enviado_sem_alteracao' : 'enviado_com_alteracao', original: orig, final: fin, diff,
      contexto: { solucao: f.solucao || null, setor: (f.crm_empresas && (f.crm_empresas.setor || f.crm_empresas.setor_sugerido)) || null, cargo: f.crm_decisores && f.crm_decisores.cargo } });
  } catch (_) { /* aprendizado não bloqueia o registro do envio */ }
  await logCron('gmail-sync', 'info', 'envio confirmado', { fila_id: filaId, gmail_message_id: messageId, origem, enviado_em: enviadoEm, era_estimado: jaEnviado });
  return true;
}

async function aplicarHistoricoGmail(gm, registros, cont) {
  // Conversas rastreadas: rascunhos do agente ainda não confirmados.
  const ab = await sg('crm_fila?origem=eq.sdr&canal=eq.email&outlook_message_id=not.is.null&thread_ref=not.is.null&enviado_real_em=is.null&apagado_em=is.null&select=id,thread_ref,rascunho_criado_em,rascunho_atualizado_em&limit=1000');
  const porThread = new Map((Array.isArray(ab) ? ab : []).map(r => [r.thread_ref, r.id]));
  // Última gravação do PRÓPRIO agente no rascunho (criação ou edição pelo CRM).
  const gravouEm = new Map((Array.isArray(ab) ? ab : []).map(r => [r.id, Math.max(Date.parse(r.rascunho_criado_em || 0) || 0, Date.parse(r.rascunho_atualizado_em || 0) || 0)]));
  const evs = eventosDoHistorico(registros, porThread);
  for (const ev of evs) {
    cont.verificados++;
    if (ev.tipo === 'rascunho_editado') {
      const filaId = porThread.get(ev.threadId);
      // Teste real (26/11): a criação/edição feita pelo próprio agente aparece no
      // histórico como DRAFT novo. Só é edição do Pedro se for depois disso.
      const metaD = await metadadosMensagem(gm.token, ev.messageId).catch(() => null);
      if (!metaD || Date.parse(metaD.data) <= (gravouEm.get(filaId) || 0) + 90000) continue;
      if (await eventoGmailNovo(ev.messageId, 'rascunho_editado', filaId, ev.threadId, { em: metaD.data })) {
        cont.editados_gmail++;
        await sp(`crm_fila?id=eq.${filaId}`, { editado_no_gmail_em: metaD.data }, 'PATCH');
      }
      continue;
    }
    // Enviado: associa pelo Message-ID do agente ou pela conversa do rascunho.
    const meta = await metadadosMensagem(gm.token, ev.messageId).catch(() => null);
    if (!meta || !meta.labelIds.includes('SENT')) continue;
    const pelaHeader = filaIdDoMessageId(meta.messageIdHeader);
    const filaId = pelaHeader || porThread.get(meta.threadId) || null;
    if (!filaId) {
      if (pelaHeader === null && /@agente\.galeriaholding\.crm/i.test(meta.messageIdHeader)) {
        if (await eventoGmailNovo(meta.id, 'sem_associacao', null, meta.threadId, { message_id: meta.messageIdHeader })) cont.sem_associacao++;
      }
      continue;   // e-mail pessoal ou de outra conversa: não é do agente, não é registrado
    }
    if (!(await eventoGmailNovo(meta.id, 'enviado', filaId, meta.threadId, { assunto: meta.assunto, data: meta.data, por: pelaHeader ? 'message-id' : 'conversa' }))) continue;
    if (await registrarEnvioReal(gm, filaId, { messageId: meta.id, threadId: meta.threadId, enviadoEm: meta.data, assunto: meta.assunto, origem: 'history' })) cont.enviados_gmail++;
  }
}

// Reconciliação completa: rascunho por rascunho (o que o histórico não cobre:
// rascunho apagado, envio anterior ao cursor, duplicatas).
async function reconciliarRascunhosGmail(gm, cont, agoraIso) {
  const corte = new Date(Date.now() - 30 * 86400000).toISOString();
  const itens = await sg(`crm_fila?origem=eq.sdr&canal=eq.email&status=in.(aprovado,enviado)&enviado_real_em=is.null&outlook_message_id=not.is.null&rascunho_criado_em=gte.${corte}&apagado_em=is.null&select=id,status,decisor_id,empresa_id,agencia_id,assunto,corpo,outlook_message_id,thread_ref,rascunho_criado_em,crm_decisores(email)&order=rascunho_criado_em.asc&limit=60`);
  for (const it of (Array.isArray(itens) ? itens : [])) {
    if (!ehRascunhoGmail(it.outlook_message_id)) continue;
    const para = it.crm_decisores && it.crm_decisores.email;
    if (!para) continue;
    cont.verificados++;
    // Duplicatas do mesmo item (mesmo Message-ID em mais de um rascunho): só registra.
    try {
      // Mesmo item em mais de um rascunho (boundary com o id da fila): só registra, não apaga.
      const l = await gmailReq('GET', '/drafts?maxResults=10&q=' + encodeURIComponent(consultaRascunho(para, it.assunto)), null, gm.token);
      const meus = [];
      for (const d of ((l && l.drafts) || [])) {
        const det = await gmailReq('GET', '/drafts/' + encodeURIComponent(d.id) + '?format=metadata&metadataHeaders=Content-Type', null, gm.token);
        const ct = (((det.message && det.message.payload && det.message.payload.headers) || []).find(h => String(h.name).toLowerCase() === 'content-type') || {}).value || '';
        if (filaIdDaFronteira(ct) === it.id) meus.push(d.id);
      }
      if (meus.length > 1 && await eventoGmailNovo('dup:' + it.id, 'duplicado', it.id, null, { drafts: meus, no_banco: it.outlook_message_id })) cont.duplicados++;
    } catch (_) {}
    const st = await estadoDoRascunhoGmail(gm.token, { draftId: it.outlook_message_id, para, desdeISO: it.rascunho_criado_em });
    // Conversa do rascunho pode mudar (edição): mantém thread_ref certo para o incremental.
    if (st.estado === 'rascunho' && st.threadId && st.threadId !== it.thread_ref) {
      await sp(`crm_fila?id=eq.${it.id}`, { thread_ref: st.threadId }, 'PATCH'); cont.conversas_corrigidas = (cont.conversas_corrigidas || 0) + 1;
    }
    if (st.estado === 'enviado') {
      if (await eventoGmailNovo(st.messageId, 'enviado', it.id, st.threadId, { assunto: st.assunto, data: st.enviadoEm, por: 'reconciliacao' })
          && await registrarEnvioReal(gm, it.id, { messageId: st.messageId, threadId: st.threadId, enviadoEm: st.enviadoEm, assunto: st.assunto, origem: 'reconciliacao' })) cont.enviados_gmail++;
    } else if (st.estado === 'apagado' && it.status === 'aprovado') {
      const rows = await spPatchRet(`crm_fila?id=eq.${it.id}&status=eq.aprovado`, { status: 'pulado', motivo_pulo: 'rascunho apagado no Gmail' });
      if (!rows.length) continue;
      cont.apagados++;
      await eventoGmailNovo(it.outlook_message_id, 'rascunho_apagado', it.id, null, null);
      await sp(`crm_sdr_estado?fila_id=eq.${it.id}&etapa=eq.rascunho`, { etapa: 'avaliado', motivo: 'rascunho apagado pelo Pedro no Gmail (não enviado); o histórico fica', atualizado_em: agoraIso }, 'PATCH');
    }
  }
}

// ── sdr-aprendizado (diário): eventos → PROPOSTAS na memória comercial ────────
// Nunca ativa nada: o que nasce aqui fica 'proposto' até o Pedro ativar. Se a
// proposta já existe, só atualiza a contagem de evidências (status intocado).
async function jobSdrAprendizado(req, res) {
  const inicio = Date.now();
  const desde = new Date(Date.now() - 180 * 86400000).toISOString();
  const eventos = await sg(`crm_aprendizado_eventos?criado_em=gte.${desde}&select=tipo,motivo,diff,contexto,final&order=criado_em.desc&limit=5000`);
  if (eventos === null) return erroLeitura('sdr-aprendizado', res, inicio, 'crm_aprendizado_eventos');
  const desemp = await sg('crm_agente_desempenho_v?select=*&limit=1000');
  const propostas = propostasDeAprendizado(eventos, { desempenho: Array.isArray(desemp) ? desemp : [] });
  // Perfil de comunicação: só com amostra mínima de mensagens aprovadas/enviadas.
  const finais = eventos.filter(e => (e.tipo === 'enviado_sem_alteracao' || e.tipo === 'enviado_com_alteracao') && e.final).map(e => e.final);
  const perfil = perfilDeComunicacao(finais);
  if (perfil.amostra_suficiente) {
    propostas.push({ chave: 'perfil:estatistico', tipo: 'perfil', escopo: {}, evidencias: perfil.n, evidencia_detalhe: perfil,
      texto: `E-mails que o Pedro enviou: mediana de ${perfil.palavras_mediana} palavras e ${perfil.frases_mediana} frases; assunto com ~${perfil.assunto_palavras_mediana} palavras; ${perfil.termina_com_pergunta_pct}% terminam com uma pergunta; tom ${perfil.formalidade}; ${perfil.adjetivos_por_email} adjetivos de efeito por e-mail.` });
  }
  let novas = 0, atualizadas = 0;
  for (const p of propostas) {
    const ja = await sg(`crm_memoria_comercial?chave=eq.${encodeURIComponent(p.chave)}&select=id,status,evidencias&limit=1`);
    if (Array.isArray(ja) && ja[0]) {
      if (ja[0].evidencias !== p.evidencias) { await sp(`crm_memoria_comercial?id=eq.${ja[0].id}`, { evidencias: p.evidencias, evidencia_detalhe: p.evidencia_detalhe, atualizado_em: new Date().toISOString() }, 'PATCH'); atualizadas++; }
    } else if (await sp('crm_memoria_comercial', { chave: p.chave, tipo: p.tipo, texto: p.texto, escopo: p.escopo || {}, evidencias: p.evidencias, evidencia_detalhe: p.evidencia_detalhe, fonte: 'aprendizado', status: 'proposto' })) novas++;
  }
  const ctx = { eventos: eventos.length, propostas: propostas.length, novas, atualizadas, perfil_amostra: perfil.n, perfil_suficiente: perfil.amostra_suficiente, ms: Date.now() - inicio };
  await logCron('sdr-aprendizado', 'info', novas ? `fim — ${novas} proposta(s) nova(s) para o Pedro revisar` : 'fim', ctx);
  return res.status(200).json({ ok: true, ...ctx });
}


// ── gmail-crm: o CRM se completa pelo Gmail ───────────────────────────────────
// A cada 15 min (07h-22h): lê os e-mails novos (enviados e recebidos), casa com
// contatos/empresas do CRM, registra toques, descobre contatos novos de empresas
// conhecidas, lê a conversa (modelo) e atualiza o status de cada prospecção.
// Pipeline: avanço claro é aplicado (com desfazer); o resto vira sugestão.
// Primeira execução: carga dos últimos 45 dias, em lotes. Depois: History API.
// Só leitura no Gmail. E-mail sem relação com o CRM é ignorado e não é guardado.
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
async function gm_get(token, path) {
  const r = await fetch(GMAIL_API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) { const e = new Error('gmail ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
const hdrV = (hs, n) => ((hs || []).find(x => String(x.name).toLowerCase() === n) || {}).value || '';

// Aplica o estado lido de uma conversa (Gmail ou WhatsApp) na oportunidade da empresa:
// prazo combinado, reunião marcada e avanço de etapa (ou sugestão para o Pedro aprovar).
const FONTE_GMAIL = { nome: 'Gmail', autor: 'agente-gmail', canal: 'email' };
const FONTE_WHATSAPP = { nome: 'WhatsApp', autor: 'agente-whatsapp', canal: 'whatsapp' };
async function aplicarStatusConversa({ empresaId, threadId, ultima, st, dataPP, mensagens, op, respondeu, nomeEmpresa, cont, fonte }) {
    const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    // Prazo combinado no e-mail vira o próximo passo da oportunidade aberta.
    if (aplicarPrazoDoEmail({ dataPP, hojeStr, op, respondeu, ultimaMsgEm: ultima })) {
      const passo = String(st.proximo_passo || st.resumo || '').slice(0, 300);
      if (await sp(`crm_oportunidades?id=eq.${op.id}`, { proximo_passo: passo, proximo_passo_em: dataPP, atualizado_em: new Date().toISOString() }, 'PATCH')) {
        await sp('crm_oportunidade_eventos', { oportunidade_id: op.id, tipo: 'nota', texto: ('Prazo pelo ' + fonte.nome + ': ' + passo + ' até ' + dataPP.split('-').reverse().join('/') + (st.evidencia ? ' — "' + st.evidencia + '"' : '')).slice(0, 600), autor_email: fonte.autor });
        op.proximo_passo = passo; op.proximo_passo_em = dataPP; cont.prazos = (cont.prazos || 0) + 1;
      }
    }
    // Reunião marcada com data: registra (meta semanal e lista de próximas reuniões), uma por empresa e dia.
    if (respondeu && st.sinal === 'reuniao_marcada' && dataPP && dataPP >= hojeStr) {
      const ja = await sg(`crm_toques?empresa_id=eq.${empresaId}&reuniao_em=gte.${dataPP}T00:00:00-03:00&reuniao_em=lte.${dataPP}T23:59:59-03:00&apagado_em=is.null&select=id&limit=1`);
      if (Array.isArray(ja) && !ja.length) {
        const ultimaRec = [...mensagens].reverse().find(x => x.direcao === 'recebido');
        if (await sp('crm_toques', { empresa_id: empresaId, canal: fonte.canal, direcao: 'recebido', assunto: String((ultimaRec && ultimaRec.assunto) || fonte.nome).slice(0, 500),
          resumo: (fonte.nome + ': reunião marcada para ' + dataPP.split('-').reverse().join('/') + ' — ' + (st.resumo || '')).slice(0, 500), data: new Date().toISOString(),
          fonte: 'sistema', resultado: 'reuniao_marcada', reuniao_em: dataPP + 'T00:00:00-03:00' })) cont.reunioes = (cont.reunioes || 0) + 1;
      }
    }
    const dec = decidirPipeline({ sinal: st.sinal, confianca: st.confianca, estagioAtual: op ? op.estagio : null,
      clienteRespondeu: respondeu });
    if (dec.acao === 'nada') { cont.sem_mudanca++; return; }
    const base = { empresa_id: empresaId, thread_id: threadId, sinal: st.sinal, confianca: st.confianca, estagio_para: dec.para,
      resumo: String(st.resumo || '').slice(0, 400), evidencia: String(st.evidencia || '').slice(0, 300), motivo: dec.motivo };
    if (dec.acao === 'sugerir') {
      const linha = Object.assign({ oportunidade_id: op && !dec.nova ? op.id : null, estagio_de: op && !dec.nova ? op.estagio : null, status: 'pendente' }, base);
      // O Pedro já recusou esta mudança para esta empresa nos últimos 30 dias: não insiste.
      const recusada = await sg(`crm_gmail_sugestoes?empresa_id=eq.${empresaId}&status=eq.rejeitada&estagio_para=eq.${encodeURIComponent(dec.para)}&decidido_por=not.like.agente*&decidido_em=gte.${new Date(Date.now() - 30 * 864e5).toISOString()}&select=id&limit=1`);
      if (Array.isArray(recusada) && recusada.length) { cont.sem_mudanca++; return; }
      // Uma pendente por empresa: atualiza a existente em vez de criar outra.
      const pend = await sg(`crm_gmail_sugestoes?empresa_id=eq.${empresaId}&status=eq.pendente&select=id,estagio_para&order=criado_em.desc&limit=1`);
      const atual = Array.isArray(pend) && pend.length ? pend[0] : null;
      if (atual) {
        if (!substituiSugestao(atual, { estagio_para: dec.para })) { cont.sem_mudanca++; return; }
        if (await sp(`crm_gmail_sugestoes?id=eq.${atual.id}`, Object.assign({}, linha, { criado_em: new Date().toISOString() }), 'PATCH')) cont.sugeridas++;
        return;
      }
      if (await spUpsert('crm_gmail_sugestoes', linha, 'empresa_id,thread_id,sinal', true)) cont.sugeridas++;
      return;
    }
    // aplicar/criar: registra antes (índice único impede aplicar duas vezes o mesmo sinal da mesma conversa).
    const reg = await fetch(SUPA_URL + '/rest/v1/crm_gmail_sugestoes?on_conflict=empresa_id,thread_id,sinal', { method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(Object.assign({ oportunidade_id: op ? op.id : null, estagio_de: dec.acao === 'criar' ? null : op.estagio, status: 'aplicada', decidido_em: new Date().toISOString(), decidido_por: fonte.autor }, base)) });
    const regRows = reg.ok ? await reg.json().catch(() => []) : [];
    if (!regRows.length) return;
    let opId = op ? op.id : null;
    if (dec.acao === 'criar') {
      const nova = await spRet('crm_oportunidades', { empresa_id: empresaId, titulo: (nomeEmpresa || 'Empresa') + ': conversa no ' + fonte.nome, estagio: dec.para,
        origem: 'abordagem_direta', proximo_passo: String(st.proximo_passo || st.resumo || '').slice(0, 300), proximo_passo_em: dataPP });
      if (!nova) return;
      opId = nova.id;
      await sp('crm_oportunidade_eventos', { oportunidade_id: opId, tipo: 'criada', para: dec.para, texto: (fonte.nome + ': ' + st.resumo + (st.evidencia ? ' — "' + st.evidencia + '"' : '')).slice(0, 600), autor_email: fonte.autor });
      await sp(`crm_gmail_sugestoes?id=eq.${regRows[0].id}`, { oportunidade_id: opId }, 'PATCH');
    } else {
      await sp(`crm_oportunidades?id=eq.${opId}`, Object.assign({ estagio: dec.para, atualizado_em: new Date().toISOString() },
        !op.proximo_passo && st.proximo_passo ? { proximo_passo: String(st.proximo_passo).slice(0, 300), proximo_passo_em: dataPP } : {}), 'PATCH');
      await sp('crm_oportunidade_eventos', { oportunidade_id: opId, tipo: 'estagio', de: op.estagio, para: dec.para, texto: (fonte.nome + ': ' + st.resumo + (st.evidencia ? ' — "' + st.evidencia + '"' : '')).slice(0, 600), autor_email: fonte.autor });
    }
    // Sugestões pendentes da mesma empresa que esta atualização já cobre saem da lista.
    const cobertas = await sg(`crm_gmail_sugestoes?empresa_id=eq.${empresaId}&status=eq.pendente&select=id,estagio_para`);
    for (const p of (Array.isArray(cobertas) ? cobertas : [])) {
      if (substituiSugestao(p, { estagio_para: dec.para })) await sp(`crm_gmail_sugestoes?id=eq.${p.id}`, { status: 'rejeitada', decidido_em: new Date().toISOString(), decidido_por: fonte.autor, motivo: 'coberta pela atualização automática #' + regRows[0].id }, 'PATCH');
    }
    cont.aplicadas++;
}

// ── whatsapp-crm: o CRM lê as conversas de trabalho do WhatsApp (depósito do Mac) ──
// A cada 15 min: conversas ligadas a uma empresa, com mensagem nova desde a última
// leitura e dos últimos 60 dias. Mesmas regras do Gmail (aplicarStatusConversa):
// prazo combinado, reunião marcada, avanço de etapa claro; o resto vira sugestão.
async function jobWhatsappCrm(req, res) {
  const inicio = Date.now(); const LIMITE = 45000;
  const cont = { conversas_lidas: 0, aplicadas: 0, sugeridas: 0, sem_mudanca: 0, custo_usd: 0 };
  const cfgR = await sg('crm_configuracoes?chave=in.(whatsapp_crm_custo_dia_max_usd,gmail_crm_modelo)&select=chave,valor');
  const cfg = {}; for (const r of (Array.isArray(cfgR) ? cfgR : [])) cfg[r.chave] = r.valor;
  const desde = new Date(Date.now() - 60 * 864e5).toISOString();
  const lista = await sg(`crm_wa_conversas?empresa_id=not.is.null&tipo=eq.pessoa&categoria=eq.trabalho&ultima_em=gte.${desde}&select=jid,nome,empresa_id,decisor_id,ultima_em,analisada_ate&order=ultima_em.desc&limit=200`);
  if (lista === null) return erroLeitura('whatsapp-crm', res, inicio, 'crm_wa_conversas');
  const fila = lista.filter(c => !c.analisada_ate || new Date(c.ultima_em) > new Date(c.analisada_ate));
  const tetoUsd = Number(cfg.whatsapp_crm_custo_dia_max_usd) || 1;
  const logsHoje = await sg(`crm_logs?origem=eq.cron:whatsapp-crm&mensagem=like.fim*&criado_em=gte.${inicioDiaBRT()}&select=contexto&limit=500`);
  let gastoHoje = gastoDosLogs(logsHoje);
  const modelo = typeof cfg.gmail_crm_modelo === 'string' && cfg.gmail_crm_modelo ? cfg.gmail_crm_modelo : MODELO_SDR;
  if (!(await temChaveLLM())) { await logCron('whatsapp-crm', 'aviso', 'fim — sem chave da IA', {}); return res.status(200).json({ ok: true, pulado: true }); }
  const empIds = [...new Set(fila.map(c => c.empresa_id))];
  const nomes = {};
  if (empIds.length) { const ns = await sg(`crm_empresas?id=in.(${empIds.join(',')})&select=id,nome`); for (const e of (Array.isArray(ns) ? ns : [])) nomes[e.id] = e.nome; }
  for (const c of fila) {
    if (gastoHoje >= tetoUsd || Date.now() - inicio > LIMITE) break;
    const ms = await sg(`crm_wa_mensagens?jid=eq.${encodeURIComponent(c.jid)}&enviada_em=gte.${desde}&select=de_mim,texto,midia,enviada_em&order=enviada_em.desc&limit=60`);
    const mensagens = (Array.isArray(ms) ? ms : []).reverse().filter(m => m.texto || m.midia).map(m => ({ direcao: m.de_mim ? 'enviado' : 'recebido', data: m.enviada_em, de: c.nome || 'contato', assunto: '', texto: m.texto || m.midia }));
    if (!mensagens.length) { await sp(`crm_wa_conversas?jid=eq.${encodeURIComponent(c.jid)}`, { analisada_ate: c.ultima_em, analisada_em: new Date().toISOString() }, 'PATCH'); continue; }
    const ops = await sg(`crm_oportunidades?empresa_id=eq.${c.empresa_id}&apagado_em=is.null&select=id,estagio,proximo_passo,proximo_passo_em,atualizado_em&order=atualizado_em.desc.nullslast&limit=5`);
    const abertas = Array.isArray(ops) ? ops : [];
    const op = abertas.find(o => !['Perdido', 'Cliente ativo', 'Pausado'].includes(o.estagio)) || abertas[0] || null;
    const { system, user } = construirPromptStatus({ empresa: nomes[c.empresa_id], estagioAtual: op ? op.estagio : null, mensagens, hoje: new Date().toISOString().slice(0, 10), canal: 'whatsapp' });
    const r = await gerarJSON({ system, user, schema: SCHEMA_STATUS, effort: 'low', model: modelo });
    cont.custo_usd += r.custo || 0; gastoHoje += r.custo || 0;
    if (!r.obj) continue;
    cont.conversas_lidas++;
    const st = r.obj;
    const dataPP = /^\d{4}-\d{2}-\d{2}$/.test(st.data_proximo_passo || '') ? st.data_proximo_passo : null;
    await sp(`crm_wa_conversas?jid=eq.${encodeURIComponent(c.jid)}`, { sinal: st.sinal, confianca: st.confianca, resumo: String(st.resumo || '').slice(0, 400), proximo_passo: String(st.proximo_passo || '').slice(0, 300),
      proximo_passo_em: dataPP, evidencia: String(st.evidencia || '').slice(0, 300), analisada_ate: c.ultima_em, analisada_em: new Date().toISOString() }, 'PATCH');
    const respondeu = mensagens.some(m => m.direcao === 'recebido');
    await aplicarStatusConversa({ empresaId: c.empresa_id, threadId: 'wa:' + c.jid, ultima: c.ultima_em, st, dataPP, mensagens, op, respondeu, nomeEmpresa: nomes[c.empresa_id], cont, fonte: FONTE_WHATSAPP });
  }
  cont.custo_usd = Math.round(cont.custo_usd * 10000) / 10000; cont.pendentes = Math.max(0, fila.length - cont.conversas_lidas); cont.ms = Date.now() - inicio;
  await logCron('whatsapp-crm', cont.aplicadas || cont.sugeridas ? 'aviso' : 'info', cont.aplicadas || cont.sugeridas ? `fim — ${cont.aplicadas} atualização(ões) no pipeline, ${cont.sugeridas} sugestão(ões)` : 'fim', cont);
  return res.status(200).json({ ok: true, ...cont });
}

async function jobGmailCrm(req, res) {
  const inicio = Date.now(); const LIMITE = 48000;
  const gm = await obterTokenGmail({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY }).catch(() => null);
  if (!gm) { await logCron('gmail-crm', 'aviso', 'fim — pulado', { motivo: 'Gmail não conectado' }); return res.status(200).json({ ok: true, pulado: true }); }
  const cfgR = await sg('crm_configuracoes?chave=in.(gmail_crm_history_id,gmail_crm_backfill,gmail_crm_modelo,gmail_crm_custo_dia_max_usd,email_copia)&select=chave,valor');
  const cfg = {}; for (const r of (Array.isArray(cfgR) ? cfgR : [])) cfg[r.chave] = r.valor;
  const proprios = new Set([String(gm.email || '').toLowerCase(), typeof cfg.email_copia === 'string' ? cfg.email_copia.toLowerCase() : ''].filter(Boolean));

  // Índice do CRM (contatos por e-mail; empresas por domínio).
  const decs = await sg('crm_decisores?apagado_em=is.null&email=not.is.null&select=id,nome,email,empresa_id,ultimo_toque_em&limit=10000');
  const emps = await sg('crm_empresas?apagado_em=is.null&or=(dominio.not.is.null,website.not.is.null)&select=id,nome,dominio,website&limit=5000');
  if (decs === null || emps === null) return erroLeitura('gmail-crm', res, inicio, 'índice do CRM');
  const indice = montarIndice({ decisores: decs, empresas: emps });
  const nomeEmp = {}; for (const e of emps) nomeEmp[e.id] = e.nome;

  // Mensagens a processar: carga inicial (lista paginada) ou histórico.
  let ids = []; let modo; let novoCursor = null; let backfill = cfg.gmail_crm_backfill && typeof cfg.gmail_crm_backfill === 'object' ? cfg.gmail_crm_backfill : null;
  const cursor = typeof cfg.gmail_crm_history_id === 'string' ? cfg.gmail_crm_history_id : null;
  if (!cursor || (backfill && !backfill.fim)) {
    modo = 'carga_inicial';
    if (!backfill) { const p = await perfilGmail(gm.token); backfill = { inicio_history_id: p.historyId, pageToken: null, fim: false, lidas: 0 }; }
    const q = 'newer_than:45d (in:inbox OR in:sent) -category:promotions -category:social -category:updates -category:forums';
    backfill.paginaAtual = backfill.pageToken || null;   // para retomar a MESMA página se esta execução não terminar
    const l = await gm_get(gm.token, '/messages?maxResults=60&q=' + encodeURIComponent(q) + (backfill.pageToken ? '&pageToken=' + encodeURIComponent(backfill.pageToken) : ''));
    ids = (l.messages || []).map(m => m.id);
    backfill.pageToken = l.nextPageToken || null;
    if (!l.nextPageToken) { backfill.fim = true; novoCursor = backfill.inicio_history_id; }
  } else {
    modo = 'incremental';
    const h = await historicoGmail(gm.token, cursor);
    if (h.expirado) {   // muito tempo parado: recomeça a carga (eventos já vistos são ignorados)
      await spUpsert('crm_configuracoes', { chave: 'gmail_crm_backfill', valor: null }, 'chave');
      await spUpsert('crm_configuracoes', { chave: 'gmail_crm_history_id', valor: null }, 'chave');
      await logCron('gmail-crm', 'aviso', 'fim — histórico expirado, recomeça a carga', null);
      return res.status(200).json({ ok: true, historico_expirado: true });
    }
    const vistos = new Set();
    for (const reg of h.registros) for (const x of (reg.messagesAdded || [])) {
      const m = x.message || {}; const lb = m.labelIds || [];
      if (lb.includes('DRAFT') || !(lb.includes('INBOX') || lb.includes('SENT'))) continue;
      if (!vistos.has(m.id)) { vistos.add(m.id); ids.push(m.id); }
    }
    novoCursor = h.historyId;
  }

  // O que o fluxo do SDR já registra (não duplicar toque).
  const sdrFila = await sg('crm_fila?origem=eq.sdr&thread_ref=not.is.null&select=thread_ref&limit=5000');
  const threadsSdr = new Set((Array.isArray(sdrFila) ? sdrFila : []).map(r => r.thread_ref));
  // Respostas de quem está no fluxo do SDR são registradas pelo leitor de respostas do SDR.
  const noSdr = await sg('crm_sdr_estado?sombra=eq.false&select=decisor_id&limit=20000');
  const decisoresSdr = new Set((Array.isArray(noSdr) ? noSdr : []).map(r => r.decisor_id));

  const cont = { modo, mensagens: ids.length, do_crm: 0, toques: 0, contatos_novos: 0, conversas_lidas: 0, aplicadas: 0, sugeridas: 0, sem_mudanca: 0, custo_usd: 0 };
  const conversas = new Map();   // empresa|thread → { empresa_id, threadId, ultima, direcao }
  let completo = true;
  for (const id of ids) {
    if (Date.now() - inicio > LIMITE * 0.6) { completo = false; break; }
    let d; try { d = await gm_get(gm.token, '/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject'); } catch (_) { continue; }
    const hs = (d.payload && d.payload.headers) || [];
    const meta = { labelIds: d.labelIds || [], de: hdrV(hs, 'from'), para: hdrV(hs, 'to'), cc: hdrV(hs, 'cc') };
    if (meta.labelIds.includes('DRAFT')) continue;
    const m = casarMensagem(meta, indice, proprios);
    if (!m) continue;
    if (!(await eventoGmailNovo(d.id, 'crm_msg', null, d.threadId, { direcao: m.direcao, empresas: m.empresaIds }))) continue;   // já processada
    cont.do_crm++;
    const data = new Date(Number(d.internalDate || Date.now())).toISOString();
    const assunto = hdrV(hs, 'subject');
    // Contato novo de empresa conhecida: entra no CRM (fora da cadência: a conversa já é do Pedro).
    for (const nv of m.novos) {
      if (indice.porEmail.has(nv.email)) { m.decisores.push(indice.porEmail.get(nv.email)); continue; }
      const novo = await spRet('crm_decisores', { empresa_id: nv.empresa_id, nome: String(nv.nome || nv.email).slice(0, 120), email: nv.email, email_valido: true,
        fonte: 'gmail', status: 'ativo', etapa_cadencia: 'off', observacoes: 'Descoberto no Gmail em ' + data.slice(0, 10) + ' (conversa com o Pedro)' });
      if (novo) { indice.porEmail.set(nv.email, novo); m.decisores.push(novo); cont.contatos_novos++; }
    }
    const jaDoSdr = m.direcao === 'enviado' && threadsSdr.has(d.threadId);
    for (const dc of m.decisores) {
      if (jaDoSdr) continue;
      if (m.direcao === 'recebido' && decisoresSdr.has(dc.id)) continue;   // o leitor de respostas do SDR registra
      if (await sp('crm_toques', { decisor_id: dc.id, empresa_id: dc.empresa_id, canal: 'email', direcao: m.direcao, assunto: String(assunto).slice(0, 500),
        resumo: ('Gmail: ' + String(d.snippet || '')).slice(0, 500), data, fonte: 'sistema', resultado: m.direcao === 'recebido' ? 'resposta' : 'enviado' })) cont.toques++;
      await sp(`crm_decisores?id=eq.${dc.id}&or=(ultimo_toque_em.is.null,ultimo_toque_em.lt.${data})`, Object.assign({ ultimo_toque_em: data }, m.direcao === 'recebido' ? { respondeu: true } : {}), 'PATCH');
    }
    for (const empId of m.empresaIds) {
      const k = empId + '|' + d.threadId; const atual = conversas.get(k);
      if (!atual || atual.ultima < data) conversas.set(k, { empresa_id: empId, threadId: d.threadId, ultima: data, direcao: m.direcao });
    }
  }

  // Status de cada prospecção: lê a conversa (só as que tiveram mensagem nova).
  const tetoUsd = Number(cfg.gmail_crm_custo_dia_max_usd) || 1;
  const logsHoje = await sg(`crm_logs?origem=eq.cron:gmail-crm&mensagem=like.fim*&criado_em=gte.${inicioDiaBRT()}&select=contexto&limit=500`);
  let gastoHoje = gastoDosLogs(logsHoje);
  const modelo = typeof cfg.gmail_crm_modelo === 'string' && cfg.gmail_crm_modelo ? cfg.gmail_crm_modelo : MODELO_SDR;
  const temLLM = await temChaveLLM();
  // Conversas que uma execução anterior não conseguiu ler (tempo, teto de custo, falha
  // do modelo) ficam com sinal vazio: entram de novo aqui, depois das novas.
  const pendentes = await sg(`crm_gmail_status?sinal=is.null&thread_id=not.is.null&select=empresa_id,thread_id,ultima_mensagem_em,ultima_direcao&order=ultima_mensagem_em.desc.nullslast&limit=15`);
  for (const p of (Array.isArray(pendentes) ? pendentes : [])) {
    const k = p.empresa_id + '|' + p.thread_id;
    if (![...conversas.values()].some(c => c.empresa_id === p.empresa_id)) conversas.set(k, { empresa_id: p.empresa_id, threadId: p.thread_id, ultima: p.ultima_mensagem_em, direcao: p.ultima_direcao });
  }
  // Empresa casada pelo e-mail do contato (sem domínio cadastrado) não está em nomeEmp:
  // busca o nome (teste real 26/11: oportunidade aberta como "Empresa: conversa no Gmail").
  const semNome = [...new Set([...conversas.values()].map(c => c.empresa_id).filter(id => id && !nomeEmp[id]))];
  if (semNome.length) {
    const ns = await sg(`crm_empresas?id=in.(${semNome.join(',')})&select=id,nome`);
    for (const e of (Array.isArray(ns) ? ns : [])) nomeEmp[e.id] = e.nome;
  }
  for (const c of conversas.values()) {
    await spUpsert('crm_gmail_status', { empresa_id: c.empresa_id, ultima_mensagem_em: c.ultima, ultima_direcao: c.direcao, thread_id: c.threadId, atualizado_em: new Date().toISOString() }, 'empresa_id');
    if (!temLLM || gastoHoje >= tetoUsd || Date.now() - inicio > LIMITE) { completo = completo && true; continue; }
    let th; try { th = await gm_get(gm.token, '/threads/' + c.threadId + '?format=full'); } catch (_) { continue; }
    const mensagens = (th.messages || []).filter(x => !(x.labelIds || []).includes('DRAFT')).map(x => {
      const h2 = (x.payload && x.payload.headers) || [];
      return { direcao: (x.labelIds || []).includes('SENT') ? 'enviado' : 'recebido', data: new Date(Number(x.internalDate || 0)).toISOString(), de: hdrV(h2, 'from'), assunto: hdrV(h2, 'subject'), texto: semCitacao(textoDoPayload(x.payload)) };
    });
    const ops = await sg(`crm_oportunidades?empresa_id=eq.${c.empresa_id}&apagado_em=is.null&select=id,estagio,proximo_passo,proximo_passo_em,atualizado_em&order=atualizado_em.desc.nullslast&limit=5`);
    const abertas = (Array.isArray(ops) ? ops : []);
    const op = abertas.find(o => !['Perdido', 'Cliente ativo', 'Pausado'].includes(o.estagio)) || abertas[0] || null;
    const { system, user } = construirPromptStatus({ empresa: nomeEmp[c.empresa_id], estagioAtual: op ? op.estagio : null, mensagens, hoje: new Date().toISOString().slice(0, 10) });
    const r = await gerarJSON({ system, user, schema: SCHEMA_STATUS, effort: 'low', model: modelo });
    cont.custo_usd += r.custo || 0; gastoHoje += r.custo || 0;
    if (!r.obj) continue;
    cont.conversas_lidas++;
    const st = r.obj;
    const dataPP = /^\d{4}-\d{2}-\d{2}$/.test(st.data_proximo_passo || '') ? st.data_proximo_passo : null;
    await spUpsert('crm_gmail_status', { empresa_id: c.empresa_id, sinal: st.sinal, confianca: st.confianca, resumo: String(st.resumo || '').slice(0, 400),
      proximo_passo: String(st.proximo_passo || '').slice(0, 300), proximo_passo_em: dataPP, evidencia: String(st.evidencia || '').slice(0, 300),
      thread_id: c.threadId, ultima_mensagem_em: c.ultima, ultima_direcao: c.direcao, atualizado_em: new Date().toISOString() }, 'empresa_id');
    const respondeu = respostaReal(mensagens, proprios);
    await aplicarStatusConversa({ empresaId: c.empresa_id, threadId: c.threadId, ultima: c.ultima, st, dataPP, mensagens, op, respondeu, nomeEmpresa: nomeEmp[c.empresa_id], cont, fonte: FONTE_GMAIL });
  }

  // Cursor só avança se tudo foi processado (senão a próxima execução retoma).
  if (modo === 'carga_inicial') {
    if (completo) backfill.lidas = (backfill.lidas || 0) + ids.length;
    if (!completo) { backfill.fim = false; backfill.pageToken = backfill.paginaAtual; }   // eventos já vistos são pulados (dedup)
    await spUpsert('crm_configuracoes', { chave: 'gmail_crm_backfill', valor: backfill }, 'chave');
    if (backfill.fim && completo && novoCursor) await spUpsert('crm_configuracoes', { chave: 'gmail_crm_history_id', valor: novoCursor }, 'chave');
  } else if (completo && novoCursor) {
    await spUpsert('crm_configuracoes', { chave: 'gmail_crm_history_id', valor: novoCursor }, 'chave');
  }
  cont.custo_usd = Math.round(cont.custo_usd * 10000) / 10000; cont.completo = completo; cont.ms = Date.now() - inicio;
  await logCron('gmail-crm', cont.aplicadas || cont.sugeridas ? 'aviso' : 'info', cont.aplicadas || cont.sugeridas ? `fim — ${cont.aplicadas} atualização(ões) no pipeline, ${cont.sugeridas} sugestão(ões)` : 'fim', cont);
  return res.status(200).json({ ok: true, ...cont });
}

// ── job: classificar-setores ─────────────────────────────────────────────────
// Põe cada empresa num setor da lista única (crm_empresas.setor_canonico). Primeiro
// o que o setor antigo já diz (de graça); o resto vai para a IA em lotes de 60.
// Idempotente: só pega quem ainda não tem setor_canonico. Não mexe no setor original.
async function jobClassificarSetores(req, res) {
  const inicio = Date.now(); const LIMITE = 38000;
  const cont = { pelo_setor_antigo: 0, pela_ia: 0, lotes: 0, custo_usd: 0, restantes: null };
  const agora = new Date().toISOString();
  // 1) Setor antigo que já diz algo: uma gravação por setor (não por empresa).
  const antigos = await sg('crm_empresas?setor_canonico=is.null&apagado_em=is.null&setor=not.is.null&select=setor&limit=5000');
  if (antigos === null) return erroLeitura('classificar-setores', res, inicio, 'crm_empresas');
  const grupos = {};
  for (const r of antigos) { const c = setorDoAntigo(r.setor); if (c) (grupos[c] = grupos[c] || new Set()).add(r.setor); }
  await Promise.all(Object.entries(grupos).map(async ([canon, vals]) => {
    const lista = [...vals].map(v => '"' + String(v).replace(/"/g, '\\"') + '"').join(',');
    const out = await spPatchRet(`crm_empresas?setor_canonico=is.null&apagado_em=is.null&setor=in.(${encodeURIComponent(lista)})`,
      { setor_canonico: canon, setor_confianca: 'alta', setor_fonte: 'setor_existente', classificado_em: agora });
    cont.pelo_setor_antigo += out.length;
  }));
  // 2) O resto pela IA: lotes de 40, três em paralelo por rodada, até o tempo acabar.
  const rows = await sg('crm_empresas?setor_canonico=is.null&apagado_em=is.null&select=id,nome,setor,segmento_detalhe,dominio,website,site&order=criado_em.desc&limit=360');
  const paraIA = (Array.isArray(rows) ? rows : []).map(e => ({ id: e.id, nome: e.nome, setor: e.setor, segmento_detalhe: e.segmento_detalhe, site: e.dominio || e.website || e.site }));
  const modelo = 'claude-sonnet-5-5';
  const lotes = []; for (let i = 0; i < paraIA.length; i += 40) lotes.push(paraIA.slice(i, i + 40));
  for (let i = 0; i < lotes.length && Date.now() - inicio < LIMITE - 20000; i += 3) {
    const rodada = lotes.slice(i, i + 3);
    const resps = await Promise.all(rodada.map(lote => { const { system, user } = promptSetores(lote); return gerarJSON({ system, user, schema: SCHEMA_SETORES, effort: 'low', model: modelo }); }));
    const grav = [];
    resps.forEach((r, k) => {
      cont.lotes++; cont.custo_usd += r.custo || 0;
      const ids = new Set(rodada[k].map(x => x.id));
      for (const it of ((r.obj && r.obj.itens) || [])) {
        const setor = setorValido(it.setor);
        if (setor && ids.has(it.id)) grav.push({ id: it.id, setor, confianca: it.confianca });
      }
    });
    for (let j = 0; j < grav.length; j += 20) {
      const ok = await Promise.all(grav.slice(j, j + 20).map(g => sp(`crm_empresas?id=eq.${g.id}`, { setor_canonico: g.setor, setor_confianca: g.confianca, setor_fonte: 'ia', classificado_em: new Date().toISOString() }, 'PATCH')));
      cont.pela_ia += ok.filter(Boolean).length;
    }
  }
  const resto = await sg('crm_empresas?setor_canonico=is.null&apagado_em=is.null&select=id&limit=3000');
  cont.restantes = Array.isArray(resto) ? resto.length : null;
  cont.custo_usd = Math.round(cont.custo_usd * 10000) / 10000; cont.ms = Date.now() - inicio;
  await logCron('classificar-setores', nivelTrabalho(cont.pelo_setor_antigo + cont.pela_ia), 'fim', cont);
  return res.status(200).json({ ok: true, ...cont });
}

// ── job: blitz-redacao ───────────────────────────────────────────────────────
// Escreve, para cada contato da lista da blitz, um e-mail e um WhatsApp (lib/blitz.js)
// e põe na crm_fila como RASCUNHO (origem 'blitz'). Nada é enviado: o Pedro revisa,
// aprova, o rascunho vai para o Gmail e o envio é clique dele.
// Uma blitz por vez, com trava (lease_ate) para duas execuções não escreverem juntas;
// o índice único (blitz, contato, canal) impede mensagem duplicada mesmo assim.
async function jobBlitzRedacao(req, res) {
  const inicio = Date.now(); const LIMITE = 40000;
  const cont = { escritos: 0, pulados: 0, revisar: 0, custo_usd: 0 };
  const agora = new Date();
  const abertas = await sg('crm_blitz?status=eq.escrevendo&apagado_em=is.null&select=*&order=criado_em.asc&limit=1');
  if (abertas === null) return erroLeitura('blitz-redacao', res, inicio, 'crm_blitz');
  const bz = abertas[0];
  if (!bz) return res.status(200).json({ ok: true, nada: true });
  // Trava: só segue quem conseguir marcar a blitz por 55 s.
  const pego = await spPatchRet(`crm_blitz?id=eq.${bz.id}&or=(lease_ate.is.null,lease_ate.lt.${agora.toISOString()})`, { lease_ate: new Date(Date.now() + 55000).toISOString() });
  if (!pego.length) return res.status(200).json({ ok: true, ocupado: true });

  const itens = await sg(`crm_lista_itens?lista_id=eq.${bz.lista_id}&select=decisor_id,crm_decisores(id,nome,cargo,email,wa,opt_out,status,empresa_id,crm_empresas(id,nome,setor,setor_canonico,dominio,website,site,apagado_em))&limit=2000`);
  const feitos = await sg(`crm_fila?blitz_id=eq.${bz.id}&select=decisor_id,canal&limit=5000`);
  if (itens === null || feitos === null) return erroLeitura('blitz-redacao', res, inicio, 'lista/fila');
  const jaTem = new Set(feitos.map(f => f.decisor_id + '|' + f.canal));
  const canais = Array.isArray(bz.canais) && bz.canais.length ? bz.canais : ['email', 'whatsapp'];
  const blRows = await sg('crm_blocklist?ativo=eq.true&apagado_em=is.null&select=nome_canonico,aliases,dominios,grupo_economico,ativo&limit=2000');
  const blocklist = makeBlocklist(blRows || []);
  const KV = await knowledgeVivo();
  const agencias = KV.agencias || [];
  const agRow = bz.agencia_id ? await sg(`crm_agencias?id=eq.${bz.agencia_id}&select=slug,nome&limit=1`) : null;
  const slug = Array.isArray(agRow) && agRow[0] ? agRow[0].slug : 'holding';
  const agencia = agencias.find(a => a.slug === slug) || { nome: (Array.isArray(agRow) && agRow[0] && agRow[0].nome) || 'Galeria Holding' };
  const holding = agencias.find(a => a.slug === 'holding') || null;
  const modelo = MODELO_SDR;

  // Quem ainda falta: contato válido, empresa ativa, não bloqueado, e algum canal pedido que ele tenha e ainda não foi escrito.
  const pendentes = []; let invalidos = 0;
  for (const it of itens) {
    const d = it.crm_decisores; const e = d && d.crm_empresas;
    const canaisDele = canais.filter(c => (c === 'email' ? !!d?.email : !!d?.wa) && !jaTem.has(d.id + '|' + c));
    if (!d || !e || e.apagado_em || d.opt_out || ['saiu_da_empresa', 'invalido'].includes(d.status)) { invalidos++; continue; }
    if (blocklist.isBlocked({ name: e.nome, domain: e.dominio || e.website || e.site, email: d.email })) { invalidos++; continue; }
    if (!canais.some(c => c === 'email' ? d.email : d.wa)) { invalidos++; continue; }
    if (canaisDele.length) pendentes.push({ d, e, canaisDele });
  }

  async function escrever(p) {
    const setor = p.e.setor_canonico || p.e.setor || '';
    const memoria = await memoriaParaPrompt({ setor });
    const { system, user } = construirPromptBlitz({ tema: bz.tema, agencia, holding, cases: casesDoSetor(KV.cases_destaque, setor), memoria,
      contato: p.d, empresa: { nome: p.e.nome, setor, site: p.e.dominio || p.e.website || p.e.site } });
    let r = await gerarJSON({ system, user, schema: SCHEMA_BLITZ, effort: 'low', model: modelo });
    let custo = r.custo || 0;
    let problemas = checarMensagem(r.obj);
    if (problemas.length && r.obj) {   // uma segunda tentativa, dizendo o que corrigir
      const r2 = await gerarJSON({ system, user: user + '\n\nCORRIJA: ' + problemas.join('; '), schema: SCHEMA_BLITZ, effort: 'low', model: modelo });
      custo += r2.custo || 0;
      const p2 = checarMensagem(r2.obj);
      if (r2.obj && p2.length < problemas.length) { r = r2; problemas = p2; }
    }
    cont.custo_usd += custo;
    if (!r.obj) { cont.pulados++; return; }
    const aviso = problemas.length ? ' ⚠ revisar: ' + problemas.join('; ') : '';
    if (aviso) cont.revisar++;
    const base = { decisor_id: p.d.id, empresa_id: p.e.id, status: 'rascunho', origem: 'blitz', blitz_id: bz.id, etapa_cadencia: 1, etapa: 'blitz',
      agencia_id: bz.agencia_id || null, agencia_slug: slug, modelo: r.modelo || modelo, custo_usd: Math.round(custo / p.canaisDele.length * 10000) / 10000,
      contexto_para_aprovacao: ('Blitz "' + bz.nome + '" · ' + (r.obj.gancho || '') + aviso).slice(0, 500), gerado_em: new Date().toISOString() };
    for (const canal of p.canaisDele) {
      const linha = canal === 'email'
        ? Object.assign({}, base, { canal, assunto: String(r.obj.assunto).slice(0, 200), corpo: String(r.obj.email).slice(0, 4000) })
        : Object.assign({}, base, { canal, assunto: null, corpo: String(r.obj.whatsapp).slice(0, 2000) });
      if (await sp('crm_fila', linha)) cont.escritos++;   // duplicata: o índice único recusa (409) e nada muda
    }
  }
  for (let i = 0; i < pendentes.length && Date.now() - inicio < LIMITE - 18000; i += 4) {
    await Promise.all(pendentes.slice(i, i + 4).map(p => escrever(p).catch(() => { cont.pulados++; })));
  }

  const depois = await sg(`crm_fila?blitz_id=eq.${bz.id}&select=decisor_id&limit=5000`);
  const contatosEscritos = new Set((Array.isArray(depois) ? depois : []).map(x => x.decisor_id)).size;
  const terminou = pendentes.length === 0 || contatosEscritos + invalidos >= (bz.total || 0) ||
    (Date.now() - new Date(bz.criado_em).getTime() > 3 * 3600e3);   // passa de 3 h: encerra com o que tem
  await sp(`crm_blitz?id=eq.${bz.id}`, { escritos: contatosEscritos, pulados: invalidos, custo_usd: Math.round(((Number(bz.custo_usd) || 0) + cont.custo_usd) * 10000) / 10000,
    status: terminou ? 'pronta' : 'escrevendo', lease_ate: null, atualizado_em: new Date().toISOString() }, 'PATCH');
  cont.custo_usd = Math.round(cont.custo_usd * 10000) / 10000; cont.terminou = terminou; cont.ms = Date.now() - inicio;
  await logCron('blitz-redacao', nivelTrabalho(cont.escritos), 'fim', Object.assign({ blitz_id: bz.id }, cont));
  return res.status(200).json({ ok: true, ...cont });
}

// ── job: movimentacoes / movimentacoes-lusha ─────────────────────────────────
// Quem assumiu como CMO / diretor(a) de marketing no Brasil. 'imprensa' (todo dia):
// Google News RSS; 'lusha' (segunda): sinais de promoção/troca de empresa. Cada
// movimentação nova vira contato e, com e-mail, RASCUNHO de parabéns no Gmail no
// estilo do Pedro (lib/estilo.js). Nada é enviado. Roda em várias passadas de até
// 45 s: a 1ª do dia busca as fontes; as seguintes processam o que ficou pendente.
async function jobMovimentacoes(req, res, modo) {
  const inicio = Date.now(); const LIMITE = 45000;
  const cont = { modo, itens: 0, extraidos: 0, novas: 0, processadas: 0, rascunhos: 0, sem_email: 0, descartadas: 0, lusha_creditos: 0, custo_usd: 0, erros: [] };
  const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const cfgR = await sg('crm_configuracoes?chave=in.(movimentacoes_ultima_busca,movimentacoes_lusha_ultima,movimentacoes_vistos,lusha_daily_limit,lusha_creditos_dia)&select=chave,valor');
  const cfg = {}; for (const r of (Array.isArray(cfgR) ? cfgR : [])) cfg[r.chave] = r.valor;

  // 1) Buscar fontes (uma vez por dia na imprensa; uma vez por semana no Lusha).
  const novas = [];
  if (modo === 'imprensa' && cfg.movimentacoes_ultima_busca !== hojeStr) {
    const listas = await Promise.all(CONSULTAS_IMPRENSA.map(q => fetch(urlImprensa(q), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) })
      .then(r => r.ok ? r.text() : '').then(lerRss).catch(() => [])));
    const vistos = new Set(Array.isArray(cfg.movimentacoes_vistos) ? cfg.movimentacoes_vistos : []);
    const chaveT = (t) => String(t).toLowerCase().replace(/\s+-\s+[^-]+$/, '').slice(0, 90);
    const itens = juntarItens(listas).filter(i => !vistos.has(chaveT(i.titulo))).slice(0, 120);
    cont.itens = itens.length;
    for (let i = 0; i < itens.length; i += 60) {
      const lote = itens.slice(i, i + 60);
      const { system, user } = promptExtracao(lote);
      const r = await gerarJSON({ system, user, schema: SCHEMA_EXTRACAO, effort: 'low', model: 'claude-sonnet-5-5' });
      cont.custo_usd += r.custo || 0;
      for (const m of ((r.obj && r.obj.movimentos) || [])) {
        const it = lote[m.item] || {};
        novas.push(Object.assign({}, m, { fonte: 'imprensa', veiculo: it.fonte || '', titulo: it.titulo || '', url: it.url || '', publicado_em: it.data ? new Date(it.data).toISOString() : null }));
      }
    }
    const todos = [...vistos, ...itens.map(i => chaveT(i.titulo))].slice(-800);
    await upsertConfig('movimentacoes_vistos', todos);
    await upsertConfig('movimentacoes_ultima_busca', hojeStr);
  }
  if (modo === 'lusha' && cfg.movimentacoes_lusha_ultima !== hojeStr && LUSHA_KEY) {
    const desde = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
    const cargos = ['CMO', 'Chief Marketing Officer', 'Diretor de Marketing', 'Diretora de Marketing', 'Marketing Director', 'Head de Marketing', 'Head of Marketing', 'VP de Marketing', 'Diretor de Marca'];
    const corpos = [
      { filters: { contacts: { include: { jobTitles: cargos, locations: [{ country: 'Brazil' }], signals: { types: ['promotion', 'companyChange'], startDate: desde } } } }, pagination: { page: 0, size: 25 } },
      { filters: { contacts: { include: { jobTitles: cargos, countries: ['BR'], signals: { names: ['promotion', 'companyChange'], startDate: desde } } } }, pagination: { page: 0, size: 25 } }
    ];
    let contatos = null;
    for (const corpo of corpos) {
      const r = await fetch('https://api.lusha.com/v3/contacts/prospecting', { method: 'POST', headers: { api_key: LUSHA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
      if (r.ok) { const j = await r.json().catch(() => ({})); contatos = j.contacts || j.data || j.results || []; cont.lusha_creditos += (j.billing && j.billing.creditsCharged) || 0; break; }
      cont.erros.push('lusha ' + r.status + ': ' + String(await r.text()).slice(0, 160));
    }
    for (const c of (contatos || [])) {
      const pessoa = [c.firstName, c.lastName].filter(Boolean).join(' ');
      novas.push({ pessoa, cargo: (c.jobTitle && c.jobTitle.title) || '', empresa: (c.company && c.company.name) || '', cargo_anterior: '', empresa_anterior: '',
        trajetoria: '', feitos: '', fonte: 'lusha', veiculo: 'Lusha (sinal: ' + ((c.signalTypes || []).join(', ') || 'troca de cargo') + ')', titulo: '', url: (c.socialLinks && c.socialLinks.linkedin) || '',
        dominio: c.company && c.company.domain ? String(c.company.domain).replace(/^www\./, '') : null, linkedin: (c.socialLinks && c.socialLinks.linkedin) || null });
    }
    if (contatos) await upsertConfig('movimentacoes_lusha_ultima', hojeStr);
    if (cont.lusha_creditos) { const sd = saldoDoDia(cfg.lusha_creditos_dia, hojeStr, 0); await upsertConfig('lusha_creditos_dia', { data: hojeStr, usados: sd.usados + cont.lusha_creditos }); }
  }
  cont.extraidos = novas.length;
  // Grava as movimentações novas (a chave única impede repetir a mesma pessoa+empresa).
  for (const m of novas) {
    if (!m.pessoa || String(m.pessoa).trim().split(/\s+/).length < 2 || !m.empresa || !ehCargoAlvo(m.cargo) || ehAgencia(m.empresa)) continue;
    const linha = { chave: chaveMovimento(m.pessoa, m.empresa), pessoa: m.pessoa.trim(), cargo: m.cargo, empresa: m.empresa, cargo_anterior: m.cargo_anterior || null, empresa_anterior: m.empresa_anterior || null,
      trajetoria: m.trajetoria || null, feitos: m.feitos || null, fonte: m.fonte, veiculo: m.veiculo || null, titulo: m.titulo || null, url: m.url || null, publicado_em: m.publicado_em || null,
      motivo: m.linkedin ? 'linkedin:' + m.linkedin + (m.dominio ? ' dominio:' + m.dominio : '') : null };
    const r = await fetch(SUPA_URL + '/rest/v1/crm_movimentacoes?on_conflict=chave', { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(linha) });
    const rows = r.ok ? await r.json().catch(() => []) : []; if (rows.length) cont.novas++;
  }

  // 2) Processar pendentes: 'nova' e 'sem_email' cujo contato ganhou e-mail.
  const pend = await sg('crm_movimentacoes?status=in.(nova,sem_email)&select=*&order=criado_em.asc&limit=40');
  const empresas = await sg('crm_empresas?apagado_em=is.null&select=id,nome,dominio,website,site,setor_canonico&limit=10000');
  const listaEmp = Array.isArray(empresas) ? empresas : [];
  const KV = await knowledgeVivo();
  const holding = (KV.agencias || []).find(a => a.slug === 'holding') || null;
  let { usados } = saldoDoDia(cfg.lusha_creditos_dia, hojeStr, 0); usados += 0;
  const teto = Number(cfg.lusha_daily_limit) || 8;
  const agora = () => new Date().toISOString();
  for (const mv of (Array.isArray(pend) ? pend : [])) {
    if (Date.now() - inicio > LIMITE) break;
    try {
      const extra = String(mv.motivo || '');
      const linkedinMov = (extra.match(/linkedin:(\S+)/) || [])[1] || null; const dominioMov = (extra.match(/dominio:(\S+)/) || [])[1] || null;
      // Empresa: casa com a base ou cria.
      let emp = mv.empresa_id ? listaEmp.find(e => e.id === mv.empresa_id) : null;
      if (!emp) { const m = casarEmpresa(mv.empresa, listaEmp); if (m && m.confianca !== 'baixa') emp = m.empresa; }
      if (!emp) { const nova = await spRet('crm_empresas', { nome: mv.empresa, nome_normalizado: normalizarEmpresa(mv.empresa), fonte: 'movimentacao', website: dominioMov }); if (nova) { emp = nova; listaEmp.push(nova); } }
      if (!emp) { await sp(`crm_movimentacoes?id=eq.${mv.id}`, { status: 'erro', motivo: 'não criou a empresa', atualizado_em: agora() }, 'PATCH'); continue; }
      // Pessoa: na mesma empresa, ou nova. Se ela estava na base em outra empresa, marca que saiu de lá.
      let dec = null;
      if (mv.decisor_id) dec = (await sg(`crm_decisores?id=eq.${mv.decisor_id}&select=id,nome,email,cargo,linkedin_url&limit=1`) || [])[0];
      if (!dec) {
        const daEmp = await sg(`crm_decisores?empresa_id=eq.${emp.id}&apagado_em=is.null&select=id,nome,email,cargo,linkedin_url,empresa_id&limit=500`);
        dec = casarPessoa({ nome: mv.pessoa }, daEmp || [], emp.id);
        if (dec) await sp(`crm_decisores?id=eq.${dec.id}`, { cargo: mv.cargo, sinal_recente_em: agora(), atualizado_em: agora() }, 'PATCH');
      }
      if (!dec) {
        const homonimos = await sg(`crm_decisores?nome=ilike.${encodeURIComponent(mv.pessoa)}&apagado_em=is.null&select=id,empresa_id,email,crm_empresas(nome)&limit=5`);
        for (const h of (Array.isArray(homonimos) ? homonimos : [])) {
          if (mv.empresa_anterior && h.crm_empresas && casarEmpresa(mv.empresa_anterior, [{ id: 'x', nome: h.crm_empresas.nome }])) {
            await sp(`crm_decisores?id=eq.${h.id}`, { status: 'saiu_da_empresa', observacoes: 'Saiu: assumiu ' + mv.cargo + ' na ' + mv.empresa + ' (' + (mv.veiculo || mv.fonte) + ', ' + hojeStr + ')', atualizado_em: agora() }, 'PATCH');
          }
        }
        dec = await spRet('crm_decisores', { empresa_id: emp.id, nome: mv.pessoa, cargo: mv.cargo, linkedin_url: linkedinMov, fonte: 'movimentacao', status: 'ativo', estrelas: 4, sinal_recente_em: agora(),
          observacoes: ('Assumiu ' + mv.cargo + ' na ' + mv.empresa + ' (' + (mv.veiculo || mv.fonte) + (mv.publicado_em ? ', ' + String(mv.publicado_em).slice(0, 10) : '') + ')' + (mv.trajetoria ? '. Trajetória: ' + mv.trajetoria : '') + (mv.feitos ? '. Feitos: ' + mv.feitos : '')).slice(0, 2000) });
      }
      if (!dec) { await sp(`crm_movimentacoes?id=eq.${mv.id}`, { status: 'erro', motivo: 'não criou o contato', atualizado_em: agora() }, 'PATCH'); continue; }
      // E-mail: Lusha com prioridade, dentro do teto do dia.
      if (!dec.email && usados < teto && LUSHA_KEY) {
        const dom = emp.dominio || emp.website || emp.site || dominioMov;
        const p = await pessoaLusha({ chave: LUSHA_KEY, nome: mv.pessoa, empresa: emp.nome, linkedin: dec.linkedin_url || linkedinMov,
          dominio: dom ? String(dom).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : null });
        usados += p.creditos || 0; cont.lusha_creditos += p.creditos || 0;
        const patch = { enriquecimento_tentado_em: agora() };
        if (p.email) { const dono = await sg(`crm_decisores?email=ilike.${encodeURIComponent(p.email)}&apagado_em=is.null&id=neq.${dec.id}&select=id&limit=1`); if (!(Array.isArray(dono) && dono.length)) patch.email = p.email; }
        if (!dec.linkedin_url && p.linkedin) patch.linkedin_url = p.linkedin;
        await sp(`crm_decisores?id=eq.${dec.id}`, patch, 'PATCH');
        if (patch.email) dec.email = patch.email;
        if (cont.lusha_creditos) await upsertConfig('lusha_creditos_dia', { data: hojeStr, usados });
      }
      // Mensagem (só escreve uma vez; reaproveita se já escreveu).
      let assunto = mv.assunto, email = mv.mensagem_email, linkedin = mv.mensagem_linkedin;
      if (!email) {
        const memoria = await memoriaParaPrompt({ setor: emp.setor_canonico || '' });
        const { system, user, fontes } = promptParabens({ mov: mv, holding, memoria, cases: casesDoSetor(KV.cases_destaque, emp.setor_canonico || '') });
        let r = await gerarJSON({ system, user, schema: SCHEMA_PARABENS, effort: 'low', model: MODELO_SDR });
        cont.custo_usd += r.custo || 0;
        let probs = checarParabens(r.obj, fontes);
        if (probs.length && r.obj) {
          const r2 = await gerarJSON({ system, user: user + '\n\nCORRIJA: ' + probs.join('; '), schema: SCHEMA_PARABENS, effort: 'low', model: MODELO_SDR });
          cont.custo_usd += r2.custo || 0; const p2 = checarParabens(r2.obj, fontes);
          if (r2.obj && p2.length < probs.length) { r = r2; probs = p2; }
        }
        if (!r.obj || probs.some(x => /número|incompleta/.test(x))) { await sp(`crm_movimentacoes?id=eq.${mv.id}`, { status: 'erro', motivo: 'mensagem reprovada: ' + probs.join('; '), empresa_id: emp.id, decisor_id: dec.id, atualizado_em: agora() }, 'PATCH'); continue; }
        assunto = r.obj.assunto; email = r.obj.email; linkedin = r.obj.linkedin;
      }
      const base = { empresa_id: emp.id, decisor_id: dec.id, assunto, mensagem_email: email, mensagem_linkedin: linkedin, atualizado_em: agora() };
      if (dec.email) {
        const fila = await spRet('crm_fila', { decisor_id: dec.id, empresa_id: emp.id, canal: 'email', assunto: String(assunto).slice(0, 200), corpo: String(email).slice(0, 4000),
          status: 'aprovado', origem: 'movimentacao', etapa: 'parabens', etapa_cadencia: 1, aprovado_em: agora(), gerado_em: agora(), modelo: MODELO_SDR,
          contexto_para_aprovacao: ('Parabéns: ' + mv.pessoa + ' assumiu ' + mv.cargo + ' na ' + mv.empresa + ' (' + (mv.veiculo || mv.fonte) + ')' + (mv.url ? ' ' + mv.url : '')).slice(0, 500) });
        await sp(`crm_movimentacoes?id=eq.${mv.id}`, Object.assign(base, { status: 'rascunho', fila_id: fila && fila.id }), 'PATCH');
        if (fila) cont.rascunhos++;
      } else {
        await sp(`crm_movimentacoes?id=eq.${mv.id}`, Object.assign(base, { status: 'sem_email', motivo: usados >= teto ? 'teto de créditos do dia: e-mail no próximo enriquecimento' : 'Lusha sem e-mail: use a mensagem no LinkedIn' }), 'PATCH');
        cont.sem_email++;
      }
      cont.processadas++;
    } catch (e) { cont.erros.push(String(e.message || e).slice(0, 160)); }
  }
  // Cria os rascunhos no Gmail agora (só cria; enviar é clique do Pedro).
  if (cont.rascunhos) await fetch(SUPA_URL + '/rest/v1/rpc/sdr_invoke', { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ job: 'rascunhos-matinais', lote: 1 }) }).catch(() => {});
  cont.custo_usd = Math.round(cont.custo_usd * 10000) / 10000; cont.ms = Date.now() - inicio;
  await logCron('movimentacoes', nivelTrabalho(cont.novas + cont.processadas), 'fim', cont);
  return res.status(200).json({ ok: true, ...cont });
}

// PATCH que devolve as linhas alteradas: o filtro de status garante que só uma
// execução registra o envio (idempotência entre o cron e o clique no app).
async function spPatchRet(path, body) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, { method: 'PATCH', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

// Fecha o ciclo do rascunho do SDR:
//  1) rascunho do Gmail que sumiu: enviado (está no Enviados) ou apagado;
//  2) item da fila enviado (Gmail, WhatsApp pelo app) com o lead ainda em
//     'rascunho': marca enviado e agenda o próximo passo da cadência.
// Sem isso, nenhum follow-up nascia: só o envio automático (Piloto) os criava.
async function sincronizarEnvios(gm) {
  const cont = { modo: null, verificados: 0, enviados_gmail: 0, editados_gmail: 0, apagados: 0, duplicados: 0, sem_associacao: 0, ciclos_fechados: 0, followups: 0 };
  const agoraIso = new Date().toISOString();
  if (gm) {
    // 1) Incremental pela History API. 2) Reconciliação completa se o histórico
    //    expirou, se não há cursor ou uma vez por dia (pega o que escapou).
    const cfgG = await sg('crm_configuracoes?chave=in.(gmail_history_id,gmail_reconciliado_em)&select=chave,valor');
    const mg = {}; for (const r of (Array.isArray(cfgG) ? cfgG : [])) mg[r.chave] = r.valor;
    const cursor = typeof mg.gmail_history_id === 'string' ? mg.gmail_history_id : null;
    const ultimaRec = typeof mg.gmail_reconciliado_em === 'string' ? Date.parse(mg.gmail_reconciliado_em) : 0;
    let precisaCompleta = !cursor || (Date.now() - ultimaRec > 20 * 3600000);
    if (cursor) {
      const h = await historicoGmail(gm.token, cursor);
      if (h.expirado) { precisaCompleta = true; cont.historico_expirado = true; }
      else {
        cont.modo = 'incremental';
        await aplicarHistoricoGmail(gm, h.registros, cont);
        if (h.historyId) await spUpsert('crm_configuracoes', { chave: 'gmail_history_id', valor: h.historyId }, 'chave');
      }
    }
    if (precisaCompleta) {
      const perfil = await perfilGmail(gm.token).catch(() => null);   // cursor novo ANTES de varrer: nada fica no vão
      await reconciliarRascunhosGmail(gm, cont, agoraIso);
      if (perfil && perfil.historyId) await spUpsert('crm_configuracoes', { chave: 'gmail_history_id', valor: perfil.historyId }, 'chave');
      await spUpsert('crm_configuracoes', { chave: 'gmail_reconciliado_em', valor: agoraIso }, 'chave');
      cont.modo = cont.modo ? cont.modo + '+completa' : 'completa';
    }
  }
  // Fecha o ciclo de quem já saiu (por qualquer caminho) e agenda o follow-up.
  const abertos = await sg('crm_sdr_estado?etapa=eq.rascunho&status=eq.ativo&sombra=eq.false&fila_id=not.is.null&select=id,decisor_id,empresa_id,agencia_id,agencia_motivo,dossie_id,dia_cadencia,fila_id,crm_fila:fila_id(status,enviado_em,decisao)&limit=200');
  const cfg = (Array.isArray(abertos) && abertos.length) ? await cfgEnvio() : null;
  for (const e of (Array.isArray(abertos) ? abertos : [])) {
    const f = e.crm_fila || {};
    if (!['enviado', 'respondido'].includes(f.status) || !f.enviado_em) continue;
    const rows = await spPatchRet(`crm_sdr_estado?id=eq.${e.id}&etapa=eq.rascunho`, { etapa: 'enviado', enviado_em: f.enviado_em, atualizado_em: agoraIso });
    if (!rows.length) continue;
    cont.ciclos_fechados++;
    if (f.status !== 'enviado' || !cfg) continue;   // respondeu: a cadência para
    if (f.decisao === 'rejeitado') continue;          // rejeitado pelo Pedro: sem follow-up automático
    const prox = proximoPasso({ cadencia: cfg.cadencia, diaAtual: e.dia_cadencia || 0, dataEnvioISO: horaBRT(new Date(f.enviado_em)).data, feriados: cfg.feriados });
    if (prox && await spUpsert('crm_sdr_estado', { decisor_id: e.decisor_id, empresa_id: e.empresa_id, agencia_id: e.agencia_id, agencia_motivo: e.agencia_motivo,
      dossie_id: e.dossie_id, dia_cadencia: prox.dia, data_lote: prox.data, etapa: 'aguardando', status: 'ativo' }, 'decisor_id,data_lote,dia_cadencia', true)) cont.followups++;
  }
  return cont;
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
    if (job === 'sdr-estrategia')        return await jobSdrEstrategia(req, res);
    if (job === 'sdr-calibrar-qc')       return await jobSdrCalibrarQc(req, res);
    if (job === 'sdr-redacao')           return await jobSdrRedacao(req, res);
    if (job === 'sdr-qualidade')         return await jobSdrQualidade(req, res);
    if (job === 'sdr-respostas')         return await jobSdrRespostas(req, res);
    if (job === 'sdr-vigia')             return await jobSdrVigia(req, res);
    if (job === 'sdr-aprendizado')       return await jobSdrAprendizado(req, res);
    if (job === 'aprender-estilo')       return await jobAprenderEstilo(req, res);
    if (job === 'gmail-crm')             return await jobGmailCrm(req, res);
    if (job === 'whatsapp-crm')          return await jobWhatsappCrm(req, res);
    if (job === 'classificar-setores')   return await jobClassificarSetores(req, res);
    if (job === 'blitz-redacao')         return await jobBlitzRedacao(req, res);
    if (job === 'movimentacoes')         return await jobMovimentacoes(req, res, 'imprensa');
    if (job === 'movimentacoes-lusha')   return await jobMovimentacoes(req, res, 'lusha');
    if (job === 'sdr-envios') {
      const gm = await obterTokenGmail({ supaUrl: SUPA_URL, serviceKey: SUPA_KEY }).catch(() => null);
      const ctx = await sincronizarEnvios(gm);
      await logCron('sdr-envios', 'info', 'fim', ctx);
      return res.status(200).json({ ok: true, ...ctx });
    }
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
