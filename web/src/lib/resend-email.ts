const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type ResendSendResult = { ok: true } | { ok: false; reason: string };

export function isResendEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

export function resendFromAddress(): string {
  const from = process.env.RESEND_FROM?.trim();
  if (from) return from;
  return "Get Vaulted <onboarding@resend.dev>";
}

export async function sendResendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = args.to.trim();
  if (!to) return { ok: false, reason: "missing_recipient" };
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "resend_not_configured" };
    }
    return { ok: false, reason: "resend_not_configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromAddress(),
        to: [to],
        subject: args.subject.slice(0, 200),
        text: args.text,
        html: args.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[resend-email] send failed", { status: res.status, body: body.slice(0, 500) });
      return { ok: false, reason: "resend_http_error" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[resend-email] send error", e);
    return { ok: false, reason: "resend_network_error" };
  }
}
