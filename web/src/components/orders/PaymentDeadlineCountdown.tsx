"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** Live mm:ss remaining until `deadlineIso` (UTC). */
export function PaymentDeadlineCountdown({ deadlineIso }: { deadlineIso: string }) {
  const [msLeft, setMsLeft] = useState(() => new Date(deadlineIso).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setMsLeft(new Date(deadlineIso).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  if (msLeft <= 0) {
    return <span className="font-mono text-sm text-rose-200/90">0:00</span>;
  }
  const totalSec = Math.floor(msLeft / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return (
    <span className="font-mono text-sm tabular-nums text-amber-200/95">
      {m}:{pad(s)}
    </span>
  );
}
