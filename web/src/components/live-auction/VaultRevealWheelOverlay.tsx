"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { segmentColorForLabel } from "@/lib/nfl-team-colors";
import {
  landingRotationDeg,
  VAULT_REVEAL_RESULT_HOLD_MS,
  vaultSealMetaLine,
  vaultSealWinnerCopy,
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

const WHEEL_PEG_COUNT = 32;

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
      const extraSpins = spin.labels.length > 20 ? 7 : spin.labels.length > 10 ? 6 : 5;
      const target = landingRotationDeg(spin.winnerIndex, spin.labels.length, extraSpins);
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

  const winner = vaultSealWinnerCopy(spin);
  const pegs = Array.from({ length: WHEEL_PEG_COUNT }, (_, i) => i);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-[#030305]/96 px-4 backdrop-blur-md"
      role="dialog"
      aria-live="polite"
      aria-label={`${spinKindCopy(spin.kind)} reveal`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(212,175,55,0.28) 0%, rgba(212,175,55,0.06) 42%, transparent 72%)",
        }}
      />
      {phase === "spinning" ? (
        <div
          className="pointer-events-none absolute inset-0 motion-safe:animate-[vault-reveal-wheel-shimmer_1.2s_ease-in-out_infinite]"
          style={{
            background:
              "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(212,175,55,0.08) 60deg, transparent 120deg)",
          }}
        />
      ) : null}

      <div className="relative flex w-full max-w-md flex-col items-center gap-5">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300/95">
            {spinKindCopy(spin.kind)}
          </p>
          <h2 className="mt-1 text-center text-xl font-black text-white">{spin.title}</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-500">{vaultSealMetaLine(spin)}</p>
        </div>

        <div className="relative flex h-[min(72vw,320px)] w-[min(72vw,320px)] items-center justify-center">
          <div
            className={`absolute inset-[-14%] rounded-full blur-3xl transition-opacity duration-700 ${
              phase === "spinning" ? "opacity-100 motion-safe:animate-pulse" : phase === "done" ? "opacity-80" : "opacity-50"
            }`}
            style={{
              background: "radial-gradient(circle, rgba(212,175,55,0.4) 0%, rgba(212,175,55,0) 70%)",
            }}
          />

          <svg
            viewBox="0 0 340 340"
            className="pointer-events-none absolute inset-[-3%] h-[106%] w-[106%] text-amber-400/70"
            aria-hidden
          >
            <circle
              cx="170"
              cy="170"
              r="162"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 8"
              opacity="0.45"
            />
            {pegs.map((i) => {
              const angle = (i / WHEEL_PEG_COUNT) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const cx = 170 + 162 * Math.cos(rad);
              const cy = 170 + 162 * Math.sin(rad);
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={phase === "spinning" && i % 2 === 0 ? 3.2 : 2.4}
                  fill={i % 2 === 0 ? "#fcd34d" : "#d4af37"}
                  opacity={phase === "done" && i === spin.winnerIndex % WHEEL_PEG_COUNT ? 1 : 0.65}
                />
              );
            })}
          </svg>

          <div className="absolute -top-2 z-30 flex flex-col items-center">
            <div className="h-0 w-0 border-x-[14px] border-b-[26px] border-x-transparent border-b-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,0.9)]" />
            <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-200 shadow-[0_0_10px_rgba(252,211,77,0.9)]" />
          </div>

          <div
            className="relative h-full w-full rounded-full border-[3px] border-amber-400/55 shadow-[0_0_48px_-6px_rgba(212,175,55,0.75),inset_0_0_36px_rgba(0,0,0,0.55)] transition-transform ease-[cubic-bezier(0.08,0.82,0.17,1)]"
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
                <radialGradient id="wheel-hub-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#1a1a1f" />
                  <stop offset="100%" stopColor="#050505" />
                </radialGradient>
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

          <div className="pointer-events-none absolute z-20 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-[2px] border-amber-300/85 bg-gradient-to-br from-zinc-900 to-black text-sm font-black text-amber-200 shadow-[0_0_28px_rgba(212,175,55,0.55)]">
            GV
          </div>
        </div>

        {phase === "done" ? (
          <div className="vault-reveal-winner-pop w-full max-w-sm rounded-2xl border border-amber-400/45 bg-gradient-to-b from-amber-500/25 to-zinc-950/95 px-6 py-5 text-center shadow-[0_24px_60px_-20px_rgba(212,175,55,0.55)]">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/90">{winner.kicker}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-white">{winner.primary}</p>
            {winner.sub ? <p className="mt-2 text-sm font-semibold text-zinc-300">{winner.sub}</p> : null}
            {winner.detail ? (
              <p className="mt-1 text-base font-bold text-amber-100/95">{winner.detail}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-bold tracking-[0.12em] text-amber-100/90 motion-safe:animate-pulse">Spinning…</p>
        )}

        <button
          type="button"
          onClick={() => onDismissRef.current()}
          className="rounded-full border border-white/10 px-8 py-2 text-xs font-bold uppercase tracking-wide text-zinc-400 transition hover:border-amber-400/35 hover:text-zinc-200"
        >
          {phase === "done" ? "Continue" : "Skip"}
        </button>
      </div>
    </div>
  );
}
