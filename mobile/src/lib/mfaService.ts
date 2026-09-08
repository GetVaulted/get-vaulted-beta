import { ensureSupabaseReady, getSupabase, isSupabaseConfigured } from './supabase';

/** See @supabase/auth-js GoTrueClient.enroll(): the client library prefixes the raw SVG the
 * server returns with this literal data-URL scheme before handing it back — `qr_code` is never
 * plain SVG markup by the time app code sees it. Stripped back off here since React Native has no
 * `<img>` tag; the caller renders the remaining markup with `SvgXml` from `react-native-svg`. */
const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;utf-8,';

export function extractSvgMarkupFromQrDataUrl(qrCode: string): string {
  return qrCode.startsWith(SVG_DATA_URL_PREFIX) ? qrCode.slice(SVG_DATA_URL_PREFIX.length) : qrCode;
}

async function requireSupabase() {
  await ensureSupabaseReady();
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
  }
  return sb;
}

export type TotpEnrollment = {
  factorId: string;
  /** Ready to hand to <SvgXml xml={...} /> — see extractSvgMarkupFromQrDataUrl. */
  qrSvgMarkup: string;
  /** Manual-entry fallback for when the user can't scan the QR code. */
  secret: string;
};

/** Currently active (verified) TOTP factor, if any. Supabase allows multiple factors in general,
 * but this app only ever enrolls one at a time — see TwoFactorAuthScreen. */
export async function getVerifiedTotpFactor(): Promise<{ id: string; createdAt: string } | null> {
  const sb = await requireSupabase();
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;
  // `data.totp` is already narrowed to verified TOTP factors only (see AuthMFAListFactorsResponse).
  const factor = data.totp[0];
  return factor ? { id: factor.id, createdAt: factor.created_at } : null;
}

/** Step 1 of enrollment — call this when the user taps "Enable two-factor authentication". */
export async function enrollTotpFactor(): Promise<TotpEnrollment> {
  const sb = await requireSupabase();
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Get Vaulted (mobile)',
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrSvgMarkup: extractSvgMarkupFromQrDataUrl(data.totp.qr_code),
    secret: data.totp.secret,
  };
}

/** Step 2 of enrollment — the 6-digit code the user just read off their authenticator app.
 * Also used, with the same factorId, as the login-time challenge (see MfaChallengeGate). */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const sb = await requireSupabase();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw error;
}

/** Turning 2FA off. Supabase requires the *current* session to already be at AAL2 to unenroll a
 * verified factor — true here in practice, since MfaChallengeGate already forces that upgrade
 * before letting the user anywhere near Settings. */
export async function unenrollTotpFactor(factorId: string): Promise<void> {
  const sb = await requireSupabase();
  const { error } = await sb.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/** Matches auth-js's own `AuthenticatorAssuranceLevels | null` — a plain `string | null` rather
 * than a strict 'aal1' | 'aal2' union, since the SDK's type is deliberately open-ended (`string &
 * {}`) for forward compatibility. Compare against the literal 'aal1' / 'aal2' at call sites. */
export type AuthenticatorAssuranceLevel = string | null;

/** Whether the *current* session still needs a TOTP challenge before it's considered fully
 * signed in (`currentLevel === 'aal1' && nextLevel === 'aal2'` — see MfaChallengeGate). */
export async function getAssuranceLevels(): Promise<{
  currentLevel: AuthenticatorAssuranceLevel;
  nextLevel: AuthenticatorAssuranceLevel;
}> {
  const sb = await requireSupabase();
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
}
