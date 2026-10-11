import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { updateMyProfile } from '../api/profilesRepository';
import { reportAuthDiagnostic } from '../lib/authDiagnostics';
import { setKeepMeLoggedInPreference } from '../lib/authSessionStorage';
import { warmPresenceSlot } from '../lib/liveRoomPresenceKey';
import { resolveInitialAuthSession } from '../lib/recoverInvalidAuthSession';
import { ensureSupabaseReady, getSupabase, isSupabaseConfigured, resetSupabaseBootstrap } from '../lib/supabase';
import { runSupabaseAuthOp } from '../lib/supabaseAuthRetry';
import { signInWithAppleOAuth, signInWithGoogleOAuth, type SocialAuthResult } from '../lib/socialAuth';

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * The event from Supabase's most recent `onAuthStateChange` callback (e.g. `SIGNED_IN`,
   * `TOKEN_REFRESHED`, `SIGNED_OUT`). Consumers use this to tell a definite sign-out apart from a
   * transient `session === null` reading during a warm-resume token refresh — see
   * `authSessionRoutingDecision.ts`.
   */
  lastAuthEvent: AuthChangeEvent | null;
  /** Signed-out browse mode: main app visible, no live rooms / buy / bid until account. */
  guestExploreMode: boolean;
  enterGuestExplore: () => void;
  signInWithPassword: (email: string, password: string, opts?: { persistSession?: boolean }) => Promise<void>;
  signInWithGoogle: (opts?: { persistSession?: boolean }) => Promise<SocialAuthResult>;
  signInWithApple: (opts?: { persistSession?: boolean }) => Promise<SocialAuthResult>;
  signUpWithPassword: (params: {
    email: string;
    password: string;
    username: string;
    /** `?ref=<referralCode>` from a shared referral link, or a manually-entered referral code. */
    referralCode?: string;
  }) => Promise<{
    needsEmailConfirmation: boolean;
  }>;
  requestPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestExploreMode, setGuestExploreMode] = useState(false);
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthChangeEvent | null>(null);
  /** True while the user themself is signing out, so only UNEXPECTED sign-outs are reported. */
  const userInitiatedSignOutRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        await ensureSupabaseReady();
        const sb = getSupabase();
        if (!sb) {
          if (!cancelled) setSession(null);
          return;
        }

        const { session: initial } = await resolveInitialAuthSession(sb);
        if (cancelled) return;
        setSession(initial);
        setGuestExploreMode(false);

        // Load the persisted live-room presence identity before any screen (including a live
        // room) can mount, so viewer presence tracking never falls back to minting a fresh
        // random identity on cold start — see liveRoomPresenceKey.ts for why that mattered.
        // Fire-and-forget rather than awaited: this was blocking the entire app's first paint on
        // an AsyncStorage round-trip, adding real, user-visible delay to every cold launch, for a
        // guarantee it doesn't actually need to be in the critical path for. The buyer still has to
        // navigate past this screen to a live room (seconds of real time) before
        // `resolvePresenceSlotSync` could ever run — AsyncStorage typically resolves in well under
        // that window, so the protection this exists for still holds in practice.
        void warmPresenceSlot(initial?.user?.id ?? null);

        const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
          setLastAuthEvent(event);
          setSession(next);
          if (event === 'SIGNED_OUT' && !userInitiatedSignOutRef.current) {
            reportAuthDiagnostic('unexpected_signed_out');
          }
          // Defense-in-depth for sign-in after guest browsing: non-blocking, since login already
          // has enough network latency to make the cold-start race here vanishingly unlikely.
          void warmPresenceSlot(next?.user?.id ?? null);
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        if (!cancelled) {
          setSession(null);
          setGuestExploreMode(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (session?.user) setGuestExploreMode(false);
  }, [session?.user?.id]);

  // Supabase's token-refresh timer must only run while the app is in the foreground. On Android a
  // refresh that is mid-flight when the app is backgrounded/killed can rotate the server-side
  // token without the new one ever being saved, which later reads as "logged out". This is the
  // official React Native pattern: pause the timer in the background, resume (and refresh right
  // away if needed) when the app comes back.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const apply = (state: string) => {
      const auth = getSupabase()?.auth;
      if (!auth) return;
      if (state === 'active') void auth.startAutoRefresh();
      else void auth.stopAutoRefresh();
    };
    const sub = AppState.addEventListener('change', apply);
    return () => sub.remove();
  }, []);

  const enterGuestExplore = useCallback(() => {
    setGuestExploreMode(true);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string, opts?: { persistSession?: boolean }) => {
    await ensureSupabaseReady();
    const persist = opts?.persistSession ?? true;
    await setKeepMeLoggedInPreference(persist);
    const { error } = await runSupabaseAuthOp(() => {
      const sb = getSupabase();
      if (!sb || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
      }
      return sb.auth.signInWithPassword({ email: email.trim(), password });
    });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async (opts?: { persistSession?: boolean }) => {
    await setKeepMeLoggedInPreference(opts?.persistSession ?? true);
    return signInWithGoogleOAuth();
  }, []);

  const signInWithApple = useCallback(async (opts?: { persistSession?: boolean }) => {
    await setKeepMeLoggedInPreference(opts?.persistSession ?? true);
    return signInWithAppleOAuth();
  }, []);

  const signUpWithPassword = useCallback(
    async (params: { email: string; password: string; username: string; referralCode?: string }) => {
      const runSignUp = async () => {
        await ensureSupabaseReady();
        const sb = getSupabase();
        if (!sb || !isSupabaseConfigured()) throw new Error('Supabase is not configured.');
        const username = params.username.trim().toLowerCase();
        const displayName = username;
        const referralCode = params.referralCode?.trim().slice(0, 32) || undefined;
        return sb.auth.signUp({
          email: params.email.trim(),
          password: params.password,
          options: {
            data: {
              username,
              display_name: displayName,
              ...(referralCode ? { referral_code: referralCode } : {}),
            },
            emailRedirectTo:
              process.env.EXPO_PUBLIC_SITE_URL?.trim()?.replace(/\/+$/, '') ||
              'https://shopgetvaulted.com',
          },
        });
      };

      let { data, error } = await runSignUp();
      if (error?.message === 'Invalid API key') {
        resetSupabaseBootstrap();
        ({ data, error } = await runSignUp());
      }
      if (error) throw error;

      const username = params.username.trim().toLowerCase();
      const displayName = username;
      const uid = data.user?.id;
      if (data.session?.user && uid && username) {
        void updateMyProfile(uid, { username, display_name: displayName }).catch((e) => {
          if (__DEV__) console.warn('[auth:signup] profile sync', e);
        });
      }
      const needsEmailConfirmation = !data.session;
      return { needsEmailConfirmation };
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    await ensureSupabaseReady();
    const sb = getSupabase();
    if (!sb || !isSupabaseConfigured()) {
      throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
    }
    const trimmed = email.trim();
    if (!trimmed) throw new Error('Enter your email address.');
    // Must land on the web reset page — without redirectTo, Supabase uses Site URL and the link is useless.
    const site = (
      process.env.EXPO_PUBLIC_SITE_URL?.trim() ||
      process.env.EXPO_PUBLIC_SHARE_SITE_URL?.trim() ||
      'https://shopgetvaulted.com'
    ).replace(/\/+$/, '');
    const redirectTo = `${site}/reset-password`;
    const { error } = await runSupabaseAuthOp(() => {
      const client = getSupabase();
      if (!client || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
      }
      return client.auth.resetPasswordForEmail(trimmed, { redirectTo });
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    setGuestExploreMode(false);
    userInitiatedSignOutRef.current = true;
    try {
      await getSupabase()?.auth.signOut();
    } finally {
      userInitiatedSignOutRef.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      lastAuthEvent,
      guestExploreMode,
      enterGuestExplore,
      signInWithPassword,
      signInWithGoogle,
      signInWithApple,
      signUpWithPassword,
      requestPasswordReset,
      signOut,
    }),
    [
      session,
      loading,
      lastAuthEvent,
      guestExploreMode,
      enterGuestExplore,
      signInWithPassword,
      signInWithGoogle,
      signInWithApple,
      signUpWithPassword,
      requestPasswordReset,
      signOut,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
