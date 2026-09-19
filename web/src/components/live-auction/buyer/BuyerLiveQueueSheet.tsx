"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type BuyerLiveQueueSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Optional marketplace profile link (separate from this room's shop lineup). */
  sellerStoreHref?: string | null;
  children: ReactNode;
  footer?: ReactNode;
};

/** Buyer-only in-room shop / lineup drawer (not used on seller console). */
export function BuyerLiveQueueSheet({
  open,
  onClose,
  title = "Shop",
  subtitle,
  sellerStoreHref,
  children,
  footer,
}: BuyerLiveQueueSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/55 backdrop-blur-[2px]" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0" aria-label="Close shop" onClick={onClose} />
      <div className="relative mx-auto flex max-h-[min(78vh,720px)] w-full max-w-[1920px] flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-zinc-100">{title}</p>
            {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {sellerStoreHref ? (
              <Link
                href={sellerStoreHref}
                className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 hover:text-gold-bright hover:underline"
              >
                Seller store
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
        {footer ? <div className="border-t border-zinc-800 px-3 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
