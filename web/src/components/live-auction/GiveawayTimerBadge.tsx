"use client";

import { useGiveawayCountdown } from "@/hooks/useGiveawayCountdown";

export function GiveawayTimerBadge({
  entryCloseAt,
  onExpired,
  className = "",
}: {
  entryCloseAt: string | null | undefined;
  onExpired?: () => void;
  className?: string;
}) {
  const { label, seconds } = useGiveawayCountdown(entryCloseAt, onExpired);
  if (!label || seconds == null) return null;

  const urgent = seconds > 0 && seconds <= 30;
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono tabular-nums ${
        urgent
          ? "border-amber-400/35 bg-amber-500/15 text-amber-100"
          : "border-violet-400/20 bg-violet-500/10 text-violet-100/90"
      } ${className}`}
    >
      {label}
    </span>
  );
}
