import type { Config, Handler } from '@netlify/functions';

/**
 * Every 5 minutes: remind hosts whose show starts in ~15 minutes.
 * Requires Netlify env: CRON_SECRET, and SITE_URL or URL (shopgetvaulted.com).
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
    console.error('[live-host-prestart-cron] CRON_SECRET missing');
    return { statusCode: 503, body: 'CRON_SECRET missing' };
  }
  if (!site) {
    console.error('[live-host-prestart-cron] SITE_URL/URL missing');
    return { statusCode: 503, body: 'SITE_URL missing' };
  }

  try {
    const res = await fetch(`${site}/api/cron/live-host-prestart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[live-host-prestart-cron] upstream failed', res.status, text.slice(0, 300));
      return { statusCode: res.status, body: text.slice(0, 500) };
    }
    return { statusCode: 200, body: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[live-host-prestart-cron] fetch failed', msg);
    return { statusCode: 500, body: msg };
  }
};
