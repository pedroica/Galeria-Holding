// api/copiloto.js — Copiloto IA: streaming SSE, tool use, web search
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL      = 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_SVC      = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPA_ANON     = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
const MAX_TOOL      = 8;
const __dir         = dirname(fileURLToPath(import.meta.url));

let KNOWLEDGE = {};
try { KNOWLEDGE = JSON.parse(readFileSync(join(__dir, '..', 'data', 'galeria-holding-knowledge.json'), 'utf8')); } catch {}

// ─── Supabase helpers ────────────────────────────────────────────────────────
function supa(path, opts = {}) {
  return fetch(SUPA_URL + path, {
    ...opts,
    headers: { apikey: SUPA_SVC, Authorization: 'Bearer ' + SUPA_SVC, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  }).then(r => r.ok ? r.json() : r.json().then(e => { throw e; }));
}

async function verifyJwt(token) {
  if (!token || token.length < 20) return null;
  const r = await fetch(SUPA_URL + '/auth/v1/user', { headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + token } });
  return r.ok ? r.json() : null;
}

// ─── Tool implementations (server-side, service key, no free SQL) ────────────
async function toolBuscarEmpresa({ nome, dominio }) {
  let q = '/rest/v1/crm_empresas?select=id,nome,setor,website,dominios,cliente_ativo,agencia_atendendo&limit=5';
  if (nome)    q += '&nome=ilike.' + encodeURIComponent('%' + nome + '%');
  if (dominio && !nome) q += '&website=ilike.' + encodeURIComponent('%' + dominio + '%');
  const rows = await supa(q);
  if (!rows?.length) return { encontrada: false };
  const emp = rows[0];
  const [toques, decs] = await Promise.all([
    supa('/rest/v1/crm_toques?empresa_id=eq.' + emp.id + '&order=data.desc&limit=5&select=data,canal,agencia_id,resultado,etapa,nota'),
    supa('/rest/v1/crm_decisores?empresa_id=eq.' + emp.id + '&status=eq.ativo&select=id,nome,cargo,email,wa,ultimo_toque_em&limit=10&order=cargo.asc')
  ]);
  return { ...emp, encontrada: true, ultimos_toques: toques || [], decisores: decs || [] };
}

async function toolListarDecisores({ empresa }) {
  const emps = await supa('/rest/v1/crm_empresas?nome=ilike.' + encodeURIComponent('%' + empresa + '%') + '&select=id,nome&limit=1');
  if (!emps?.length) return { erro: 'Empresa não encontrada: ' + empresa };
  const decs = await supa('/rest/v1/crm_decisores?empresa_id=eq.' + emps[0].id + '&status=eq.ativo&select=id,nome,cargo,email,wa,linkedin_url,ultimo_toque_em&order=cargo.asc');
  return { empresa: emps[0].nome, empresa_id: emps[0].id, decisores: decs || [] };
}

async function toolHistoricoToques({ empresa, decisor, periodo }) {
  let q = '/rest/v1/crm_toques?select=data,canal,agencia_id,etapa,resultado,nota,texto_enviado,direcao&order=data.desc&limit=30';
  if (empresa) {
    const e = await supa('/rest/v1/crm_empresas?nome=ilike.' + encodeURIComponent('%' + empresa + '%') + '&select=id&limit=1');
    if (e?.[0]) q += '&empresa_id=eq.' + e[0].id;
  }
  if (decisor) {
    const d = await supa('/rest/v1/crm_decisores?nome=ilike.' + encodeURIComponent('%' + decisor + '%') + '&select=id&limit=1');
    if (d?.[0]) q += '&decisor_id=eq.' + d[0].id;
  }
  if (periodo === 'semana') { const d = new Date(); d.setDate(d.getDate() - 7); q += '&data=gte.' + d.toISOString(); }
  if (periodo === 'mes')    { const d = new Date(); d.setDate(d.getDate() - 30); q += '&data=gte.' + d.toISOString(); }
  const rows = await supa(q);
  return { toques: rows || [], total: rows?.length || 0 };
}

