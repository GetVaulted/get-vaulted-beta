"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import {
  buildSurpriseCardShuffle,
  SURPRISE_CARD_HOLD_MS,
  SURPRISE_CARD_INTRO_MS,
  SURPRISE_CARD_OUTRO_MS,
  type SurpriseCardFields,
} from "../../../../shared/surprise-reveal-card";

type Phase = "intro" | "shuffle" | "won" | "outro";

/**
 * Surprise Set reveal — TikTok-style card: "Randomizing for @buyer…" while the set's item names
 * shuffle behind a blur and slow down, then the winning item locks in.
 * Every viewer sees the same sequence (seeded by the spin id).
 */
export function SurpriseRevealCardOverlay({
  spin,
  card,
  onDismiss,
  viewerUsername,
}: {
  spin: VaultRevealSpinPayload;
  card: SurpriseCardFields;
  onDismiss: () => void;
  viewerUsername?: string | null;
}) {
  const steps = useMemo(() => buildSurpriseCardShuffle(card, spin.spinId), [card, spin.spinId]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !cancelled && fn(), ms));

    setPhase("intro");
    setStepIndex(0);
    let t = SURPRISE_CARD_INTRO_MS;
    at(t, () => setPhase("shuffle"));
    steps.forEach((step, i) => {
      at(t, () => setStepIndex(i));
      t += step.holdMs;
    });
    at(t, () => setPhase("won"));
    t += SURPRISE_CARD_HOLD_MS;
    at(t, () => setPhase("outro"));
    t += SURPRISE_CARD_OUTRO_MS;
    at(t, () => onDismissRef.current());

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [spin.spinId, steps]);

  const buyer = (spin.buyerUsername ?? "").replace(/^@+/, "").trim();
  const viewer = (viewerUsername ?? "").replace(/^@+/, "").trim();
  const isMe = Boolean(buyer && viewer && buyer.toLowerCase() === viewer.toLowerCase());
  const won = phase === "won" || phase === "outro";
  const shown = won ? card.cardWinner : steps[stepIndex]?.name ?? "";
  const progress = steps.length > 1 ? Math.min(1, stepIndex / (steps.length - 1)) : 1;
  // Heavy blur while names fly by, easing off as the shuffle slows.
  const blurPx = won ? 0 : phase === "intro" ? 8 : Math.max(1.5, 7 * (1 - progress ** 1.6));

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center px-4 pb-28 sm:items-center sm:pb-0"
      role="dialog"
      aria-live="assertive"
      aria-label={won ? `${buyer ? `@${buyer}` : "Buyer"} got ${card.cardWinner}` : "Randomizing surprise"}
      onClick={() => onDismissRef.current()}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-black/55 transition-opacity duration-300 ${
          phase === "outro" ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        className={`relative w-full max-w-[360px] transition-all duration-300 ease-out ${
          phase === "intro"
            ? "translate-y-6 scale-95 opacity-0"
            : phase === "outro"
              ? "translate-y-3 scale-95 opacity-0"
              : "translate-y-0 scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`rounded-2xl p-[2px] transition-shadow duration-300 ${
            won
              ? "bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-500 shadow-[0_0_60px_rgba(251,191,36,0.55)]"
              : "bg-gradient-to-br from-zinc-600 via-zinc-500 to-zinc-700 shadow-[0_0_28px_rgba(0,0,0,0.6)]"
          }`}
        >
          <div className="relative overflow-hidden rounded-[14px] bg-[#0a0a0c] px-5 py-4">
            {won ? (
              <div className="surprise-card-flash pointer-events-none absolute inset-0 bg-amber-200/25" />
            ) : null}
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black ${
                  won ? "bg-amber-300 text-black" : "bg-white/10 text-amber-200"
                }`}
                aria-hidden
              >
                {won ? "★" : "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-lg font-extrabold leading-tight text-white transition-[filter] duration-100 ${
                    won ? "surprise-card-pop" : ""
                  }`}
                  style={{ filter: `blur(${blurPx}px)` }}
                >
                  {shown}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-semibold text-zinc-400">
                  {won
                    ? isMe
                      ? "You got it! Here's your instant surprise 🎉"
                      : `@${buyer || "buyer"} — here's your instant surprise!`
                    : `Randomizing for ${isMe ? "you" : buyer ? `@${buyer}` : "buyer"}…`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.2em]">
              <span className="min-w-0 truncate text-amber-300/90">{spin.title}</span>
              <span className="shrink-0 whitespace-nowrap text-zinc-500">Server draw</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes surprise-card-pop { 0% { transform: scale(0.9); } 55% { transform: scale(1.08); } 100% { transform: scale(1); } }
        .surprise-card-pop { animation: surprise-card-pop 420ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: left center; }
        @keyframes surprise-card-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
        .surprise-card-flash { animation: surprise-card-flash 700ms ease-out forwards; }
      `}</style>
    </div>
  );
}
