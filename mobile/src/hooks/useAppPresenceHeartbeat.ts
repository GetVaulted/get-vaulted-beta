import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

const HEARTBEAT_MS = 45_000;

function presencePlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/**
 * Signed-in foreground heartbeat so admin Command Center can count mobile users online.
 */
export function useAppPresenceHeartbeat() {
  const { session, guestExploreMode } = useAuth();
  const token = session?.access_token ?? null;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!token || guestExploreMode) return;
    const platform = presencePlatform();
    if (!platform) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      if (cancelled || appStateRef.current !== 'active') return;
      void fetchWebApiAuthed('/api/account/presence', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      }).catch(() => {
        /* ignore transient network errors */
      });
    };

    const start = () => {
      ping();
      if (intervalId != null) clearInterval(intervalId);
      intervalId = setInterval(ping, HEARTBEAT_MS);
    };

    const stop = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    if (appStateRef.current === 'active') start();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      appStateRef.current = next;
      if (next === 'active') start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [guestExploreMode, token]);
}
