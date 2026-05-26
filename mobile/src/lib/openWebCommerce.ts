import * as WebBrowser from 'expo-web-browser';
import { getWebApiBaseUrl } from './webApiBaseUrl';

export function webOrderPayUrl(orderId: string): string | null {
  const base = getWebApiBaseUrl();
  if (!base || !orderId.trim()) return null;
  return `${base.replace(/\/$/, '')}/orders/${encodeURIComponent(orderId.trim())}`;
}

export function webLiveRoomUrl(roomId: string): string | null {
  const base = getWebApiBaseUrl();
  if (!base || !roomId.trim()) return null;
  return `${base.replace(/\/$/, '')}/live/${encodeURIComponent(roomId.trim())}`;
}

export function webListingUrl(listingId: string): string | null {
  const base = getWebApiBaseUrl();
  if (!base || !listingId.trim()) return null;
  return `${base.replace(/\/$/, '')}/listing/${encodeURIComponent(listingId.trim())}`;
}

export function webListingCheckoutUrl(listingId: string): string | null {
  const base = getWebApiBaseUrl();
  if (!base || !listingId.trim()) return null;
  return `${base.replace(/\/$/, '')}/checkout/${encodeURIComponent(listingId.trim())}`;
}

export function webAccountPaymentMethodsUrl(): string | null {
  const base = getWebApiBaseUrl();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/account/payment-methods`;
}

export function webAccountWalletShippingUrl(): string | null {
  const base = getWebApiBaseUrl();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/account/payment-methods#wallet-shipping`;
}

/** Opens web checkout / live room in system browser when mobile native pay is not wired. */
export async function openWebCommerceUrl(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    showInRecents: true,
  });
}
