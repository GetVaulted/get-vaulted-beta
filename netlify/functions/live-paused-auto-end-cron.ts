import type { Config, Handler } from '@netlify/functions';

/**
 * Every 5 minutes: end any live show whose video has been paused for 60+ minutes (safety net so a
 * forgotten pause cannot leave a show "live" and billing overnight). See
 * web/src/lib/live-paused-auto-end.ts. Requires Netlify env: CRON_SECRET, and SITE_URL or URL.
 */
export const config: Config = {
  schedule: '*/5 * * * *',
};

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET?.trim();
  const site =
    process.env.URL?.trim().replace(/\/+$/, '') ||
    process.env.SITE_URL?.trim().replace(/\/+$/, '') ||
    process.env.DEPLOY_PRIME_URL?.trim().replace(/\/+$/, '') ||
    '';

  if (!secret) {
    console.error('[live-paused-auto-end-cron] CRON_SECRET missing');
    return { statusCode: 503, body: 'CRON_SECRET missing' };
  }
  if (!site) {
    console.error('[live-paused-auto-end-cron] SITE_URL/URL missing');
    return { statusCode: 503, body: 'SITE_URL missing' };
  }

  try {
    const res = await fetch(`${site}/api/cron/live-paused-auto-end`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[live-paused-auto-end-cron] upstream failed', res.status, text.slice(0, 300));
      return { statusCode: res.status, body: text.slice(0, 500) };
    }
    return { statusCode: 200, body: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[live-paused-auto-end-cron] fetch failed', msg);
    return { statusCode: 500, body: msg };
  }
};
