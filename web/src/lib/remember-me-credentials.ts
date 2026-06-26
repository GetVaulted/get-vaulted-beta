const STORAGE_KEY = "gv_remember_me_v1";

type RememberMePayload = {
  v: 1;
  rememberMe: boolean;
  email?: string;
  password?: string;
};

function readPayload(): RememberMePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberMePayload>;
    if (parsed.v !== 1) return null;
    return {
      v: 1,
      rememberMe: parsed.rememberMe === true,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      password: typeof parsed.password === "string" ? parsed.password : undefined,
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

export function loadRememberedCredentials(): { email: string; password: string } | null {
  const payload = readPayload();
  if (!payload?.rememberMe) return null;
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password;
  if (!email || !password) return null;
  return { email, password };
}

/** Persists or clears saved sign-in credentials based on the Remember me choice. */
export function persistRememberMeCredentials(
  rememberMe: boolean,
  email: string,
  password: string,
): void {
  const normalizedEmail = email.trim().toLowerCase();
  if (!rememberMe) {
    writePayload(null);
    return;
  }
  if (!normalizedEmail || !password) {
    writePayload(null);
    return;
  }
  writePayload({
    v: 1,
    rememberMe: true,
    email: normalizedEmail,
    password,
  });
}

export function clearRememberMeCredentials(): void {
  writePayload(null);
}
