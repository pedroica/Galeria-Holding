// D3 — Gerar fila de prospecção
// POST /api/gerar-fila
// Auth: Bearer CRON_SECRET ou JWT Supabase
// D1: exclusividade semanal, etapa_cadencia, pausa, status, email_valido
// D2: ordena por crm_empresa_agencia_estrelas (estrelas_manual vence estrelas_calculadas)
// Gera texto via Claude claude-sonnet-4-6

import Anthropic from '@anthropic-ai/sdk';

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;
// Anon key é pública (já está no código frontend) — aceita chamadas do app web
const SUPA_ANON = process.env.SUPA_CRM_ANON_KEY || 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const LIMITES = { email: 50, whatsapp: 80, linkedin_convite: 20, linkedin_mensagem: 20 };

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

function inicioSemana() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dia = now.getDay();
  const seg = new Date(now);
  seg.setDate(now.getDate() - (dia === 0 ? 6 : dia - 1));
  seg.setHours(0, 0, 0, 0);
  return seg.toISOString();
}

async function contadosHoje(canal) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const rows = await sg(`crm_fila?canal=eq.${canal}&status=in.(aprovado,enviado)&enviado_em=gte.${hoje.toISOString()}&select=id`);
  return Array.isArray(rows) ? rows.length : 0;
}

function elegivel(d, semanaInicio) {
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

async function gerarTexto(anthropic, prompt, canal) {
  const maxWords = canal === 'linkedin_convite' ? 40 : canal === 'whatsapp' ? 60 : 120;
  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
    system: `Você gera mensagens de prospecção B2B em português para Pedro Ica, Head of Growth da Galeria Holding.
Regras absolutas:
- Máximo ${maxWords} palavras no corpo
- Assunto (se email): máximo 8 palavras
- Sem travessão (—), sem lista (- / •), sem jargão corporativo
- Exatamente 1 pergunta clara no final
- Tom: direto, humano, sem bajulação
- Nunca inventar dado, case ou resultado
Formato de resposta (JSON):
{"assunto":"...","corpo":"..."}`
  });
  const txt = r.content[0]?.text || '';
  let obj = {};
  try {
    // Strip markdown code fences before JSON extraction
    const clean = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const m = clean.match(/\{[\s\S]+\}/);
    if (m) obj = JSON.parse(m[0]);
  } catch (e) {}
  return {
    assunto: obj.assunto || '',
    corpo: obj.corpo || txt.slice(0, 600),
    tokens_prompt: r.usage?.input_tokens || 0,
    tokens_resposta: r.usage?.output_tokens || 0,
    custo_usd: ((r.usage?.input_tokens || 0) * 3 + (r.usage?.output_tokens || 0) * 15) / 1_000_000
  };
}

