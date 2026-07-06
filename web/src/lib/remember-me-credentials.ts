const STORAGE_KEY = "gv_remember_me_v1";

/**
 * SECURITY: this module intentionally never persists a password. An earlier version stored the
 * raw password alongside the email in localStorage so it could auto-fill the sign-in form, which
 * meant any XSS or local/browser-extension access could read the plaintext password directly.
 * "Remember me" for staying signed in is already handled by the long-lived NextAuth session
 * cookie — this module only remembers the email (not a secret) so the field can be pre-filled,
 * and lets the browser's own password manager (via autoComplete="current-password") fill the
 * password securely if the user has opted into that separately.
 */
type RememberMePayload = {
  v: 2;
  rememberMe: boolean;
  email?: string;
};

function readPayload(): RememberMePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberMePayload> & { password?: unknown };
    if (parsed.v !== 2) return null;
    return {
      v: 2,
      rememberMe: parsed.rememberMe === true,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
    };
  } catch {
    return null;
  }
}

function writePayload(payload: RememberMePayload | null): void {
  if (typeof window === "undefined") return;
  if (!payload) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadRememberMePreference(): boolean {
  return readPayload()?.rememberMe === true;
}

/** Returns only the remembered email (never a password) for pre-filling the sign-in form. */
export function loadRememberedEmail(): string | null {
  const payload = readPayload();
  if (!payload?.rememberMe) return null;
  const email = payload.email?.trim().toLowerCase();
  return email || null;
}

/** Persists or clears the remembered email/preference based on the Remember me choice. Never stores the password. */
export function persistRememberMeCredentials(rememberMe: boolean, email: string): void {
  const normalizedEmail = email.trim().toLowerCase();
  if (!rememberMe || !normalizedEmail) {
    writePayload(null);
    return;
  }
  writePayload({
    v: 2,
    rememberMe: true,
    email: normalizedEmail,
  });
}

export function clearRememberMeCredentials(): void {
  writePayload(null);
}
