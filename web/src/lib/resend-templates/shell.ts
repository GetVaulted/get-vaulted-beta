import { RESEND_EMAIL_BRAND, escapeResendHtml } from "@/lib/resend-templates/brand";

export type EmailShellParts = {
  headline: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
};

/** Inline HTML for local preview / fallback sends. */
export function buildEmailShellInline(parts: EmailShellParts): string {
  const { bg, card, border, gold, text, muted } = RESEND_EMAIL_BRAND;
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${card};border:1px solid ${border};border-radius:16px;padding:32px 28px;">
        <tr><td style="color:${gold};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Get Vaulted</td></tr>
        <tr><td style="padding-top:16px;color:${text};font-size:22px;font-weight:700;line-height:1.3;">${escapeResendHtml(parts.headline)}</td></tr>
        <tr><td style="padding-top:12px;color:${muted};font-size:15px;line-height:1.55;">${parts.bodyHtml}</td></tr>
        <tr><td style="padding-top:24px;">
          <a href="${escapeResendHtml(parts.ctaHref)}" style="display:inline-block;background:linear-gradient(135deg,#c9a227,#e8c547);color:#0a0a0d;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">${escapeResendHtml(parts.ctaLabel)}</a>
        </td></tr>
        <tr><td style="padding-top:28px;color:${muted};font-size:12px;line-height:1.5;">You're receiving this because you have a Get Vaulted order. Manage notifications in the app.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Resend hosted template HTML — variables replaced at send time. */
export function buildResendOrderShellTemplateHtml(): string {
  const { bg, card, border, gold, text, muted } = RESEND_EMAIL_BRAND;
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${card};border:1px solid ${border};border-radius:16px;padding:32px 28px;">
        <tr><td style="color:${gold};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Get Vaulted</td></tr>
        <tr><td style="padding-top:16px;color:${text};font-size:22px;font-weight:700;line-height:1.3;">{{{HEADLINE}}}</td></tr>
        <tr><td style="padding-top:12px;color:${muted};font-size:15px;line-height:1.55;">{{{BODY_HTML}}}</td></tr>
        <tr><td style="padding-top:24px;">
          <a href="{{{ORDER_URL}}}" style="display:inline-block;background:linear-gradient(135deg,#c9a227,#e8c547);color:#0a0a0d;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">{{{CTA_LABEL}}}</a>
        </td></tr>
        <tr><td style="padding-top:28px;color:${muted};font-size:12px;line-height:1.5;">You're receiving this because you have a Get Vaulted order. Manage notifications in the app.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildResendSignupVerificationTemplateHtml(): string {
  const C = RESEND_EMAIL_BRAND;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Get Vaulted verification code</title>
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
                      {{{VERIFICATION_CODE}}}
                    </span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${C.muted};text-align:center;">
                {{{EXPIRES_PHRASE}}}
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
