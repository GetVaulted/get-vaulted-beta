import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: fetchWebApiMobile previously called plain `fetch` with no timeout — a dropped
// connection would hang forever instead of rejecting (performance audit 2026-07).

describe('fetchWebApiMobile timeout behavior', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env.EXPO_PUBLIC_SITE_URL = 'https://example.com';
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('aborts and rejects instead of hanging forever when the connection never responds', async () => {
    global.fetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
        // Never resolves on its own — simulates a hung/dropped connection.
      });
    }) as unknown as typeof fetch;

    const { fetchWebApiMobile } = await import('./fetchWebApiMobile');

    const pending = fetchWebApiMobile('/api/listings');
    const assertion = expect(pending).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
  });

  it('resolves normally when the server responds before the timeout', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const { fetchWebApiMobile } = await import('./fetchWebApiMobile');
    const res = await fetchWebApiMobile('/api/listings');
    expect(res.status).toBe(200);
  });
});