async function toolItensFila({ status, canal, agencia }) {
  let q = '/rest/v1/crm_fila?select=id,empresa,decisor,canal,etapa,assunto,status,agencia_id,criado_em&order=criado_em.desc&limit=50';
  if (status)  q += '&status=eq.' + encodeURIComponent(status);
  if (canal)   q += '&canal=eq.' + encodeURIComponent(canal);
  if (agencia) q += '&agencia_id=eq.' + encodeURIComponent(agencia);
  const rows = await supa(q);
  return { itens: rows || [], total: rows?.length || 0 };
}

async function toolContadoresSemana() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1)); mon.setHours(0,0,0,0);
  const monIso = mon.toISOString();
  const [toques, reunioes, aprovados] = await Promise.all([
    supa('/rest/v1/crm_toques?data=gte.' + monIso + '&select=empresa_id,canal&limit=1000'),
    supa('/rest/v1/crm_toques?data=gte.' + monIso + '&resultado=eq.reuniao_marcada&select=empresa_id&limit=200'),
    supa('/rest/v1/crm_fila?status=eq.aprovado&select=id,canal&limit=200')
  ]);
  const empsUnicas = new Set((toques || []).map(t => t.empresa_id).filter(Boolean));
  return {
    semana_inicio_sp: monIso,
    empresas_tocadas: empsUnicas.size,
    toques_total: (toques || []).length,
    reunioes_marcadas: (reunioes || []).length,
    itens_aprovados_na_fila: (aprovados || []).length,
    por_canal: (toques || []).reduce((acc, t) => { acc[t.canal] = (acc[t.canal] || 0) + 1; return acc; }, {})
  };
}

async function toolListarTemplates({ agencia, canal }) {
  let q = '/rest/v1/crm_templates?ativo=eq.true&select=id,agencia_id,canal,etapa,tipo,assunto,corpo&limit=30';
  if (agencia) q += '&agencia_id=eq.' + encodeURIComponent(agencia);
  if (canal)   q += '&canal=eq.' + encodeURIComponent(canal);
  const rows = await supa(q);
  return { templates: rows || [], total: rows?.length || 0 };
}

async function toolNoticiasEmpresa({ empresa }) {
  const emps = await supa('/rest/v1/crm_empresas?nome=ilike.' + encodeURIComponent('%' + empresa + '%') + '&select=id,nome&limit=1');
  if (!emps?.length) return { erro: 'Empresa não encontrada: ' + empresa };
  const rows = await supa('/rest/v1/crm_noticias?empresa_id=eq.' + emps[0].id + '&order=data.desc&limit=10&select=titulo,resumo,fonte,data,url');
  return { empresa: emps[0].nome, noticias: rows || [] };
}

async function toolGerarFila({ n, agencia_id, setor }) {
  const limite = Math.min(n || 5, 20);
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1)); mon.setHours(0,0,0,0);
  const monIso = mon.toISOString();

  const recentes = await supa('/rest/v1/crm_toques?data=gte.' + monIso + '&select=empresa_id&limit=1000');
  const recentIds = new Set((recentes || []).map(r => r.empresa_id).filter(Boolean));

  let empQ = '/rest/v1/crm_empresas?select=id,nome,setor,website&limit=300&order=nome.asc';
  if (setor) empQ += '&setor=ilike.' + encodeURIComponent('%' + setor + '%');
  const empresas = await supa(empQ);
  const candidatas = (empresas || []).filter(e => !recentIds.has(e.id));
  if (!candidatas.length) return { criados: 0, motivo: 'Nenhuma empresa elegível para o setor/período solicitado' };

  const agId = agencia_id || '3409ab82-f0cd-4d95-b6e2-398995425411';
  const criados = [];

  for (const emp of candidatas) {
    if (criados.length >= limite) break;
    const decs = await supa('/rest/v1/crm_decisores?empresa_id=eq.' + emp.id + '&status=eq.ativo&email=not.is.null&select=id,nome,cargo,email&limit=3&order=cargo.asc');
    const dec = decs?.[0];
    if (!dec) continue;
    await supa('/rest/v1/crm_fila', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        empresa: emp.nome, empresa_id: emp.id,
        decisor: dec.nome, decisor_id: dec.id,
        agencia_id: agId, canal: 'email', etapa: '1',
        status: 'rascunho',
        assunto: emp.nome + ' · uma conversa',
        corpo: 'Acompanho o trabalho da ' + emp.nome + '. Podemos conversar 20 minutos?',
        criado_em: new Date().toISOString(), origem: 'copiloto'
      })
    });
    criados.push({ empresa: emp.nome, decisor: dec.nome, cargo: dec.cargo });
  }

  return { criados: criados.length, limite_solicitado: limite, itens: criados, status: 'rascunho', nota: 'Acesse Aprovar para revisar e aprovar os rascunhos antes do envio' };
}

