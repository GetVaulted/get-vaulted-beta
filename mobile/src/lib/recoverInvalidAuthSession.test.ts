import { describe, expect, it } from 'vitest';
import { isInvalidRefreshTokenError } from './recoverInvalidAuthSessionErrors';

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
});
