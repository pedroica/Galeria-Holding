// D3 — Gerar fila de prospecção
// POST /api/gerar-fila
// Body: { agencia_slug?, canais?, limite? }
// Auth: Bearer Supabase JWT
// Regras D1: exclusividade semanal, etapa_cadencia, pausa, status ativo, email_valido
// Regras D2: ordena estrelas→sinal_recente→temperatura, 1 decisor/empresa, limites diários
// Gera texto via Claude (claude-sonnet-4-6), ≤120 palavras, ≤8 palavras assunto

import Anthropic from '@anthropic-ai/sdk';

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPA_CRM_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

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

// Início da semana BRT (segunda-feira 00:00)
function inicioSemana() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dia = now.getDay();
  const seg = new Date(now);
  seg.setDate(now.getDate() - (dia === 0 ? 6 : dia - 1));
  seg.setHours(0, 0, 0, 0);
  return seg.toISOString();
}

// Contagem enviados hoje por canal
async function contadosHoje(canal) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const rows = await sg(`crm_fila?canal=eq.${canal}&status=in.(aprovado,enviado)&enviado_em=gte.${hoje.toISOString()}&select=id`);
  return Array.isArray(rows) ? rows.length : 0;
}

// D1 — elegibilidade de um decisor
function elegivel(d, semanaInicio) {
  if (!d) return false;
  if (d.status && ['inativo', 'removido', 'descadastrado'].includes(d.status)) return false;
  if (d.email_valido === false && !d.wa) return false; // sem contato válido
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
  try { const m = txt.match(/\{[\s\S]+\}/); if (m) obj = JSON.parse(m[0]); } catch (e) {}
  return {
    assunto: obj.assunto || '',
    corpo: obj.corpo || txt.slice(0, 600),
    tokens_prompt: r.usage?.input_tokens || 0,
    tokens_resposta: r.usage?.output_tokens || 0,
    custo_usd: ((r.usage?.input_tokens || 0) * 3 + (r.usage?.output_tokens || 0) * 15) / 1_000_000
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!auth || !(await verifyJWT(auth))) return res.status(401).json({ error: 'Não autenticado' });

  const { agencia_slug, canais = ['email', 'whatsapp'], limite = 30 } = req.body || {};

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const semana = inicioSemana();
  const gerados = [];
  const erros = [];

  // D2 — buscar agências a processar
  let agencias;
  if (agencia_slug) {
    agencias = await sg(`crm_agencias?id_slug=eq.${agencia_slug}&select=*`) ||
               await sg(`crm_agencias?select=*&limit=14`);
  } else {
    agencias = await sg('crm_agencias?select=*&order=nome.asc&limit=14');
  }
  if (!Array.isArray(agencias) || agencias.length === 0) return res.status(200).json({ gerados: 0, erros: [] });

  // Limites restantes por canal hoje
  const restante = {};
  for (const c of canais) {
    const usados = await contadosHoje(c);
    restante[c] = Math.max(0, (LIMITES[c] || 50) - usados);
  }

  let totalGerado = 0;

  for (const ag of agencias) {
    if (totalGerado >= limite) break;

    // D2: buscar decisores elegíveis ordenados por estrelas desc, sinal_recente desc, temperatura desc
    // 1 decisor por empresa — usar DISTINCT ON empresa_id
    const decisores = await sg(
      `crm_decisores?etapa_cadencia=neq.off&status=neq.inativo&select=*,crm_empresas!empresa_id(id,nome,setor,segmento_detalhe,estrelas,sinal_recente_em,cliente_ativo,agencia_atendendo)` +
      `&order=estrelas.desc,sinal_recente_em.desc,temperatura.desc&limit=50`
    );
    if (!Array.isArray(decisores)) continue;

    // D1 — filtrar elegíveis, 1 por empresa
    const empresasVistas = new Set();
    const elegiveis = decisores.filter(d => {
      if (!elegivel(d, semana)) return false;
      if (empresasVistas.has(d.empresa_id)) return false;
      // Exclusividade semanal: não recebeu nesta semana
      if (d.ultimo_toque_em && new Date(d.ultimo_toque_em) > new Date(semana)) return false;
      // Empresa não pode estar em carteira/cliente ativo de outra agência com conflito
      const emp = d.crm_empresas;
      if (emp && emp.cliente_ativo && emp.agencia_atendendo && emp.agencia_atendendo !== ag.id) return false;
      empresasVistas.add(d.empresa_id);
      return true;
    });

    // Buscar templates e cases para esta agência
    const templates = await sg(`crm_templates?agencia_id=eq.${ag.id}&tipo=eq.prospeccao&select=*`);
    const cases = await sg(`crm_cases?agencia_id=eq.${ag.id}&ativo=eq.true&permitido_em_prospeccao=eq.true&destaque=eq.true&select=id,titulo,marca,resumo,url_pagina&limit=5`);

    for (const d of elegiveis) {
      if (totalGerado >= limite) break;
      const emp = d.crm_empresas || {};
      const canalList = canaisDisponiveis(d).filter(c => canais.includes(c) && (restante[c] || 0) > 0);
      if (canalList.length === 0) continue;

      const canal = canalList[0];
      const etapa = d.etapa_cadencia || 'etapa1';

      // Selecionar template para este canal e etapa
      const tpl = (templates || []).find(t => t.canal === canal && t.etapa && t.etapa.includes(etapa.replace('etapa', '')));
      const caso = cases && cases[Math.floor(Math.random() * (cases.length || 1))];

      const prompt = `Gere uma mensagem de prospecção.
Agência: ${ag.nome}
Empresa-alvo: ${emp.nome || d.empresa_id}
Setor: ${emp.setor || emp.segmento_detalhe || 'não especificado'}
Decisor: ${d.nome}, ${d.cargo || 'cargo desconhecido'}
Canal: ${canal}
Etapa: ${etapa}
${tpl ? 'Template base: ' + tpl.corpo.slice(0, 300) : ''}
${caso ? 'Case de referência: ' + caso.titulo + ' (' + (caso.marca || '') + ') — ' + (caso.resumo || '') : ''}
Personalize o template para esta empresa e decisor específicos.`;

      try {
        const txt = await gerarTexto(anthropic, prompt, canal);
        const row = await sp('crm_fila', {
          agencia_id: ag.id, agencia_slug: ag.id,
          empresa_id: d.empresa_id, decisor_id: d.id,
          canal, etapa, status: 'rascunho',
          assunto: txt.assunto || null,
          corpo: txt.corpo,
          case_id: caso?.id || null,
          template_id: tpl?.id || null,
          tokens_prompt: txt.tokens_prompt, tokens_resposta: txt.tokens_resposta,
          custo_usd: txt.custo_usd, modelo: 'claude-sonnet-4-6',
          contexto_para_aprovacao: `${emp.nome || ''} · ${d.nome} · ${d.cargo || ''}`
        });

        if (row) {
          restante[canal] = (restante[canal] || 0) - 1;
          totalGerado++;
          gerados.push({ id: row[0]?.id, empresa: emp.nome, decisor: d.nome, canal });
          // Atualizar ultimo_toque_em no decisor
          await sp(`crm_decisores?id=eq.${d.id}`, { ultimo_toque_em: new Date().toISOString() }, 'PATCH');
        }
      } catch (e) {
        erros.push({ empresa: emp.nome, decisor: d.nome, err: e.message });
      }
    }
  }

  // Atualizar custos em crm_configuracoes
  const totalCusto = gerados.reduce((acc, g) => acc, 0); // simplificado
  await sp('crm_configuracoes?id=eq.custos_tokens', {
    valor: { ultimo_run: new Date().toISOString(), ultimo_gerado: totalGerado },
    atualizado_em: new Date().toISOString()
  }, 'PATCH').catch(() => {});

  return res.status(200).json({ gerados: totalGerado, itens: gerados, erros });
}
