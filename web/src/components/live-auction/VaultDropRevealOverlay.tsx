"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { isLightSpotAccent, segmentColorForLabel } from "@/lib/nfl-team-colors";
import {
  buildVaultDropReelLane,
  vaultDropPoolPhaseCopyForSpin,
  vaultDropRevealAccent,
  vaultDropRevealChipColor,
  vaultDropReelSpinEasingCss,
  VAULT_DROP_REEL_PILL_HEIGHT,
  VAULT_DROP_REEL_PILL_SPAN,
  VAULT_DROP_REEL_PILL_WIDTH,
  vaultDropReelCenterOffset,
  vaultDropReelFocusRingPosition,
  vaultDropRevealEyebrow,
  vaultDropRevealGivvyWinBanner,
  vaultDropRevealPoolHint,
  vaultDropRevealTiming,
  vaultDropReelPillBackground,
  vaultDropReelPillLabel,
  vaultSealMetaLine,
  vaultSealWinnerCopy,
  type VaultRevealSpinPayload,
} from "@/lib/vault-reveal-spin";
import { SplitFlapBoard } from "./SplitFlapBoard";

type Phase = "idle" | "pool" | "reveal";

const REEL_PILL_WIDTH = VAULT_DROP_REEL_PILL_WIDTH;
const REEL_PILL_HEIGHT = VAULT_DROP_REEL_PILL_HEIGHT;
const REEL_PILL_SPAN = VAULT_DROP_REEL_PILL_SPAN;
const REEL_WINDOW_HEIGHT = REEL_PILL_HEIGHT + 12;

function reelCenterOffset(viewportWidth: number, index: number, span = REEL_PILL_SPAN): number {
  return vaultDropReelCenterOffset(viewportWidth, index, span);
}

function revealAccentColor(spin: VaultRevealSpinPayload): string {
  if (spin.kind === "random_reveal" || spin.kind === "break_pyt") {
    return labelAccentColor(spin, spin.winnerIndex);
  }
  return vaultDropRevealAccent(spin);
}

function labelAccentColor(spin: VaultRevealSpinPayload, index: number): string {
  if (spin.kind === "giveaway") return vaultDropRevealChipColor(spin, index);
  const label = spin.labels[index]?.trim() ?? "";
  return segmentColorForLabel(label, spin.segmentAbbrs?.[index] ?? null);
}

function reelPillBackground(spin: VaultRevealSpinPayload, chipAccent: string, lightChip: boolean): string {
  if (spin.kind === "random_reveal" || spin.kind === "break_pyt") {
    return vaultDropReelPillBackground(chipAccent, lightChip);
  }
  return lightChip ? `${chipAccent}ee` : `${chipAccent}66`;
}

function animateReelScroll(
  setReelX: (x: number) => void,
  setReelTransition: (t: string) => void,
  viewportWidth: number,
  scrollIndex: number,
  transition: string,
  resetTransition = true,
): Promise<void> {
  return new Promise((resolve) => {
    const apply = () => {
      setReelTransition(transition);
      setReelX(reelCenterOffset(viewportWidth, scrollIndex));
      const match = transition.match(/^(\d+)ms/);
      const durationMs = match ? Number(match[1]) : 0;
      window.setTimeout(() => {
        setReelX(reelCenterOffset(viewportWidth, scrollIndex));
        resolve();
      }, durationMs);
    };
    if (resetTransition) {
      setReelTransition("none");
      void waitNextFrame().then(apply);
      return;
    }
    apply();
  });
}

async function waitForReelViewport(
  ref: RefObject<HTMLDivElement | null>,
  widthRef: MutableRefObject<number>,
): Promise<number> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const width = ref.current?.clientWidth ?? 0;
    if (width > 0) {
      widthRef.current = width;
      return width;
    }
    await waitNextFrame();
  }
  return widthRef.current;
}