// Busca mapa de estrelas por empresa para uma agência
// Usa COALESCE(estrelas_manual, estrelas_calculadas), fallback = 0
async function estrelasPorEmpresa(agenciaId) {
  const rows = await sg(
    `crm_empresa_agencia_estrelas?agencia_id=eq.${agenciaId}&select=empresa_id,estrelas_manual,estrelas_calculadas&limit=500`
  );
  const map = {};
  for (const r of (Array.isArray(rows) ? rows : [])) {
    map[r.empresa_id] = r.estrelas_manual != null ? Number(r.estrelas_manual) : Number(r.estrelas_calculadas || 0);
  }
  return map;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  // Aceita: CRON_SECRET, service role key (fallback quando CRON_SECRET não configurado), ou JWT válido
  const isCron = authHeader && (
    (CRON_SECRET && authHeader === CRON_SECRET) ||
    (SUPA_KEY && authHeader === SUPA_KEY) ||
    (SUPA_ANON && authHeader === SUPA_ANON) // app web usa anon key (pública)
  );
  const isJWT = !isCron && authHeader && await verifyJWT(authHeader);
  if (!isCron && !isJWT) return res.status(401).json({ error: 'Não autenticado' });

  const { agencia_slug, canais = ['email', 'whatsapp'], limite = 30 } = req.body || {};

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const semana = inicioSemana();
  const gerados = [];
  const erros = [];
  const bloqueados = [];

  let agencias;
  if (agencia_slug) {
    agencias = await sg(`crm_agencias?slug=eq.${agencia_slug}&select=*`);
    if (!Array.isArray(agencias) || agencias.length === 0) {
      agencias = await sg(`crm_agencias?id=eq.${agencia_slug}&select=*`);
    }
  }
  if (!Array.isArray(agencias) || agencias.length === 0) {
    agencias = await sg('crm_agencias?select=*&order=nome.asc&limit=14');
  }
  if (!Array.isArray(agencias) || agencias.length === 0) return res.status(200).json({ gerados: 0, erros: [] });

  const restante = {};
  for (const c of canais) {
    const usados = await contadosHoje(c);
    restante[c] = Math.max(0, (LIMITES[c] || 50) - usados);
  }

  let totalGerado = 0;

  for (const ag of agencias) {
    if (totalGerado >= limite) break;

    // D2 — buscar mapa de estrelas por empresa para esta agência
    const scoreMap = await estrelasPorEmpresa(ag.id);

    // D2 — buscar decisores elegíveis
    const decisores = await sg(
      `crm_decisores?etapa_cadencia=neq.off&status=neq.inativo` +
      `&select=*,crm_empresas!empresa_id(id,nome,setor,segmento_detalhe,sinal_recente_em,cliente_ativo,agencia_atendendo)` +
      `&limit=100`
    );
    if (!Array.isArray(decisores)) continue;

    // D1 — filtrar elegíveis, 1 por empresa, ordenar por estrelas desc
    const empresasVistas = new Set();
    const semanaInicio = semana;
    const elegiveis = decisores
      .filter(d => {
        if (!elegivel(d, semanaInicio)) { bloqueados.push({decisor:d.nome,motivo:'inelegivel'}); return false; }
        if (empresasVistas.has(d.empresa_id)) { bloqueados.push({decisor:d.nome,motivo:'empresa_ja_na_fila'}); return false; }
        if (d.ultimo_toque_em && new Date(d.ultimo_toque_em) > new Date(semanaInicio)) { bloqueados.push({decisor:d.nome,motivo:'tocado_esta_semana'}); return false; }
        const emp = d.crm_empresas;
        if (emp && emp.cliente_ativo && emp.agencia_atendendo && emp.agencia_atendendo !== ag.id) { bloqueados.push({decisor:d.nome,motivo:'cliente_ativo_outra_agencia'}); return false; }
        empresasVistas.add(d.empresa_id);
        return true;
      })
      .sort((a, b) => {
        const sa = scoreMap[a.empresa_id] || 0;
        const sb = scoreMap[b.empresa_id] || 0;
        if (sb !== sa) return sb - sa;
        const ta = new Date(a.sinal_recente_em || 0).getTime();
        const tb = new Date(b.sinal_recente_em || 0).getTime();
        if (tb !== ta) return tb - ta;
        return (b.temperatura || 0) - (a.temperatura || 0);
      });

    const templates = await sg(`crm_templates?agencia_id=eq.${ag.id}&tipo=eq.prospeccao&select=*`);
    const cases = await sg(`crm_cases?agencia_id=eq.${ag.id}&ativo=eq.true&permitido_em_prospeccao=eq.true&destaque=eq.true&select=id,titulo,marca,resumo,url_pagina&limit=5`);

    for (const d of elegiveis) {
      if (totalGerado >= limite) break;
      const emp = d.crm_empresas || {};
      const canalList = canaisDisponiveis(d).filter(c => canais.includes(c) && (restante[c] || 0) > 0);
      if (canalList.length === 0) continue;

      const canal = canalList[0];
      const etapa = d.etapa_cadencia || 'etapa1';
      const tpl = (templates || []).find(t => t.canal === canal && t.etapa && t.etapa.includes(etapa.replace('etapa', '')));
      const caso = cases && cases.length > 0 ? cases[Math.floor(Math.random() * cases.length)] : null;
      const estrelas = scoreMap[d.empresa_id] || 0;

      const prompt = `Gere uma mensagem de prospecção.
Agência: ${ag.nome}
Empresa-alvo: ${emp.nome || d.empresa_id}
Setor: ${emp.setor || emp.segmento_detalhe || 'não especificado'}
Decisor: ${d.nome}, ${d.cargo || 'cargo desconhecido'}
Canal: ${canal}
Etapa: ${etapa}
Relevância da empresa: ${estrelas}/5 estrelas
${tpl ? 'Template base: ' + tpl.corpo.slice(0, 300) : ''}
${caso ? 'Case de referência: ' + caso.titulo + ' (' + (caso.marca || '') + ') — ' + (caso.resumo || '') : ''}
Personalize o template para esta empresa e decisor específicos.`;

      try {
        const txt = await gerarTexto(anthropic, prompt, canal);
        const row = await sp('crm_fila', {
          agencia_id: ag.id, agencia_slug: ag.nome,
          empresa_id: d.empresa_id, decisor_id: d.id,
          canal, etapa, status: 'rascunho',
          assunto: txt.assunto || null,
          corpo: txt.corpo,
          case_id: caso?.id || null,
          template_id: tpl?.id || null,
          tokens_prompt: txt.tokens_prompt, tokens_resposta: txt.tokens_resposta,
          custo_usd: txt.custo_usd, modelo: 'claude-sonnet-4-6',
          contexto_para_aprovacao: `${emp.nome || ''} · ${d.nome} · ${d.cargo || ''} · ${estrelas}★`
        });

        if (row) {
          restante[canal] = (restante[canal] || 0) - 1;
          totalGerado++;
          gerados.push({ id: row[0]?.id, empresa: emp.nome, decisor: d.nome, canal, estrelas });
          await sp(`crm_decisores?id=eq.${d.id}`, { ultimo_toque_em: new Date().toISOString() }, 'PATCH');
        }
      } catch (e) {
        erros.push({ empresa: emp.nome, decisor: d.nome, err: e.message });
      }
    }
  }

  return res.status(200).json({ gerados: totalGerado, itens: gerados, erros, bloqueados });
}
