"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  landingRotationDeg,
  type VaultRevealSpinPayload,
} from "@/lib/vault-reveal-spin";

function shortLabel(label: string) {
  const bare = label.trim().replace(/^@/, "") || "entrant";
  return bare.length > 10 ? `${bare.slice(0, 9)}…` : bare;
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

  const segments = useMemo(() => {
    if (!spin?.labels.length) return [];
    const slice = 360 / spin.labels.length;
    const colors = ["#047857", "#059669", "#10b981", "#34d399", "#065f46", "#0d9488"];
    return spin.labels.map((label, i) => ({
      label,
      start: i * slice,
      color: colors[i % colors.length]!,
    }));
  }, [spin]);

  useEffect(() => {
    if (!spin) {
      setPhase("idle");
      setRotation(0);
      seenRef.current = null;
      return;
    }
    if (seenRef.current === spin.spinId) return;
    seenRef.current = spin.spinId;
    setPhase("spinning");
    setRotation(0);
    const target = landingRotationDeg(spin.winnerIndex, spin.labels.length);
    const t1 = requestAnimationFrame(() => setRotation(target));
    const t2 = window.setTimeout(() => setPhase("done"), spin.durationMs);
    const t3 = window.setTimeout(() => onDismiss(), spin.durationMs + 2200);
    return () => {
      cancelAnimationFrame(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDismiss, spin]);

  if (!spin) return null;

  const winner = spin.winnerLabel.replace(/^@/, "");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/90">Vault reveal</p>
        <h2 className="text-center text-xl font-black text-white">{spin.title}</h2>
        <p className="text-xs text-zinc-400">
          {spin.kind === "break_pyt" ? "PYT randomizer" : "Giveaway"} · {spin.labels.length} on wheel
        </p>

        <div className="relative flex h-[300px] w-[300px] items-center justify-center">
          <div className="absolute -top-1 z-20 h-0 w-0 border-x-[12px] border-b-[22px] border-x-transparent border-b-amber-300" />
          <div
            className="relative h-full w-full rounded-full border-2 border-amber-400/40 transition-transform ease-out"
            style={{
              transform: `rotate(${rotation}deg)`,
              transitionDuration: phase === "spinning" ? `${spin.durationMs}ms` : "0ms",
            }}
          >
            <svg viewBox="0 0 300 300" className="h-full w-full">
              {segments.map((seg, i) => {
                const slice = 360 / spin.labels.length;
                const start = seg.start;
                const end = start + slice;
                const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
                const cx = 150;
                const cy = 150;
                const r = 146;
                const x1 = cx + r * Math.cos(toRad(end));
                const y1 = cy + r * Math.sin(toRad(end));
                const x2 = cx + r * Math.cos(toRad(start));
                const y2 = cy + r * Math.sin(toRad(start));
                const large = slice > 180 ? 1 : 0;
                const mid = start + slice / 2;
                const lx = cx + r * 0.58 * Math.cos(toRad(mid));
                const ly = cy + r * 0.58 * Math.sin(toRad(mid));
                return (
                  <g key={`${seg.label}-${i}`}>
                    <path
                      d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2} Z`}
                      fill={seg.color}
                      stroke="#0a0a0a"
                      strokeWidth={1}
                    />
                    <text
                      x={lx}
                      y={ly}
                      fill="#ecfdf5"
                      fontSize={spin.labels.length > 16 ? 7 : spin.labels.length > 10 ? 8 : 9}
                      fontWeight="700"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {shortLabel(seg.label)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="pointer-events-none absolute z-10 flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 bg-zinc-950 text-xs font-black text-amber-300">
            GV
          </div>
        </div>

        {phase === "done" ? (
          <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-6 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-200/80">
              {spin.kind === "break_pyt" ? "First pick" : "Winner"}
            </p>
            <p className="text-2xl font-black text-emerald-50">@{winner}</p>
            {spin.kind === "break_pyt" && spin.assignments?.length ? (
              <p className="mt-1 text-[10px] text-emerald-100/70">
                Full order locked · {spin.assignments.length} spots
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-semibold text-zinc-300">Spinning…</p>
        )}
      </div>
    </div>
  );
}