function runSpinProgress(
  startMs: number,
  durationMs: number,
  onProgress: (progress: number) => void,
  token: number,
  runTokenRef: MutableRefObject<number>,
): () => void {
  let raf = 0;
  const tick = (now: number) => {
    if (runTokenRef.current !== token) return;
    const progress = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - startMs) / durationMs));
    onProgress(progress);
    if (progress < 1) raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(raf);
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
  viewerUsername,
  viewerUserId,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
  viewerUsername?: string | null;
  viewerUserId?: string | null;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const animSpinIdRef = useRef<string | null>(null);
  const reelViewportRef = useRef<HTMLDivElement | null>(null);
  const reelViewportWidthRef = useRef(0);
  const winnerScrollIndexRef = useRef(0);
  const runTokenRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [centerScrollIndex, setCenterScrollIndex] = useState(0);
  const [poolProgress, setPoolProgress] = useState(0);
  const [poolPhaseCopy, setPoolPhaseCopy] = useState("Rolling the pool");
  const [entered, setEntered] = useState(false);
  const [reelMeasuredWidth, setReelMeasuredWidth] = useState(0);
  const [reelX, setReelX] = useState(0);
  const [reelTransition, setReelTransition] = useState("0ms linear");
  const [reelBump, setReelBump] = useState(false);
  // Which label index the split-flap board (Givvy Draw only) is currently showing —
  // updated on the same spin-progress cadence that already drives the old reel's position.
  const [flapIndex, setFlapIndex] = useState(0);

  const accent = useMemo(() => (spin ? revealAccentColor(spin) : "#D4AF37"), [spin]);
  const scrollPlan = useMemo(
    () => (spin?.labels?.length ? vaultDropRevealTiming(spin).scrollPlan : null),
    [spin?.labels, spin?.winnerIndex],
  );
  const reelLaneLabels = useMemo(
    () =>
      spin?.labels?.length && scrollPlan
        ? buildVaultDropReelLane(spin.labels, scrollPlan.laneCopyCount)
        : [],
    [spin?.labels, scrollPlan?.laneCopyCount],
  );
  const labelCount = spin?.labels.length ?? 0;
  const showWinner = phase === "reveal";

  useEffect(() => {
    if (spin?.spinId) return;
    animSpinIdRef.current = null;
    setPhase("idle");
    setEntered(false);
    setReelBump(false);
    setReelMeasuredWidth(0);
    setReelTransition("none");
    setReelX(0);
  }, [spin?.spinId]);

  useEffect(() => {
    if (!spin?.labels?.length) return;
    if (animSpinIdRef.current === spin.spinId) return;
    if (reelMeasuredWidth <= 0) return;
    animSpinIdRef.current = spin.spinId;

    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;

    const { scrollPlan } = vaultDropRevealTiming(spin);
    const { laneStartScroll, spinEndScroll, winnerScrollIndex, spinDurationMs, landDurationMs } = scrollPlan;
    winnerScrollIndexRef.current = winnerScrollIndex;
    setPhase("pool");
    setCenterScrollIndex(laneStartScroll);
    setFlapIndex(labelCount > 0 ? ((laneStartScroll % labelCount) + labelCount) % labelCount : 0);
    setPoolProgress(0);
    setPoolPhaseCopy(vaultDropPoolPhaseCopyForSpin(spin, 0));
    setEntered(false);
    setReelBump(false);
    setReelTransition("none");
    setReelX(reelCenterOffset(reelMeasuredWidth, laneStartScroll));
    const raf = window.requestAnimationFrame(() => setEntered(true));

    const spinTransition = `transform ${vaultDropReelSpinEasingCss(spinDurationMs)}`;

    void (async () => {
      const viewportWidth = await waitForReelViewport(reelViewportRef, reelViewportWidthRef);
      if (runTokenRef.current !== runToken || viewportWidth <= 0) return;

      setReelTransition("none");
      setReelX(reelCenterOffset(viewportWidth, laneStartScroll));
      await waitNextFrame();
      if (runTokenRef.current !== runToken) return;

      const spinStartMs = performance.now();
      let lastFlapIndex = laneStartScroll;
      const stopProgress = runSpinProgress(
        spinStartMs,
        spinDurationMs,
        (progress) => {
          setPoolProgress(progress);
          setPoolPhaseCopy(vaultDropPoolPhaseCopyForSpin(spin, progress));
          if (labelCount > 0) {
            // Ease the linear time-progress into the same deceleration feel as the CSS
            // transition on the reel itself, so flap flips slow down toward the lock too.
            const eased = 1 - Math.pow(1 - progress, 3);
            const idx = Math.round(laneStartScroll + (spinEndScroll - laneStartScroll) * eased);
            if (idx !== lastFlapIndex) {
              lastFlapIndex = idx;
              setFlapIndex(((idx % labelCount) + labelCount) % labelCount);
            }
          }
        },
        runToken,
        runTokenRef,
      );

      await animateReelScroll(
        setReelX,
        setReelTransition,
        viewportWidth,
        spinEndScroll,
        spinTransition,
      );
      stopProgress();

      if (runTokenRef.current !== runToken) return;

      setCenterScrollIndex(winnerScrollIndex);
      setPoolProgress(1);
      setPoolPhaseCopy("Locked");
      setPhase("reveal");
      setReelTransition("none");
      setReelX(reelCenterOffset(viewportWidth, winnerScrollIndex));

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, Math.min(120, landDurationMs));
      });
      if (runTokenRef.current !== runToken) return;

      setReelBump(true);
      window.setTimeout(() => setReelBump(false), 520);
    })();

    return () => {
      window.cancelAnimationFrame(raf);
      runTokenRef.current += 1;
    };
  }, [spin?.spinId, reelMeasuredWidth]);

  useEffect(() => {
    const node = reelViewportRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      if (width <= 0) return;
      reelViewportWidthRef.current = width;
      setReelMeasuredWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
      if (phase === "pool") return;
      const scrollIdx = phase === "reveal" ? winnerScrollIndexRef.current : centerScrollIndex;
      setReelTransition("none");
      setReelX(reelCenterOffset(width, scrollIdx));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [spin?.spinId, phase, centerScrollIndex]);

  useEffect(() => {
    if (!spin?.spinId) return;
    const { totalMs } = vaultDropRevealTiming(spin);
    const dismissTimer = window.setTimeout(() => onDismissRef.current(), totalMs);
    return () => window.clearTimeout(dismissTimer);
  }, [spin?.spinId, spin?.labels.length, spin?.winnerIndex]);

  if (!spin || spin.labels.length === 0) return null;

  const winner = vaultSealWinnerCopy(spin);
  const eyebrow = vaultDropRevealEyebrow(spin);
  const poolHint = vaultDropRevealPoolHint(spin);
  const isGivvyDraw = spin.kind === "giveaway";
  const givvyWinBanner = showWinner
    ? vaultDropRevealGivvyWinBanner(spin, { userId: viewerUserId, username: viewerUsername })
    : null;
  const focusRing = vaultDropReelFocusRingPosition(reelMeasuredWidth, REEL_WINDOW_HEIGHT);

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
          background: `radial-gradient(circle at 50% 42%, ${showWinner ? accent : isGivvyDraw ? "#34d399" : "#D4AF37"}55 0%, transparent 58%)`,
        }}
      />

      <div
        className={`relative w-full max-w-[380px] transition-all duration-300 ease-out ${
          entered ? "scale-100 opacity-100" : "scale-[0.82] opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`rounded-2xl p-[2px] ${
            isGivvyDraw
              ? "bg-gradient-to-br from-emerald-600 via-emerald-400 to-teal-300 shadow-[0_0_48px_rgba(52,211,153,0.35)]"
              : "bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 shadow-[0_0_48px_rgba(217,70,239,0.35)]"
          }`}
        >
          <div className="relative overflow-hidden rounded-[14px] bg-[#0a0a0c] px-6 py-6 text-center">
            <div
              className={`vault-drop-scan pointer-events-none absolute inset-x-0 top-0 h-px ${
                isGivvyDraw
                  ? "bg-emerald-200/70 shadow-[0_0_18px_rgba(110,231,183,0.8)]"
                  : "bg-amber-200/70 shadow-[0_0_18px_rgba(255,215,120,0.8)]"
              }`}
            />

            <p
              className={`text-[10px] font-black uppercase tracking-[0.28em] ${
                isGivvyDraw ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {eyebrow}
            </p>
            <h2 className="mt-2 text-base font-extrabold leading-snug text-white">{spin.title}</h2>
            <p className="mt-1 text-[11px] font-semibold text-zinc-500">{vaultSealMetaLine(spin)}</p>
            <p
              className={`mt-1 text-[10px] font-bold ${
                isGivvyDraw ? "text-emerald-200/70" : "text-amber-200/70"
              }`}
            >
              Verified server draw · everyone sees the same roll
            </p>

            <div className="mt-6 space-y-3">
              <p
                className={`text-xs font-black uppercase tracking-[0.24em] ${
                  isGivvyDraw ? "text-emerald-200/90" : "text-amber-200/90"
                }`}
              >
                {showWinner ? winner.kicker : poolPhaseCopy}
              </p>
              {!showWinner ? (
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ease-out ${
                      isGivvyDraw ? "bg-emerald-300" : "bg-amber-300"
                    }`}
                    style={{ width: `${Math.round(poolProgress * 100)}%` }}
                  />
                </div>
              ) : null}

              {isGivvyDraw ? (
                <SplitFlapBoard spin={spin} showWinner={showWinner} flapIndex={flapIndex} bump={reelBump} />
              ) : (
                <div className="relative w-full">
                  <div
                    ref={reelViewportRef}
                    className="relative h-[52px] overflow-hidden rounded-full border border-white/10 bg-black/35"
                  >
                    <div
                      className="relative z-[1] flex h-full items-center will-change-transform"
                      style={{
                        transform: `translateX(${reelX}px)`,
                        transition: reelTransition,
                      }}
                    >
                      {reelLaneLabels.map((label, index) => {
                        const sourceIndex = labelCount > 0 ? index % labelCount : 0;
                        const chipAccent = labelAccentColor(spin, sourceIndex);
                        const lightChip = isLightSpotAccent(chipAccent);
                        const isWinnerSlot = showWinner && index === centerScrollIndex;
                        const pillLabel = vaultDropReelPillLabel(spin, sourceIndex);
                        return (
                          <div
                            key={`${label}-${index}`}
                            className="flex shrink-0 items-center justify-center"
                            style={{ width: REEL_PILL_SPAN }}
                          >
                            <div
                              className={`box-border flex h-10 w-[84px] items-center justify-center rounded-full border-2 px-2 text-center text-[11px] font-extrabold leading-none ${
                                lightChip ? "text-zinc-950" : "text-white"
                              } ${
                                isWinnerSlot && reelBump ? "scale-105" : "scale-100"
                              } ${isWinnerSlot ? "shadow-[0_8px_20px_rgba(0,0,0,0.35)]" : ""} transition-transform duration-200`}
                              style={{
                                borderColor: chipAccent,
                                backgroundColor: reelPillBackground(spin, chipAccent, lightChip),
                              }}
                            >
                              {pillLabel}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-r from-[#0a0a0c] via-transparent via-70% to-[#0a0a0c]" />
                    <div
                      className="pointer-events-none absolute rounded-full border-2 border-amber-200/85"
                      style={{
                        left: focusRing.left,
                        top: focusRing.top,
                        width: focusRing.width,
                        height: focusRing.height,
                      }}
                    />
                    {showWinner ? (
                      <div
                        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-md"
                        style={{
                          width: REEL_PILL_WIDTH + 20,
                          height: REEL_PILL_HEIGHT + 20,
                          backgroundColor: `${accent}66`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              )}

              {showWinner ? (
                <>
                  {givvyWinBanner ? (
                    <p className="vault-reveal-winner-pop mb-2 text-lg font-black tracking-tight text-emerald-300">
                      {givvyWinBanner}
                    </p>
                  ) : null}
                  <p className="vault-reveal-winner-pop text-3xl font-black tracking-tight" style={{ color: accent }}>
                    {winner.primary}
                  </p>
                  {winner.sub ? <p className="text-sm font-bold text-zinc-300">{winner.sub}</p> : null}
                  {winner.detail ? <p className="text-xs font-semibold text-zinc-500">{winner.detail}</p> : null}
                </>
              ) : (
                <p className="text-[10px] font-semibold text-zinc-500">{poolHint}</p>
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
