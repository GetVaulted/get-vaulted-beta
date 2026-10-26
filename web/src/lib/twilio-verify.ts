/**
 * Thin client for Twilio Verify (SMS one-time codes). Reads TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 * and TWILIO_VERIFY_SERVICE_SID. Twilio generates, delivers, expires and rate-limits the codes; we
 * only ask it to send one and then ask it whether the code the user typed is correct.
 */
export type SendCodeResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "invalid_number" | "rate_limited" | "failed" };

export type CheckCodeResult =
  | { ok: true; approved: boolean }
  | { ok: false; reason: "not_configured" | "rate_limited" | "failed" };

function config(): { sid: string; token: string; service: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const service = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!sid || !token || !service) return null;
  return { sid, token, service };
}

export function isTwilioVerifyConfigured(): boolean {
  return config() != null;
}

async function twilioPost(path: string, form: Record<string, string>) {
  const c = config();
  if (!c) return null;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${c.service}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, json };
}

export async function sendPhoneVerificationCode(phoneE164: string): Promise<SendCodeResult> {
  try {
    const r = await twilioPost("Verifications", { To: phoneE164, Channel: "sms" });
    if (!r) return { ok: false, reason: "not_configured" };
    if (r.status >= 200 && r.status < 300) return { ok: true };
    const code = Number(r.json.code);
    if (code === 60200 || code === 60205 || code === 21211 || code === 21614) {
      return { ok: false, reason: "invalid_number" };
    }
    if (r.status === 429 || code === 60203 || code === 20429) return { ok: false, reason: "rate_limited" };
    console.error("[twilio-verify] send failed", r.status, r.json.code, r.json.message);
    return { ok: false, reason: "failed" };
  } catch (err) {
    console.error("[twilio-verify] send error", err);
    return { ok: false, reason: "failed" };
  }
}

export async function checkPhoneVerificationCode(phoneE164: string, code: string): Promise<CheckCodeResult> {
  try {
    const r = await twilioPost("VerificationCheck", { To: phoneE164, Code: code });
    if (!r) return { ok: false, reason: "not_configured" };
    if (r.status >= 200 && r.status < 300) return { ok: true, approved: r.json.status === "approved" };
    // 404 = no pending verification (expired or already used) → simply "not approved".
    if (r.status === 404) return { ok: true, approved: false };
    if (r.status === 429 || Number(r.json.code) === 60202) return { ok: false, reason: "rate_limited" };
    console.error("[twilio-verify] check failed", r.status, r.json.code, r.json.message);
    return { ok: false, reason: "failed" };
  } catch (err) {
    console.error("[twilio-verify] check error", err);
    return { ok: false, reason: "failed" };
  }
}
