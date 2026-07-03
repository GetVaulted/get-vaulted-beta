"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AUTH_USER_MESSAGES } from "@/lib/unified-auth";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { getSupabaseBrowserAuthClient } from "@/lib/supabase-browser-auth-client";

type LinkState = "verifying" | "ready" | "invalid";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");

  const [linkState, setLinkState] = useState<LinkState>(errorDescription ? "invalid" : "verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (errorDescription) return;

    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) {
      setLinkState("invalid");
      return;
    }

    let cancelled = false;

    // Supabase's client auto-processes the recovery link (hash tokens or ?code=) on init and
    // fires PASSWORD_RECOVERY once a recovery session is established.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setLinkState("ready");
      }
    });

    // If a session already exists by the time this mounts (e.g. fast auto-exchange), treat it as ready.
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setLinkState((s) => (s === "verifying" ? "ready" : s));
    });

    const timeout = setTimeout(() => {
      if (!cancelled) setLinkState((s) => (s === "verifying" ? "invalid" : s));
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [errorDescription]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) {
      setError(AUTH_USER_MESSAGES.passwordResetFailed);
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || AUTH_USER_MESSAGES.passwordResetFailed);
        return;
      }
      await supabase.auth.signOut();
      router.replace("/signin?reset=1");
    } catch {
      setError(AUTH_USER_MESSAGES.passwordResetFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_56px_-28px_rgba(0,0,0,0.85)] sm:p-7">
      <h1 className="font-display text-center text-2xl font-bold text-foreground sm:text-left">Choose a new password</h1>

      {linkState === "verifying" ? (
        <p className="mt-4 text-center text-sm text-zinc-500 sm:text-left">
          {AUTH_USER_MESSAGES.passwordResetLinkVerifying}
        </p>
      ) : linkState === "invalid" ? (
        <>
          <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-950/30 px-3 py-2.5 text-center text-sm font-medium text-rose-100 sm:text-left">
            {errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, " ")) : AUTH_USER_MESSAGES.passwordResetLinkInvalid}
          </p>
          <Link
            href="/forgot-password"
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110 active:scale-[0.98]"
          >
            Request a new reset link
          </Link>
        </>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="reset-password" className="text-xs font-medium text-zinc-300">
              New password
            </label>
            <PasswordInput
              id="reset-password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reset-password-confirm" className="text-xs font-medium text-zinc-300">
              Confirm new password
            </label>
            <PasswordInput
              id="reset-password-confirm"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              placeholder="Re-enter your new password"
              required
              minLength={8}
            />
          </div>
          {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 h-11 rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-xs text-zinc-600 sm:text-left">
        <Link href="/signin" className="font-semibold text-gold-bright hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(14,14,18,0.98)_0%,#030303_55%,#030303_100%)] px-4 py-14">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/25 to-transparent"
        aria-hidden
      />
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#0a0a0d]/80 p-10 text-center text-sm text-zinc-500">
            Loading…
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
