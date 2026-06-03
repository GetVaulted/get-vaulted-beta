import type { PrismaClient } from "@/generated/prisma/client";
import {
  evaluateUsernamePolicy,
  normalizeUsernameForStorage,
  usernamePolicyUserMessage,
  type UsernameRejectReason,
} from "@/lib/username-policy";
import { isUsernameTakenCaseInsensitive } from "@/lib/username-db";

export type RegisterUsernameResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: UsernameRejectReason; message: string };

const MESSAGES: Record<UsernameRejectReason, string> = {
  invalid: usernamePolicyUserMessage("invalid"),
  reserved: usernamePolicyUserMessage("reserved"),
  profanity: usernamePolicyUserMessage("profanity"),
  taken: usernamePolicyUserMessage("taken"),
};

export async function validateUsernameForRegistration(
  db: PrismaClient,
  rawUsername: string,
): Promise<RegisterUsernameResult> {
  const normalized = normalizeUsernameForStorage(rawUsername);
  if (normalized.length === 0) {
    return { ok: false, reason: "invalid", message: MESSAGES.invalid };
  }
  const policy = evaluateUsernamePolicy(normalized);
  if (!policy.ok) {
    return { ok: false, reason: policy.reason, message: MESSAGES[policy.reason] };
  }
  const taken = await isUsernameTakenCaseInsensitive(db, normalized);
  if (taken) {
    return { ok: false, reason: "taken", message: MESSAGES.taken };
  }
  return { ok: true, normalized };
}
