import { describe, expect, it } from 'vitest';
import { extractOAuthAuthCode } from './extractOAuthAuthCode';

describe('extractOAuthAuthCode', () => {
  it('returns a bare auth code unchanged', () => {
    expect(extractOAuthAuthCode('34e770dd-9ff9-416c-87fa-43b31d7ef225')).toBe(
      '34e770dd-9ff9-416c-87fa-43b31d7ef225',
    );
  });

  it('extracts code from native redirect URL', () => {
    expect(
      extractOAuthAuthCode('getvaulted://auth/callback?code=34e770dd-9ff9-416c-87fa-43b31d7ef225'),
    ).toBe('34e770dd-9ff9-416c-87fa-43b31d7ef225');
  });

  it('extracts code from https mobile callback URL', () => {
    expect(
      extractOAuthAuthCode(
        'https://shopgetvaulted.com/mobile/auth/callback?code=abc-123&state=xyz',
      ),
    ).toBe('abc-123');
  });

  it('returns null when code is missing', () => {
    expect(extractOAuthAuthCode('getvaulted://auth/callback?error=access_denied')).toBeNull();
    expect(extractOAuthAuthCode('')).toBeNull();
  });
});
