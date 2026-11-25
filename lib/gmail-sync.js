// lib/gmail-sync.js — sincronização incremental com o Gmail (History API).
// O Gmail é a fonte de verdade do que aconteceu com os rascunhos do agente:
// enviado, editado no Gmail, apagado. Só LÊ: nada aqui envia ou apaga.
//
// Por que History API e não Pub/Sub: notificações push exigem um tópico Google
// Cloud Pub/Sub com permissão para o Gmail publicar e um endpoint público
// assinado; o projeto não tem essa estrutura. A History API a cada 15 min é
// incremental (só o que mudou desde o último historyId), barata e confiável;
// se o historyId expirar (~1 semana sem uso), cai na reconciliação completa.

import { gmailReq } from './gmail-token.js';

// Message-ID que o agente põe em cada rascunho: <fila-UUID@agente.galeriaholding.crm>
export function filaIdDoMessageId(h) {
  const m = String(h || '').match(/<?fila-([0-9a-f-]{36})@agente\.galeriaholding\.crm>?/i);
  return m ? m[1].toLowerCase() : null;
}

export async function perfilGmail(token) {
  const p = await gmailReq('GET', '/profile', null, token);
  return { historyId: p && p.historyId ? String(p.historyId) : null, email: p && p.emailAddress };
}

// Lê o histórico desde startHistoryId (paginado). expirado=true se o Gmail não
// guarda mais esse ponto (404): aí o chamador faz a reconciliação completa.
export async function historicoGmail(token, startHistoryId, { maxPaginas = 10 } = {}) {
  const registros = []; let pageToken = null; let historyId = String(startHistoryId); let paginas = 0;
  try {
    do {
      const q = '/history?startHistoryId=' + encodeURIComponent(startHistoryId) + '&historyTypes=messageAdded&historyTypes=labelAdded&maxResults=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const r = await gmailReq('GET', q, null, token);
      for (const h of (r.history || [])) registros.push(h);
      if (r.historyId) historyId = String(r.historyId);
      pageToken = r.nextPageToken || null; paginas++;
    } while (pageToken && paginas < maxPaginas);
  } catch (e) {
    if (e.status === 404) return { expirado: true, registros: [], historyId: null };
    throw e;
  }
  return { expirado: false, registros, historyId, truncado: !!pageToken };
}

// Puro: dos registros do histórico, as mensagens que interessam. SENT = possível
// envio; DRAFT novo numa conversa rastreada = rascunho editado no Gmail.
export function eventosDoHistorico(registros, threadsRastreadas) {
  const vistos = new Set(); const out = [];
  for (const h of (Array.isArray(registros) ? registros : [])) {
    const msgs = [].concat((h.messagesAdded || []).map(x => x.message), (h.labelsAdded || []).map(x => Object.assign({}, x.message, { labelIds: x.labelIds && x.message && x.message.labelIds ? x.message.labelIds : (x.labelIds || []) })));
    for (const m of msgs) {
      if (!m || !m.id) continue;
      const labels = m.labelIds || [];
      const rastreada = threadsRastreadas && threadsRastreadas.has(m.threadId);
      let tipo = null;
      if (labels.includes('SENT')) tipo = 'enviado_candidato';
      else if (labels.includes('DRAFT') && rastreada) tipo = 'rascunho_editado';
      if (!tipo) continue;
      const k = m.id + '|' + tipo; if (vistos.has(k)) continue; vistos.add(k);
      out.push({ tipo, messageId: m.id, threadId: m.threadId || null });
    }
  }
  return out;
}

const hdr = (hs, n) => ((hs || []).find(x => String(x.name).toLowerCase() === n) || {}).value || '';

export async function metadadosMensagem(token, id) {
  const d = await gmailReq('GET', '/messages/' + encodeURIComponent(id) + '?format=metadata&metadataHeaders=Message-ID&metadataHeaders=To&metadataHeaders=Subject', null, token);
  const hs = (d.payload && d.payload.headers) || [];
  return { id: d.id, threadId: d.threadId, labelIds: d.labelIds || [], messageIdHeader: hdr(hs, 'message-id'), para: hdr(hs, 'to'), assunto: hdr(hs, 'subject'),
    data: new Date(Number(d.internalDate || Date.now())).toISOString() };
}

// Corpo em texto da mensagem (text/plain; senão o HTML sem tags). Usado para
// comparar o que saiu com o que o agente escreveu (aprendizado).
export function textoDoPayload(payload) {
  const partes = [];
  const andar = (p) => { if (!p) return; if (p.parts) p.parts.forEach(andar); else if (p.body && p.body.data) partes.push({ tipo: p.mimeType || '', data: p.body.data }); };
  andar(payload);
  const dec = (b) => Buffer.from(String(b).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const plain = partes.find(p => /text\/plain/i.test(p.tipo));
  if (plain) return dec(plain.data);
  const html = partes.find(p => /text\/html/i.test(p.tipo));
  if (!html) return '';
  return dec(html.data).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}
export async function corpoMensagem(token, id) {
  const d = await gmailReq('GET', '/messages/' + encodeURIComponent(id) + '?format=full', null, token);
  // Tira a citação de resposta e a assinatura do Gmail (depois de "-- ").
  return textoDoPayload(d.payload).split(/\n--\s*\n/)[0].trim();
}
