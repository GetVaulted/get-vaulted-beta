import { fetchWebApiMobile } from './fetchWebApiMobile';
import { getWebApiBaseUrl } from './webApiBaseUrl';

export type AppAuthConfig = {
  stripePublishableKey?: string | null;
};

export async function fetchAppAuthConfig(): Promise<AppAuthConfig | null> {
  if (!getWebApiBaseUrl()) return null;
  try {
    const res = await fetchWebApiMobile('/api/auth/config');
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as AppAuthConfig;
    return j;
  } catch {
    return null;
  }
}
