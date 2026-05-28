"use client";

import type { VaultMode } from "@/components/break-host/vault/vault-modes";
import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";

const MODE_SPOT: Record<VaultMode, string> = {
  auction_night: "rgba(255, 190, 40, 0.32)",
  vault_drop: "rgba(34, 211, 238, 0.22)",
  break_room: "rgba(167, 139, 250, 0.24)",
  marketplace_showcase: "rgba(52, 211, 153, 0.2)",
  collector_lounge: "rgba(251, 146, 60, 0.18)",
};

const ENERGY_MULT: Record<LiveRoomEnergyLevel, number> = {
  calm: 0.65,
  warming: 0.88,
  hot: 1.15,
  electric: 1.55,
};

type LiveStageLightingProps = {
  vaultMode?: VaultMode;
  energyLevel?: LiveRoomEnergyLevel;
  energyScore?: number;
};

/** Radial spotlight + subtle particles — sits behind 9:16 plate, never on video. */
export function LiveStageLighting({
  vaultMode = "auction_night",
  energyLevel = "calm",
  energyScore = 0,
}: LiveStageLightingProps) {
  const spot = MODE_SPOT[vaultMode];
  const mult = ENERGY_MULT[energyLevel];
  const intensity = Math.min(1, (energyScore / 100) * mult + 0.32);
  const showEnergyHaze = energyLevel === "hot" || energyLevel === "electric";

  return (
    <div className="live-stage-lighting pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {showEnergyHaze ? (
        <div
          className="absolute inset-x-0 bottom-0 h-[55%] motion-safe:animate-[live-stage-spot-pulse_4s_ease-in-out_infinite]"
          style={{
            background:
              energyLevel === "electric"
                ? "radial-gradient(ellipse 90% 70% at 50% 100%, rgba(255,170,40,0.14) 0%, rgba(239,68,68,0.06) 45%, transparent 72%)"
                : "radial-gradient(ellipse 85% 65% at 50% 100%, rgba(255,190,40,0.1) 0%, transparent 68%)",
            opacity: energyLevel === "electric" ? 0.95 : 0.75,
          }}
        />
      ) : null}
      <div
        className="live-stage-spotlight absolute left-1/2 top-[42%] size-[min(90vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:animate-[live-stage-spot-pulse_6s_ease-in-out_infinite]"
        style={{
          background: `radial-gradient(circle, ${spot} 0%, transparent 68%)`,
          opacity: intensity,
        }}
      />
      <div
        className="live-stage-spotlight-secondary absolute left-1/2 top-[58%] size-[min(70vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:animate-[live-stage-spot-drift_12s_ease-in-out_infinite]"
        style={{
          background: `radial-gradient(circle, ${spot} 0%, transparent 72%)`,
          opacity: intensity * 0.45,
        }}
      />
      <div className="live-stage-particles absolute inset-0 opacity-[0.35]">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="live-stage-particle absolute size-0.5 rounded-full bg-amber-200/40 motion-safe:animate-[live-stage-particle-float_14s_ease-in-out_infinite]"
            style={{
              left: `${12 + i * 11}%`,
              top: `${20 + (i % 4) * 18}%`,
              animationDelay: `${i * 1.7}s`,
              opacity: 0.15 + (intensity * 0.25),
            }}
          />
        ))}
      </div>
    </div>
  );
}
