"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { isClientDevVerificationUiAllowed } from "@/lib/dev-verification-assist";
import { safeReturnTo } from "@/lib/safe-return-to";
import {
  clearSignupPendingStorage,
  signupPendingStorageKeys,
  signupRequiresOtpVerification,
  type RegisterSuccessPayload,
} from "@/lib/signup-register-routing";
import type { UsernameRejectReason } from "@/lib/username-policy";
import { normalizeUsernameForStorage, USERNAME_UNAVAILABLE_MESSAGE, usernamePolicyUserMessage } from "@/lib/username-policy";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { PasswordInput } from "@/components/auth/PasswordInput";

type UsernameUiStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "reserved"
  | "profanity"
  /** Username check HTTP/network failure — see usernameCheckDetail */
  | "check_failed";

function mapReasonToStatus(reason: UsernameRejectReason | undefined): Exclude<UsernameUiStatus, "idle" | "checking" | "available"> {
  if (reason === "taken") return "taken";
  if (reason === "invalid") return "invalid";
  if (reason === "reserved") return "reserved";
  if (reason === "profanity") return "profanity";
  return "invalid";
}

type CheckUsernameJson = {
  available?: boolean;
  reason?: UsernameRejectReason;
  error?: string;
  /** Set only in development when the server adds a DB/network hint (passwords redacted). */
  debugMessage?: string;
};

type UsernameCheckOutcome = { status: UsernameUiStatus; detail?: string };

export type PasswordRequirement = { key: "length" | "letter" | "number"; label: string; met: boolean };

/** Modest, non-punishing password policy: 8+ chars, at least one letter, at least one number. */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { key: "length", label: "8+ characters", met: password.length >= 8 },
    { key: "letter", label: "Contains a letter", met: /[a-zA-Z]/.test(password) },
    { key: "number", label: "Contains a number", met: /[0-9]/.test(password) },
  ];
}

export function isPasswordStrongEnough(password: string): boolean {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}

