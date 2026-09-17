// E3 — Cron sexta 17h BRT: fechamento semanal automático
// - Move cards 'negociacao' sem atualização na semana de volta para 'contato' (stale)
// - Move cards 'fechamento' com > 14 dias sem atualização → 'negociacao' (não fecharam)
// - Gera sumário de métricas e salva em crm_config (chave: relatorio_semanal_ultimo)
// Schedule: "0 20 * * 5" (sexta 20h UTC = 17h BRT)

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;

async function sg(path) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
  });
  return r.ok ? r.json() : [];
}
async function sp(path, body, method = 'PATCH') {
  await fetch(SUPA_URL + '/rest/v1/' + path, {
    method,
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const now = new Date();
  // Verificar se é sexta (0=dom...5=sex) — Vercel agenda garante isso, mas checamos por segurança
  const diaBRT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  if (diaBRT.getDay() !== 5) {
    return res.status(200).json({ ok: true, msg: 'Não é sexta, pulando.' });
  }

  const semSeg = new Date(now);
  semSeg.setDate(semSeg.getDate() - (semSeg.getDay() === 0 ? 6 : semSeg.getDay() - 1));
  semSeg.setHours(0, 0, 0, 0);
  const limite14d = new Date(now);
  limite14d.setDate(limite14d.getDate() - 14);

  // 1. Cards em 'negociacao' sem atualização desde segunda → stale_negociacao
  const negStale = await sg(
    `crm_kanban?col=eq.negociacao&atualizado_em=lt.${semSeg.toISOString()}&select=id,nome,agencia_id`
  );
  for (const c of (Array.isArray(negStale) ? negStale : [])) {
    await sp(`crm_kanban?id=eq.${c.id}`, { col: 'contato', atualizado_em: now.toISOString(), notas: '[Auto] Voltou para Contato — sem movimento na semana' });
  }

  // 2. Cards em 'fechamento' há mais de 14 dias → negociacao (não fecharam)
  const fechStale = await sg(
    `crm_kanban?col=eq.fechamento&atualizado_em=lt.${limite14d.toISOString()}&select=id,nome,agencia_id`
  );
  for (const c of (Array.isArray(fechStale) ? fechStale : [])) {
    await sp(`crm_kanban?id=eq.${c.id}`, { col: 'negociacao', atualizado_em: now.toISOString(), notas: '[Auto] Voltou para Negociação — mais de 14 dias sem fechamento' });
  }

  // 3. Métricas da semana
  const reunioesSem = await sg(
    `crm_kanban?col=eq.reuniao&atualizado_em=gte.${semSeg.toISOString()}&select=id,agencia_id`
  );
  const enviados = await sg(
    `crm_fila?status=in.(aprovado,enviado,respondido)&enviado_em=gte.${semSeg.toISOString()}&select=id,canal,status`
  );
  const respostas = (Array.isArray(enviados) ? enviados : []).filter(x => x.status === 'respondido').length;

  const relatorio = {
    semana_inicio: semSeg.toISOString().slice(0, 10),
    gerado_em: now.toISOString(),
    reunioes: Array.isArray(reunioesSem) ? reunioesSem.length : 0,
    enviados: Array.isArray(enviados) ? enviados.length : 0,
    respostas,
    negociacao_stale_movidos: Array.isArray(negStale) ? negStale.length : 0,
    fechamento_stale_movidos: Array.isArray(fechStale) ? fechStale.length : 0,
  };

  // Salvar relatorio em crm_config (upsert)
  await fetch(SUPA_URL + '/rest/v1/crm_config', {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ chave: 'relatorio_semanal_ultimo', valor: JSON.stringify(relatorio) })
  });

  console.log('[cron:fechamento-sexta]', relatorio);
  return res.status(200).json({ ok: true, ...relatorio });
}
