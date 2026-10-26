import { PHONE_VERIFICATION_REQUIRED_MESSAGE } from "@/lib/live-room-commerce-messages";
import { prisma } from "@/lib/prisma";

export const PHONE_VERIFICATION_REQUIRED_CODE = "PHONE_VERIFICATION_REQUIRED" as const;

export type PhoneVerificationBlock = {
  status: 403;
  error: string;
  code: typeof PHONE_VERIFICATION_REQUIRED_CODE;
};

/**
 * Accounts created at or after this instant must verify a phone number. Unset (the default) means
 * nothing is enforced for new accounts, so the code can ship before the SMS provider is configured.
 * Older accounts are only affected when an admin sets `User.phoneVerificationRequired`.
 */
export function phoneVerificationRequiredFromMs(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.PHONE_VERIFICATION_REQUIRED_FROM?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function isPhoneVerificationRequired(
  user: { phoneVerifiedAt: Date | null; phoneVerificationRequired: boolean; createdAt: Date },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (user.phoneVerifiedAt) return false;
  if (user.phoneVerificationRequired) return true;
  const from = phoneVerificationRequiredFromMs(env);
  return from != null && user.createdAt.getTime() >= from;
}

/**
 * Normalizes user input to E.164. US numbers may be typed as 10 digits, 11 digits starting with 1,
 * or with +1. Anything else must already start with "+" and a country code. Returns null if invalid.
 */
export function normalizePhoneE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    if (digits.startsWith("1")) {
      return /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+${digits}` : null;
    }
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  if (digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+${digits}`;
  return null;
}

export function maskPhoneLast4(phoneE164: string | null | undefined): string | null {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Accounts that are fine (verified or not required) are cached so bids/buys pay no extra query. */
const OK_TTL_MS = 5 * 60_000;
const okCache = new Map<string, number>();

export function clearPhoneVerificationCache(userId?: string): void {
  if (userId) okCache.delete(userId);
  else okCache.clear();
}

/** Null when the user may bid / buy / enter giveaways; otherwise the 403 body to return. */
export async function getPhoneVerificationBlock(userId: string): Promise<PhoneVerificationBlock | null> {
  const hit = okCache.get(userId);
  if (hit != null && Date.now() - hit < OK_TTL_MS) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, phoneVerifiedAt: true, phoneVerificationRequired: true },
    });
    if (!user) return null;
    if (isPhoneVerificationRequired(user)) {
      okCache.delete(userId);
      return { status: 403, error: PHONE_VERIFICATION_REQUIRED_MESSAGE, code: PHONE_VERIFICATION_REQUIRED_CODE };
    }
    okCache.set(userId, Date.now());
    if (okCache.size > 5_000) {
      const now = Date.now();
      for (const [k, t] of okCache) if (now - t > OK_TTL_MS) okCache.delete(k);
    }
    return null;
  } catch (err) {
    // Never block commerce because this check itself failed.
    console.error("[phone-verification] check failed", err);
    return null;
  }
}
