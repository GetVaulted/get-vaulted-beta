import { timingSafeEqual } from "node:crypto";

function safeBuf(s: string): Buffer {
  return Buffer.from(s, "utf8");
}

/**
 * Trustap webhooks authenticate with HTTP Basic per official docs (not HMAC signatures).
 * @see https://docs.trustap.com/docs/concepts/webhooks — Authentication
 */
export function verifyTrustapWebhookBasicAuth(req: Request): boolean {
  const user = process.env.TRUSTAP_WEBHOOK_USERNAME?.trim() ?? "";
  const pass = process.env.TRUSTAP_WEBHOOK_PASSWORD?.trim() ?? "";
  if (!user || !pass) return false;

  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  const u = colon >= 0 ? decoded.slice(0, colon) : decoded;
  const p = colon >= 0 ? decoded.slice(colon + 1) : "";

  const uOk = u.length === user.length && timingSafeEqual(safeBuf(u), safeBuf(user));
  const pOk = p.length === pass.length && timingSafeEqual(safeBuf(p), safeBuf(pass));
  return uOk && pOk;
}
