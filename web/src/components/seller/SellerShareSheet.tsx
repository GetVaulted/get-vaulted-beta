"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatLiveRoomShareDescription,
  formatLiveRoomShareOgTitle,
  formatLiveRoomShareText,
} from "@/lib/live-room-share-metadata";
import { sellerProfilePath } from "@/lib/seller-profile-url";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";

type SellerShareSheetProps = {
  open: boolean;
  onClose: () => void;
  publicUrl: string;
  showTitle: string;
  hostUsername?: string;
  onToast?: (message: string) => void;
};

function socialShareUrl(platform: "x" | "facebook" | "sms", url: string, title: string, description: string): string {
  const text = encodeURIComponent(`${title}\n${description}`);
  const link = encodeURIComponent(url);
  if (platform === "x") return `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
  if (platform === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${link}`;
  return `sms:?&body=${text}%20${link}`;
}

export function SellerShareSheet({ open, onClose, publicUrl, showTitle, hostUsername, onToast }: SellerShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const shareTitle = useMemo(
    () =>
      formatLiveRoomShareOgTitle({
        id: "",
        title: showTitle,
        sellerUsername: hostUsername ?? "host",
      }),
    [hostUsername, showTitle],
  );
  const shareDescription = useMemo(() => formatLiveRoomShareDescription({ title: showTitle }), [showTitle]);
  const shareText = useMemo(
    () =>
      formatLiveRoomShareText({
        hostUsername: hostUsername ?? "host",
        showTitle,
        url: publicUrl,
      }),
    [hostUsername, publicUrl, showTitle],
  );

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toast = useCallback(
    (msg: string) => {
      onToast?.(msg);
    },
    [onToast],
  );

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
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: publicUrl,
        });
        onClose();
        return;
      }
      await copyLink();
    } catch {
      /* dismissed */
    }
  }, [copyLink, onClose, publicUrl, shareText, shareTitle]);

  const inviteFollowers = useCallback(async () => {
    const handle = hostUsername?.trim();
    const profileUrl = handle
      ? `${window.location.origin}${sellerProfilePath(handle)}`
      : publicUrl;
    const inviteText = handle
      ? `Follow @${handle} on Get Vaulted for live shows, drops, and vault listings:\n${profileUrl}`
      : `Join my live show on Get Vaulted:\n${publicUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: handle ? `Follow @${handle} on Get Vaulted` : shareTitle,
          text: inviteText,
          url: profileUrl,
        });
        onClose();
        return;
      }
      await navigator.clipboard.writeText(inviteText);
      toast("Invite link copied.");
    } catch {
      /* dismissed */
    }
  }, [hostUsername, onClose, publicUrl, shareTitle, toast]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={SELLER_CONSOLE.shareShow}
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/[0.08] px-5 py-4">
          <p className="font-display text-lg font-bold text-white">{SELLER_CONSOLE.shareShow}</p>
          <p className="mt-1 truncate text-sm text-zinc-400">{showTitle}</p>
        </div>
        <div className="space-y-2 p-4">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full items-center justify-between rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-left text-sm font-bold text-gold-bright hover:bg-gold/15"
          >
            {SELLER_CONSOLE.copyLink}
            <span className="text-xs font-semibold text-zinc-400">{copied ? "Copied" : publicUrl.replace(/^https?:\/\//, "")}</span>
          </button>
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold text-zinc-100 hover:bg-white/[0.08]"
          >
            {SELLER_CONSOLE.nativeShare}
          </button>
          <div className="grid grid-cols-3 gap-2 pt-1">
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
          <button
            type="button"
            onClick={() => void inviteFollowers()}
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold text-zinc-100 hover:bg-white/[0.08]"
          >
            {SELLER_CONSOLE.inviteFollowers}
            <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-zinc-500">
              Share your seller profile so buyers can follow for live alerts.
            </span>
          </button>
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
