// lib/followup.js — escreve o follow-up (WhatsApp ou e-mail) de uma oportunidade, com
// pesquisa na internet, o estilo aprendido do Pedro e a conversa do WhatsApp. Usado pela
// tela (api/enrich?provider=wa-pipeline) e pelo amigo no WhatsApp (api/copiloto.js).
// req(path, opts) = fetch autenticado no Supabase (service key) que devolve JSON ou null.
import { promptWhatsappPipeline, lerResposta, checarWhatsapp, escolherContato, linkWhatsapp } from './wa-pipeline.js';
import { linhasEstiloAprendido } from './estilo-aprendido.js';
import { gerarComBusca } from './llm.js';

export async function gerarFollowup({ req, op, empresa, contatos, decisorId, canal = 'whatsapp', instrucao, hojeStr, supaUrl, serviceKey, envKey }) {
  const q = (p) => req(p).catch(() => null);
  const empId = op.empresa_id || null;
  const [toques, eventos, ags, est] = await Promise.all([
    empId ? q('/rest/v1/crm_toques?empresa_id=eq.' + empId + '&select=canal,direcao,resultado,assunto,resumo,data,criado_em&order=criado_em.desc&limit=10') : null,
    !op.id ? null : q('/rest/v1/crm_oportunidade_eventos?oportunidade_id=eq.' + op.id + '&select=tipo,de,para,texto,criado_em&order=criado_em.desc&limit=10'),
    op.agencia_id ? q('/rest/v1/crm_agencias?id=eq.' + op.agencia_id + '&select=nome&limit=1') : null,
    q('/rest/v1/crm_configuracoes?chave=eq.estilo_pedro_aprendido&select=valor&limit=1')
  ]);
  const contato = escolherContato(contatos, decisorId, canal);
  const estiloAprendido = linhasEstiloAprendido(Array.isArray(est) && est[0] ? est[0].valor : null, canal);
  // Conversa do WhatsApp (depósito do Mac) com essa pessoa: as 20 últimas mensagens.
  let conversaWa = [];
  if (contato) {
    const cv = await q('/rest/v1/crm_wa_conversas?decisor_id=eq.' + contato.id + '&select=jid&limit=3');
    const jids = (Array.isArray(cv) ? cv : []).map(c => c.jid);
    if (jids.length) {
      const ms = await q('/rest/v1/crm_wa_mensagens?jid=in.(' + jids.map(j => '"' + j + '"').join(',') + ')&select=de_mim,texto,midia,enviada_em&order=enviada_em.desc&limit=20');
      conversaWa = (Array.isArray(ms) ? ms : []).reverse();
    }
  }
  const pr = promptWhatsappPipeline({ op, empresa, contato, toques: Array.isArray(toques) ? toques : [], eventos: Array.isArray(eventos) ? eventos : [], instrucao,
    agencia: Array.isArray(ags) && ags[0] ? ags[0].nome : '', hoje: hojeStr, canal, estiloAprendido, conversaWa });
  const g = await gerarComBusca({ system: pr.system, content: pr.user, supaUrl, serviceKey, envKey });
  const r = lerResposta(g.texto);
  if (!r) return { erro: 'A IA não devolveu a mensagem. Tente de novo.' + (g.erro ? ' (' + g.erro + ')' : '') };
  const fontes = r.fontes.concat((g.urls || []).filter(x => !r.fontes.includes(x))).slice(0, 6);
  const salvo = !op.id ? null : await req('/rest/v1/crm_oportunidade_mensagens', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    oportunidade_id: op.id, decisor_id: contato ? contato.id : null, canal, assunto: r.assunto || null, corpo: r.mensagem, corpo_original: r.mensagem,
    fato_usado: r.fato_usado || null, fontes, instrucao: instrucao ? String(instrucao).slice(0, 500) : null }) }).catch(() => null);
  return {
    id: Array.isArray(salvo) && salvo[0] ? salvo[0].id : null, canal, assunto: r.assunto, mensagem: r.mensagem, fato_usado: r.fato_usado, fontes,
    alertas: checarWhatsapp(r.mensagem, canal, r.assunto), buscas: g.buscas || 0, contato, link: linkWhatsapp(contato && contato.wa, r.mensagem)
  };
}
