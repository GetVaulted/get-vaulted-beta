"use client";

import Link from "next/link";

/** Shown when the seller views `/live/[id]` — queue management stays in seller console, not buyer UI. */
export function HostLiveRoomConsoleBanner({
  liveRoomId,
}: {
  liveRoomId: string;
  /** Retained for call-site compatibility; every room type now hosts from the seller console. */
  roomType?: "auction" | "sale" | "break";
}) {
  const consoleHref = `/seller/live/${encodeURIComponent(liveRoomId)}/console`;

  return (
    <div className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5">
      <p className="text-xs font-bold text-gold-bright">You are hosting this show</p>
      <p className="mt-0.5 text-[11px] leading-snug text-zinc-300">
        Manage the queue, pricing, and go-live controls in your seller command center — this page is the buyer view.
      </p>
      <Link
        href={consoleHref}
        className="mt-2 inline-block text-xs font-bold text-gold-bright underline-offset-2 hover:underline"
      >
        Open command center →
      </Link>
    </div>
  );
}
