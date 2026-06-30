"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canonicalLiveRoomUrl,
  formatLiveRoomShareDescription,
  formatLiveRoomShareOgTitle,
} from "@/lib/live-room-share-metadata";
import { shareLiveRoomNative } from "@/lib/share-live-room-native";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";

type FollowUser = {
  userId: string;
  username: string;
  image: string | null;
};

type LiveRoomShareSheetProps = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  showTitle: string;
  hostUsername: string;
  isLive?: boolean;
  category?: string | null;
  canNotifyFollowers?: boolean;
  onToast?: (message: string) => void;
};

function socialShareUrl(platform: "x" | "facebook" | "sms", url: string, title: string, description: string): string {
  const text = encodeURIComponent(`${title}\n${description}`);
  const link = encodeURIComponent(url);
  if (platform === "x") return `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
  if (platform === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${link}`;
  return `sms:?&body=${text}%20${link}`;
}

export function LiveRoomShareSheet({
  open,
  onClose,
  roomId,
  showTitle,
  hostUsername,
  isLive = true,
  category = null,
  canNotifyFollowers = false,
  onToast,
}: LiveRoomShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);

  const publicUrl = useMemo(() => canonicalLiveRoomUrl(roomId), [roomId]);
  const shareMeta = useMemo(
    () => ({
      id: roomId,
      title: showTitle,
      category,
      sellerUsername: hostUsername,
      isLive,
    }),
    [category, hostUsername, isLive, roomId, showTitle],
  );
  const shareTitle = useMemo(() => formatLiveRoomShareOgTitle(shareMeta), [shareMeta]);
  const shareDescription = useMemo(() => formatLiveRoomShareDescription(shareMeta), [shareMeta]);

  const toast = useCallback((msg: string) => onToast?.(msg), [onToast]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setNote("");
      setBusyUserId(null);
      setNotifyBusy(false);
      return;
    }
    setLoadingFollowing(true);
    void fetch("/api/account/follows", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return { following: [] as FollowUser[] };
        const j = (await res.json()) as { following?: FollowUser[] };
        return { following: Array.isArray(j.following) ? j.following : [] };
      })
      .then((data) => setFollowing(data.following))
      .catch(() => setFollowing([]))
      .finally(() => setLoadingFollowing(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast("Link copied.");
    } catch {
      toast("Could not copy link.");
    }
  }, [publicUrl, toast]);

  const nativeShare = useCallback(async () => {
    try {
      const ok = await shareLiveRoomNative({
        roomId,
        showTitle,
        hostUsername,
        category,
        isLive,
      });
      if (ok) onClose();
      else await copyLink();
    } catch {
      /* dismissed */
    }
  }, [category, copyLink, hostUsername, isLive, onClose, roomId, showTitle]);

  const sendInApp = useCallback(
    async (params: { recipientUserIds?: string[]; notifyFollowers?: boolean }) => {
      const trimmedNote = note.trim();
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/share-in-app`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          note: trimmedNote || undefined,
        }),
      });
      let body: { sent?: number; error?: string } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        toast(typeof body.error === "string" ? body.error : "Could not share in app.");
        return;
      }
      const sent = body.sent ?? 0;
      if (sent <= 0) {
        toast("Could not deliver share.");
        return;
      }
      toast(sent === 1 ? "Shared in Get Vaulted." : `Shared with ${sent} people.`);
      onClose();
    },
    [note, onClose, roomId, toast],
  );

  const sendToUser = useCallback(
    async (user: FollowUser) => {
      if (busyUserId) return;
      setBusyUserId(user.userId);
      try {
        await sendInApp({ recipientUserIds: [user.userId] });
      } finally {
        setBusyUserId(null);
      }
    },
    [busyUserId, sendInApp],
  );

  const notifyFollowers = useCallback(async () => {
    if (!window.confirm("Send a Get Vaulted notification to everyone who follows you?")) return;
    setNotifyBusy(true);
    try {
      await sendInApp({ notifyFollowers: true });
    } finally {
      setNotifyBusy(false);
    }
  }, [sendInApp]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={SELLER_CONSOLE.shareInApp}
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/[0.08] px-5 py-4">
          <p className="font-display text-lg font-bold text-white">{SELLER_CONSOLE.shareInApp}</p>
          <p className="mt-1 truncate text-sm text-zinc-400">{showTitle}</p>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
              {SELLER_CONSOLE.sendToFollowing}
            </p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              placeholder="Add a note (optional)"
              className="mb-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
            {loadingFollowing ? (
              <p className="py-3 text-sm text-zinc-500">Loading people you follow…</p>
            ) : following.length === 0 ? (
              <p className="text-sm leading-relaxed text-zinc-500">Follow sellers to share shows with them here.</p>
            ) : (
              <ul className="max-h-44 overflow-y-auto rounded-xl border border-white/10">
                {following.map((user) => (
                  <li key={user.userId} className="border-b border-white/[0.06] last:border-b-0">
                    <button
                      type="button"
                      disabled={Boolean(busyUserId) || notifyBusy}
                      onClick={() => void sendToUser(user)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.04] disabled:opacity-60"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-200">
                        {user.username.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">@{user.username}</span>
                      <span className="text-xs font-bold text-gold-bright">{busyUserId === user.userId ? "…" : "Send"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canNotifyFollowers ? (
            <button
              type="button"
              disabled={notifyBusy || Boolean(busyUserId)}
              onClick={() => void notifyFollowers()}
              className="w-full rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-left hover:bg-gold/15 disabled:opacity-60"
            >
              <span className="block text-sm font-bold text-gold-bright">{SELLER_CONSOLE.notifyMyFollowers}</span>
              <span className="mt-0.5 block text-[11px] font-medium text-zinc-500">
                Alert everyone who follows you on Get Vaulted.
              </span>
            </button>
          ) : null}

          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
              {SELLER_CONSOLE.shareOutside}
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mb-2 flex w-full items-center justify-between rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-left text-sm font-bold text-gold-bright hover:bg-gold/15"
            >
              {SELLER_CONSOLE.copyLink}
              <span className="text-xs font-semibold text-zinc-400">
                {copied ? "Copied" : publicUrl.replace(/^https?:\/\//, "")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void nativeShare()}
              className="mb-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold text-zinc-100 hover:bg-white/[0.08]"
            >
              {SELLER_CONSOLE.nativeShare}
            </button>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["X", "x"],
                  ["Facebook", "facebook"],
                  ["SMS", "sms"],
                ] as const
              ).map(([label, platform]) => (
                <a
                  key={platform}
                  href={socialShareUrl(platform, publicUrl, shareTitle, shareDescription)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-zinc-200 hover:border-white/20"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-bold text-zinc-300 hover:bg-white/[0.05]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
