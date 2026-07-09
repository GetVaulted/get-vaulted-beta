"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";
import type { UsernameRejectReason } from "@/lib/username-policy";
import {
  normalizeUsernameForStorage,
  USERNAME_UNAVAILABLE_MESSAGE,
  usernamePolicyUserMessage,
} from "@/lib/username-policy";

type UsernameUiStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "reserved"
  | "profanity"
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
};

type ProfileSetupJson = {
  needsSetup?: boolean;
  username?: string;
  referralAlreadySet?: boolean;
  error?: string;
};

export function CompleteProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const initialRef = searchParams.get("ref")?.trim().slice(0, 32) ?? "";

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [referralCode, setReferralCode] = useState(initialRef);
  const [referralLocked, setReferralLocked] = useState(false);
  const [suggestedUsername, setSuggestedUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameUiStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameCheckGenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/profile-setup", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as ProfileSetupJson;
        if (!res.ok) {
          if (!cancelled) setError(body.error ?? "Could not load your profile.");
          return;
        }
        if (!body.needsSetup) {
          router.replace(returnTo);
          return;
        }
        if (!cancelled) {
          setUsername(body.username ?? "");
          setSuggestedUsername(body.username ?? "");
          setReferralLocked(Boolean(body.referralAlreadySet));
          if (body.referralAlreadySet) setReferralCode("");
        }
      } catch {
        if (!cancelled) setError("Could not load your profile. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [returnTo, router]);

  const fetchUsernameStatus = useCallback(async (value: string): Promise<UsernameUiStatus> => {
    const normalized = normalizeUsernameForStorage(value);
    if (normalized.length === 0) return "invalid";
    try {
      const res = await fetch(`/api/users/check-username?username=${encodeURIComponent(normalized)}`, {
        cache: "no-store",
      });
      const parsed = (await res.json().catch(() => ({}))) as CheckUsernameJson;
      if (!res.ok) return "check_failed";
      if (parsed.available === true) return "available";
      if (parsed.available === false) return mapReasonToStatus(parsed.reason);
      return "check_failed";
    } catch {
      return "check_failed";
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameStatus("idle");
      return;
    }
    const gen = ++usernameCheckGenRef.current;
    setUsernameStatus("checking");
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const normalized = normalizeUsernameForStorage(trimmed);
        if (normalized === normalizeUsernameForStorage(suggestedUsername)) {
          if (usernameCheckGenRef.current !== gen) return;
          setUsernameStatus("available");
          return;
        }
        const status = await fetchUsernameStatus(trimmed);
        if (usernameCheckGenRef.current !== gen) return;
        setUsernameStatus(status);
      })();
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, fetchUsernameStatus, suggestedUsername]);

  const usernameHint = (() => {
    if (usernameStatus === "checking") return "Checking availability…";
    if (usernameStatus === "available") return "Username is available.";
    if (usernameStatus === "taken") return USERNAME_UNAVAILABLE_MESSAGE;
    if (usernameStatus === "invalid" || usernameStatus === "reserved" || usernameStatus === "profanity") {
      return usernamePolicyUserMessage(usernameStatus === "profanity" ? "profanity" : usernameStatus);
    }
    if (usernameStatus === "check_failed") return "Could not check username. Try again.";
    return null;
  })();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = username.trim();
    if (!u) {
      setError("Choose a username.");
      return;
    }
    const normalized = normalizeUsernameForStorage(u);
    const keepingSuggested = normalized === normalizeUsernameForStorage(suggestedUsername);
    if (usernameStatus === "checking") {
      setError("Wait for the username check to finish.");
      return;
    }
    if (usernameStatus !== "available" && !keepingSuggested) {
      setError(usernameHint ?? "Choose a valid, available username.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/profile-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          ...(referralLocked ? {} : { referralCode: referralCode.trim() || undefined }),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save your profile.");
        return;
      }
      router.replace(returnTo);
    } catch {
      setError("Could not save your profile. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Choose your username</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Pick a public username before continuing. You can change it later, but only once every 60 days and not while you
          have open orders.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Username
        <input
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-white"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          maxLength={20}
          required
        />
        {usernameHint ? <span className="text-xs text-neutral-500">{usernameHint}</span> : null}
      </label>

      {!referralLocked ? (
        <label className="flex flex-col gap-1 text-sm text-neutral-300">
          Referral code <span className="text-neutral-500">(optional)</span>
          <input
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-white"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={20}
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-amber-500 px-4 py-3 font-semibold text-black disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
