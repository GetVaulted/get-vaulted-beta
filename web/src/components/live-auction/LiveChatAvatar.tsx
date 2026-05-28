"use client";

import { useState } from "react";
import { liveChatUsernameInitial } from "@/lib/live-chat-avatar";

type LiveChatAvatarProps = {
  username: string;
  avatarUrl?: string | null;
  /** Desktop default 28px; overlay compact uses 24px. */
  size?: 24 | 28 | 30 | 32;
  isHost?: boolean;
  isModerator?: boolean;
  className?: string;
};

export function LiveChatAvatar({
  username,
  avatarUrl,
  size = 28,
  isHost = false,
  isModerator = false,
  className = "",
}: LiveChatAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = avatarUrl?.trim();
  const showImage = Boolean(src) && !imgFailed;
  const initial = liveChatUsernameInitial(username);

  const ringClass = isHost
    ? "ring-1 ring-amber-400/55"
    : isModerator
      ? "ring-1 ring-violet-400/45"
      : "ring-1 ring-white/10";

  const baseClass = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800/90 ${ringClass} ${className}`;

  if (showImage && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`${baseClass} object-cover`}
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${baseClass} font-display font-black text-amber-200/90`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
