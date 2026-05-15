"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useState } from "react";

type MobileBottomSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function MobileBottomSheet({ open, title, onClose, children }: MobileBottomSheetProps) {
  const [rendered, setRendered] = useState(open);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const id = requestAnimationFrame(() => setActive(true));
      return () => cancelAnimationFrame(id);
    }
    setActive(false);
    const id = window.setTimeout(() => setRendered(false), 320);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [rendered]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-[80] lg:hidden">
      <button
        type="button"
        aria-label="Close panel"
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[var(--live-duration-ui)] ease-[var(--live-ease)] motion-reduce:transition-none ${active ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`live-glass-modal-sheet absolute inset-x-0 bottom-0 transition-transform duration-[var(--live-duration-ui)] ease-[var(--live-ease)] motion-reduce:transition-none ${active ? "translate-y-0" : "translate-y-8"}`}
      >
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between px-4 pt-2.5">
            <div className="mx-auto h-1 w-12 rounded-full bg-white/[0.18]" />
          </div>
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-200">{title}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[color:var(--live-border)] px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition-[transform,background-color,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] hover:bg-white/[0.06] active:scale-[0.97] motion-reduce:active:scale-100"
            >
              Close
            </button>
          </div>
          <div className="max-h-[85vh] overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
