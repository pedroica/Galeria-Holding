// api/cron-morning.js — aviso matinal diário (Vercel Cron, 7h BRT = 10h UTC)
// Env vars necessárias em Vercel → Settings → Environment Variables:
//   RESEND_API_KEY  — chave do resend.com (free: 3000 emails/mês)
//   CRON_SECRET     — string aleatória para proteger o endpoint
//   SITE_URL        — URL do app, ex: https://crm-galeria.vercel.app

export default async function handler(req, res) {
  // Apenas Vercel Cron ou requisições com o secret correto
  const auth = req.headers["authorization"];
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "RESEND_API_KEY não configurado" });
  }

  const siteUrl = process.env.SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : "https://seu-crm.vercel.app";

  const agora = new Date().toLocaleString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "America/Sao_Paulo"
  });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0D0D1A;font-family:-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D1A;padding:40px 0;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
      <tr><td style="padding:32px 28px 28px;background:#13132A;border-radius:12px;border:1px solid #2a2a5a;">

        <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#E0E0FF;">☀️ Bom dia!</p>
        <p style="margin:0 0 28px;font-size:13px;color:#555570;text-transform:capitalize;">${agora}</p>

        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#C0C0D0;">
          Seus <strong style="color:#A78BFA;">10 contatos do dia</strong> estão selecionados.<br>
          Clique abaixo, pressione <strong style="color:#A78BFA;">⚡ Gerar tudo</strong> e em
          segundos você terá e-mails personalizados + mensagens LinkedIn prontos para disparar.
        </p>

        <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td style="padding:0 8px 0 0;">
              <a href="${siteUrl}"
                 style="display:inline-block;padding:13px 24px;background:#A78BFA;
                        color:#0D0D1A;text-decoration:none;border-radius:7px;
                        font-weight:700;font-size:13px;">
                ☀️ Abrir Bom Dia →
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0;font-size:11px;color:#333356;line-height:1.6;border-top:1px solid #1e1e3a;padding-top:16px;">
          CRM Galeria · aviso automático · 7h BRT<br>
          Para desativar, remova o cron em Vercel → Settings → Crons
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CRM Galeria <onboarding@resend.dev>",
        to: ["pedroica@gmail.com"],
        subject: `☀️ Bom dia! Seus 10 contatos de hoje estão prontos — ${agora}`,
        html,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("[cron-morning] Resend error:", data);
      return res.status(500).json({ error: data });
    }

    return res.status(200).json({ ok: true, emailId: data.id, sentAt: new Date().toISOString() });
  } catch (e) {
    console.error("[cron-morning] fetch error:", e);
    return res.status(500).json({ error: e.message });
  }
}
