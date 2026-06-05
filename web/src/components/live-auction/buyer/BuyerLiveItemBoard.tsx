"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BuyerLiveDesktopCommerce } from "@/components/live-auction/buyer/BuyerLiveDesktopCommerce";
import { BuyerLiveLineupPanel, type BuyerLiveLineupRow } from "@/components/live-auction/buyer/BuyerLiveLineupPanel";

export type BuyerLiveItemBoardProps = {
  /** Active lot, bid controls, and waiting states. */
  commerce: ReactNode | null;
  items: BuyerLiveLineupRow[];
  selectedId: string;
  shopHref?: string | null;
  onSelect: (id: string) => void;
  actions?: ReactNode;
};

/** Desktop buyer right column (20%): actions, active item commerce, scrollable queue. */
export function BuyerLiveItemBoard({
  commerce,
  items,
  selectedId,
  shopHref,
  onSelect,
  actions,
}: BuyerLiveItemBoardProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Item board</p>
          <p className="text-[11px] font-semibold text-zinc-300">{items.length} in lineup</p>
        </div>
        {shopHref ? (
          <Link href={shopHref} className="text-[10px] font-semibold text-gold-bright hover:underline">
            Shop →
          </Link>
        ) : null}
      </div>

      {actions ? <div className="shrink-0 border-b border-zinc-800/80 px-2 py-2">{actions}</div> : null}

      {commerce ? (
        <div className="shrink-0 border-b border-zinc-800/80 p-2">
          <BuyerLiveDesktopCommerce>{commerce}</BuyerLiveDesktopCommerce>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <BuyerLiveLineupPanel
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
          hideHeader
        />
      </div>
    </div>
  );
}
