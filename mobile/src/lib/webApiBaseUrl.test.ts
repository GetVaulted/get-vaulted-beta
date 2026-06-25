import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWebApiUrl, misconfiguredWebApiHostWarning } from './webApiBaseUrl';

describe('webApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds layaways API url from EXPO_PUBLIC_SITE_URL', () => {
    vi.stubEnv('EXPO_PUBLIC_SITE_URL', 'https://beta.shopgetvaulted.com');
    vi.stubEnv('EXPO_PUBLIC_WEB_API_URL', '');
    const built = buildWebApiUrl('/api/account/sales/layaways');
    expect(built.url).toBe('https://beta.shopgetvaulted.com/api/account/sales/layaways');
  });

  it('does not warn on production www host', () => {
    expect(misconfiguredWebApiHostWarning('https://www.shopgetvaulted.com')).toBeNull();
  });

  it('warns when origin includes a path suffix', () => {
    expect(misconfiguredWebApiHostWarning('https://beta.shopgetvaulted.com/api')).toContain('origin only');
  });
});