async function toolRegistrarResultado({ empresa, decisor, resultado, nota, data }) {
  const emps = await supa('/rest/v1/crm_empresas?nome=ilike.' + encodeURIComponent('%' + empresa + '%') + '&select=id&limit=1');
  if (!emps?.[0]) return { erro: 'Empresa não encontrada: ' + empresa };
  const decs = decisor ? await supa('/rest/v1/crm_decisores?empresa_id=eq.' + emps[0].id + '&nome=ilike.' + encodeURIComponent('%' + decisor + '%') + '&select=id&limit=1') : [];
  const dataStr = data || new Date().toISOString();
  await supa('/rest/v1/crm_toques', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      empresa_id: emps[0].id, decisor_id: decs?.[0]?.id || null,
      canal: 'manual', direcao: 'enviado', fonte: 'manual',
      resultado: resultado || 'outro', nota: nota || '',
      data: dataStr, criado_em: new Date().toISOString()
    })
  });
  if (decs?.[0]) {
    await supa('/rest/v1/crm_decisores?id=eq.' + decs[0].id, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ultimo_toque_em: dataStr })
    });
  }
  return { registrado: true, empresa, decisor: decisor || null, resultado, data: dataStr };
}

async function execTool(name, input) {
  switch (name) {
    case 'buscar_empresa':      return toolBuscarEmpresa(input);
    case 'listar_decisores':    return toolListarDecisores(input);
    case 'historico_toques':    return toolHistoricoToques(input);
    case 'itens_fila':          return toolItensFila(input);
    case 'contadores_semana':   return toolContadoresSemana();
    case 'listar_templates':    return toolListarTemplates(input);
    case 'noticias_empresa':    return toolNoticiasEmpresa(input);
    default: return { erro: 'Ferramenta desconhecida: ' + name };
  }
}

const ACTION_TOOLS = ['gerar_fila', 'registrar_resultado', 'abordar'];

// ─── System prompt ───────────────────────────────────────────────────────────
function buildSystem() {
  const spDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
  const h   = KNOWLEDGE.holding || {};
  const ags  = (KNOWLEDGE.agencias || []).map(a => '- ' + a.nome + ': ' + (a.especialidade || a.descricao || '')).join('\n');
  const prods = (KNOWLEDGE.produtos_proprietarios || []).map(p => '- ' + p.nome + ' (' + p.agencia + '): ' + p.descricao).join('\n');
  return `Você é o Copiloto de Prospecção da Galeria Holding. Hoje é ${spDate} (horário de São Paulo).
Você está assistindo ${h.responsavel_prospeccao || 'Pedro Ica'}, ${h.cargo_responsavel || 'Sócio e Head de Growth'}.

## Galeria Holding
${h.posicionamento || 'O maior grupo de comunicação independente do Brasil.'}

## Agências do grupo
${ags}

## Produtos proprietários
${prods}

## Regras de negócio (não negociáveis)
- Máximo 1 agência abordando a mesma empresa na mesma semana
- Máximo 2 decisores diferentes da mesma empresa na mesma semana
- Alvo: CMO, VP Marketing, Diretores de marketing/criação/performance
- Nunca mencionar preço em prospecção
- Nunca inventar dado, case ou resultado — use apenas o que está no banco ou na web search

## Comportamento
- Responda em português do Brasil, sem usar travessão
- Quando buscar na web, indique claramente 🌐 (fonte pública) vs 🗄️ (banco interno)
- Máximo ${MAX_TOOL} consultas por resposta; se precisar de mais, diga o que apurou e sugira a próxima pergunta
- Para ações (gerar_fila, registrar_resultado, abordar): descreva o que vai fazer, aguarde confirmação do usuário
- Seja direto e prático; responda com dados concretos do banco quando disponíveis`;
}

