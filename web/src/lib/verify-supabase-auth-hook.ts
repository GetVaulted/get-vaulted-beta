import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies Supabase Auth Hook requests signed per the Standard Webhooks spec
 * (https://www.standardwebhooks.com/). Supabase signs every HTTP Auth Hook payload this way —
 * see https://supabase.com/docs/guides/auth/auth-hooks#hook-http-payload-contract.
 *
 * Hand-rolled instead of using the `standardwebhooks` npm package: this sandbox's npm registry
 * access returned 403 Forbidden for that package, and the algorithm is small, fully documented,
 * and only needs Node's built-in `crypto` module.
 *
 * Scheme (see the spec's "Signature scheme" section):
 *   signed content = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *   signature      = base64(HMAC-SHA256(secretBytes, signedContent))
 *   header value   = space-delimited list of `v1,<base64 signature>` entries (supports secret
 *                    rotation — try each until one matches).
 */

const REPLAY_TOLERANCE_SECONDS = 5 * 60; // 5 minutes, as recommended by the spec.

export type VerifyAuthHookResult = { ok: true } | { ok: false; reason: string };

/**
 * Supabase's generated secret is formatted `v1,whsec_<base64>` — strip the `v1,whsec_` prefix
 * before using it as raw HMAC key material (see Supabase's Send Email Hook docs example, which
 * uses the same secret format and the same strip-prefix step).
 */
function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const withoutVersion = trimmed.startsWith("v1,") ? trimmed.slice(3) : trimmed;
  const withoutScheme = withoutVersion.startsWith("whsec_") ? withoutVersion.slice(6) : withoutVersion;
  return Buffer.from(withoutScheme, "base64");
}

function computeSignature(secretBytes: Buffer, webhookId: string, webhookTimestamp: string, rawBody: string): string {
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  return createHmac("sha256", secretBytes).update(signedContent, "utf8").digest("base64");
}

function constantTimeBase64Equal(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "base64");
    const bufB = Buffer.from(b, "base64");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verifies a Supabase Auth Hook HTTP request against a single (current) secret.
 * `secret` is the raw value of your `SUPABASE_*_HOOK_SECRET` env var, in Supabase's
 * `v1,whsec_<base64>` format (paste it in exactly as Supabase shows it in the Dashboard).
 */
export function verifySupabaseAuthHookSignature(params: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string;
}): VerifyAuthHookResult {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature, secret } = params;

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, reason: "missing_webhook_headers" };
  }

  // Neither value should ever legitimately contain a `.` — reject defensively per the spec's note
  // that the id/timestamp must not be attacker-controlled in a way that could smuggle extra
  // `.`-delimited segments into the signed content.
  if (webhookId.includes(".") || webhookTimestamp.includes(".")) {
    return { ok: false, reason: "malformed_webhook_headers" };
  }

  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: "malformed_timestamp" };
  }
  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - timestampSeconds) > REPLAY_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  let secretBytes: Buffer;
  try {
    secretBytes = decodeWebhookSecret(secret);
  } catch {
    return { ok: false, reason: "invalid_secret_configuration" };
  }
  if (secretBytes.length === 0) {
    return { ok: false, reason: "invalid_secret_configuration" };
  }

  const expected = computeSignature(secretBytes, webhookId, webhookTimestamp, rawBody);

  // `webhook-signature` is space-delimited `v1,<sig>` entries (secret rotation support) —
  // check each until one matches.
  const candidates = webhookSignature.split(" ").filter(Boolean);
  for (const candidate of candidates) {
    const [version, sig] = candidate.split(",");
    if (version !== "v1" || !sig) continue;
    if (constantTimeBase64Equal(sig, expected)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "signature_mismatch" };
}
