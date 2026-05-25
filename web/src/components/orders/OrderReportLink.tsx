"use client";

import { ReportTrigger } from "@/components/trust/ReportModal";

export function OrderReportLink({ orderId }: { orderId: string }) {
  return (
    <ReportTrigger
      targetType="order"
      targetId={orderId}
      className="text-[11px] font-semibold text-zinc-500 underline-offset-2 hover:text-rose-300 hover:underline"
    >
      Report order issue
    </ReportTrigger>
  );
}
