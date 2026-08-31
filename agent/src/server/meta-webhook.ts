// Registro do webhook na Meta pela Graph API.
//
// Existe para você não precisar abrir o painel da Meta: o daemon registra a URL
// pública sozinho ao subir, e de novo sempre que ela mudar (o túnel gratuito
// troca de endereço a cada reinício).
//
// São duas chamadas, e as duas são idempotentes — repetir não duplica nada:
//   1. /{app-id}/subscriptions   → diz à Meta para onde mandar os eventos
//   2. /{waba-id}/subscribed_apps → liga a sua conta WhatsApp a este app
//
// A Meta chama o nosso GET de verificação durante a etapa 1, então o servidor
// precisa estar de pé ANTES de registrar.

export interface RegistroMeta {
  appId: string;
  appSecret: string;
  verifyToken: string;
  callbackUrl: string;
  wabaId?: string;
  token?: string; // token do usuário do sistema, para subscribed_apps
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface ResultadoRegistro {
  ok: boolean;
  callbackUrl: string;
  etapas: { etapa: string; ok: boolean; detalhe?: string }[];
}

/** Token de app = "{app-id}|{app-secret}". Formato da própria Meta. */
export function appAccessToken(appId: string, appSecret: string): string {
  return `${appId}|${appSecret}`;
}

/** Corpo da inscrição do webhook. `fields=messages` é o que traz as conversas. */
export function corpoSubscription(r: {
  callbackUrl: string;
  verifyToken: string;
  appId: string;
  appSecret: string;
}): URLSearchParams {
  return new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: r.callbackUrl,
    verify_token: r.verifyToken,
    fields: "messages",
    access_token: appAccessToken(r.appId, r.appSecret),
  });
}

/** A URL precisa ser https e pública — a Meta recusa http e localhost. */
export function urlAceitavel(url: string): { ok: boolean; motivo?: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: "não é uma URL válida" };
  }
  if (u.protocol !== "https:") return { ok: false, motivo: "a Meta só aceita https" };
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1)/i.test(u.hostname)) {
    return { ok: false, motivo: "endereço local não é alcançável pela Meta" };
  }
  return { ok: true };
}

export async function registrarWebhook(r: RegistroMeta): Promise<ResultadoRegistro> {
  const doFetch = r.fetchImpl || fetch;
  const versao = r.apiVersion || "v21.0";
  const base = `https://graph.facebook.com/${versao}`;
  const etapas: ResultadoRegistro["etapas"] = [];

  const check = urlAceitavel(r.callbackUrl);
  if (!check.ok) {
    return {
      ok: false,
      callbackUrl: r.callbackUrl,
      etapas: [{ etapa: "url", ok: false, detalhe: check.motivo }],
    };
  }

  // 1. Inscrever o app no objeto whatsapp_business_account.
  try {
    const res = await doFetch(`${base}/${r.appId}/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpoSubscription(r).toString(),
    });
    const texto = await res.text();
    etapas.push({
      etapa: "subscriptions",
      ok: res.ok,
      detalhe: res.ok ? undefined : `HTTP ${res.status}: ${texto.slice(0, 300)}`,
    });
  } catch (e) {
    etapas.push({
      etapa: "subscriptions",
      ok: false,
      detalhe: e instanceof Error ? e.message : String(e),
    });
  }

  // 2. Ligar a conta WhatsApp ao app (opcional: só se você informou o WABA ID).
  if (r.wabaId && r.token) {
    try {
      const res = await doFetch(`${base}/${r.wabaId}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${r.token}` },
      });
      const texto = await res.text();
      etapas.push({
        etapa: "subscribed_apps",
        ok: res.ok,
        detalhe: res.ok ? undefined : `HTTP ${res.status}: ${texto.slice(0, 300)}`,
      });
    } catch (e) {
      etapas.push({
        etapa: "subscribed_apps",
        ok: false,
        detalhe: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ok: etapas.every((e) => e.ok), callbackUrl: r.callbackUrl, etapas };
}
