import { describe, expect, it } from 'vitest';
import {
  isAlreadyUsedRefreshTokenError,
  isInvalidRefreshTokenError,
} from './recoverInvalidAuthSessionErrors';

describe('isInvalidRefreshTokenError', () => {
  it('matches AuthApiError refresh token not found', () => {
    expect(
      isInvalidRefreshTokenError({
        name: 'AuthApiError',
        message: 'Invalid Refresh Token: Refresh Token Not Found',
        status: 400,
      }),
    ).toBe(true);
  });

  it('matches refresh_token_not_found code', () => {
    expect(isInvalidRefreshTokenError({ code: 'refresh_token_not_found', message: 'bad' })).toBe(true);
  });

  it('ignores unrelated auth errors', () => {
    expect(isInvalidRefreshTokenError({ name: 'AuthApiError', message: 'Invalid login credentials' })).toBe(
      false,
    );
  });

  it('does not treat Already Used races as a dead session', () => {
    const err = {
      name: 'AuthApiError',
      message: 'Invalid Refresh Token: Already Used',
      status: 400,
    };
    expect(isInvalidRefreshTokenError(err)).toBe(false);
    expect(isAlreadyUsedRefreshTokenError(err)).toBe(true);
  });

  it('does not wipe on generic AuthApiError containing refresh', () => {
    expect(
      isInvalidRefreshTokenError({
        name: 'AuthApiError',
        message: 'Failed to refresh session due to network',
      }),
    ).toBe(false);
  });
});
