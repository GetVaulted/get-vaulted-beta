import { Linking } from 'react-native';
import { createSellerStripeDashboardLink } from '../api/stripeConnectRepository';

/**
 * Opens Stripe Express Dashboard (balance, payouts, bank settings) in the **system** browser.
 *
 * Do not use `expo-web-browser` / SFSafariViewController here: Stripe's Express login
 * SMS step often fails there with "Native fetch error: Load Failure" because the
 * in-app browser does not share cookies/storage with Safari and blocks parts of
 * Stripe's verification fetch. System Safari/Chrome handles that flow correctly.
 */
export async function openStripeConnectDashboard(accessToken: string): Promise<void> {
  const { url } = await createSellerStripeDashboardLink(accessToken);
  if (!url?.startsWith('http')) {
    throw new Error('Server did not return a valid Stripe dashboard URL.');
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error('Could not open Stripe in your browser.');
  }

  await Linking.openURL(url);
}
