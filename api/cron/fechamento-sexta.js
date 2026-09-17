// E3 — Cron sexta 17h BRT: relatório semanal (sem movimentação de cards)
// Grava métricas em crm_relatorios com token único.
// Nenhum card muda de coluna — isso é decisão do Pedro.
// Schedule: "0 20 * * 5" (sexta 20h UTC = 17h BRT)

const SUPA_URL = process.env.SUPA_CRM_URL || 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPA_CRM_SERVICE_KEY;

async function sg(path) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
  });
  return r.ok ? r.json() : [];
}

function semanaInicio(ref) {
  const d = new Date(ref || Date.now());
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const now = new Date();
  const diaBRT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  // Permite rodar qualquer dia para teste manual; só loga aviso se não for sexta
  const isSexta = diaBRT.getDay() === 5;

  const semSeg = semanaInicio(now);

  // Métricas da semana — kanban
  const kanbanRows = await sg(
    `crm_kanban?select=id,col,agencia_id,responsavel,atualizado_em&atualizado_em=gte.${semSeg.toISOString()}&limit=500`
  );
  const reunioesSem = (Array.isArray(kanbanRows) ? kanbanRows : []).filter(c => c.col === 'reuniao');

  // Métricas da semana — fila
  const filaRows = await sg(
    `crm_fila?select=id,canal,status,agencia_id&enviado_em=gte.${semSeg.toISOString()}&limit=2000`
  );
  const fila = Array.isArray(filaRows) ? filaRows : [];
  const respostas = fila.filter(x => x.status === 'respondido').length;

  // Agências
  const agencias = await sg('crm_agencias?select=id,nome&limit=20');
  const byAg = {};
  for (const ag of (Array.isArray(agencias) ? agencias : [])) {
    const agReunioes = reunioesSem.filter(c =>
      (c.agencia_id || c.responsavel || '').toLowerCase().includes(ag.id.toLowerCase())
    ).length;
    const agFila = fila.filter(f => f.agencia_id === ag.id);
    byAg[ag.nome || ag.id] = {
      reunioes: agReunioes,
      enviados: agFila.length,
      respostas: agFila.filter(f => f.status === 'respondido').length,
    };
  }

  const dados = {
    semana_inicio: semSeg.toISOString().slice(0, 10),
    gerado_em: now.toISOString(),
    reunioes_total: reunioesSem.length,
    enviados_total: fila.length,
    respostas_total: respostas,
    taxa_resposta_pct: fila.length > 0 ? Math.round((respostas / fila.length) * 100) : 0,
    por_agencia: byAg,
    aviso: isSexta ? null : 'Gerado fora de sexta (manual)',
  };

  // Upsert em crm_relatorios (merge por semana_inicio + tipo)
  const upsertRes = await fetch(SUPA_URL + '/rest/v1/crm_relatorios', {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      tipo: 'semanal',
      semana_inicio: semSeg.toISOString().slice(0, 10),
      gerado_em: now.toISOString(),
      dados,
    }),
  });

  let token = null;
  if (upsertRes.ok) {
    const rows = await upsertRes.json();
    token = Array.isArray(rows) && rows[0] ? rows[0].token : null;
  }

  const linkRelatorio = token
    ? `https://galeria-holding.vercel.app/api/relatorio/${token}`
    : null;

  console.log('[cron:fechamento-sexta]', { reunioes: dados.reunioes_total, enviados: dados.enviados_total, respostas, token });
  return res.status(200).json({ ok: true, token, link: linkRelatorio, ...dados });
}
