import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { getSupabase } from '../lib/supabase';

export type QaSessionDebugResponse = {
  generatedAt: string;
  environment: {
    supabaseProjectRef: string | null;
    databaseProjectRef: string | null;
    expectedBetaProjectRef: string;
    alignedWithBeta: boolean;
    requestHost: string | null;
  };
  session: {
    authenticated: boolean;
    supabaseAuthUserId: string | null;
    email: string | null;
    prismaUserId: string | null;
    sessionSource: 'bearer' | 'cookie' | null;
  };
  identityConsistency: {
    prismaUsersWithSameEmail: Array<{
      id: string;
      stripeAccountId: string | null;
      stripeOnboardingComplete: boolean;
    }>;
    canonicalPrismaUserId: string | null;
    idEmailMismatch: boolean;
    warning: string | null;
  };
  sellerReadiness: {
    stripeAccountId: string | null;
    summary: string;
    canPublish: boolean;
    canHostLive: boolean;
    payoutsReady: boolean;
  } | null;
  liveDiscovery: {
    publicRoomCount: number;
    sellerRoomCount: number | null;
    rooms: Array<{ id: string; title: string; status: string; sellerUsername: string | null }>;
    source: string;
  };
};

export async function fetchQaSessionDebug(): Promise<QaSessionDebugResponse | null> {
  const base = getWebApiBaseUrl();
  if (!base) return null;
  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  const token = session?.access_token;
  const res = await fetch(`${base}/api/qa/session-debug`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`session-debug HTTP ${res.status}${err ? `: ${err.slice(0, 120)}` : ''}`);
  }
  return (await res.json()) as QaSessionDebugResponse;
}