// ─── Tool definitions ────────────────────────────────────────────────────────
const TOOL_DEFS = [
  { type: 'web_search_20250305', name: 'web_search' },
  { name: 'buscar_empresa',    description: 'Busca empresa pelo nome ou domínio. Retorna dados, setor, cliente_ativo, últimos toques e decisores ativos.',  input_schema: { type: 'object', properties: { nome: { type: 'string', description: 'Nome parcial da empresa' }, dominio: { type: 'string', description: 'Domínio/website (opcional)' } } } },
  { name: 'listar_decisores',  description: 'Lista decisores ativos de uma empresa com cargo, email, wa, linkedin_url e último toque.',                       input_schema: { type: 'object', properties: { empresa: { type: 'string' } }, required: ['empresa'] } },
  { name: 'historico_toques',  description: 'Histórico de toques de uma empresa ou decisor: data, canal, agência, etapa, resultado, texto enviado.',          input_schema: { type: 'object', properties: { empresa: { type: 'string' }, decisor: { type: 'string' }, periodo: { type: 'string', enum: ['semana','mes','tudo'] } } } },
  { name: 'itens_fila',        description: 'Lista itens da fila de prospecção filtrados por status, canal ou agência.',                                      input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['rascunho','aprovado','enviado','pulado','erro'] }, canal: { type: 'string', enum: ['email','whatsapp','linkedin_convite','linkedin_mensagem'] }, agencia: { type: 'string', description: 'UUID da agência' } } } },
  { name: 'contadores_semana', description: 'Métricas da semana: empresas tocadas, toques total, reuniões marcadas, itens aprovados na fila, por canal.',     input_schema: { type: 'object', properties: {} } },
  { name: 'listar_templates',  description: 'Lista templates de prospecção por agência e canal.',                                                              input_schema: { type: 'object', properties: { agencia: { type: 'string', description: 'UUID da agência' }, canal: { type: 'string', enum: ['email','whatsapp','linkedin_convite','linkedin_mensagem'] } } } },
  { name: 'noticias_empresa',  description: 'Notícias sobre uma empresa armazenadas no CRM (crm_noticias).',                                                  input_schema: { type: 'object', properties: { empresa: { type: 'string' } }, required: ['empresa'] } },
  { name: 'gerar_fila',        description: 'AÇÃO: Gera rascunhos de prospecção em crm_fila. Requer confirmação do usuário antes de executar.',              input_schema: { type: 'object', properties: { n: { type: 'number', description: 'Quantidade (máx 20)' }, agencia_id: { type: 'string', description: 'UUID da agência' }, setor: { type: 'string', description: 'Setor das empresas (ex: varejo, cosméticos, automotivo)' } }, required: ['n'] } },
  { name: 'registrar_resultado', description: 'AÇÃO: Registra toque/resultado em crm_toques. Requer confirmação.',                                           input_schema: { type: 'object', properties: { empresa: { type: 'string' }, decisor: { type: 'string' }, resultado: { type: 'string', enum: ['sem_resposta','resposta','reuniao_marcada','nao_interesse','outro'] }, nota: { type: 'string' }, data: { type: 'string', description: 'ISO 8601, opcional' } }, required: ['empresa','resultado'] } },
  { name: 'abordar',           description: 'AÇÃO: Abre o painel Abordar preenchido para um decisor. Requer confirmação.',                                   input_schema: { type: 'object', properties: { decisor_id: { type: 'string' }, decisor_nome: { type: 'string' }, empresa: { type: 'string' }, canal: { type: 'string', enum: ['email','whatsapp','linkedin_convite'] }, agencia_id: { type: 'string' } }, required: ['empresa'] } }
];

