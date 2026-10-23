import { schedule } from '@netlify/functions';

/**
 * Every 5 minutes: ask the Next.js API to alert admins about risky buyer activity.
 * Requires Netlify env: CRON_SECRET, and SITE_URL or URL (shopgetvaulted.com).
 */
export const handler = schedule('*/5 * * * *', async () => {
  const secret = process.env.CRON_SECRET?.trim();
  const site =
    process.env.URL?.trim().replace(/\/+$/, '') ||
    process.env.SITE_URL?.trim().replace(/\/+$/, '') ||
    process.env.DEPLOY_PRIME_URL?.trim().replace(/\/+$/, '') ||
    '';

  if (!secret) {
    console.error('[buyer-risk-alert-cron] CRON_SECRET missing');
    return { statusCode: 503, body: 'CRON_SECRET missing' };
  }
  if (!site) {
    console.error('[buyer-risk-alert-cron] SITE_URL/URL missing');
    return { statusCode: 503, body: 'SITE_URL missing' };
  }

  try {
    const res = await fetch(`${site}/api/cron/buyer-risk-alert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[buyer-risk-alert-cron] upstream failed', res.status, text.slice(0, 300));
      return { statusCode: res.status, body: text.slice(0, 500) };
    }
    console.info('[buyer-risk-alert-cron] ok', text.slice(0, 300));
    return { statusCode: 200, body: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[buyer-risk-alert-cron] fetch failed', msg);
    return { statusCode: 500, body: msg };
  }
});
