"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_MS = 420;

type Props = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onCommit: () => void;
  onHoldStart?: () => boolean | void;
  className?: string;
};

export function HoldToBuyButton({
  label,
  disabled = false,
  busy = false,
  onCommit,
  onHoldStart,
  className = "",
}: Props) {
  const [progress, setProgress] = useState(0);
  const holdingRef = useRef(false);
  const committedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startMsRef = useRef(0);

  const clearHold = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    holdingRef.current = false;
    if (!committedRef.current) setProgress(0);
    // Do NOT clear `committedRef` here. This runs synchronously on mouseup/touchend, which is
    // immediately followed — same synchronous event dispatch, same gesture — by the browser's
    // native "click" event. `committedRef` has to still read true when `onFinePointerClick` checks
    // it below, or the guard added there does nothing. It's cleared on a deferred timer instead
    // (see the hold-commit timeout), once that trailing click has had its chance to fire.
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  useEffect(() => {
    if (disabled || busy) clearHold();
  }, [busy, clearHold, disabled]);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startMsRef.current;
    const next = Math.min(1, elapsed / HOLD_MS);
    setProgress(next);
    if (next < 1 && holdingRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const beginHold = useCallback(() => {
    if (disabled || busy || holdingRef.current || committedRef.current) return;
    const allowed = onHoldStart?.();
    if (allowed === false) return;
    holdingRef.current = true;
    startMsRef.current = Date.now();
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!holdingRef.current) return;
      committedRef.current = true;
      holdingRef.current = false;
      onCommit();
      setProgress(0);
      // Holding the button past HOLD_MS still ends in a mouseup, and the browser fires its native
      // "click" event right after — reaching `onFinePointerClick` with the parent's `busy` prop
      // still stale (pre-render) at that point. `committedRef` guards that click, and must survive
      // through it, so its reset is deferred a tick instead of happening immediately here.
      setTimeout(() => {
        committedRef.current = false;
      }, 0);
    }, HOLD_MS);
  }, [busy, disabled, onCommit, onHoldStart, tick]);

  const onFinePointerClick = useCallback(() => {
    if (disabled || busy || committedRef.current) return;
    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      const allowed = onHoldStart?.();
      if (allowed === false) return;
      onCommit();
    }
  }, [busy, disabled, onCommit, onHoldStart]);

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onMouseDown={beginHold}
      onMouseUp={clearHold}
      onMouseLeave={clearHold}
      onTouchStart={beginHold}
      onTouchEnd={clearHold}
      onClick={onFinePointerClick}
      className={`relative min-h-12 w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-sm font-black uppercase tracking-wide text-zinc-950 disabled:opacity-45 ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 bg-white/35 transition-[width] duration-75"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative z-[1]">{busy ? "Processing…" : label}</span>
    </button>
  );
}
