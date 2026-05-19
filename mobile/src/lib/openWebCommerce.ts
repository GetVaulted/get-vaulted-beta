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

/** Opens web checkout / live room in system browser when mobile native pay is not wired. */
export async function openWebCommerceUrl(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    showInRecents: true,
  });
}