// ─── Conversation DB ─────────────────────────────────────────────────────────
async function loadConversa(cId, userId) {
  if (!cId) return { id: null, mensagens: [] };
  const rows = await supa('/rest/v1/crm_copiloto_conversas?id=eq.' + cId + '&user_id=eq.' + userId + '&select=id,titulo,mensagens&limit=1').catch(() => []);
  return rows?.[0] || { id: null, mensagens: [] };
}

async function saveConversa(cId, userId, msgs, titulo) {
  const agora = new Date().toISOString();
  if (cId) {
    await supa('/rest/v1/crm_copiloto_conversas?id=eq.' + cId + '&user_id=eq.' + userId, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ mensagens: msgs, atualizado_em: agora }) });
    return cId;
  }
  const row = await supa('/rest/v1/crm_copiloto_conversas', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: userId, titulo: titulo || 'Nova conversa', mensagens: msgs, criado_em: agora, atualizado_em: agora }) });
  return row?.[0]?.id;
}

async function logCusto(cId, tokIn, tokOut) {
  const custo = (tokIn * 3 + tokOut * 15) / 1_000_000;
  await supa('/rest/v1/crm_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ tipo: 'copiloto', referencia_id: cId || null, custo_usd: custo, tokens_entrada: tokIn, tokens_saida: tokOut, payload: { modelo: 'claude-sonnet-4-6' } }) }).catch(() => {});
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export const config = { maxDuration: 55 };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  function send(data) { if (!res.writableEnded) res.write('data: ' + JSON.stringify(data) + '\n\n'); }

  try {
    const { jwt, conversaId, mensagem, confirmarAcao } = req.body;
    const user = await verifyJwt(jwt);
    if (!user) { send({ t: 'error', msg: 'Sessão expirada — recarregue a página' }); return res.end(); }

    const userId = user.id;
    const conversa = await loadConversa(conversaId, userId);
    let msgs = [...(conversa.mensagens || [])];
    let tokIn = 0, tokOut = 0;
    let finalCId = conversaId || conversa.id;

    // ── Confirmed action execution ──
    if (confirmarAcao) {
      const { action, params } = confirmarAcao;
      if (action === 'abordar') {
        send({ t: 'abordar', params });
        msgs.push({ role: 'user', content: '[Ação abordar confirmada para ' + (params.empresa || '') + ']', ts: new Date().toISOString() });
        msgs.push({ role: 'assistant', content: 'Abrindo painel Abordar para ' + (params.empresa || 'empresa selecionada') + '.', ts: new Date().toISOString() });
      } else {
        let result;
        if (action === 'gerar_fila')        result = await toolGerarFila(params);
        else if (action === 'registrar_resultado') result = await toolRegistrarResultado(params);
        else result = { erro: 'Ação desconhecida' };
        const txt = JSON.stringify(result, null, 2);
        send({ t: 'text', d: '**Resultado da ação `' + action + '`:**\n```json\n' + txt + '\n```\n' });
        msgs.push({ role: 'user', content: 'Ação ' + action + ' confirmada.', ts: new Date().toISOString() });
        msgs.push({ role: 'assistant', content: 'Ação executada:\n```json\n' + txt + '\n```', ts: new Date().toISOString() });
      }
      finalCId = await saveConversa(finalCId, userId, msgs, msgs[0]?.content?.slice(0, 60));
      send({ t: 'done', conversaId: finalCId });
      return res.end();
    }

    if (!mensagem?.trim()) { send({ t: 'error', msg: 'Mensagem vazia' }); return res.end(); }

    msgs.push({ role: 'user', content: mensagem.trim(), ts: new Date().toISOString() });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const system = buildSystem();

    // Convert stored msgs to Anthropic API format (string content only, filtered _api flag)
    function toApi(ms) { return ms.filter(m => !m._api && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content })); }

    // Maintain a separate apiMsgs list for the multi-turn loop
    let apiMsgs = toApi(msgs);
    let toolCalls = 0;
    let accumText = '';

    while (true) {
      const stream = anthropic.messages.stream({ model: 'claude-sonnet-4-6', max_tokens: 2048, system, tools: TOOL_DEFS, messages: apiMsgs });

      const toolUses = [];
      let curTool = null;
      let turnText = '';

      for await (const ev of stream) {
        if (ev.type === 'message_start' && ev.message?.usage) tokIn += ev.message.usage.input_tokens || 0;
        if (ev.type === 'content_block_start') {
          if (ev.content_block.type === 'tool_use') { curTool = { id: ev.content_block.id, name: ev.content_block.name, inputStr: '' }; send({ t: 'tool_start', n: ev.content_block.name, id: ev.content_block.id }); }
        }
        if (ev.type === 'content_block_delta') {
          if (ev.delta.type === 'text_delta') { send({ t: 'text', d: ev.delta.text }); turnText += ev.delta.text; }
          if (ev.delta.type === 'input_json_delta' && curTool) curTool.inputStr += ev.delta.partial_json;
        }
        if (ev.type === 'content_block_stop' && curTool) {
          try { curTool.input = JSON.parse(curTool.inputStr || '{}'); } catch { curTool.input = {}; }
          toolUses.push({ ...curTool }); curTool = null;
        }
        if (ev.type === 'message_delta' && ev.usage) tokOut += ev.usage.output_tokens || 0;
      }

      const finalMsg = await stream.finalMessage();
      accumText += turnText;

      // Persist text turn for display (API _api:true msgs are only for the loop)
      if (turnText) msgs.push({ role: 'assistant', content: turnText, ts: new Date().toISOString() });

      if (finalMsg.stop_reason !== 'tool_use' || !toolUses.length) break;

      if (toolCalls >= MAX_TOOL) {
        send({ t: 'text', d: '\n\n*Limite de ' + MAX_TOOL + ' consultas atingido. Tente uma pergunta mais específica.*' });
        break;
      }

      // Build tool results
      const toolResults = [];
      for (const tu of toolUses) {
        toolCalls++;

        if (tu.name === 'web_search') {
          // Server-side tool — result already in finalMsg.content
          const wsBlock = (finalMsg.content || []).find(b => b.type === 'tool_result' && b.tool_use_id === tu.id);
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: wsBlock ? (typeof wsBlock.content === 'string' ? wsBlock.content : JSON.stringify(wsBlock.content)) : '[]' });
          send({ t: 'tool_done', n: 'web_search', id: tu.id });
          continue;
        }

        if (ACTION_TOOLS.includes(tu.name)) {
          const cid = 'conf_' + Date.now() + '_' + toolCalls;
          send({ t: 'confirm', id: cid, action: tu.name, params: tu.input });
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ status: 'pendente_confirmacao', mensagem: 'Aguardando confirmação do usuário.' }) });
        } else {
          let res2;
          try { res2 = await execTool(tu.name, tu.input); } catch (e) { res2 = { erro: String(e.message || e) }; }
          send({ t: 'tool_done', n: tu.name, id: tu.id });
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(res2) });
        }
      }

      // Build next API turn (with full tool_use + tool_result blocks)
      apiMsgs = [...apiMsgs.filter((_, i) => i < apiMsgs.length), { role: 'assistant', content: finalMsg.content }, { role: 'user', content: toolResults }];
    }

    const titulo = msgs.find(m => m.role === 'user')?.content?.slice(0, 60) || 'Nova conversa';
    finalCId = await saveConversa(finalCId, userId, msgs, titulo);
    await logCusto(finalCId, tokIn, tokOut);
    send({ t: 'done', conversaId: finalCId, custo: (tokIn * 3 + tokOut * 15) / 1_000_000 });
  } catch (err) {
    console.error('[copiloto]', err);
    send({ t: 'error', msg: err.message || 'Erro interno no Copiloto' });
  }
  res.end();
}
