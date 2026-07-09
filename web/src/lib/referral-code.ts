import type { PrismaClient } from "@/generated/prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Unambiguous charset — avoids 0/O, 1/I/L confusion in shared links. */
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const REFERRAL_CODE_LENGTH = 10;
export const REFERRAL_CODE_MAX_INPUT_LENGTH = 32;

export function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += REFERRAL_CODE_ALPHABET[bytes[i]! % REFERRAL_CODE_ALPHABET.length];
  }
  return out;
}

export function normalizeReferralCodeInput(raw: string | null | undefined): string {
  return raw?.trim().slice(0, REFERRAL_CODE_MAX_INPUT_LENGTH) ?? "";
}

export async function allocateUniqueReferralCode(
  db: Pick<PrismaClient, "user"> = prisma,
): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = generateReferralCode();
    const taken = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Could not allocate a unique referral code.");
}

/** Assign a secret referral code to an existing user if missing. */
export async function ensureUserReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 24; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      if (updated.referralCode) return updated.referralCode;
    } catch (e) {
      const isUniqueViolation =
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "P2002";
      if (!isUniqueViolation) throw e;
    }
  }
  throw new Error("Could not persist referral code for user.");
}

/**
 * Resolve a signup `?ref=` value to a referrer user id.
 * Prefers the secret `referralCode`; falls back to legacy username links.
 */
export async function resolveReferrerIdFromReferralInput(
  raw: string | null | undefined,
  db: Pick<PrismaClient, "user"> = prisma,
): Promise<string | null> {
  const input = normalizeReferralCodeInput(raw);
  if (!input) return null;

  const secret = input.toUpperCase();
  if (/^[A-Z0-9]{6,32}$/.test(secret)) {
    const byCode = await db.user.findUnique({
      where: { referralCode: secret },
      select: { id: true },
    });
    if (byCode) return byCode.id;
  }

  // Legacy username-based links (`?ref=<username>`) — still honored for old shares.
  const legacyUsername = input.toLowerCase().slice(0, 20);
  if (/^[a-z0-9_]{3,20}$/.test(legacyUsername)) {
    const byUsername = await db.user.findUnique({
      where: { username: legacyUsername },
      select: { id: true },
    });
    if (byUsername) return byUsername.id;
  }

  return null;
}
