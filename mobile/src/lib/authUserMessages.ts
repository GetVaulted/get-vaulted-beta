/** User-facing auth copy — keep aligned with web `AUTH_USER_MESSAGES`. */
export const AUTH_USER_MESSAGES = {
  signInInvalidCredentials:
    'Invalid email or password. If you recently joined, confirm your email first, then try again.',
  signUpConfirmEmail:
    'We sent a confirmation link. After you confirm, return here and sign in.',
  passwordResetSent:
    'If an account exists for that address, you will receive a reset link shortly.',
  passwordResetBody: 'We will email you a link to choose a new password.',
  socialNotConfigured: 'Social sign-in is not configured.',
  socialSignInFailed: 'Could not complete social sign-in. Try again or use email and password.',
  socialSignInCancelled: 'Sign-in was cancelled.',
} as const;
