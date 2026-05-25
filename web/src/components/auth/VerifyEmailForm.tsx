"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { isClientDevVerificationUiAllowed } from "@/lib/dev-verification-assist";
import { clearSignupPendingStorage } from "@/lib/signup-register-routing";
import { safeReturnTo } from "@/lib/safe-return-to";

const PENDING_KEY = "gv_signup_pending";
const DEV_CODE_KEY = "gv_dev_last_code";

type PendingPayload = { v: 1; email: string; password: string; returnTo?: string };

function parsePending(raw: string | null): PendingPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingPayload;
    if (p?.v !== 1 || typeof p.email !== "string" || typeof p.password !== "string") return null;
    if (!p.email.includes("@")) return null;
    return p;
  } catch {
    return null;
  }
}

export function VerifyEmailForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [returnTo, setReturnTo] = useState("/marketplace");
  const [code, setCode] = useState("");
  const [bootError, setBootError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        const pending = parsePending(typeof window !== "undefined" ? sessionStorage.getItem(PENDING_KEY) : null);

        try {
          const cfg = (await fetch("/api/auth/config", { cache: "no-store" }).then((r) => r.json())) as {
            webSignupVerificationMethod?: string;
          };
          if (cfg.webSignupVerificationMethod && cfg.webSignupVerificationMethod !== "resend_code") {
            clearSignupPendingStorage();
            const emailParam = pending?.email ? `&email=${encodeURIComponent(pending.email)}` : "";
            const rt = pending?.returnTo ? `&returnTo=${encodeURIComponent(safeReturnTo(pending.returnTo))}` : "";
            router.replace(`/signin?registered=1${emailParam}${rt}`);
            return;
          }
        } catch {
          /* fall through */
        }

        if (!pending) {
          setBootError("missing");
          return;
        }
        setEmail(pending.email);
        setPassword(pending.password);
        setReturnTo(safeReturnTo(pending.returnTo));
        const hint = sessionStorage.getItem(DEV_CODE_KEY);
        if (hint && isClientDevVerificationUiAllowed()) {
          setDevHint(hint);
        }
      })();
    });
  }, [router]);

  const clearPending = useCallback(() => {
    try {
      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(DEV_CODE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        alreadyVerified?: boolean;
      };

      if (!res.ok) {
        const msg =
          data.code === "EXPIRED_CODE"
            ? (data.error ?? "This code has expired. Request a new code below.")
            : data.code === "INVALID_CODE" || data.code === "INVALID_CODE_FORMAT"
              ? (data.error ?? "Invalid verification code.")
              : data.code === "USER_NOT_FOUND"
                ? (data.error ?? "No account found for this email. Start sign-up again.")
                : data.code === "NO_PENDING_CODE"
                  ? (data.error ?? "No active verification code. Use Resend code below.")
                  : data.code === "VERIFY_CONFLICT"
                    ? (data.error ?? "This code is no longer valid. Request a new code below.")
                    : data.code === "EMAIL_REQUIRED" || data.code === "CODE_REQUIRED" || data.code === "INVALID_EMAIL"
                      ? (data.error ?? "Check your email and the 6-digit code, then try again.")
                      : data.code === "DATABASE_SCHEMA"
                        ? (data.error ?? "Server database needs an update. Contact support or try again later.")
                        : data.code === "SERVER_ERROR"
                          ? (data.error ?? "Something went wrong. Try again.")
                          : (data.error ?? "Something went wrong. Try again.");
        setError(msg);
        return;
      }

      const sign = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (sign?.error) {
        setError("Your email is verified, but sign-in failed. Try signing in from the home page.");
        return;
      }

      clearPending();
      const next = returnTo.startsWith("/") ? returnTo : "/marketplace";
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setResendMessage(null);
    setError(null);
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        _localDevVerificationCode?: string;
      };

      if (res.status === 429) {
        setResendMessage(data.error ?? "Please wait before requesting another code.");
        return;
      }
      if (!res.ok) {
        setResendMessage(data.error ?? "Could not resend the email.");
        return;
      }

      if (data._localDevVerificationCode && isClientDevVerificationUiAllowed()) {
        setDevHint(data._localDevVerificationCode);
        try {
          sessionStorage.setItem(DEV_CODE_KEY, data._localDevVerificationCode);
        } catch {
          /* ignore */
        }
      }

      setResendMessage("If an unverified account exists for this email, we sent a new code.");
    } catch {
      setResendMessage("Network error. Try again.");
    } finally {
      setResendLoading(false);
    }
  };

  if (bootError === "missing") {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <p className="text-sm font-medium text-zinc-300">This verification link is out of date.</p>
        <p className="mt-2 text-sm text-zinc-500">Start sign-up again — your email will carry forward after you submit the form.</p>
        <Link
          href="/signup"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950"
        >
          Back to sign up
        </Link>
      </div>
    );
  }

  return (
    <form className="mt-5 flex flex-col gap-3.5" onSubmit={onSubmit} noValidate>
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
      {resendMessage ? <p className="text-xs font-medium text-emerald-400/90">{resendMessage}</p> : null}

      {devHint && isClientDevVerificationUiAllowed() ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-mono text-amber-100">
          Local dev only: verification code <span className="font-bold tracking-widest">{devHint}</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-300">Email</span>
        <div className="h-11 rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-sm leading-[2.75rem] text-zinc-400">{email || "…"}</div>
        <p className="text-[11px] text-zinc-600">We sent a code to this address — no need to retype it.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="verify-code" className="text-xs font-medium text-zinc-300">
          Verification code
        </label>
        <input
          id="verify-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-11 rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-center font-mono text-lg tracking-[0.35em] text-foreground outline-none ring-gold/25 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
          placeholder="000000"
          aria-invalid={Boolean(error)}
        />
      </div>

      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="mt-0.5 h-11 rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? "Verifying…" : "Verify & continue"}
      </button>

      <button
        type="button"
        disabled={resendLoading || !email}
        onClick={() => void onResend()}
        className="h-10 rounded-full border border-white/12 text-sm font-medium text-zinc-300 transition hover:border-gold/35 hover:text-foreground disabled:opacity-50"
      >
        {resendLoading ? "Sending…" : "Resend code"}
      </button>

      <p className="mt-2 text-center text-xs text-zinc-600">
        Wrong place?{" "}
        <Link href="/signup" className="font-semibold text-gold-bright hover:underline">
          Start over
        </Link>
      </p>
    </form>
  );
}
