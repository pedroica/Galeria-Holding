// lib/canais-envio.js — saída real de mensagens (e-mail pelo Graph, WhatsApp pela
// Cloud API). Só é chamado pelo job sdr-envio DEPOIS de podeEnviar() aprovar.
// Nunca loga token nem corpo completo.

export async function enviarEmailGraph(token, { para, assunto, html }) {
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject: assunto, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: para } }] }, saveToSentItems: true })
  });
  if (r.status === 202 || r.ok) return { ok: true };
  const t = await r.text().catch(() => '');
  return { ok: false, erro: 'graph ' + r.status + ': ' + t.slice(0, 160) };
}

export function normalizarWa(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

// O corpo vira o parâmetro {{2}} do modelo aprovado. A Meta não aceita quebra de
// linha nem 4+ espaços seguidos dentro de parâmetro.
export function parametrosTemplate(primeiroNome, corpo) {
  let miolo = String(corpo || '')
    .replace(/^\s*(oi|olá|ola|bom dia|boa tarde)[^,\n]*,\s*/i, '')
    .replace(/\n+\s*pedro ica\s*$/i, '')
    .replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return [{ type: 'text', text: primeiroNome || 'tudo bem' }, { type: 'text', text: miolo.slice(0, 900) }];
}

export async function enviarWhatsAppTemplate({ token, phoneId, para, template, idioma, parametros }) {
  const r = await fetch('https://graph.facebook.com/v21.0/' + phoneId + '/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'template',
      template: { name: template, language: { code: idioma || 'pt_BR' }, components: [{ type: 'body', parameters: parametros }] } })
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.messages && j.messages[0]) return { ok: true, id: j.messages[0].id };
  return { ok: false, erro: 'whatsapp ' + r.status + ': ' + JSON.stringify(j.error || j).slice(0, 160) };
}
