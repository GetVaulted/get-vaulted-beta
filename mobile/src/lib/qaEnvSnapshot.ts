import { getWebApiBaseUrl } from './webApiBaseUrl';
import { isSupabaseConfigured } from './supabase';
import { supabaseProjectRefFromUrl } from './supabaseProjectRef';
import { formatLiveDiscoveryMetaLine, getLiveDiscoveryMeta } from './liveDiscoveryMeta';

const EXPECTED_BETA_REF = 'xkaaicokjgmpbctfermj';

export type QaEnvSnapshot = {
  apiBaseUrl: string | null;
  supabaseProjectRef: string | null;
  supabaseConfigured: boolean;
  alignedWithBeta: boolean;
  discoveryLine: string;
};

export function getQaEnvSnapshot(): QaEnvSnapshot {
  const apiBaseUrl = getWebApiBaseUrl();
  const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const supabaseProjectRef = supaUrl ? supabaseProjectRefFromUrl(supaUrl) : null;
  return {
    apiBaseUrl,
    supabaseProjectRef,
    supabaseConfigured: isSupabaseConfigured(),
    alignedWithBeta: supabaseProjectRef === EXPECTED_BETA_REF,
    discoveryLine: formatLiveDiscoveryMetaLine(getLiveDiscoveryMeta()),
  };
}
