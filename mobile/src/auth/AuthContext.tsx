import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { updateMyProfile } from '../api/profilesRepository';
import { setKeepMeLoggedInPreference } from '../lib/authSessionStorage';
import { resolveInitialAuthSession } from '../lib/recoverInvalidAuthSession';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { signInWithAppleOAuth, signInWithGoogleOAuth, type SocialAuthResult } from '../lib/socialAuth';

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Signed-out browse mode: main app visible, no live rooms / buy / bid until account. */
  guestExploreMode: boolean;
  enterGuestExplore: () => void;
  signInWithPassword: (email: string, password: string, opts?: { persistSession?: boolean }) => Promise<void>;
  signInWithGoogle: (opts?: { persistSession?: boolean }) => Promise<SocialAuthResult>;
  signInWithApple: (opts?: { persistSession?: boolean }) => Promise<SocialAuthResult>;
  signUpWithPassword: (params: { email: string; password: string; username: string }) => Promise<{
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

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setSession(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { session: initial } = await resolveInitialAuthSession(sb);
        if (cancelled) return;
        setSession(initial);
        setGuestExploreMode(false);
      } catch {
        if (cancelled) return;
        setSession(null);
        setGuestExploreMode(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user) setGuestExploreMode(false);
  }, [session?.user?.id]);

  const enterGuestExplore = useCallback(() => {
    setGuestExploreMode(true);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string, opts?: { persistSession?: boolean }) => {
    const sb = getSupabase();
    if (!sb || !isSupabaseConfigured()) throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
    const persist = opts?.persistSession ?? true;
    await setKeepMeLoggedInPreference(persist);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
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
    async (params: { email: string; password: string; username: string }) => {
      const sb = getSupabase();
      if (!sb || !isSupabaseConfigured()) throw new Error('Supabase is not configured.');
      const username = params.username.trim().toLowerCase();
      const displayName = username;
      const { data, error } = await sb.auth.signUp({
        email: params.email.trim(),
        password: params.password,
        options: {
          data: {
            username,
            display_name: displayName,
          },
          emailRedirectTo:
            process.env.EXPO_PUBLIC_SITE_URL?.trim()?.replace(/\/+$/, '') ||
            'https://beta.shopgetvaulted.com',
        },
      });
      if (error) throw error;
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
    const sb = getSupabase();
    if (!sb || !isSupabaseConfigured()) {
      throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
    }
    const trimmed = email.trim();
    if (!trimmed) throw new Error('Enter your email address.');
    const { error } = await sb.auth.resetPasswordForEmail(trimmed);
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    setGuestExploreMode(false);
    await getSupabase()?.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
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
