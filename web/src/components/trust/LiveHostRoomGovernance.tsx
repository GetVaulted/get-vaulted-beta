"use client";

import { useState, type ReactNode } from "react";
import type { LiveRoomModeratorRow } from "@/hooks/useLiveRoomModerationState";
import type { MentionSearchUser } from "@/lib/mentions/mention-types";
import { MentionComposer } from "@/components/mentions/MentionComposer";

const SLOW_MODE_PRESETS = [0, 5, 10, 30] as const;

type Props = {
  slowModeSeconds: number;
  moderators: LiveRoomModeratorRow[];
  busy: boolean;
  error: string | null;
  onSetSlowMode: (seconds: number) => void;
  onAssignModerator: (userId: string) => void;
  onRevokeModerator: (userId: string) => void;
};

function GhostButton({
  children,
  disabled,
  onClick,
  active,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left text-[11px] font-semibold transition disabled:opacity-40 ${
        active
          ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
          : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/15 hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

export function LiveHostRoomGovernance({
  slowModeSeconds,
  moderators,
  busy,
  error,
  onSetSlowMode,
  onAssignModerator,
  onRevokeModerator,
}: Props) {
  const [modSearch, setModSearch] = useState("");

  const nextSlowMode = () => {
    const idx = SLOW_MODE_PRESETS.indexOf(slowModeSeconds as (typeof SLOW_MODE_PRESETS)[number]);
    const next = SLOW_MODE_PRESETS[(idx >= 0 ? idx + 1 : 0) % SLOW_MODE_PRESETS.length];
    onSetSlowMode(next);
  };

  const pickModerator = (user: MentionSearchUser) => {
    onAssignModerator(user.id);
    setModSearch("");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <GhostButton disabled={busy} onClick={nextSlowMode} active={slowModeSeconds > 0}>
          Slow mode {slowModeSeconds > 0 ? `${slowModeSeconds}s` : "off"}
        </GhostButton>
        {SLOW_MODE_PRESETS.filter((s) => s !== slowModeSeconds).map((s) => (
          <GhostButton key={s} disabled={busy} onClick={() => onSetSlowMode(s)}>
            {s === 0 ? "Slow off" : `${s}s`}
          </GhostButton>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Mute, kick, ban, and delete messages from the <span className="font-medium text-zinc-400">mod</span> menu on
        chat rows in the host chat panel.
      </p>

      <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Moderators</p>
        {moderators.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No co-moderators assigned.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {moderators.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                <span>@{m.username}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRevokeModerator(m.userId)}
                  className="rounded px-2 py-0.5 text-[10px] font-bold uppercase text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <p className="mb-2 text-[11px] text-zinc-500">
            Type @username like chat mentions and tap a match to assign. Their mod tools appear on their device.
          </p>
          <MentionComposer
            singleLine
            value={modSearch}
            onChange={setModSearch}
            onPickUser={pickModerator}
            disabled={busy}
            placeholder="@username"
            className="w-full rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-400/35"
          />
        </div>
      </div>

      {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
    </div>
  );
}
