"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { segmentColorForLabel } from "@/lib/nfl-team-colors";
import {
  buildVaultDropReelLane,
  reelStepAnimationMs,
  reelStepEasingCss,
  vaultDropPoolPhaseCopy,
  vaultDropReelLaneStartScrollIndex,
  vaultDropRevealEyebrow,
  vaultDropRevealTiming,
  vaultSealMetaLine,
  vaultSealWinnerCopy,
  type VaultRevealSpinPayload,
} from "@/lib/vault-reveal-spin";

type Phase = "idle" | "pool" | "reveal";

const REEL_PILL_WIDTH = 84;
const REEL_PILL_GAP = 6;

function revealAccentColor(spin: VaultRevealSpinPayload): string {
  return labelAccentColor(spin, spin.winnerIndex);
}

function labelAccentColor(spin: VaultRevealSpinPayload, index: number): string {
  if (spin.kind === "giveaway") return "#D4AF37";
  const label = spin.labels[index]?.trim() ?? "";
  return segmentColorForLabel(label, spin.segmentAbbrs?.[index] ?? null);
}

function shortPoolLabel(label: string): string {
  const t = label.trim();
  if (t.length <= 14) return t;
  return `${t.slice(0, 13)}…`;
}

function reelCenterOffset(viewportWidth: number, index: number): number {
  return viewportWidth / 2 - REEL_PILL_WIDTH / 2 - index * (REEL_PILL_WIDTH + REEL_PILL_GAP);
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

export function VaultDropRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const animSpinIdRef = useRef<string | null>(null);
  const reelFrameRef = useRef<HTMLDivElement | null>(null);
  const reelViewportWidthRef = useRef(280);
  const winnerScrollIndexRef = useRef(0);
  const runTokenRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [cycleIndex, setCycleIndex] = useState(0);
  const [centerScrollIndex, setCenterScrollIndex] = useState(0);
  const [poolProgress, setPoolProgress] = useState(0);
  const [poolPhaseCopy, setPoolPhaseCopy] = useState("Rolling the pool");
  const [entered, setEntered] = useState(false);
  const [reelX, setReelX] = useState(0);
  const [reelTransition, setReelTransition] = useState("0ms linear");
  const [reelBump, setReelBump] = useState(false);

  const accent = useMemo(() => (spin ? revealAccentColor(spin) : "#D4AF37"), [spin]);
  const reelLaneLabels = useMemo(() => (spin ? buildVaultDropReelLane(spin.labels) : []), [spin?.labels]);
  const labelCount = spin?.labels.length ?? 0;
  const showWinner = phase === "reveal";

  useEffect(() => {
    if (!spin) {
      animSpinIdRef.current = null;
      setPhase("idle");
      setEntered(false);
      setReelBump(false);
      return;
    }
    if (animSpinIdRef.current === spin.spinId) return;
    animSpinIdRef.current = spin.spinId;

    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;

    const { steps } = vaultDropRevealTiming(spin);
    const laneStartScroll = vaultDropReelLaneStartScrollIndex(spin.labels.length, steps[0]?.labelIndex ?? 0);
    const winnerScrollIndex = laneStartScroll + steps.length;
    winnerScrollIndexRef.current = winnerScrollIndex;
    const firstIndex = steps[0]?.labelIndex ?? 0;
    setPhase("pool");
    setCycleIndex(firstIndex);
    setCenterScrollIndex(laneStartScroll);
    setPoolProgress(0);
    setPoolPhaseCopy(vaultDropPoolPhaseCopy(0));
    setEntered(false);
    setReelBump(false);
    setReelTransition("none");
    setReelX(reelCenterOffset(reelViewportWidthRef.current, laneStartScroll));
    const raf = window.requestAnimationFrame(() => setEntered(true));

    const animateReelToScroll = async (
      scrollIndex: number,
      progress: number,
      landing: boolean,
      delayMs: number,
    ) => {
      const durationMs = reelStepAnimationMs(progress, landing, delayMs);
      const toX = reelCenterOffset(reelViewportWidthRef.current, scrollIndex);
      setReelTransition("none");
      await waitNextFrame();
      setCenterScrollIndex(scrollIndex);
      setReelTransition(`transform ${reelStepEasingCss(progress, landing)}`);
      setReelX(toX);
      await waitMs(durationMs);
    };

    void (async () => {
      for (let stepIdx = 1; stepIdx < steps.length; stepIdx += 1) {
        if (runTokenRef.current !== runToken) return;
        const step = steps[stepIdx]!;
        const progress = stepIdx / Math.max(1, steps.length - 1);
        setCycleIndex(step.labelIndex);
        setPoolProgress(progress);
        setPoolPhaseCopy(vaultDropPoolPhaseCopy(progress));
        await animateReelToScroll(laneStartScroll + stepIdx, progress, false, step.delayMs);
      }

      if (runTokenRef.current !== runToken) return;

      setPhase("reveal");
      setCycleIndex(spin.winnerIndex);
      setPoolProgress(1);
      setPoolPhaseCopy("Locked");
      await animateReelToScroll(winnerScrollIndex, 1, true, 0);
      if (runTokenRef.current !== runToken) return;

      setReelBump(true);
      window.setTimeout(() => setReelBump(false), 520);
    })();

    return () => {
      window.cancelAnimationFrame(raf);
      runTokenRef.current += 1;
    };
  }, [spin?.spinId]);

  useEffect(() => {
    if (!spin?.spinId) return;
    const { totalMs } = vaultDropRevealTiming(spin);
    const dismissTimer = window.setTimeout(() => onDismissRef.current(), totalMs);
    return () => window.clearTimeout(dismissTimer);
  }, [spin?.spinId, spin?.labels.length, spin?.winnerIndex]);

  useEffect(() => {
    const node = reelFrameRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      if (width <= 0) return;
      reelViewportWidthRef.current = width;
      const scrollIdx = phase === "reveal" ? winnerScrollIndexRef.current : centerScrollIndex;
      setReelX(reelCenterOffset(width, scrollIdx));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [spin?.spinId, phase, centerScrollIndex]);

  if (!spin) return null;

  const winner = vaultSealWinnerCopy(spin);
  const eyebrow = vaultDropRevealEyebrow(spin.kind);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-live="assertive"
      aria-label={`${eyebrow}: ${winner.primary}`}
      onClick={() => onDismissRef.current()}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${showWinner ? accent : "#D4AF37"}55 0%, transparent 58%)`,
        }}
      />

      <div
        className={`relative w-full max-w-[380px] transition-all duration-300 ease-out ${
          entered ? "scale-100 opacity-100" : "scale-[0.82] opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 p-[2px] shadow-[0_0_48px_rgba(217,70,239,0.35)]">
          <div className="relative overflow-hidden rounded-[14px] bg-[#0a0a0c] px-6 py-6 text-center">
            <div className="vault-drop-scan pointer-events-none absolute inset-x-0 top-0 h-px bg-amber-200/70 shadow-[0_0_18px_rgba(255,215,120,0.8)]" />

            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">{eyebrow}</p>
            <h2 className="mt-2 text-base font-extrabold leading-snug text-white">{spin.title}</h2>
            <p className="mt-1 text-[11px] font-semibold text-zinc-500">{vaultSealMetaLine(spin)}</p>
            <p className="mt-1 text-[10px] font-bold text-amber-200/70">
              Verified server draw · everyone sees the same roll
            </p>

            <div className="mt-6 space-y-3">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200/90">
                {showWinner ? winner.kicker : poolPhaseCopy}
              </p>
              {!showWinner ? (
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-300 transition-[width] duration-150 ease-out"
                    style={{ width: `${Math.round(poolProgress * 100)}%` }}
                  />
                </div>
              ) : null}

              <div ref={reelFrameRef} className="relative w-full">
                <div className="relative h-12 overflow-hidden rounded-full border border-white/10 bg-black/35">
                  <div
                    className="flex h-full items-center gap-1.5 will-change-transform"
                    style={{
                      transform: `translateX(${reelX}px)`,
                      transition: reelTransition,
                    }}
                  >
                    {reelLaneLabels.map((label, index) => {
                      const sourceIndex = labelCount > 0 ? index % labelCount : 0;
                      const chipAccent = labelAccentColor(spin, sourceIndex);
                      const isWinnerSlot = showWinner && index === centerScrollIndex;
                      return (
                        <div
                          key={`${label}-${index}`}
                          className={`flex h-10 w-[84px] shrink-0 items-center justify-center rounded-full border px-2 text-center text-[11px] font-extrabold leading-none text-white ${
                            isWinnerSlot && reelBump ? "scale-110" : "scale-100"
                          } ${isWinnerSlot ? "border-2 shadow-[0_8px_20px_rgba(0,0,0,0.35)]" : "border"} transition-transform duration-200`}
                          style={{
                            borderColor: chipAccent,
                            backgroundColor: `${chipAccent}66`,
                          }}
                        >
                          {shortPoolLabel(label)}
                        </div>
                      );
                    })}
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a0a0c] via-transparent via-70% to-[#0a0a0c]" />
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[92px] -translate-x-1/2 rounded-full border-2 border-amber-200/70 bg-amber-200/[0.06]" />
                {showWinner ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-[104px] -translate-x-1/2 rounded-full opacity-70 blur-md"
                    style={{ backgroundColor: `${accent}66` }}
                  />
                ) : null}
              </div>

              {showWinner ? (
                <>
                  <p className="vault-reveal-winner-pop text-3xl font-black tracking-tight" style={{ color: accent }}>
                    {winner.primary}
                  </p>
                  {winner.sub ? <p className="text-sm font-bold text-zinc-300">{winner.sub}</p> : null}
                  {winner.detail ? <p className="text-xs font-semibold text-zinc-500">{winner.detail}</p> : null}
                </>
              ) : (
                <p className="text-[10px] font-semibold text-zinc-500">
                  Team reel slows down and locks on your draw
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDismissRef.current()}
          className="mt-5 w-full py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500 transition hover:text-zinc-300"
        >
          {showWinner ? "Continue" : "Skip"}
        </button>
      </div>
    </div>
  );
}
