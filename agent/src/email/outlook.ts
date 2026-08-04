// Adapter de e-mail — Microsoft 365 / Outlook via Microsoft Graph API.
// A caixa pedro.ica@galeriaholding.co é Microsoft (não Gmail), então os
// rascunhos são criados em POST /me/messages (nascem como draft/isDraft=true).
//
// buildGraphDraft() é puro e testável. As funções HTTP (token + createDraft)
// rodam no worker (Railway), que tem internet aberta.

import type { RenderedEmail } from "./template.ts";

export interface Recipient {
  name?: string;
  email: string;
}

export interface GraphMessage {
  subject: string;
  body: { contentType: "HTML"; content: string };
  toRecipients: { emailAddress: { address: string; name?: string } }[];
}

/** Monta o corpo JSON de um rascunho para POST /me/messages. */
export function buildGraphDraft(rendered: RenderedEmail, to: Recipient): GraphMessage {
  if (!to.email) throw new Error("destinatário sem email");
  return {
    subject: rendered.subject,
    body: { contentType: "HTML", content: rendered.html },
    toRecipients: [
      { emailAddress: { address: to.email, name: to.name || undefined } },
    ],
  };
}

// ── HTTP (worker) ───────────────────────────────────────────────────────────
export interface OutlookAuth {
  tenant: string; // 'common' | 'organizations' | tenant-id
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Read offline_access";

/** Troca o refresh token por um access token (fluxo delegado). */
export async function getAccessToken(auth: OutlookAuth, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = `https://login.microsoftonline.com/${auth.tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken,
    scope: SCOPE,
  });
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Outlook token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return j.access_token as string;
}

/** Cria um rascunho na caixa do usuário. Retorna o id da mensagem. */
export async function createDraft(
  accessToken: string,
  message: GraphMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; webLink?: string }> {
  const res = await fetchImpl(`${GRAPH}/me/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Graph createDraft ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return { id: j.id, webLink: j.webLink };
}
