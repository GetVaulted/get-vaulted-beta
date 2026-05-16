"use client";

import { useState } from "react";

const PRESETS = [
  { id: "ship", label: "Free shipping after $200", body: "Free shipping unlocks at $200 hammer on any single lot tonight." },
  { id: "heat", label: "Sneaker heat starts next", body: "Next block is all sneakers — have payment + ship ready." },
  { id: "givvy", label: "5 giveaways tonight", body: "Five givvys on the sheet — stay through the final hour." },
] as const;

type VaultHostAnnouncementsProps = {
  busy: boolean;
  systemMsg: string;
  onSystemMsgChange: (v: string) => void;
  onSend: () => void;
};

export function VaultHostAnnouncements({ busy, systemMsg, onSystemMsgChange, onSend }: VaultHostAnnouncementsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="pointer-events-none absolute left-2 top-[max(4.5rem,env(safe-area-inset-top)+3.5rem)] z-[9] flex max-w-[min(92vw,20rem)] flex-col gap-2 max-[380px]:left-1 max-[380px]:max-w-[min(94vw,18rem)] min-[1400px]:top-[5.25rem]">
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

        <div className="rounded-xl border border-amber-400/15 bg-gradient-to-br from-amber-500/10 via-black/50 to-black/65 p-2.5 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.88)] backdrop-blur-[var(--live-blur-xl)] ring-1 ring-amber-400/10">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-100/85">Live broadcast</p>
          <textarea
            value={systemMsg}
            onChange={(e) => onSystemMsgChange(e.target.value)}
            placeholder="Push a line to the room…"
            rows={2}
            className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-400/35"
          />
          <button
            type="button"
            disabled={busy || !systemMsg.trim()}
            onClick={onSend}
            className="mt-2 w-full rounded-lg bg-gradient-to-r from-amber-500/90 to-yellow-400/90 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] disabled:opacity-40"
          >
            Send to chat
          </button>
        </div>
      </div>
    </div>
  );
}
