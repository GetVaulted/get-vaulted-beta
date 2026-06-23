"use client";

import { useState } from "react";
import { liveChatUsernameInitial } from "@/lib/live-chat-avatar";
import type { MentionSearchUser } from "@/lib/mentions/mention-types";

type MentionPickerStripProps = {
  users: MentionSearchUser[];
  highlightIndex: number;
  onPick: (user: MentionSearchUser) => void;
  className?: string;
};

function truncateHandle(username: string, max = 11): string {
  const label = `@${username}`;
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function MentionPickerStrip({ users, highlightIndex, onPick, className = "" }: MentionPickerStripProps) {
  if (users.length === 0) return null;

  return (
    <div
      className={`pointer-events-auto absolute bottom-full left-0 right-0 z-30 mb-2 ${className}`}
      role="listbox"
      aria-label="Mention suggestions"
    >
      <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full items-start gap-3 px-0.5">
          {users.map((user, idx) => (
            <MentionPickerStripItem
              key={user.id}
              user={user}
              highlighted={idx === highlightIndex}
              onPick={() => onPick(user)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MentionPickerStripItem({
  user,
  highlighted,
  onPick,
}: {
  user: MentionSearchUser;
  highlighted: boolean;
  onPick: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = user.image?.trim();
  const showImage = Boolean(src) && !imgFailed;

  return (
    <button
      type="button"
      role="option"
      aria-selected={highlighted}
      className={`flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 rounded-lg px-0.5 py-0.5 transition-transform duration-150 ease-out active:scale-95 ${
        highlighted ? "scale-[1.03]" : ""
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      {showImage && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={52}
          height={52}
          className="h-[52px] w-[52px] shrink-0 rounded-full object-cover ring-1 ring-white/20"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-zinc-800/90 text-base font-black text-amber-200/90 ring-1 ring-white/20"
          aria-hidden
        >
          {liveChatUsernameInitial(user.username)}
        </span>
      )}
      <span className="max-w-[4.25rem] truncate text-center text-[11px] font-semibold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
        {truncateHandle(user.username)}
      </span>
    </button>
  );
}
