"use client";

import { useCallback, useEffect, useState } from "react";
import { canModeratorPerformAction } from "@/lib/trust/live-room-moderator-permissions";
import type { LiveRoomModeratorLevel } from "@/generated/prisma/enums";

export type LiveChatUserActionTarget = {
  username: string;
  userId: string;
};

type Props = {
  liveRoomId: string;
  hostUserId?: string | null;
  isHost: boolean;
  canModerate: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
  allowedActions: string[];
  target: LiveChatUserActionTarget | null;
  onClose: () => void;
  onTag: (username: string) => void;
  onViewProfile?: (userId: string) => void;
  onModerationComplete?: () => void;
};

function canKickFromShow(args: {
  targetUserId: string;
  hostUserId?: string | null;
  isHost: boolean;
  canModerate: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
  allowedActions: string[];
}) {
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  if (args.allowedActions.length) {
    return args.allowedActions.includes("room_ban");
  }
  return canModeratorPerformAction({
    actionType: "room_ban",
    isHost: args.isHost,
    moderatorLevel: args.moderatorLevel,
  });
}

function canBanFromSeller(args: {
  targetUserId: string;
  hostUserId?: string | null;
  isHost: boolean;
  canModerate: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
  allowedActions: string[];
}) {
  if (!args.isHost) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  if (args.allowedActions.length) {
    return args.allowedActions.includes("seller_stream_ban");
  }
  return canModeratorPerformAction({
    actionType: "seller_stream_ban",
    isHost: args.isHost,
    moderatorLevel: args.moderatorLevel,
  });
}

export function LiveChatUserActionMenu({
  liveRoomId,
  hostUserId = null,
  isHost,
  canModerate,
  moderatorLevel,
  allowedActions,
  target,
  onClose,
  onTag,
  onViewProfile,
  onModerationComplete,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setError(null);
      setBusy(false);
    }
  }, [target]);

  const applyAction = useCallback(
    async (actionType: "room_ban" | "seller_stream_ban", label: string) => {
      if (!target || busy) return;
      const confirmed = window.confirm(
        actionType === "room_ban"
          ? `${target.username} will be removed and cannot return to this show.`
          : `${target.username} will be blocked from every show hosted by this seller.`,
      );
      if (!confirmed) return;

      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/moderation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            actionType,
            targetUserId: target.userId,
            reason: `${label} (@${target.username})`,
            metadata: { source: "username_menu" },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Action failed.");
          return;
        }
        onModerationComplete?.();
        onClose();
      } finally {
        setBusy(false);
      }
    },
    [busy, liveRoomId, onClose, onModerationComplete, target],
  );

  if (!target) return null;

  const showKick = canModerate
    ? canKickFromShow({
        targetUserId: target.userId,
        hostUserId,
        isHost,
        canModerate,
        moderatorLevel,
        allowedActions,
      })
    : false;
  const showBan = canModerate
    ? canBanFromSeller({
        targetUserId: target.userId,
        hostUserId,
        isHost,
        canModerate,
        moderatorLevel,
        allowedActions,
      })
    : false;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${target.username}`}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a0d] p-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3 py-2 text-sm font-semibold text-zinc-100">{target.username}</p>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
            onClick={() => {
              onTag(target.username);
              onClose();
            }}
          >
            Mention in chat
          </button>
          {onViewProfile ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
              onClick={() => {
                onViewProfile(target.userId);
                onClose();
              }}
            >
              View profile
            </button>
          ) : null}
          {showKick ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              onClick={() => void applyAction("room_ban", "Kicked from show")}
            >
              Kick from show
            </button>
          ) : null}
          {showBan ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              onClick={() => void applyAction("seller_stream_ban", "Banned from seller shows")}
            >
              Ban from all shows
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="mt-1 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-400 hover:bg-white/5 disabled:opacity-50"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        {error ? <p className="px-3 py-2 text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
