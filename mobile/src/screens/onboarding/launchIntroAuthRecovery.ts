/**
 * `LaunchIntroScreen`'s `instantAuth` warm-resume path shows the login form whenever `user` reads
 * as null at that instant. Because that null reading can itself be a transient blip that resolves
 * a moment later (see `authSessionRoutingDecision.ts`), the screen needs to self-correct rather
 * than leaving the user stuck looking at a login form for an account they are still signed into.
 *
 * This is safe without needing to know *why* the login UI was shown (a real, intentional sign-out
 * vs. an ambiguous blip): a real sign-out never results in `user` becoming non-null again on its
 * own, so this only ever fires for the ambiguous case. The `formTouched` guard additionally makes
 * sure we never yank the screen out from under someone who has started typing into the form —
 * e.g. to sign into a different account after a real, intentional sign-out.
 */
export function shouldAutoAdvanceAfterAuthRecovery(params: {
  /** True once `finishIntroRouting` decided `user` was null and started showing the login UI. */
  loginUiShown: boolean;
  /** True once the user has interacted with the login form (typed, tapped a button, etc). */
  formTouched: boolean;
  /** True once we've already auto-advanced once for this screen instance. */
  alreadyAdvanced: boolean;
  /** True once `user` (from `useAuth()`) is non-null again. */
  hasUser: boolean;
}): boolean {
  return params.loginUiShown && params.hasUser && !params.formTouched && !params.alreadyAdvanced;
}
