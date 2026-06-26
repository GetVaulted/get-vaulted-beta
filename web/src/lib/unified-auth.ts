import { isBetaDeployment } from "@/lib/is-beta-deployment";

/** Beta (and future launch) uses Supabase Auth as the single identity source for web + mobile. */
export function usesUnifiedSupabaseAuth(): boolean {
  return isBetaDeployment();
}

/**
 * Email verification gate for Prisma `User.emailVerified`.
 * Beta: Supabase `enable_confirmations = false` — successful sign-in/sign-up is treated as verified.
 */
export function isEmailVerificationRequiredForSignIn(): boolean {
  return !usesUnifiedSupabaseAuth();
}

export const AUTH_USER_MESSAGES = {
  signInInvalidCredentials:
    "Invalid email or password. If you recently joined, confirm your email first, then try again.",
  signInSubtitle: "Use the email and password for your Get Vaulted account.",
  signInConfirmEmail:
    "Check your email for a confirmation link, then sign in here with your email and password.",
  signInReady: "Account ready. Sign in with your email and password.",
  signUpConfirmEmail:
    "We sent a confirmation link. After you confirm, return here and sign in.",
  passwordResetSent:
    "If an account exists for that address, you will receive a reset link shortly.",
  passwordResetComplete: "Your password was updated. Sign in with your new password.",
  passwordResetBody: "We will email you a link to choose a new password.",
  socialNotConfigured: "Social sign-in is not configured on this site.",
  socialSignInFailed: "Could not complete social sign-in. Try again or use email and password.",
  socialSignInCancelled: "Sign-in was cancelled.",
} as const;
