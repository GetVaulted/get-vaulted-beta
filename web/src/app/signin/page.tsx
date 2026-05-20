"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo") || searchParams.get("callbackUrl"));
  const registered = searchParams.get("registered");
  const suspended = searchParams.get("suspended") === "1";

  /** If credentials ever landed in the query string (native GET fallback), strip them from the address bar. */
  useEffect(() => {
    if (!searchParams.has("password")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("password");
    next.delete("email");
    const qs = next.toString();
    router.replace(`/signin${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);
  const joinHref =
    returnTo !== "/marketplace" ? `/join?returnTo=${encodeURIComponent(returnTo)}` : "/join";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        setError(
          "Invalid email or password. Web sign-up needs email verification; accounts created in the mobile app use the same email and password here once Supabase env is aligned on beta.",
        );
        return;
      }
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
        {registered === "1" ? (
          <span className="text-emerald-200/90">
            Account ready. Sign in with your email and password (you should already be verified).
          </span>
        ) : (
          "Use the email and password for your Get Vaulted account."
        )}
      </p>

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
          <label htmlFor="signin-password" className="text-xs font-medium text-zinc-300">
            Password
          </label>
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-sm text-foreground outline-none ring-gold/25 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
            placeholder="Your password"
            required
            minLength={8}
          />
        </div>
        {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-1 h-11 rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-zinc-600 sm:text-left">
        Signed up on the mobile app? Use the same email and password. Signed up on the web? Enter the
        verification code from your email before signing in.
      </p>
      <p className="mt-3 text-center text-xs text-zinc-600 sm:text-left">
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
