// lib/agenda-google.js — Google Agenda do Pedro (mesmo login do Gmail, escopo calendar.events).
// Pedido de 26/11: o amigo no Telegram vê a agenda e marca reuniões.
// Regra: evento só na agenda dele = direto; evento COM convidados manda convite para
// terceiros, então só sai com o "manda" do Pedro (lib/amigo-wa.js).
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const FUSO = 'America/Sao_Paulo';

export class SemEscopoAgenda extends Error {}

async function calReq(token, method, url, body) {
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 403 || r.status === 401) {
    const t = await r.text().catch(() => '');
    if (/insufficient|scope|PERMISSION|disabled|has not been used/i.test(t) || r.status === 401) throw new SemEscopoAgenda(t.slice(0, 200));
  }
  if (r.status === 204) return null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Google Agenda ' + r.status + ': ' + String((d.error && d.error.message) || '').slice(0, 160));
  return d;
}

// "2026-12-03T15:00" (hora de Brasília) → ISO com -03:00. Brasil sem horário de verão desde 2019.
export function isoBrasilia(local) {
  const s = String(local || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return m[1] + 'T' + m[2] + ':' + m[3] + ':00-03:00';
}
export function somarMinutos(iso, min) { return new Date(Date.parse(iso) + min * 60000).toISOString(); }

export function resumoEvento(e) {
  const ini = (e.start && (e.start.dateTime || e.start.date)) || '';
  const diaTodo = !!(e.start && e.start.date && !e.start.dateTime);
  const quando = diaTodo ? ini.split('-').reverse().join('/') + ' (dia todo)'
    : new Date(ini).toLocaleString('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return {
    id: e.id, titulo: e.summary || '(sem título)', quando, inicio: ini,
    fim: (e.end && (e.end.dateTime || e.end.date)) || null,
    local: e.location || null, meet: e.hangoutLink || null,
    convidados: (e.attendees || []).filter(a => !a.self).map(a => (a.displayName ? a.displayName + ' ' : '') + '<' + a.email + '>' + (a.responseStatus && a.responseStatus !== 'needsAction' ? ' ' + a.responseStatus : '')).slice(0, 10)
  };
}

export async function listarEventos(token, { de, ate, busca, max }) {
  const q = new URLSearchParams({ timeMin: de, timeMax: ate, singleEvents: 'true', orderBy: 'startTime', maxResults: String(Math.min(max || 30, 100)), timeZone: FUSO });
  if (busca) q.set('q', busca);
  const d = await calReq(token, 'GET', CAL + '?' + q.toString());
  return (d.items || []).filter(e => e.status !== 'cancelled').map(resumoEvento);
}

export function montarEvento({ titulo, inicio, duracao, descricao, local, convidados, meet }) {
  const ini = isoBrasilia(inicio);
  if (!ini) return null;
  const ev = {
    summary: String(titulo || 'Reunião').slice(0, 200),
    start: { dateTime: ini, timeZone: FUSO },
    end: { dateTime: somarMinutos(ini, Number(duracao) > 0 ? Number(duracao) : 60), timeZone: FUSO }
  };
  if (descricao) ev.description = String(descricao).slice(0, 4000);
  if (local) ev.location = String(local).slice(0, 300);
  const emails = (convidados || []).map(x => String(x || '').trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (emails.length) ev.attendees = emails.map(email => ({ email }));
  if (meet) ev.conferenceData = { createRequest: { requestId: 'gh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  return ev;
}

export async function criarEvento(token, ev) {
  const temConvite = !!(ev.attendees && ev.attendees.length);
  const q = '?conferenceDataVersion=1&sendUpdates=' + (temConvite ? 'all' : 'none');
  return resumoEvento(await calReq(token, 'POST', CAL + q, ev));
}

export async function alterarEvento(token, id, patch, avisar) {
  return resumoEvento(await calReq(token, 'PATCH', CAL + '/' + encodeURIComponent(id) + '?conferenceDataVersion=1&sendUpdates=' + (avisar ? 'all' : 'none'), patch));
}

export async function cancelarEvento(token, id, avisar) {
  await calReq(token, 'DELETE', CAL + '/' + encodeURIComponent(id) + '?sendUpdates=' + (avisar ? 'all' : 'none'));
  return true;
}
