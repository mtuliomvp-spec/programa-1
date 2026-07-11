import "server-only";

/**
 * Envio de e-mails transacionais (redefinição de senha, aprovação de
 * acesso). Provedores suportados, escolhidos pelas variáveis de ambiente:
 *
 * - Brevo (recomendado, grátis 300/dia, sem domínio próprio):
 *   BREVO_API_KEY + EMAIL_FROM (remetente verificado na conta Brevo)
 * - Resend (exige domínio verificado):
 *   RESEND_API_KEY + EMAIL_FROM
 *
 * Sem nenhuma chave configurada, o sistema segue no modo "avisar o
 * administrador" (sem e-mail).
 */

const FROM_NAME = "MVP Veículos";

export function isEmailConfigured(): boolean {
  return Boolean(
    (process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) && process.env.EMAIL_FROM,
  );
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { ok: false, error: "EMAIL_FROM não configurado" };

  try {
    if (process.env.BREVO_API_KEY) {
      const url = process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: from },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        return { ok: false, error: `Brevo HTTP ${response.status}` };
      }
      return { ok: true };
    }

    if (process.env.RESEND_API_KEY) {
      const url = process.env.RESEND_API_URL || "https://api.resend.com/emails";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${from}>`,
          to: [input.to],
          subject: input.subject,
          html: input.html,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        return { ok: false, error: `Resend HTTP ${response.status}` };
      }
      return { ok: true };
    }

    return { ok: false, error: "Nenhum provedor de e-mail configurado" };
  } catch {
    return { ok: false, error: "Falha de rede ao enviar e-mail" };
  }
}

export function emailLayout(title: string, bodyHtml: string): string {
  return `
  <div style="background:#f1f5f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <p style="margin:0 0 4px;font-size:18px;font-weight:bold;color:#1d4ed8">MVP Veículos</p>
      <p style="margin:0 0 24px;font-size:12px;color:#64748b">Gestão de seminovos</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${title}</h1>
      ${bodyHtml}
      <p style="margin:24px 0 0;font-size:11px;color:#94a3b8">
        Se você não solicitou este e-mail, pode ignorá-lo com segurança.
      </p>
    </div>
  </div>`;
}
