"use client";

import { ReportTrigger } from "@/components/trust/ReportModal";

export function LiveRoomReportLink({ roomId, className }: { roomId: string; className?: string }) {
  return (
    <ReportTrigger
      targetType="live_room"
      targetId={roomId}
      liveRoomId={roomId}
      className={className ?? "text-[10px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-rose-300"}
    >
      Report show
    </ReportTrigger>
  );
}

export function ListingReportLink({ listingId, className }: { listingId: string; className?: string }) {
  return (
    <ReportTrigger
      targetType="listing"
      targetId={listingId}
      className={className ?? "text-[11px] font-semibold text-zinc-500 hover:text-rose-300"}
    >
      Report listing
    </ReportTrigger>
  );
}

export function UserReportLink({
  userId,
  label = "Report user",
  className,
}: {
  userId: string;
  label?: string;
  className?: string;
}) {
  return (
    <ReportTrigger
      targetType="user"
      targetId={userId}
      className={className ?? "text-[11px] font-semibold text-zinc-500 hover:text-rose-300"}
    >
      {label}
    </ReportTrigger>
  );
}