const devSignupLog =
  process.env.NODE_ENV === "development"
    ? (...args: unknown[]) => {
        console.log("[signup]", ...args);
      }
    : () => {};

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Referral attribution is one-time and immutable, so we only ever read this once from the
  // link (`?ref=<code>`) — never re-derive it from a later re-render.
  const [referralCode] = useState(() => searchParams.get("ref")?.trim().slice(0, 32) ?? "");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [usernameStatus, setUsernameStatus] = useState<UsernameUiStatus>("idle");
  /** Server or network message when usernameStatus === "check_failed" */
  const [usernameCheckDetail, setUsernameCheckDetail] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped when the debounced username changes or the field is cleared; drops stale in-flight responses. */
  const usernameCheckGenRef = useRef(0);

  const fetchUsernameStatus = useCallback(async (value: string): Promise<UsernameCheckOutcome> => {
    const normalized = normalizeUsernameForStorage(value);
    if (normalized.length === 0) return { status: "invalid" };
    try {
      const res = await fetch(`/api/users/check-username?username=${encodeURIComponent(normalized)}`, {
        cache: "no-store",
      });
      const parsed = (await res.json().catch(() => ({}))) as CheckUsernameJson;
      if (!res.ok) {
        const base =
          typeof parsed.error === "string" && parsed.error.trim() ? parsed.error.trim() : "Could not check username. Try again.";
        const dbg =
          process.env.NODE_ENV === "development" && typeof parsed.debugMessage === "string" && parsed.debugMessage.trim()
            ? parsed.debugMessage.trim()
            : "";
        const msg = dbg ? `${base}\n${dbg}` : base;
        devSignupLog("check-username response (error)", { normalized, status: res.status, body: parsed });
        return { status: "check_failed", detail: msg };
      }
      if (parsed.available === true) {
        devSignupLog("check-username response", { normalized, available: true });
        return { status: "available" };
      }
      if (parsed.available === false) {
        devSignupLog("check-username response", { normalized, available: false, reason: parsed.reason });
        return { status: mapReasonToStatus(parsed.reason) };
      }
      devSignupLog("check-username response (unexpected shape)", { normalized, body: parsed });
      return { status: "check_failed", detail: "Could not check username. Try again." };
    } catch (e) {
      devSignupLog("check-username fetch threw", { normalized, error: e });
      return { status: "check_failed", detail: "Could not check username. Try again." };
    }
  }, []);

  const runUsernameCheck = useCallback(async (value: string, generation: number) => {
    const normalized = normalizeUsernameForStorage(value);
    if (normalized.length === 0) {
      setUsernameCheckDetail(null);
      setUsernameStatus("idle");
      return;
    }
    if (generation !== usernameCheckGenRef.current) return;
    const outcome = await fetchUsernameStatus(value);
    if (generation !== usernameCheckGenRef.current) return;
    setUsernameStatus(outcome.status);
    setUsernameCheckDetail(outcome.status === "check_failed" ? (outcome.detail ?? null) : null);
  }, [fetchUsernameStatus]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const normalized = normalizeUsernameForStorage(username);
      if (normalized.length === 0) {
        usernameCheckGenRef.current += 1;
        setUsernameCheckDetail(null);
        setUsernameStatus("idle");
        return;
      }
      usernameCheckGenRef.current += 1;
      const generation = usernameCheckGenRef.current;
      setUsernameCheckDetail(null);
      setUsernameStatus("checking");
      debounceRef.current = setTimeout(() => {
        void runUsernameCheck(username, generation);
      }, 400);
    });
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, runUsernameCheck]);

  const usernameInputClassName = (() => {
    const base =
      "h-11 w-full rounded-xl bg-[#0c0c10] px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-zinc-600 focus:ring-2";
    if (usernameStatus === "available") {
      return `${base} border-2 border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/35 focus:ring-offset-0 focus:ring-offset-[#0c0c10]`;
    }
    if (
      usernameStatus === "taken" ||
      usernameStatus === "invalid" ||
      usernameStatus === "reserved" ||
      usernameStatus === "profanity"
    ) {
      return `${base} border border-rose-500/55 focus:border-rose-500 focus:ring-rose-500/20 focus:ring-offset-0 focus:ring-offset-[#0c0c10]`;
    }
    if (usernameStatus === "checking") {
      return `${base} border border-zinc-500/40 focus:border-zinc-500/55 focus:ring-zinc-500/15 focus:ring-offset-0 focus:ring-offset-[#0c0c10]`;
    }
    if (usernameStatus === "check_failed") {
      return `${base} border border-amber-500/45 focus:border-amber-500/60 focus:ring-amber-500/20 focus:ring-offset-0 focus:ring-offset-[#0c0c10]`;
    }
    return `${base} border border-white/10 focus:border-gold/40 focus:ring-gold/25 focus:ring-offset-0 focus:ring-offset-[#0c0c10]`;
  })();

  const emailOk = email.trim().length > 0 && email.includes("@");
  const passwordRequirements = getPasswordRequirements(password);
  const passwordStrongEnough = isPasswordStrongEnough(password);
  const passwordOk = passwordStrongEnough && password === confirm;
  const normalizedUsernamePreview = normalizeUsernameForStorage(username);
  const usernameLenOk = normalizedUsernamePreview.length >= 3;
  const usernameGateOk = usernameStatus === "available";
  const formFieldsOk = emailOk && passwordOk && termsAccepted && usernameLenOk;
  const submitDisabled =
    loading || !formFieldsOk || usernameStatus === "checking" || (!usernameGateOk && usernameLenOk);

  const usernameSubmitBlockMessage = (status: UsernameUiStatus): string => {
    switch (status) {
      case "taken":
      case "reserved":
      case "profanity":
        return USERNAME_UNAVAILABLE_MESSAGE;
      case "invalid":
        return usernamePolicyUserMessage("invalid");
      case "checking":
        return "Still checking username. Try again in a moment.";
      case "idle":
        return "Wait for the username check to finish, then try again.";
      case "check_failed":
        return usernameCheckDetail ?? "Could not check username. Try again.";
      default:
        return "Choose an available username before continuing.";
    }
  };

  const registerErrorMessage = (data: { error?: string; code?: string; debugMessage?: string }, httpStatus: number): string => {
    const dbg =
      process.env.NODE_ENV === "development" && typeof data.debugMessage === "string" && data.debugMessage.trim()
        ? `\n${data.debugMessage.trim()}`
        : "";
    const { error, code } = data;
    if (typeof error === "string" && error.trim()) return `${error.trim()}${dbg}`;
    switch (code) {
      case "ACCOUNT_EXISTS":
        return "An account with this email already exists. Please sign in.";
      case "USERNAME_TAKEN":
        return "That username is already taken.";
      case "USERNAME_INVALID":
        return "Username must be 3–20 characters: letters, numbers, and underscores only.";
      case "INVALID_EMAIL":
        return "Enter a valid email.";
      case "INVALID_PASSWORD":
        return "Password needs 8+ characters, including a letter and a number.";
      case "INVALID_JSON":
        return "Invalid request. Please refresh and try again.";
      case "EMAIL_SEND_FAILED":
      case "EMAIL_NOT_CONFIGURED":
        return "We could not send the verification email. Try again later.";
      case "SERVER_ERROR":
        return `Something went wrong on the server. Try again.${dbg}`;
      default:
        return process.env.NODE_ENV === "development"
          ? `Could not create account. (HTTP ${httpStatus}${code ? ` · ${code}` : ""})${dbg}`
          : `Could not create account.${dbg}`;
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!termsAccepted) {
      setError("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    if (submitDisabled) {
      if (!emailOk) setError("Enter a valid email.");
      else if (!passwordOk)
        setError(
          !passwordStrongEnough
            ? "Password needs 8+ characters, including a letter and a number."
            : "Passwords do not match.",
        );
      else if (!usernameLenOk) setError("Username must be at least 3 characters.");
      else if (usernameStatus === "checking") setError("Still checking username. Try again in a moment.");
      else if (!usernameGateOk) setError(usernameSubmitBlockMessage(usernameStatus));
      else setError("Fill in all fields and accept the terms.");
      devSignupLog("Create Account blocked", {
        submitDisabled,
        emailOk,
        passwordOk,
        termsAccepted,
        usernameLenOk,
        usernameStatus,
        usernameGateOk,
      });
      return;
    }
    const normalizedUsername = normalizeUsernameForStorage(username);
    if (!normalizedUsername) {
      setUsernameStatus("invalid");
      setError("Enter a valid username.");
      return;
    }
    setUsernameCheckDetail(null);
    setUsernameStatus("checking");
    const outcome = await fetchUsernameStatus(normalizedUsername);
    setUsernameStatus(outcome.status);
    if (outcome.status === "check_failed") {
      const detail = outcome.detail ?? "Could not check username. Try again.";
      setUsernameCheckDetail(detail);
      setError(detail);
      devSignupLog("submit: username check failed", { normalizedUsername, detail });
      return;
    }
    if (outcome.status !== "available") {
      setError(usernameSubmitBlockMessage(outcome.status));
      devSignupLog("submit: username not available", { normalizedUsername, status: outcome.status });
      return;
    }

    setLoading(true);
    devSignupLog("Create Account submit", { normalizedUsername });
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username: normalizedUsername,
          password,
          ...(referralCode ? { referralCode } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterSuccessPayload & {
        error?: string;
        code?: string;
        debugMessage?: string;
      };
      devSignupLog("register response", { status: res.status, code: data.code, error: data.error });
      if (!res.ok) {
        setError(registerErrorMessage(data, res.status));
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const dest = safeReturnTo(returnTo);

      if (!signupRequiresOtpVerification(data)) {
        clearSignupPendingStorage();

        const isImmediate =
          data.verificationMethod === "immediate" || data.needsEmailConfirmation === false;

        if (isImmediate) {
          router.replace(dest);
          void signIn("credentials", {
            email: normalizedEmail,
            password,
            redirect: false,
          }).then((signInRes) => {
            if (!signInRes?.ok) {
              router.push(
                `/signin?email=${encodeURIComponent(normalizedEmail)}&registered=1${returnTo !== "/marketplace" ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`,
              );
            }
            router.refresh();
          });
          return;
          router.push(
            `/signin?email=${encodeURIComponent(normalizedEmail)}&registered=1${returnTo !== "/marketplace" ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`,
          );
          router.refresh();
          return;
        }

        router.push(
          `/signin?email=${encodeURIComponent(normalizedEmail)}&confirm=1${returnTo !== "/marketplace" ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`,
        );
        router.refresh();
        return;
      }

      const { pending, devCode } = signupPendingStorageKeys();
      try {
        sessionStorage.setItem(
          pending,
          JSON.stringify({ v: 1 as const, email: normalizedEmail, password, returnTo }),
        );
        if (isClientDevVerificationUiAllowed() && data._localDevVerificationCode) {
          sessionStorage.setItem(devCode, data._localDevVerificationCode);
        } else {
          sessionStorage.removeItem(devCode);
        }
      } catch {
        setError("Could not continue sign-up in this browser (storage blocked). Allow storage and try again.");
        return;
      }

      router.push("/signup/verify");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const statusLine = (() => {
    switch (usernameStatus) {
      case "checking":
        return <p className="text-[11px] font-medium text-zinc-500">Checking username…</p>;
      case "available":
        return <p className="text-[11px] font-medium text-emerald-400">Username is available</p>;
      case "taken":
        return <p className="text-[11px] font-medium text-rose-300">{USERNAME_UNAVAILABLE_MESSAGE}</p>;
      case "check_failed":
        return (
          <p className="text-[11px] font-medium text-amber-300">
            {usernameCheckDetail ?? "Could not check username. Try again."}
          </p>
        );
      case "invalid":
        return (
          <p className="text-[11px] font-medium text-rose-300">
            Not allowed — use 3–20 characters: letters, numbers, underscores only.
          </p>
        );
      case "reserved":
      case "profanity":
        return <p className="text-[11px] font-medium text-rose-300">{USERNAME_UNAVAILABLE_MESSAGE}</p>;
      default:
        return (
          <p className="text-[11px] text-zinc-600">
            Letters, numbers, underscores · 3–20 characters · stored lowercase
          </p>
        );
    }
  })();

  return (
    <>
      <form className="mt-5 flex flex-col gap-3.5" onSubmit={onSubmit} noValidate>
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
      {referralCode ? (
        <p className="rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs font-medium text-gold-bright">
          Referred by a friend — you&apos;ll both get referral credit after your first order.
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-email" className="text-xs font-medium text-zinc-300">
          Email
        </label>
        <input
          id="join-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email ?? ""}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-sm text-foreground outline-none ring-gold/25 transition-[border-color,box-shadow] placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
          placeholder="you@example.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-username" className="text-xs font-medium text-zinc-300">
          Username
        </label>
        <input
          id="join-username"
          name="username"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={20}
          value={username ?? ""}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          className={usernameInputClassName}
          placeholder="your_handle"
          aria-invalid={
            usernameStatus === "taken" ||
            usernameStatus === "invalid" ||
            usernameStatus === "reserved" ||
            usernameStatus === "profanity" ||
            usernameStatus === "check_failed"
          }
        />
        {statusLine}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-password" className="text-xs font-medium text-zinc-300">
          Password
        </label>
        <PasswordInput
          id="join-password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password ?? ""}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        <ul className="mt-0.5 flex flex-col gap-0.5" aria-live="polite">
          {passwordRequirements.map((requirement) => (
            <li
              key={requirement.key}
              className={`text-[11px] font-medium ${requirement.met ? "text-emerald-400" : "text-zinc-600"}`}
            >
              {requirement.met ? "✓" : "○"} {requirement.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-password-confirm" className="text-xs font-medium text-zinc-300">
          Confirm password
        </label>
        <PasswordInput
          id="join-password-confirm"
          name="confirmPassword"
          autoComplete="off"
          required
          minLength={8}
          value={confirm ?? ""}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter password"
          toggleLabels={{ show: "Show confirm password", hide: "Hide confirm password" }}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 pt-0.5">
        <input
          type="checkbox"
          name="terms"
          required
          defaultChecked={false}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-[#0c0c10] accent-gold focus:ring-2 focus:ring-gold/35 focus:ring-offset-0 focus:ring-offset-[#0a0a0d]"
        />
        <span className="text-[13px] leading-snug text-zinc-500">
          I agree to the{" "}
          <Link href="/terms" className="font-medium text-gold-bright underline-offset-2 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-gold-bright underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={submitDisabled}
        className="mt-0.5 h-11 rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? "Creating…" : "Create Account"}
      </button>
    </form>

      <SocialAuthButtons returnTo={returnTo} disabled={loading} />

      <p className="mt-4 text-center text-xs text-zinc-600 md:text-left">
        Already have an account?{" "}
        <Link
          href={returnTo !== "/marketplace" ? `/signin?returnTo=${encodeURIComponent(returnTo)}` : "/signin"}
          className="font-semibold text-gold-bright hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
