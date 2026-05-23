"use client";

import { useState } from "react";

const PRESETS = [
  { id: "ship", label: "Free shipping after $200", body: "Free shipping unlocks at $200 hammer on any single lot tonight." },
  { id: "heat", label: "Sneaker heat starts next", body: "Next block is all sneakers — have payment + ship ready." },
  { id: "givvy", label: "5 giveaways tonight", body: "Five givvys on the sheet — stay through the final hour." },
] as const;

type VaultHostAnnouncementsProps = {
  /** Mobile: floating overlay on the video stage. Desktop: compact collapsible in the right rail. */
  variant?: "mobileOverlay" | "desktopSidebar";
};

export function VaultHostAnnouncements({ variant = "mobileOverlay" }: VaultHostAnnouncementsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (variant === "desktopSidebar") {
    return (
      <div className="w-full min-w-0">
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-1 rounded-xl border border-white/[0.1] bg-black/45 px-2 py-2 text-left shadow-[0_8px_28px_-16px_rgba(0,0,0,0.85)] backdrop-blur-[var(--live-blur-xl)] ring-1 ring-white/[0.04] transition hover:border-amber-400/20"
        >
          <span className="text-[8px] font-black uppercase tracking-[0.14em] text-zinc-400">Announce</span>
          <span className="text-[10px] font-bold text-zinc-500">{sidebarOpen ? "−" : "+"}</span>
        </button>
        {sidebarOpen ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {PRESETS.map((p) => {
              const open = expanded === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setExpanded(open ? null : p.id)}
                  className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1.5 text-left ring-1 ring-white/[0.03] transition hover:border-amber-400/20"
                >
                  <p className="text-[9px] font-bold leading-snug text-zinc-100">{p.label}</p>
                  {open ? <p className="mt-1 text-[8px] leading-relaxed text-zinc-500">{p.body}</p> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute left-2 top-[max(4.5rem,env(safe-area-inset-top)+3.5rem)] z-[9] flex max-w-[min(92vw,20rem)] flex-col gap-2 max-[380px]:left-1 max-[380px]:max-w-[min(94vw,18rem)] min-[1400px]:hidden">
      <div className="pointer-events-auto flex flex-col gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Host announcements</p>
        {PRESETS.map((p) => {
          const open = expanded === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setExpanded(open ? null : p.id)}
              className={`group text-left transition-[transform,box-shadow] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] ${
                open ? "scale-[1.02]" : "hover:scale-[1.01]"
              }`}
            >
              <div
                className={`rounded-xl border border-white/[0.1] bg-black/45 px-3 py-2 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.85)] backdrop-blur-[var(--live-blur-xl)] ring-1 ring-white/[0.04] ${
                  open ? "ring-amber-400/25" : ""
                }`}
              >
                <p className="text-[11px] font-bold leading-snug text-white drop-shadow-sm">{p.label}</p>
                {open ? <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{p.body}</p> : null}
                <p className="mt-1 text-[9px] font-semibold text-zinc-600 group-hover:text-zinc-500">{open ? "Tap to collapse" : "Tap to expand"}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
