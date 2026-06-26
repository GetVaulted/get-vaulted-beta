"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";
import {
  loadRememberedCredentials,
  loadRememberMePreference,
  persistRememberMeCredentials,
} from "@/lib/remember-me-credentials";
import { AUTH_USER_MESSAGES } from "@/lib/unified-auth";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { PasswordInput } from "@/components/auth/PasswordInput";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const returnTo = safeReturnTo(searchParams.get("returnTo") || searchParams.get("callbackUrl"));
  const registered = searchParams.get("registered");
  const confirm = searchParams.get("confirm");
  const reset = searchParams.get("reset") === "1";
  const suspended = searchParams.get("suspended") === "1";
  const oauthErrorRaw = searchParams.get("oauthError");
  const emailFromQuery = searchParams.get("email")?.trim().toLowerCase() ?? "";

  /** If credentials ever landed in the query string (native GET fallback), strip them from the address bar. */
  useEffect(() => {
    if (!searchParams.has("password")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("password");
    next.delete("email");
    const qs = next.toString();
    router.replace(`/signin${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  /** If OAuth failed but the session cookie is already set, skip the error screen. */
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    const next = returnTo.startsWith("/") ? returnTo : "/marketplace";
    router.replace(next);
    router.refresh();
  }, [returnTo, router, session?.user, status]);

  const joinHref =
    returnTo !== "/marketplace" ? `/join?returnTo=${encodeURIComponent(returnTo)}` : "/join";

  const [email, setEmail] = useState(() => emailFromQuery);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    oauthErrorRaw ? decodeURIComponent(oauthErrorRaw.replace(/\+/g, " ")) : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = loadRememberedCredentials();
    if (saved) {
      setEmail((current) => current || saved.email);
      setPassword(saved.password);
      setRememberMe(true);
      return;
    }
    setRememberMe(loadRememberMePreference());
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (!res?.ok || res.error) {
        setError(AUTH_USER_MESSAGES.signInInvalidCredentials);
        return;
      }
      persistRememberMeCredentials(rememberMe, email, password);
      const next = returnTo.startsWith("/") ? returnTo : "/marketplace";
      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_56px_-28px_rgba(0,0,0,0.85)] sm:p-7">
      <h1 className="font-display text-center text-2xl font-bold text-foreground sm:text-left">Sign in</h1>
      <p className="mt-2 text-center text-sm text-zinc-500 sm:text-left">
        {confirm === "1" ? (
          <span className="text-emerald-200/90">{AUTH_USER_MESSAGES.signInConfirmEmail}</span>
        ) : reset ? (
          <span className="text-emerald-200/90">{AUTH_USER_MESSAGES.passwordResetComplete}</span>
        ) : registered === "1" ? (
          <span className="text-emerald-200/90">{AUTH_USER_MESSAGES.signInReady}</span>
        ) : (
          AUTH_USER_MESSAGES.signInSubtitle
        )}
      </p>

      {oauthErrorRaw ? (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-950/30 px-3 py-2.5 text-center text-sm font-medium text-rose-100 sm:text-left">
          {error}
        </p>
      ) : null}

      {suspended ? (
        <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-950/25 px-3 py-2 text-center text-xs font-medium text-amber-100/95 sm:text-left">
          This account is suspended and cannot sign in. If this is a mistake, contact support.
        </p>
      ) : null}

      <form className="mt-6 flex flex-col gap-4" method="post" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <label htmlFor="signin-email" className="text-xs font-medium text-zinc-300">
            Email
          </label>
          <input
            id="signin-email"
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="signin-password" className="text-xs font-medium text-zinc-300">
              Password
            </label>
            <Link
              href={email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}` : "/forgot-password"}
              className="text-[11px] font-semibold text-gold-bright/90 hover:text-gold-bright hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="signin-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Your password"
            required
            minLength={8}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="rememberMe"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="size-4 shrink-0 rounded border-white/20 bg-[#0c0c10] accent-gold focus:ring-2 focus:ring-gold/35 focus:ring-offset-0 focus:ring-offset-[#0a0a0d]"
          />
          <span className="text-[13px] font-medium text-zinc-400">Remember me</span>
        </label>
        {error && !oauthErrorRaw ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-1 h-11 rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <SocialAuthButtons returnTo={returnTo} disabled={loading} />

      <p className="mt-5 text-center text-xs text-zinc-600 sm:text-left">
        New here?{" "}
        <Link href={joinHref} className="font-semibold text-gold-bright hover:underline">
          Join Get Vaulted
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.98)_0%,#030303_55%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/25 to-transparent"
        aria-hidden
      />
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-10">
        <div className="max-w-lg text-center lg:text-left">
          <Link href="/" className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright">
            ← Back to home
          </Link>
          <h2 className="font-display mt-6 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Welcome back to <span className="text-gold-bright">Get Vaulted</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
            Sign in to create listings, manage drafts, and sell on the marketplace.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#0a0a0d]/80 p-10 text-center text-sm text-zinc-500">
              Loading…
            </div>
          }
        >
          <SignInForm />
        </Suspense>
      </div>
    </main>
  );
}
