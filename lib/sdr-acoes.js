// lib/sdr-acoes.js — aplica no CRM o efeito de uma resposta recebida (e-mail ou
// WhatsApp). Compartilhado entre o cron (caixa do Outlook) e o webhook do
// WhatsApp. `db` é um adaptador: { get(path), send(path, body, method), insertRet(path, body), insertNovo(path, body) }.
// NUNCA responde ninguém.
import { acaoPara } from './sdr-respostas.js';

export async function aplicarResposta(db, { decisor: d, cls, canal, externalId, conversationId, remetente, assunto, texto, recebidoEm }) {
  const agora = new Date().toISOString();
  const reg = await db.insertNovo('crm_sdr_respostas?on_conflict=graph_message_id', {
    graph_message_id: externalId, conversation_id: conversationId || null, decisor_id: d.id, empresa_id: d.empresa_id,
    remetente, assunto: (assunto || '').slice(0, 300), preview: (texto || '').slice(0, 1000),
    recebido_em: recebidoEm || agora, tipo: cls.tipo, confianca: cls.confianca, evidencia: (cls.evidencia || '').slice(0, 200)
  });
  if (!reg) return null;   // já processada antes (idempotente)
  const ac = acaoPara(cls.tipo);
  const acoes = [];
  const fonte = canal === 'whatsapp' ? 'sistema' : 'outlook';

  if (ac.resultado_toque) {
    await db.send('crm_toques', { decisor_id: d.id, empresa_id: d.empresa_id, canal, direcao: 'recebido',
      assunto: (assunto || '').slice(0, 500), resumo: (cls.tipo + ': ' + (texto || '')).slice(0, 500),
      data: recebidoEm || agora, fonte, resultado: ac.resultado_toque });
    acoes.push('toque');
  }
  if (ac.marcar_email_invalido) {
    await db.send(`crm_decisores?id=eq.${d.id}`, { email_valido: false, atualizado_em: agora }, 'PATCH');
    await db.send(`crm_fila?decisor_id=eq.${d.id}&canal=eq.email&status=in.(rascunho,aprovado)`, { status: 'pulado', motivo_pulo: 'bounce: e-mail inválido' }, 'PATCH');
    if (!d.wa) await db.send(`crm_sdr_estado?decisor_id=eq.${d.id}&status=eq.ativo`, { status: 'bounce', motivo: 'e-mail voltou e não há WhatsApp', atualizado_em: agora }, 'PATCH');
    acoes.push('email_invalido');
  }
  if (ac.opt_out) {
    await db.send(`crm_decisores?id=eq.${d.id}`, { opt_out: true, opt_out_em: agora, etapa_cadencia: 'off', atualizado_em: agora }, 'PATCH');
    acoes.push('opt_out');
  }
  if (ac.parar_cadencia && cls.tipo !== 'bounce') {
    await db.send(`crm_sdr_estado?decisor_id=eq.${d.id}&status=eq.ativo`, { status: cls.tipo === 'opt_out' ? 'opt_out' : 'respondeu', motivo: 'resposta: ' + cls.tipo, atualizado_em: agora }, 'PATCH');
    await db.send(`crm_fila?decisor_id=eq.${d.id}&status=in.(rascunho,aprovado)`, { status: 'pulado', motivo_pulo: 'respondeu (' + cls.tipo + ')' }, 'PATCH');
    await db.send(`crm_fila?decisor_id=eq.${d.id}&status=eq.enviado`, { status: 'respondido' }, 'PATCH');
    if (cls.tipo !== 'opt_out') {
      const patch = { respondeu: true, status: 'respondeu', atualizado_em: agora };
      if (ac.pausar_dias) patch.pausa_ate_em = new Date(Date.now() + ac.pausar_dias * 86400000).toISOString();
      await db.send(`crm_decisores?id=eq.${d.id}`, patch, 'PATCH');
    }
    acoes.push('cadencia_parada');
  }
  let opId = null, criou = false;
  if (ac.oportunidade && d.empresa_id) {
    const abertas = await db.get(`crm_oportunidades?empresa_id=eq.${d.empresa_id}&apagado_em=is.null&fechada_em=is.null&estagio=not.in.(Perdido,Pausado)&select=id&limit=1`);
    if (Array.isArray(abertas) && abertas.length) { opId = abertas[0].id; acoes.push('oportunidade_existente'); }
    else if (Array.isArray(abertas)) {
      const est = await db.get(`crm_sdr_estado?decisor_id=eq.${d.id}&select=agencia_id&order=criado_em.desc&limit=1`);
      const op = await db.insertRet('crm_oportunidades', {
        empresa_id: d.empresa_id, agencia_id: (Array.isArray(est) && est[0] && est[0].agencia_id) || null,
        titulo: ((d.crm_empresas && d.crm_empresas.nome) || 'Empresa') + ': resposta de ' + (d.nome || remetente),
        estagio: 'Contato direto', origem: 'fila',
        proximo_passo: 'Responder ' + (d.nome || '') + ' e marcar a primeira reunião',
        proximo_passo_em: agora.slice(0, 10)
      });
      if (op) { opId = op.id; criou = true; acoes.push('oportunidade_criada'); }
    }
  }
  await db.send(`crm_sdr_respostas?id=eq.${reg.id}`, { acao: acoes.join(','), oportunidade_id: opId }, 'PATCH');
  return { id: reg.id, acoes, oportunidade_id: opId, oportunidade_criada: criou };
}
