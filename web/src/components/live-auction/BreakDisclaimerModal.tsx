"use client";

import Link from "next/link";
import { useEffect, useId } from "react";

export type BreakDisclaimerModalProps = {
  open: boolean;
  onAccept: () => void;
  /** Called when the buyer chooses to leave the room rather than accept (e.g. router.back()). */
  onDecline: () => void;
  /** Optional href for the "view terms" link (defaults to /terms#contact-free anchor). */
  termsHref?: string;
};

/**
 * Mandatory pre-bid notice for live break rooms. Buyers must accept before any
 * participation action (claim spot, team pick, pay) is enabled. The modal does
 * not dismiss on backdrop click or Escape — they must Accept or Leave.
 */
export function BreakDisclaimerModal({
  open,
  onAccept,
  onDecline,
  termsHref = "/terms",
}: BreakDisclaimerModalProps) {
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center"
      role="presentation"
      data-testid="break-disclaimer-modal"
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-[3px]" aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative z-[1] flex max-h-[min(88dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0a0d] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.95)]"
      >
        <div className="shrink-0 border-b border-white/[0.06] px-5 pb-3 pt-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/90">Required</p>
          <h2 id={titleId} className="mt-1 font-display text-lg font-bold text-foreground">
            Live Break Notice
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-3 sm:px-6">
          <p id={bodyId} className="text-sm leading-relaxed text-zinc-300">
            By clicking <span className="font-semibold text-foreground">OK</span> and participating in this break, you
            acknowledge that a live break is being conducted, that results are random or event-based, that no specific
            outcome or value is guaranteed, and that you accept the risk of receiving low-value or no-hit results. You
            agree to the break rules, livestream rules, and platform{" "}
            <Link
              href={termsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gold-bright hover:underline"
            >
              terms
            </Link>
            , and you understand that the stream may be recorded or clipped.
          </p>
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-2.5 border-t border-white/[0.06] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onDecline}
            data-testid="break-disclaimer-leave"
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-full border border-white/[0.14] px-6 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.04] sm:min-w-[7rem]"
          >
            Leave room
          </button>
          <button
            type="button"
            onClick={onAccept}
            autoFocus
            data-testid="break-disclaimer-accept"
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110 sm:min-w-[8rem]"
          >
            OK, I agree
          </button>
        </div>
      </div>
    </div>
  );
}

const STORAGE_PREFIX = "gv:break-disclaimer:v1";

/** Stable per-user, per-room key. Anonymous users get an "anon" bucket so an
 * acceptance recorded while signed-out does not silently apply to a different
 * authenticated identity using the same browser. */
export function breakDisclaimerStorageKey(liveRoomId: string, userId: string | null | undefined) {
  const u = userId && userId.length > 0 ? userId : "anon";
  return `${STORAGE_PREFIX}:${u}:${liveRoomId}`;
}
