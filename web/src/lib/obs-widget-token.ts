import { createHash, randomBytes, timingSafeEqual } from "crypto";

const TOKEN_PREFIX = "gvobs_";

/** Plain token returned once to the host; store only the hash server-side. */
export function generateObsWidgetTokenPlain(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

function tokenPepper(): string {
  const explicit = process.env.OBS_WIDGET_TOKEN_PEPPER?.trim();
  if (explicit) return explicit;
  const auth = process.env.NEXTAUTH_SECRET?.trim();
  if (auth) return auth;
  if (process.env.NODE_ENV === "production") {
    throw new Error("OBS_WIDGET_TOKEN_PEPPER or NEXTAUTH_SECRET must be set in production.");
  }
  return "dev-obs-widget-pepper";
}

export function hashObsWidgetToken(plain: string): string {
  return createHash("sha256").update(`${tokenPepper()}:${plain}`, "utf8").digest("hex");
}

export function verifyObsWidgetToken(plain: string, storedHash: string | null | undefined): boolean {
  if (!plain.trim() || !storedHash?.trim()) return false;
  const computed = hashObsWidgetToken(plain.trim());
  try {
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(storedHash.trim(), "hex"));
  } catch {
    return false;
  }
}

export function isObsWidgetTokenFormat(plain: string): boolean {
  return plain.startsWith(TOKEN_PREFIX) && plain.length >= TOKEN_PREFIX.length + 16;
}
