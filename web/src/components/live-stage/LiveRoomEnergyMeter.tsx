"use client";

import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";

type LiveRoomEnergyMeterProps = {
  score: number;
  level: LiveRoomEnergyLevel;
  compact?: boolean;
};

const LEVEL_GLOW: Record<LiveRoomEnergyLevel, string> = {
  calm: "from-zinc-500/60 to-zinc-600/40",
  warming: "from-amber-400/70 to-amber-500/50",
  hot: "from-amber-300/85 to-orange-400/65",
  electric: "from-yellow-200/90 via-amber-300/85 to-rose-400/70",
};

export function LiveRoomEnergyMeter({ score, level, compact = false }: LiveRoomEnergyMeterProps) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      className={`live-stage-glass-pill flex items-center gap-2 ${compact ? "px-2 py-1" : "px-2.5 py-1.5"}`}
      aria-label={`Room energy ${pct} percent`}
    >
      <span className={`shrink-0 font-black uppercase tracking-[0.14em] text-zinc-400 ${compact ? "text-[7px]" : "text-[8px]"}`}>
        Energy
      </span>
      <div className={`relative overflow-hidden rounded-full bg-black/50 ${compact ? "h-1 w-14" : "h-1.5 w-16"}`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out ${LEVEL_GLOW[level]} ${
            level === "electric" ? "motion-safe:animate-[vault-breathe_1.2s_ease-in-out_infinite]" : ""
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`shrink-0 font-mono font-black tabular-nums text-amber-100/90 ${compact ? "text-[9px]" : "text-[10px]"}`}>
        {pct}%
      </span>
    </div>
  );
}
