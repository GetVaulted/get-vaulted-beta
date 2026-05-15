/**
 * Shared username rules for signup and GET /api/users/check-username.
 * Usernames are stored normalized (trimmed, ASCII lowercase).
 */

export type UsernameRejectReason = "taken" | "invalid" | "reserved" | "profanity";

const RESERVED_EXACT = new Set(
  [
    "admin",
    "support",
    "getvaulted",
    "vaulted",
    "moderator",
    "official",
    "staff",
    "administrator",
    "mod",
    "root",
    "system",
    "helpdesk",
    "billing",
    "security",
  ].map((s) => s.toLowerCase()),
);

/** Match only as a full username or full underscore-segment (avoids `classic` / `essex` false positives). */
const PROFANITY_EXACT = [
  "cum",
  "sex",
  "die",
  "cp",
  "fag",
  "ass",
  "rape",
  "nazi",
  "kkk",
  "pedo",
  "isis",
].map((s) => s.toLowerCase());

/** Also match inside username with underscores removed (length ≥ 5 only) to catch compounds like `bad_word`. */
const PROFANITY_SUBSTRING = [
  "fuck",
  "fuk",
  "fvck",
  "shit",
  "cunt",
  "cock",
  "dick",
  "pussy",
  "penis",
  "vagina",
  "hitler",
  "nigga",
  "nigger",
  "n1gger",
  "n1gga",
  "fagg",
  "retard",
  "slut",
  "whore",
  "bitch",
  "bastard",
  "jizz",
  "porn",
  "xxx",
  "molest",
  "kill",
  "suicide",
  "terror",
].map((s) => s.toLowerCase());

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsernameForStorage(raw: string): string {
  return raw.trim().toLowerCase();
}

export function evaluateUsernamePolicy(normalized: string): { ok: true } | { ok: false; reason: UsernameRejectReason } {
  if (!USERNAME_PATTERN.test(normalized)) {
    return { ok: false, reason: "invalid" };
  }
  if (isReservedUsername(normalized)) {
    return { ok: false, reason: "reserved" };
  }
  if (containsProfanity(normalized)) {
    return { ok: false, reason: "profanity" };
  }
  return { ok: true };
}

export function isReservedUsername(normalized: string): boolean {
  const segments = normalized.split("_").filter(Boolean);
  for (const seg of segments) {
    if (RESERVED_EXACT.has(seg)) return true;
  }
  if (RESERVED_EXACT.has(normalized)) return true;
  return false;
}

/** True if normalized username matches blocked vocabulary. */
export function containsProfanity(normalized: string): boolean {
  const segments = normalized.split("_").filter(Boolean);
  const collapsed = normalized.replace(/_/g, "");

  for (const w of PROFANITY_EXACT) {
    if (normalized === w || segments.some((s) => s === w)) return true;
  }
  for (const w of PROFANITY_SUBSTRING) {
    if (normalized === w || segments.some((s) => s === w)) return true;
    if (w.length >= 5 && collapsed.includes(w)) return true;
  }
  return false;
}
