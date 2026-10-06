import type { Handler } from '@netlify/functions';

/**
 * Legacy Stripe webhook — retired.
 *
 * Production commerce uses Next.js `POST /api/stripe/webhook` only.
 * If Stripe Dashboard still points here, update the endpoint URL and disable this destination.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  return {
    statusCode: 410,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Legacy Stripe webhook retired',
      use: 'https://shopgetvaulted.com/api/stripe/webhook',
    }),
  };
};
