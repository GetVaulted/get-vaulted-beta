"use client";

import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import type { LiveChatUserActionTarget } from "@/components/trust/LiveChatUserActionMenu";

type Props = {
  label: string;
  className: string;
  message: LiveRoomMessageDTO;
  onOpen?: (target: LiveChatUserActionTarget) => void;
};

export function LiveChatUsernameButton({ label, className, message, onOpen }: Props) {
  if (message.messageType === "chat" && message.senderId && message.senderUsername && onOpen) {
    return (
      <button
        type="button"
        className={`${className} cursor-pointer hover:underline`}
        onClick={() =>
          onOpen({
            userId: message.senderId,
            username: message.senderUsername ?? label,
          })
        }
      >
        {label}
      </button>
    );
  }
  return <span className={className}>{label}</span>;
}
