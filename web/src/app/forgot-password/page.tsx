"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";
import { AUTH_USER_MESSAGES } from "@/lib/unified-auth";
import { getSupabaseBrowserAuthClient } from "@/lib/supabase-browser-auth-client";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const emailFromQuery = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const signinHref = returnTo !== "/marketplace" ? `/signin?returnTo=${encodeURIComponent(returnTo)}` : "/signin";

  const [email, setEmail] = useState(emailFromQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) {
      setError("Password reset is not available right now. Try again shortly or contact support.");
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
      // Always show the generic "sent" state on success to avoid confirming which emails have accounts.
      // Only surface genuine service errors (rate limiting, misconfiguration), not "not found" style errors.
      if (resetError && resetError.status && resetError.status >= 500) {
        setError(AUTH_USER_MESSAGES.passwordResetFailed);
        return;
      }
      setSent(true);
    } catch {
      setError(AUTH_USER_MESSAGES.passwordResetFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_56px_-28px_rgba(0,0,0,0.85)] sm:p-7">
      <h1 className="font-display text-center text-2xl font-bold text-foreground sm:text-left">Reset your password</h1>
      <p className="mt-2 text-center text-sm text-zinc-500 sm:text-left">
        {sent ? (
          <span className="text-emerald-200/90">{AUTH_USER_MESSAGES.passwordResetSent}</span>
        ) : (
          AUTH_USER_MESSAGES.passwordResetBody
        )}
      </p>

      {!sent ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="forgot-email" className="text-xs font-medium text-zinc-300">
              Email
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-sm text-foreground outline-none ring-gold/25 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
              placeholder="you@example.com"
              required
            />
          </div>
          {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 h-11 rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      ) : null}

      <p className="mt-5 text-center text-xs text-zinc-600 sm:text-left">
        Remembered your password?{" "}
        <Link href={signinHref} className="font-semibold text-gold-bright hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
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
        <ForgotPasswordForm />
      </Suspense>
    </main>
  );
}
