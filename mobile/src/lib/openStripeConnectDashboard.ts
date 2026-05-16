import * as WebBrowser from 'expo-web-browser';
import { createSellerStripeDashboardLink } from '../api/stripeConnectRepository';

/** Opens Stripe Express Dashboard (balance, payouts, withdraw). */
export async function openStripeConnectDashboard(accessToken: string): Promise<void> {
  const { url } = await createSellerStripeDashboardLink(accessToken);
  await WebBrowser.openBrowserAsync(url, { showInRecents: false });
}
