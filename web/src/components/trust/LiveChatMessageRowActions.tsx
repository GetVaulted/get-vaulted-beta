"use client";

import { useState } from "react";
import { LiveModeratorMenu } from "@/components/trust/LiveModeratorMenu";
import { ReportModal } from "@/components/trust/ReportModal";

type Props = {
  liveRoomId: string;
  messageId: string;
  senderId: string;
  senderUsername: string;
  hostUserId?: string | null;
  canModerate: boolean;
  reportable?: boolean;
  onModerationComplete?: () => void;
};

export function LiveChatMessageRowActions({
  liveRoomId,
  messageId,
  senderId,
  senderUsername,
  hostUserId = null,
  canModerate,
  reportable = true,
  onModerationComplete,
}: Props) {
  const [reportOpen, setReportOpen] = useState(false);

  if (!reportable && !canModerate) return null;
  const hostProtected = Boolean(hostUserId && senderId === hostUserId);

  return (
    <span className="ml-1 inline-flex items-center gap-0.5 align-middle opacity-0 transition group-hover:opacity-100 [.chat-msg-row:hover_&]:opacity-100">
      {reportable ? (
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="rounded px-1 text-[9px] font-bold uppercase text-zinc-500 hover:bg-white/10 hover:text-rose-300"
          aria-label="Report message"
        >
          report
        </button>
      ) : null}
      {canModerate && !hostProtected ? (
        <LiveModeratorMenu
          roomId={liveRoomId}
          targetUserId={senderId}
          targetUsername={senderUsername}
          targetMessageId={messageId}
          hostUserId={hostUserId}
          canModerate={canModerate}
          onActionComplete={onModerationComplete}
        />
      ) : null}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="message"
        targetId={messageId}
        liveRoomId={liveRoomId}
        label="Report message"
      />
    </span>
  );
}
