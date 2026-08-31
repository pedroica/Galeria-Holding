// Compatibilidade de runtime para as funções da Vercel.
//
// Por que isto existe: a Vercel entrega o request em dois formatos diferentes
// dependendo do runtime que ela escolhe — ora um `Request` web (headers com
// .get(), url absoluta, você devolve um `Response`), ora um `IncomingMessage`
// estilo Node (headers como objeto, url relativa, você escreve num `res`).
// O handshake do webhook já quebrou uma vez por causa disso.
//
// Em vez de apostar num formato, tratamos os dois. Funções puras, testáveis
// sem rede.

export interface NodeLikeResponse {
  statusCode?: number;
  setHeader?(name: string, value: string): void;
  end(body?: string): void;
}

/** Header por nome, em qualquer um dos dois formatos. Case-insensitive. */
export function getHeader(req: any, name: string): string | undefined {
  const h = req?.headers;
  if (!h) return undefined;
  if (typeof h.get === "function") return h.get(name) ?? undefined;
  if (typeof h === "object") {
    const alvo = name.toLowerCase();
    const chave = Object.keys(h).find((k) => k.toLowerCase() === alvo);
    if (!chave) return undefined;
    const v = (h as Record<string, unknown>)[chave];
    return Array.isArray(v) ? String(v[0]) : v == null ? undefined : String(v);
  }
  return undefined;
}

/** URL absoluta mesmo quando `req.url` vem relativa (estilo Node). */
export function absoluteUrl(req: any): URL {
  const bruta = String(req?.url || "/");
  if (/^https?:\/\//i.test(bruta)) return new URL(bruta);
  const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host") || "localhost";
  const proto = getHeader(req, "x-forwarded-proto") || "https";
  return new URL(bruta, `${proto}://${host}`);
}

export type RawBody =
  | { ok: true; raw: string; fonte: "text" | "rawBody" | "stream" | "body-string" }
  | { ok: false; motivo: string };

/**
 * Corpo CRU, em bytes exatos — é o que a assinatura da Meta cobre.
 *
 * A ordem importa: quem já tem o texto pronto (`rawBody`, body string) vem
 * antes do stream, porque ler um stream já consumido devolve vazio em silêncio
 * e a assinatura falharia sem explicação.
 *
 * Se só sobrou `req.body` como objeto já desserializado, os bytes originais se
 * perderam e NÃO dá para verificar assinatura. Aí devolvemos ok:false — quem
 * chama recusa a requisição em vez de confiar num corpo não verificado.
 */
export async function readRawBody(req: any): Promise<RawBody> {
  // 1. Já veio pronto (alguns runtimes preservam em rawBody).
  const rawProp = req?.rawBody;
  if (typeof rawProp === "string" && rawProp.length) {
    return { ok: true, raw: rawProp, fonte: "rawBody" };
  }
  if (rawProp && typeof rawProp === "object" && typeof rawProp.toString === "function" && rawProp.length) {
    return { ok: true, raw: rawProp.toString("utf8"), fonte: "rawBody" };
  }

  // 2. Body como string/Buffer (parser desligado).
  const body = req?.body;
  if (typeof body === "string" && body.length) {
    return { ok: true, raw: body, fonte: "body-string" };
  }
  if (body && typeof body === "object" && typeof body.byteLength === "number" && body.byteLength) {
    return { ok: true, raw: Buffer.from(body).toString("utf8"), fonte: "body-string" };
  }

  // 3. Request web.
  if (typeof req?.text === "function") {
    try {
      const texto = await req.text();
      if (typeof texto === "string" && texto.length) {
        return { ok: true, raw: texto, fonte: "text" };
      }
    } catch {
      // cai para o stream
    }
  }

  // 4. Stream Node ainda não consumido.
  if (typeof req?.[Symbol.asyncIterator] === "function" && req?.readableEnded !== true) {
    try {
      const partes: Buffer[] = [];
      for await (const chunk of req) {
        partes.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
      }
      if (partes.length) {
        return { ok: true, raw: Buffer.concat(partes).toString("utf8"), fonte: "stream" };
      }
    } catch {
      // cai para a recusa
    }
  }

  if (body && typeof body === "object") {
    return {
      ok: false,
      motivo:
        "o runtime desserializou o corpo antes do handler; os bytes originais se perderam " +
        "e a assinatura da Meta não pode ser conferida",
    };
  }
  return { ok: false, motivo: "corpo vazio ou ilegível" };
}

/**
 * Responde nos dois formatos. Devolve um `Response` quando não há `res`
 * (runtime web) e `undefined` quando escreveu no `res` (runtime Node).
 */
export function reply(
  res: NodeLikeResponse | undefined,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
): Response | undefined {
  if (res && typeof res.end === "function") {
    res.statusCode = status;
    if (typeof res.setHeader === "function") res.setHeader("Content-Type", contentType);
    res.end(body);
    return undefined;
  }
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}
