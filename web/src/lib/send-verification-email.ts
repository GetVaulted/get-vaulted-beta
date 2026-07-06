import { VERIFICATION_CODE_TTL_MS } from "@/lib/email-verification-code";
import { escapeResendHtml } from "@/lib/resend-templates/brand";
import { RESEND_TEMPLATE_SIGNUP_VERIFICATION } from "@/lib/resend-templates/definitions";
import { isResendHostedTemplatesEnabled, sendResendEmail, sendResendTemplateEmail } from "@/lib/resend-email";

type SendResult = { ok: true } | { ok: false; userMessage: string };

const SUBJECT = "Your Get Vaulted verification code";

/** Brand colors (inline for email clients). */
const C = {
  bg: "#0a0a0d",
  card: "#111116",
  border: "rgba(255,255,255,0.08)",
  gold: "#d4af37",
  goldDim: "#a68b2d",
  text: "#fafafa",
  muted: "#a1a1aa",
} as const;

function expiresCopyMinutes(): { minutes: number; phrase: string } {
  const minutes = Math.max(1, Math.round(VERIFICATION_CODE_TTL_MS / 60_000));
  const phrase =
    minutes === 1 ? "This code expires in 1 minute." : `This code expires in ${minutes} minutes.`;
  return { minutes, phrase };
}

function buildPlainText(code: string): string {
  const { phrase } = expiresCopyMinutes();
  return [
    "Get Vaulted",
    "",
    "Welcome — you're almost done.",
    "",
    "Enter this code to finish creating your account:",
    "",
    code,
    "",
    phrase,
    "",
    "If you didn't request this, you can safely ignore this email.",
    "",
    "— Get Vaulted",
  ].join("\n");
}

function buildHtml(code: string): string {
  const safe = escapeResendHtml(code);
  const { phrase } = expiresCopyMinutes();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeResendHtml(SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${C.bg};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;border-collapse:collapse;">
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${C.text};">Get Vaulted</span>
              <span style="display:block;width:48px;height:3px;margin:12px auto 0 auto;background:linear-gradient(90deg,${C.goldDim},${C.gold},${C.goldDim});border-radius:2px;"></span>
            </td>
          </tr>
          <tr>
            <td style="background-color:${C.card};border:1px solid ${C.border};border-radius:16px;padding:28px 24px 32px 24px;">
              <p style="margin:0 0 20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:${C.text};text-align:center;">
                Welcome — you're almost done.
              </p>
              <p style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${C.muted};text-align:center;">
                Enter this code to finish creating your account.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:20px 12px 24px 12px;">
                    <span style="display:inline-block;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:0.45em;padding:16px 20px 16px 28px;color:${C.gold};text-align:center;border:1px solid ${C.border};border-radius:12px;background-color:#0c0c10;">
                      ${safe}
                    </span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${C.muted};text-align:center;">
                ${escapeResendHtml(phrase)}
              </p>
              <p style="margin:20px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:${C.muted};text-align:center;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0 8px;text-align:center;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#71717a;">
                © Get Vaulted
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildSignupVerificationTemplateVariables(code: string): Record<string, string> {
  const { phrase } = expiresCopyMinutes();
  return {
    VERIFICATION_CODE: code,
    EXPIRES_PHRASE: phrase,
  };
}

/**
 * Sends a signup verification code via Resend when `RESEND_API_KEY` is set.
 * In production, missing configuration returns a failure (caller should not create orphan users).
 */
export async function sendSignupVerificationEmail(params: {
  to: string;
  code: string;
}): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY?.trim()) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, userMessage: "Email delivery is not configured. Please try again later." };
    }
    return { ok: false, userMessage: "Email delivery is not configured for this environment." };
  }

  const text = buildPlainText(params.code);
  const html = buildHtml(params.code);

  const result = isResendHostedTemplatesEnabled()
    ? await sendResendTemplateEmail({
        to: params.to,
        subject: SUBJECT,
        templateId: RESEND_TEMPLATE_SIGNUP_VERIFICATION,
        variables: buildSignupVerificationTemplateVariables(params.code),
      })
    : await sendResendEmail({ to: params.to, subject: SUBJECT, text, html });

  if (!result.ok) {
    if (process.env.NODE_ENV !== "production" && result.reason === "resend_not_configured") {
      return { ok: false, userMessage: "Email delivery is not configured for this environment." };
    }
    return {
      ok: false,
      userMessage: "We could not send the verification email. Check the address and try again, or contact support.",
    };
  }

  return { ok: true };
}
