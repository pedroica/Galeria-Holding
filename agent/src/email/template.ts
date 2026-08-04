// Motor de template de e-mail (Fase 2).
// Personaliza {NOME}, {EMPRESA}, {AREA}. GARANTE que nenhum placeholder vaze:
// render() lança erro se sobrar qualquer {CHAVE} não substituída.

export interface EmailVars {
  NOME: string;
  EMPRESA: string;
  AREA: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const PLACEHOLDER_RE = /\{([A-Z_ÁÉÍÓÚÃÕÇ]+)\}/g;

/**
 * Substitui {CHAVE} pelos valores. Lança se faltar valor ou sobrar placeholder
 * — regra do brief: nenhum {PLACEHOLDER} pode vazar sem substituição.
 */
export function render(tpl: string, vars: Record<string, string>): string {
  const out = tpl.replace(PLACEHOLDER_RE, (_m, key) => {
    const v = vars[key];
    if (v == null || v === "") throw new Error(`Placeholder sem valor: {${key}}`);
    return v;
  });
  const leftover = out.match(PLACEHOLDER_RE);
  if (leftover) throw new Error(`Placeholder não substituído: ${leftover.join(", ")}`);
  return out;
}

// ── Corpos base (D0 e follow-up D+4) ────────────────────────────────────────
export const SUBJECT_TPL = "Reunião Pedro Ica / {EMPRESA}";

export const BODY_D0_TPL = `{NOME},

Acompanho a {EMPRESA} há algum tempo e identifiquei algo que pode ser relevante para {AREA}.

Sou Pedro Ica, Head of Growth da Galeria Holding, grupo com 10 empresas especializadas em comunicação, performance e produção criativa. Além da maior agência da América Latina.

Atuamos pra o Google, Itaú, McDonald's, Flutter, Havaianas, Bauducco, Italac, 3 Corações etc.

Valeria 15 minutos para eu compartilhar um insight que geramos com anunciantes do mesmo segmento?

Abraço,`;

export const BODY_FUP_D4_TPL = `{NOME}, sei que a rotina é corrida — deixo aqui de novo o convite pros 15 minutos. O insight é específico do segmento de vocês e acho que vale. Essa semana funciona?`;

// ── Assinatura HTML: "Pedro Ica / Growth" à esquerda + logo à direita ───────
// logoUrl: URL pública ou data URI do PNG da Galeria Holding (slot pronto).
export function signatureHtml(logoUrl?: string): string {
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="Galeria Holding" style="height:34px;display:block" />`
    : `<span style="font-family:Arial,sans-serif;font-weight:800;letter-spacing:1px;color:#111">GALERIA HOLDING</span>`;
  return `<table cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:1px solid #e0e0e0;padding-top:12px;width:100%;max-width:460px">
  <tr>
    <td style="vertical-align:middle">
      <div style="font-family:Arial,sans-serif;font-weight:700;font-size:14px;color:#111">Pedro Ica</div>
      <div style="font-family:Arial,sans-serif;font-size:12px;color:#666;font-style:italic">Growth</div>
    </td>
    <td style="vertical-align:middle;text-align:right">${logo}</td>
  </tr>
</table>`;
}

function textToHtml(body: string): string {
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export interface RenderOptions {
  logoUrl?: string;
}

/** Renderiza o e-mail D0 (assunto + texto + html com assinatura). */
export function renderD0(vars: EmailVars, opts: RenderOptions = {}): RenderedEmail {
  const v = vars as unknown as Record<string, string>;
  const subject = render(SUBJECT_TPL, v);
  const text = render(BODY_D0_TPL, v);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
${textToHtml(text)}
${signatureHtml(opts.logoUrl)}
</div>`;
  return { subject, text, html };
}

/** Renderiza o follow-up D+4 (assunto mantém a mesma thread). */
export function renderFollowupD4(vars: EmailVars, opts: RenderOptions = {}): RenderedEmail {
  const v = vars as unknown as Record<string, string>;
  const subject = render(SUBJECT_TPL, v);
  const text = render(BODY_FUP_D4_TPL, v);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
${textToHtml(text)}
${signatureHtml(opts.logoUrl)}
</div>`;
  return { subject, text, html };
}
