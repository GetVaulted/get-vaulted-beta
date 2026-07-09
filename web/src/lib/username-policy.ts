/**
 * Username rules for signup and GET /api/users/check-username.
 * Keep in sync with `shared/username-policy.ts` (mobile + Netlify).
 * Usernames are stored normalized (trimmed, ASCII lowercase).
 */

export type UsernameRejectReason = "taken" | "invalid" | "reserved" | "profanity";

export const USERNAME_UNAVAILABLE_MESSAGE =
  "That username isn't available. Please choose a different username.";

/** Reserved for the verified platform owner account only — not public signup. */
export const OFFICIAL_PLATFORM_USERNAMES = new Set(["getvaulted"]);

export function canAdminClaimReservedUsername(
  role: string | null | undefined,
  normalized: string,
): boolean {
  return role === "admin" && OFFICIAL_PLATFORM_USERNAMES.has(normalized);
}

const RESERVED_EXACT = new Set(
  [
    "admin",
    "support",
    "getvaulted",
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

/** Blocks Get Vaulted brand impersonation; standalone "vaulted" is allowed. */
function isGetVaultedBrandUsername(normalized: string): boolean {
  if (normalized === "getvaulted") return true;
  const collapsed = normalized.replace(/_/g, "");
  const deobfuscated = normalizeObfuscatedUsername(normalized);
  for (const candidate of [collapsed, deobfuscated]) {
    if (candidate === "getvaulted" || candidate.includes("getvaulted")) return true;
  }
  const segments = normalized.split("_").filter(Boolean);
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === "get" && segments[i + 1] === "vaulted") return true;
  }
  return false;
}

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

/** Map common leet/obfuscation to letters for profanity checks. */
export function normalizeObfuscatedUsername(normalized: string): string {
  const map: Record<string, string> = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    $: "s",
    "!": "i",
  };
  let s = normalized.toLowerCase();
  for (const [from, to] of Object.entries(map)) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  return s.replace(/[^a-z0-9]/g, "");
}

export function normalizeUsernameForStorage(raw: string): string {
  return raw.trim().toLowerCase();
}

export function evaluateUsernamePolicy(
  normalized: string,
  opts?: { userRole?: string },
): { ok: true } | { ok: false; reason: UsernameRejectReason } {
  if (!USERNAME_PATTERN.test(normalized)) {
    return { ok: false, reason: "invalid" };
  }
  if (!canAdminClaimReservedUsername(opts?.userRole, normalized) && isReservedUsername(normalized)) {
    return { ok: false, reason: "reserved" };
  }
  if (containsProfanity(normalized)) {
    return { ok: false, reason: "profanity" };
  }
  return { ok: true };
}

export function isReservedUsername(normalized: string): boolean {
  if (isGetVaultedBrandUsername(normalized)) return true;
  const segments = normalized.split("_").filter(Boolean);
  for (const seg of segments) {
    if (RESERVED_EXACT.has(seg)) return true;
  }
  if (RESERVED_EXACT.has(normalized)) return true;
  return false;
}

function matchesProfanityToken(token: string, words: string[]): boolean {
  const collapsed = token.replace(/_/g, "");
  const deobfuscated = normalizeObfuscatedUsername(token);
  for (const w of words) {
    if (token === w || collapsed === w || deobfuscated === w) return true;
    if (w.length >= 5 && (collapsed.includes(w) || deobfuscated.includes(w))) return true;
  }
  return false;
}

/** True if normalized username matches blocked vocabulary (incl. obfuscated variants). */
export function containsProfanity(normalized: string): boolean {
  const segments = normalized.split("_").filter(Boolean);
  const tokens = [normalized, ...segments];

  for (const token of tokens) {
    for (const w of PROFANITY_EXACT) {
      if (token === w || segments.some((s) => s === w)) return true;
      const collapsed = token.replace(/_/g, "");
      const deob = normalizeObfuscatedUsername(token);
      if (collapsed === w || deob === w) return true;
    }
    if (matchesProfanityToken(token, PROFANITY_SUBSTRING)) return true;
  }
  return false;
}

export function usernamePolicyUserMessage(reason: UsernameRejectReason): string {
  if (reason === "profanity" || reason === "reserved") return USERNAME_UNAVAILABLE_MESSAGE;
  if (reason === "taken") return USERNAME_UNAVAILABLE_MESSAGE;
  return "Username must be 3–20 characters: letters, numbers, and underscores only.";
}
