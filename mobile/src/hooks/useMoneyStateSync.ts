import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useVaultEcosystemEvents } from './useVaultEcosystemEvents';
import { resolveRealtimeUserId } from './useCanonicalUserId';

type Options = {
  enabled?: boolean;
  accessToken?: string;
  canonicalUserId?: string;
  supabaseUserId?: string;
  refetch: () => void | Promise<void>;
  pollIntervalMs?: number;
  refetchOnFocus?: boolean;
};

const DEFAULT_POLL_MS = 12_000;

/** Realtime-first refetch for money/inventory screens with focus + foreground + polling fallback. */
export function useMoneyStateSync({
  enabled = true,
  canonicalUserId,
  supabaseUserId,
  refetch,
  pollIntervalMs = DEFAULT_POLL_MS,
  refetchOnFocus = true,
}: Options): void {
  const realtimeUserId = resolveRealtimeUserId(canonicalUserId, supabaseUserId);
  const runRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  useVaultEcosystemEvents(realtimeUserId, {
    enabled: enabled && Boolean(realtimeUserId),
    onLayaway: runRefetch,
    onOrder: runRefetch,
    onListing: runRefetch,
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(runRefetch, pollIntervalMs);
    return () => clearInterval(timer);
  }, [enabled, pollIntervalMs, runRefetch]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') runRefetch();
    });
    return () => sub.remove();
  }, [enabled, runRefetch]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !refetchOnFocus) return;
      runRefetch();
    }, [enabled, refetchOnFocus, runRefetch]),
  );
}
