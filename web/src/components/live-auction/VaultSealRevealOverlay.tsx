"use client";

import { useEffect, useRef, useState } from "react";
import {
  VAULT_SEAL_BREAK_MS,
  VAULT_SEAL_GLOW_MS,
  VAULT_SEAL_TOTAL_MS,
  type VaultRevealSpinPayload,
} from "@/lib/vault-reveal-spin";

type SealPhase = "idle" | "glow" | "break" | "winner";

function formatWinnerHandle(label: string): string {
  const bare = label.trim().replace(/^@/, "");
  return bare ? `@${bare}` : "@winner";
}

export function VaultSealRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<SealPhase>("idle");
  const seenRef = useRef<string | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!spin || spin.kind !== "giveaway") {
      setPhase("idle");
      seenRef.current = null;
      return;
    }
    if (seenRef.current === spin.spinId) return;
    seenRef.current = spin.spinId;

    setPhase("glow");
    const t1 = window.setTimeout(() => setPhase("break"), VAULT_SEAL_GLOW_MS);
    const t2 = window.setTimeout(() => setPhase("winner"), VAULT_SEAL_GLOW_MS + VAULT_SEAL_BREAK_MS);
    const tDismiss = window.setTimeout(() => onDismissRef.current(), VAULT_SEAL_TOTAL_MS);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(tDismiss);
    };
  }, [spin]);

  if (!spin || spin.kind !== "giveaway") return null;

  const winnerHandle = formatWinnerHandle(spin.winnerLabel);
  const entryCount = spin.labels.length;
  const showWinner = phase === "winner";
  const sealBreaking = phase === "break" || showWinner;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      role="dialog"
      aria-live="polite"
      aria-label="Giveaway winner reveal"
      onClick={() => onDismissRef.current()}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.35)] bg-gradient-to-b from-[#141416] to-[#0a0a0c] px-6 py-6 shadow-[0_24px_80px_-24px_rgba(212,175,55,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 50% 28%, rgba(212,175,55,0.18) 0%, transparent 62%)",
          }}
        />

        <p className="relative text-center text-[10px] font-black uppercase tracking-[0.28em] text-amber-300/95">
          Vaulted Live
        </p>
        <h2 className="relative mt-2 text-center text-lg font-bold leading-snug text-zinc-50">{spin.title}</h2>
        <p className="relative mt-1 text-center text-[11px] font-semibold text-zinc-500">
          {entryCount} {entryCount === 1 ? "entry" : "entries"} · verified draw
        </p>

        <div className="relative mx-auto mt-6 flex h-28 w-full max-w-[220px] items-center justify-center">
          {!showWinner ? (
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div
                className={`absolute inset-0 rounded-full transition-all duration-500 ${
                  phase === "glow" ? "scale-110 opacity-100" : "scale-100 opacity-60"
                }`}
                style={{
                  boxShadow:
                    phase === "glow"
                      ? "0 0 32px rgba(212,175,55,0.55), inset 0 0 20px rgba(212,175,55,0.15)"
                      : "0 0 16px rgba(212,175,55,0.25)",
                }}
              />
              <div
                className={`absolute left-0 top-0 h-full w-1/2 overflow-hidden rounded-l-full border border-r-0 border-amber-400/50 bg-gradient-to-br from-amber-500/30 to-zinc-900 transition-all duration-500 ease-out ${
                  sealBreaking ? "-translate-x-3 -rotate-12 opacity-0" : ""
                }`}
              />
              <div
                className={`absolute right-0 top-0 h-full w-1/2 overflow-hidden rounded-r-full border border-l-0 border-amber-400/50 bg-gradient-to-bl from-amber-500/30 to-zinc-900 transition-all duration-500 ease-out ${
                  sealBreaking ? "translate-x-3 rotate-12 opacity-0" : ""
                }`}
              />
              <div
                className={`relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-2 border-amber-300/70 bg-gradient-to-br from-zinc-900 to-black transition-opacity duration-300 ${
                  sealBreaking ? "opacity-0" : "opacity-100"
                }`}
              >
                <span className="text-2xl font-black text-amber-200">V</span>
              </div>
            </div>
          ) : null}

          {showWinner ? (
            <div className="vault-reveal-winner-pop w-full text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/90">Winner</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-white">{winnerHandle}</p>
              <p className="mt-2 text-sm font-medium text-zinc-400">Takes home</p>
              <p className="mt-0.5 text-base font-bold text-amber-100/90">{spin.title}</p>
            </div>
          ) : (
            <p className="absolute bottom-0 text-center text-xs font-semibold tracking-wide text-amber-100/80">
              {phase === "glow" ? "Opening vault…" : phase === "break" ? "Seal broken" : ""}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismissRef.current()}
          className="relative mt-5 w-full rounded-full border border-white/10 py-2 text-xs font-bold uppercase tracking-wide text-zinc-400 transition hover:border-amber-400/30 hover:text-zinc-200"
        >
          {showWinner ? "Continue" : "Skip"}
        </button>
      </div>
    </div>
  );
}
