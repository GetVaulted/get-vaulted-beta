"use client";

import { useEffect, useRef, useState } from "react";
import { vaultDropReelPillLabel, type VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";

/**
 * "Split-Flap Board" — the Givvy Draw reveal mechanic (web). Mirrors mobile's
 * SplitFlapBoard: a single mechanical flap tile, airport-departure-board style, that
 * flips through entries and locks on the winner, with LED dots confirming the lock. Used
 * for both open and buyers givvy draws — copy differences are handled entirely upstream by
 * `vaultDropRevealEyebrow` / `vaultDropRevealGivvyWinBanner`, this component only renders
 * whichever label index it's given.
 *
 * `flapIndex` is driven by VaultDropRevealOverlay's existing per-frame spin-progress
 * tracker (same cadence the old reel used to position its pills), so no new timing logic
 * lives here. `bump` reuses the same boolean the old reel used for its winner-lock pop, so
 * the lock moment feels identical to the reel across both visual treatments.
 */
export function SplitFlapBoard({
  spin,
  showWinner,
  flapIndex,
  bump,
}: {
  spin: VaultRevealSpinPayload;
  showWinner: boolean;
  flapIndex: number;
  bump: boolean;
}) {
  const targetIndex = showWinner ? spin.winnerIndex : flapIndex;
  const [displayIndex, setDisplayIndex] = useState(targetIndex);
  const [rotate, setRotate] = useState(0);
  const [transitionOn, setTransitionOn] = useState(true);
  const flipKey = `${showWinner ? "win" : "pool"}-${targetIndex}`;
  const prevKeyRef = useRef(flipKey);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    if (prevKeyRef.current === flipKey) return;
    prevKeyRef.current = flipKey;

    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    window.cancelAnimationFrame(rafRef.current);

    setTransitionOn(true);
    setRotate(-85);
    const t1 = window.setTimeout(() => {
      setDisplayIndex(targetIndex);
      setTransitionOn(false);
      setRotate(85);
      const t2 = window.setTimeout(() => {
        rafRef.current = window.requestAnimationFrame(() => {
          setTransitionOn(true);
          setRotate(0);
        });
      }, 20);
      timersRef.current.push(t2);
    }, 100);
    timersRef.current.push(t1);

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      window.cancelAnimationFrame(rafRef.current);
    };
  }, [flipKey, targetIndex]);

  const label = vaultDropReelPillLabel(spin, displayIndex);

  return (
    <div className="relative h-[62px] w-full rounded-xl border border-white/[0.08] bg-[#12160f]" style={{ perspective: 400 }}>
      <span className="absolute left-[7px] top-[5px] h-1 w-1 rounded-full bg-white/[0.18]" />
      <span className="absolute right-[7px] top-[5px] h-1 w-1 rounded-full bg-white/[0.18]" />
      <span className="absolute bottom-[5px] left-[7px] h-1 w-1 rounded-full bg-white/[0.18]" />
      <span className="absolute bottom-[5px] right-[7px] h-1 w-1 rounded-full bg-white/[0.18]" />

      <div className="flex h-full items-center justify-center">
        <div
          className="relative flex h-[42px] w-[80%] max-w-[260px] items-center justify-center overflow-hidden rounded-md bg-[#0e120d] px-3"
          style={{
            transform: `rotateX(${rotate}deg) scale(${bump ? 1.05 : 1})`,
            transition: transitionOn ? "transform 110ms ease" : "none",
          }}
        >
          <span
            className={`truncate text-sm font-extrabold tracking-wide ${showWinner ? "text-amber-200" : "text-emerald-50"}`}
          >
            {label}
          </span>
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/50" />
        </div>
      </div>

      <div className="absolute bottom-[7px] right-[10px] flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1 w-1 rounded-full transition-colors duration-300 ${
              showWinner ? "bg-emerald-300" : "bg-white/[0.16]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
