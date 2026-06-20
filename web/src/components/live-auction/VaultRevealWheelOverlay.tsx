"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { segmentColorForLabel } from "@/lib/nfl-team-colors";
import {
  landingRotationDeg,
  VAULT_REVEAL_RESULT_HOLD_MS,
  type VaultRevealSpinPayload,
} from "@/lib/vault-reveal-spin";

function shortLabel(label: string) {
  const bare = label.trim().replace(/^@/, "") || "—";
  if (bare.length <= 12) return bare;
  return `${bare.slice(0, 11)}…`;
}

function spinKindCopy(kind: VaultRevealSpinPayload["kind"]) {
  if (kind === "random_reveal") return "Vault Reveal";
  if (kind === "break_pyt") return "Break randomizer";
  return "Giveaway";
}

function winnerHeadline(spin: VaultRevealSpinPayload) {
  if (spin.kind === "random_reveal") return "Your team";
  if (spin.kind === "break_pyt") return "First pick";
  return "Winner";
}

export function VaultRevealWheelOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const seenRef = useRef<string | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const segments = useMemo(() => {
    if (!spin?.labels.length) return [];
    const slice = 360 / spin.labels.length;
    return spin.labels.map((label, i) => ({
      label,
      start: i * slice,
      color: segmentColorForLabel(label, spin.segmentAbbrs?.[i] ?? null),
    }));
  }, [spin]);

  useEffect(() => {
    if (!spin) {
      setPhase("idle");
      setRotation(0);
      seenRef.current = null;
      return;
    }
    const alreadySeen = seenRef.current === spin.spinId;
    if (!alreadySeen) {
      seenRef.current = spin.spinId;
      setPhase("spinning");
      setRotation(0);
      const target = landingRotationDeg(spin.winnerIndex, spin.labels.length, 6);
      requestAnimationFrame(() => setRotation(target));
      window.setTimeout(() => setPhase("done"), spin.durationMs);
    }
    const dismissAt = window.setTimeout(
      () => onDismissRef.current(),
      spin.durationMs + VAULT_REVEAL_RESULT_HOLD_MS,
    );
    return () => window.clearTimeout(dismissAt);
  }, [spin?.spinId, spin?.durationMs, spin?.winnerIndex, spin?.labels.length]);

  if (!spin) return null;

  const winner = spin.winnerLabel.replace(/^@/, "");
  const buyer = spin.buyerUsername?.replace(/^@/, "");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-[#030305]/95 px-4 backdrop-blur-md">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.04) 38%, transparent 68%)",
        }}
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-5">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300/95">
            {spinKindCopy(spin.kind)}
          </p>
          <h2 className="mt-1 text-center text-xl font-black text-white">{spin.title}</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-500">
            {spin.labels.length} remaining · premium wheel
          </p>
        </div>

        <div className="relative flex h-[min(72vw,320px)] w-[min(72vw,320px)] items-center justify-center">
          <div
            className={`absolute inset-[-8%] rounded-full blur-2xl transition-opacity duration-700 ${
              phase === "spinning" ? "opacity-90 motion-safe:animate-pulse" : "opacity-50"
            }`}
            style={{
              background: "radial-gradient(circle, rgba(212,175,55,0.35) 0%, rgba(212,175,55,0) 70%)",
            }}
          />
          <div className="absolute -top-2 z-30 flex flex-col items-center">
            <div className="h-0 w-0 border-x-[14px] border-b-[26px] border-x-transparent border-b-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,0.9)]" />
            <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-200 shadow-[0_0_10px_rgba(252,211,77,0.9)]" />
          </div>
          <div
            className="relative h-full w-full rounded-full border-[3px] border-amber-400/50 shadow-[0_0_40px_-8px_rgba(212,175,55,0.65),inset_0_0_30px_rgba(0,0,0,0.5)] transition-transform ease-[cubic-bezier(0.12,0.8,0.22,1)]"
            style={{
              transform: `rotate(${rotation}deg)`,
              transitionDuration: phase === "spinning" ? `${spin.durationMs}ms` : "0ms",
            }}
          >
            <svg viewBox="0 0 320 320" className="h-full w-full drop-shadow-2xl">
              <defs>
                <filter id="wheel-inner-shadow">
                  <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.35" />
                </filter>
              </defs>
              {segments.map((seg, i) => {
                const slice = 360 / spin.labels.length;
                const start = seg.start;
                const end = start + slice;
                const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
                const cx = 160;
                const cy = 160;
                const r = 154;
                const x1 = cx + r * Math.cos(toRad(end));
                const y1 = cy + r * Math.sin(toRad(end));
                const x2 = cx + r * Math.cos(toRad(start));
                const y2 = cy + r * Math.sin(toRad(start));
                const large = slice > 180 ? 1 : 0;
                const mid = start + slice / 2;
                const lx = cx + r * 0.62 * Math.cos(toRad(mid));
                const ly = cy + r * 0.62 * Math.sin(toRad(mid));
                const fontSize =
                  spin.labels.length > 24 ? 6 : spin.labels.length > 16 ? 7 : spin.labels.length > 10 ? 8 : 9;
                return (
                  <g key={`${seg.label}-${i}`} filter="url(#wheel-inner-shadow)">
                    <path
                      d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2} Z`}
                      fill={seg.color}
                      stroke="#0a0a0a"
                      strokeWidth={1.2}
                    />
                    <text
                      x={lx}
                      y={ly}
                      fill="#f8fafc"
                      fontSize={fontSize}
                      fontWeight="800"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${mid + 90}, ${lx}, ${ly})`}
                    >
                      {shortLabel(seg.label)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="pointer-events-none absolute z-20 flex h-16 w-16 items-center justify-center rounded-full border-[2px] border-amber-300/80 bg-gradient-to-br from-zinc-900 to-black text-sm font-black text-amber-200 shadow-[0_0_24px_rgba(212,175,55,0.45)]">
            GV
          </div>
        </div>

        {phase === "done" ? (
          <div className="vault-reveal-winner-pop w-full max-w-sm rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-500/20 to-zinc-950/90 px-6 py-4 text-center shadow-[0_24px_60px_-20px_rgba(212,175,55,0.45)]">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/90">
              {winnerHeadline(spin)}
            </p>
            <p className="mt-1 text-3xl font-black text-white">{winner}</p>
            {buyer ? (
              <p className="mt-1 text-sm font-semibold text-emerald-200/90">@{buyer}</p>
            ) : spin.kind === "giveaway" ? (
              <p className="mt-1 text-2xl font-black text-emerald-50">@{winner}</p>
            ) : null}
            {spin.kind === "random_reveal" ? (
              <p className="mt-2 text-[10px] font-semibold text-zinc-400">
                Removed from the wheel · {Math.max(0, spin.labels.length - 1)} left
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-bold tracking-wide text-amber-100/90 motion-safe:animate-pulse">Spinning…</p>
        )}
      </div>
    </div>
  );
}
