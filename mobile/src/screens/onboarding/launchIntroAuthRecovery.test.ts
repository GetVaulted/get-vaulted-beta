import { describe, expect, it } from 'vitest';
import { shouldAutoAdvanceAfterAuthRecovery } from './launchIntroAuthRecovery';

describe('shouldAutoAdvanceAfterAuthRecovery', () => {
  it('regression: auto-advances to MainTabs once the session resolves after the login UI was shown', () => {
    expect(
      shouldAutoAdvanceAfterAuthRecovery({
        loginUiShown: true,
        formTouched: false,
        alreadyAdvanced: false,
        hasUser: true,
      }),
    ).toBe(true);
  });

  it('does nothing while the user is still null (real sign-out, or recovery still pending)', () => {
    expect(
      shouldAutoAdvanceAfterAuthRecovery({
        loginUiShown: true,
        formTouched: false,
        alreadyAdvanced: false,
        hasUser: false,
      }),
    ).toBe(false);
  });

  it('does not fight a user who has started typing into the login form', () => {
    expect(
      shouldAutoAdvanceAfterAuthRecovery({
        loginUiShown: true,
        formTouched: true,
        alreadyAdvanced: false,
        hasUser: true,
      }),
    ).toBe(false);
  });

  it('does not fire if the login UI was never shown (e.g. the full, non-instant intro path)', () => {
    expect(
      shouldAutoAdvanceAfterAuthRecovery({
        loginUiShown: false,
        formTouched: false,
        alreadyAdvanced: false,
        hasUser: true,
      }),
    ).toBe(false);
  });

  it('only fires once per screen instance', () => {
    expect(
      shouldAutoAdvanceAfterAuthRecovery({
        loginUiShown: true,
        formTouched: false,
        alreadyAdvanced: true,
        hasUser: true,
      }),
    ).toBe(false);
  });
});
