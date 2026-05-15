import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;

/** Six-digit numeric code as string (leading zeros preserved). */
export function generateVerificationCode(): string {
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(VERIFICATION_CODE_LENGTH, "0");
}

export async function hashVerificationCode(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verificationCodesEqual(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Accepts pasted / spaced input; returns normalized digits or null if invalid length. */
export function normalizeVerificationCodeInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== VERIFICATION_CODE_LENGTH) return null;
  return digits;
}
