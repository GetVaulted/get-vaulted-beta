"use client";

import { useEffect, useRef, useState } from "react";
import type { StripeConnectInstance } from "@stripe/connect-js";

type AccountOnboardingElement = HTMLElement & {
  setOnExit: (listener: (() => void) | undefined) => void;
  setOnLoadError: (listener: ((err: { error?: { message?: string } }) => void) | undefined) => void;
};

type Props = {
  /** When false, component tears down Connect.js and clears the container. */
  active: boolean;
  /** Called after embedded flow exits (complete or abandon); refetch seller here. */
  onSessionEnd: () => void;
  /** Called when user likely needs fallback (popup blocked / auth window did not open). */
  onNeedsFallbackHint?: () => void;
};

/**
 * Stripe Connect embedded onboarding (AccountSession + account-onboarding).
 * Client secret is fetched only from POST /api/stripe/create-account-session (server holds secret key).
 */
export function StripeOnboardingEmbed({ active, onSessionEnd, onNeedsFallbackHint }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onSessionEnd);
  onEndRef.current = onSessionEnd;
  const connectRef = useRef<StripeConnectInstance | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setPhase("idle");
      setMessage(null);
      connectRef.current = null;
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let onboardingEl: AccountOnboardingElement | null = null;

    const run = async () => {
      setPhase("loading");
      setMessage(null);
      try {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
        if (!publishableKey) {
          throw new Error("Stripe is not configured. Add your publishable key to the environment to load payouts.");
        }

        const { loadConnectAndInitialize } = await import("@stripe/connect-js");

        const connect = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret: async () => {
            const res = await fetch("/api/stripe/create-account-session", { method: "POST" });
            const data = (await res.json().catch(() => ({}))) as { error?: string; clientSecret?: string };
            if (!res.ok) {
              throw new Error(data.error ?? `Account session failed (${res.status})`);
            }
            if (!data.clientSecret) {
              throw new Error("Missing clientSecret from server.");
            }
            return data.clientSecret;
          },
        });
        connectRef.current = connect;

        if (cancelled) return;

        const el = connect.create("account-onboarding") as AccountOnboardingElement;
        onboardingEl = el;

        el.setOnLoadError((err) => {
          setMessage(err.error?.message ?? "Could not load Stripe onboarding.");
          setPhase("error");
          onNeedsFallbackHint?.();
        });

        el.setOnExit(() => {
          onNeedsFallbackHint?.();
          onEndRef.current();
        });

        host.innerHTML = "";
        host.appendChild(el);
        if (!cancelled) setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setMessage(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    };

    void run();

    return () => {
      cancelled = true;
      try {
        if (onboardingEl?.parentNode) {
          onboardingEl.remove();
        }
        onboardingEl = null;
        if (host) host.innerHTML = "";
        void connectRef.current?.logout?.().catch(() => {});
        connectRef.current = null;
      } catch {
        /* ignore */
      }
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="flex min-h-[28rem] flex-col">
      {phase === "loading" ? (
        <p className="mb-3 text-center text-sm text-zinc-400">Loading Stripe onboarding…</p>
      ) : null}
      {phase === "error" && message ? (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{message}</p>
      ) : null}
      <div className="min-h-[24rem] flex-1 rounded-xl border border-black/10 bg-[#f9fafb] p-4 sm:p-5">
        <div
          ref={hostRef}
          className="h-full min-h-[20rem] overflow-visible rounded-lg border border-black/10 bg-white"
          data-testid="stripe-onboarding-host"
        />
      </div>
    </div>
  );
}
