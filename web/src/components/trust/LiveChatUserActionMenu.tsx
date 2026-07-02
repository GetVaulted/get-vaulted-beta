"use client";

import { useCallback, useEffect, useState } from "react";
import { canModeratorPerformAction } from "@/lib/trust/live-room-moderator-permissions";
import type { LiveRoomModeratorLevel } from "@/generated/prisma/enums";

export type LiveChatUserActionTarget = {
  username: string;
  userId: string;
};

type ModerationActionType =
  | "kick"
  | "unkick"
  | "room_ban"
  | "unban"
  | "seller_stream_ban"
  | "seller_stream_unban";

type Props = {
  liveRoomId: string;
  hostUserId?: string | null;
  isHost: boolean;
  isModerator?: boolean;
  canModerate: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
  allowedActions: string[];
  target: LiveChatUserActionTarget | null;
  onClose: () => void;
  onTag: (username: string) => void;
  onViewProfile?: (userId: string) => void;
  onModerationComplete?: () => void;
};

function canPerformUserModAction(args: {
  actionType: ModerationActionType;
  targetUserId: string;
  hostUserId?: string | null;
  isHost: boolean;
  isModerator?: boolean;
  canModerate: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
  allowedActions: string[];
}) {
  if (!args.canModerate) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  if (args.allowedActions.includes(args.actionType)) return true;
  return canModeratorPerformAction({
    actionType: args.actionType,
    isHost: args.isHost,
    isModerator: args.isModerator,
    moderatorLevel: args.moderatorLevel,
  });
}

function confirmModerationAction(actionType: ModerationActionType, username: string): boolean {
  switch (actionType) {
    case "kick":
      return window.confirm(`${username} will be removed from this show for several hours.`);
    case "room_ban":
      return window.confirm(`${username} will be removed and cannot return to this show.`);
    case "seller_stream_ban":
      return window.confirm(`${username} will be blocked from every show hosted by this seller.`);
    case "unkick":
      return window.confirm(`Remove kick for ${username}? They can rejoin this show immediately.`);
    case "unban":
      return window.confirm(`Remove room ban for ${username}? They can rejoin this show immediately.`);
    case "seller_stream_unban":
      return window.confirm(`Remove seller ban for ${username}? They can join this seller's shows again.`);
    default:
      return true;
  }
}

export function LiveChatUserActionMenu({
  liveRoomId,
  hostUserId = null,
  isHost,
  isModerator = false,
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
    async (actionType: ModerationActionType, label: string) => {
      if (!target || busy) return;
      if (!confirmModerationAction(actionType, target.username)) return;

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

  const modArgs = {
    targetUserId: target.userId,
    hostUserId,
    isHost,
    isModerator,
    canModerate,
    moderatorLevel,
    allowedActions,
  };

  const showKick = canPerformUserModAction({ ...modArgs, actionType: "kick" });
  const showUnkick = canPerformUserModAction({ ...modArgs, actionType: "unkick" });
  const showRoomBan = canPerformUserModAction({ ...modArgs, actionType: "room_ban" });
  const showUnban = canPerformUserModAction({ ...modArgs, actionType: "unban" });
  const showSellerBan = canPerformUserModAction({ ...modArgs, actionType: "seller_stream_ban" });
  const showSellerUnban = canPerformUserModAction({ ...modArgs, actionType: "seller_stream_unban" });

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
              onClick={() => void applyAction("kick", "Kicked from show")}
            >
              Kick from show
            </button>
          ) : null}
          {showUnkick ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
              onClick={() => void applyAction("unkick", "Kick removed")}
            >
              Remove kick
            </button>
          ) : null}
          {showRoomBan ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              onClick={() => void applyAction("room_ban", "Banned from show")}
            >
              Ban from this show
            </button>
          ) : null}
          {showUnban ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
              onClick={() => void applyAction("unban", "Room ban removed")}
            >
              Remove room ban
            </button>
          ) : null}
          {showSellerBan ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              onClick={() => void applyAction("seller_stream_ban", "Banned from seller shows")}
            >
              Ban from all shows
            </button>
          ) : null}
          {showSellerUnban ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
              onClick={() => void applyAction("seller_stream_unban", "Seller ban removed")}
            >
              Remove seller ban
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
