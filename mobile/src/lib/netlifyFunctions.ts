/**
 * Base URL for Netlify Functions, e.g. https://shopgetvaulted.app/.netlify/functions
 * Set EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE in .env — no trailing slash on path segment before function name.
 */
export function getNetlifyFunctionsBase(): string | null {
  const raw = process.env.EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export async function postTradeFeeCheckout(params: {
  tradeOfferId: string;
  userId: string;
  amountCents: number;
}): Promise<{ url: string; id: string }> {
  const base = getNetlifyFunctionsBase();
  if (!base) {
    throw new Error('Missing EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE (e.g. https://yoursite.netlify.app/.netlify/functions)');
  }
  const res = await fetch(`${base}/trade-fee-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tradeOfferId: params.tradeOfferId,
      userId: params.userId,
      amountCents: params.amountCents,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`trade-fee-checkout ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as { url?: string; id?: string };
  if (!data.url) {
    throw new Error('trade-fee-checkout: missing checkout URL');
  }
  return { url: data.url, id: data.id ?? '' };
}
