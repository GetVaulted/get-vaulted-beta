import { schedule } from '@netlify/functions';

/**
 * Daily (08:17 UTC): removes deleted conversations for good after their 14-day window and frees
 * conversations both people have deleted. See web/src/lib/message-thread-cleanup.ts.
 * Requires Netlify env: CRON_SECRET, and SITE_URL or URL (shopgetvaulted.com).
 */
export const handler = schedule('17 8 * * *', async () => {
  const secret = process.env.CRON_SECRET?.trim();
  const site =
    process.env.URL?.trim().replace(/\/+$/, '') ||
    process.env.SITE_URL?.trim().replace(/\/+$/, '') ||
    process.env.DEPLOY_PRIME_URL?.trim().replace(/\/+$/, '') ||
    '';

  if (!secret) {
    console.error('[message-cleanup-cron] CRON_SECRET missing');
    return { statusCode: 503, body: 'CRON_SECRET missing' };
  }
  if (!site) {
    console.error('[message-cleanup-cron] SITE_URL/URL missing');
    return { statusCode: 503, body: 'SITE_URL missing' };
  }

  try {
    const res = await fetch(`${site}/api/cron/message-cleanup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[message-cleanup-cron] upstream failed', res.status, text.slice(0, 300));
      return { statusCode: res.status, body: text.slice(0, 500) };
    }
    console.info('[message-cleanup-cron] ok', text.slice(0, 300));
    return { statusCode: 200, body: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[message-cleanup-cron] fetch failed', msg);
    return { statusCode: 500, body: msg };
  }
});
