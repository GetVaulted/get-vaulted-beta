export type RegisterSuccessPayload = {
  ok?: boolean;
  verificationMethod?: "resend_code" | "supabase_link" | "immediate";
  needsEmailConfirmation?: boolean;
  _localDevVerificationCode?: string;
};

/** True only when the user must enter a 6-digit email OTP on /signup/verify. */
export function signupRequiresOtpVerification(data: RegisterSuccessPayload): boolean {
  if (data.verificationMethod === "immediate" || data.verificationMethod === "supabase_link") {
    return false;
  }
  if (data.needsEmailConfirmation === false) return false;
  if (data.verificationMethod === "resend_code") return true;
  if (data._localDevVerificationCode) return true;
  // Legacy Resend success: { ok: true } with no extra fields.
  return true;
}

export function signupPendingStorageKeys(): { pending: string; devCode: string } {
  return { pending: "gv_signup_pending", devCode: "gv_dev_last_code" };
}

export function clearSignupPendingStorage(): void {
  if (typeof window === "undefined") return;
  const { pending, devCode } = signupPendingStorageKeys();
  try {
    sessionStorage.removeItem(pending);
    sessionStorage.removeItem(devCode);
  } catch {
    /* ignore */
  }
}
