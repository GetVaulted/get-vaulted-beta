"use client";

import { useState } from "react";

type Props = {
  roomId: string;
  targetUserId: string;
  targetUsername: string;
  targetMessageId?: string;
  hostUserId?: string | null;
  canModerate: boolean;
  onActionComplete?: () => void;
};

export function LiveModeratorMenu({
  roomId,
  targetUserId,
  targetUsername,
  targetMessageId,
  hostUserId = null,
  canModerate,
  onActionComplete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canModerate) return null;
  if (hostUserId && targetUserId === hostUserId) return null;

  const act = async (actionType: string, metadata?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/moderation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          targetUserId,
          targetMessageId: actionType === "delete_message" ? targetMessageId : undefined,
          reason: `Moderator action on @${targetUsername}`,
          metadata,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      setOpen(false);
      onActionComplete?.();
    } finally {
      setBusy(false);
    }
  };

  const punitive = [
    { type: "mute", label: "Mute" },
    { type: "kick", label: "Kick from show" },
    { type: "room_ban", label: "Ban from show" },
    { type: "seller_stream_ban", label: "Ban from all shows" },
    { type: "block_bidding", label: "Block bidding" },
    ...(targetMessageId ? [{ type: "delete_message", label: "Delete message" }] : []),
  ] as const;

  const restorative = [
    { type: "unmute", label: "Unmute" },
    { type: "unkick", label: "Remove kick" },
    { type: "unban", label: "Remove room ban" },
    { type: "seller_stream_unban", label: "Remove seller ban" },
    { type: "unblock_bidding", label: "Unblock bidding" },
  ] as const;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1 text-[9px] font-bold uppercase text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
        aria-label="Moderation menu"
      >
        mod
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-white/10 bg-[#0a0a0d] py-1 shadow-xl">
          {punitive.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              disabled={busy}
              onClick={() => void act(type)}
              className="block w-full px-3 py-1.5 text-left text-[11px] text-rose-200/90 hover:bg-white/5 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          <div className="my-1 border-t border-white/10" />
          {restorative.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              disabled={busy}
              onClick={() => void act(type)}
              className="block w-full px-3 py-1.5 text-left text-[11px] text-emerald-200/90 hover:bg-white/5 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          {error ? <p className="px-3 py-1 text-[10px] text-rose-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
