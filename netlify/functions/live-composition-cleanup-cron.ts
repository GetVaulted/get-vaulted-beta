import type { Config, Handler } from '@netlify/functions';

/**
 * Every 10 minutes: stop any IVS composition still billing after its stage has gone idle (or is
 * well past the no-active-session hard cap), and close any LiveRoom row left stuck "live" behind
 * it. See web/src/services/ivs.ts `cleanupOrphanedIvsCompositions` / `closeStaleOpenLiveRooms`.
 * Requires Netlify env: CRON_SECRET, and SITE_URL or URL (shopgetvaulted.com).
 */
export const config: Config = {
  schedule: '*/10 * * * *',
};

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET?.trim();
  const site =
    process.env.URL?.trim().replace(/\/+$/, '') ||
    process.env.SITE_URL?.trim().replace(/\/+$/, '') ||
    process.env.DEPLOY_PRIME_URL?.trim().replace(/\/+$/, '') ||
    '';

  if (!secret) {
    console.error('[live-composition-cleanup-cron] CRON_SECRET missing');
    return { statusCode: 503, body: 'CRON_SECRET missing' };
  }
  if (!site) {
    console.error('[live-composition-cleanup-cron] SITE_URL/URL missing');
    return { statusCode: 503, body: 'SITE_URL missing' };
  }

  try {
    const res = await fetch(`${site}/api/cron/live-composition-cleanup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[live-composition-cleanup-cron] upstream failed', res.status, text.slice(0, 300));
      return { statusCode: res.status, body: text.slice(0, 500) };
    }
    return { statusCode: 200, body: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[live-composition-cleanup-cron] fetch failed', msg);
    return { statusCode: 500, body: msg };
  }
};
