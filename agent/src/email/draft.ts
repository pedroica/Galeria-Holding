// Construtor de mensagem MIME para a Gmail API (drafts.create → message.raw).
// Produz base64url (URL-safe, sem padding) de uma mensagem RFC822
// multipart/alternative (text + html). Puro e testável.

export interface DraftInput {
  fromName?: string;
  fromEmail: string;
  toName?: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string; // Message-ID do D0, para encadear o follow-up na mesma thread
  references?: string;
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Codifica header com não-ASCII em MIME encoded-word (UTF-8/base64).
function encHeader(value: string): string {
  // ASCII puro passa direto
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${b64(value)}?=`;
}

function addr(name: string | undefined, email: string): string {
  return name ? `${encHeader(name)} <${email}>` : email;
}

/** Monta a mensagem RFC822 (texto cru). */
export function buildRfc822(input: DraftInput): string {
  const boundary = "b_galeria_" + input.subject.length + "_" + input.toEmail.length;
  const headers = [
    `From: ${addr(input.fromName, input.fromEmail)}`,
    `To: ${addr(input.toName, input.toEmail)}`,
    `Subject: ${encHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
    headers.push(`References: ${input.references || input.inReplyTo}`);
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const body = [
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(input.html),
    `--${boundary}--`,
    "",
  ];
  return headers.join("\r\n") + "\r\n" + body.join("\r\n");
}

/** Retorna o `raw` (base64url) para o corpo do drafts.create da Gmail API. */
export function buildDraftRaw(input: DraftInput): string {
  return toBase64Url(buildRfc822(input));
}
