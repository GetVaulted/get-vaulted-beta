import * as WebBrowser from 'expo-web-browser';

/** Opens Stripe-hosted checkout only — never used for web sign-in pages. */
export async function openStripeCheckoutSession(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) throw new Error('Invalid checkout URL.');
  if (/\/signin/i.test(trimmed)) throw new Error('Unexpected sign-in redirect.');
  await WebBrowser.openBrowserAsync(trimmed, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    showInRecents: true,
  });
}
