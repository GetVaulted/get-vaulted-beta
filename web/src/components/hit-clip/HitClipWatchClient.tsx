"use client";

import { useCallback, useState } from "react";

type Props = {
  clipId: string;
  title: string;
  clipUrl: string | null;
  thumbnailUrl: string;
  shareUrl: string;
  shareCaption: string;
};

export function HitClipWatchClient({
  clipId,
  title,
  clipUrl,
  thumbnailUrl,
  shareUrl,
  shareCaption,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const bumpShare = useCallback(() => {
    void fetch(`/api/hit-clips/${encodeURIComponent(clipId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incrementShareCount: true }),
    }).catch(() => undefined);
  }, [clipId]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareCaption);
      setCopied(true);
      bumpShare();
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [bumpShare, shareCaption]);

  const onShare = useCallback(async () => {
    setSharing(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title,
          text: shareCaption,
          url: shareUrl,
        });
        bumpShare();
      } else {
        await onCopy();
      }
    } catch {
      /* cancelled */
    } finally {
      setSharing(false);
    }
  }, [bumpShare, onCopy, shareCaption, shareUrl, title]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
      {clipUrl ? (
        <video
          className="aspect-[9/16] w-full bg-black object-contain"
          src={clipUrl}
          poster={thumbnailUrl || undefined}
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <div
          className="flex aspect-[9/16] w-full items-end bg-cover bg-center p-4"
          style={
            thumbnailUrl
              ? { backgroundImage: `linear-gradient(to top,rgba(0,0,0,.75),transparent),url(${thumbnailUrl})` }
              : { background: "linear-gradient(135deg,#1a1a1a,#333)" }
          }
        >
          <p className="text-sm text-white/80">Video is still processing — share the link for now.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => void onShare()}
          disabled={sharing}
          className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-60"
        >
          Share to TikTok
        </button>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/90 hover:bg-white/5"
        >
          {copied ? "Copied" : "Copy caption"}
        </button>
      </div>
    </div>
  );
}
