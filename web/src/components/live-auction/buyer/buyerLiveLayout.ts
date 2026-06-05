/** Mobile / tablet stacked buyer layout (below 1280px). */
export const BUYER_LIVE_PAGE_GRID =
  "grid min-h-0 flex-1 gap-2 min-[1280px]:h-full min-[1280px]:min-h-0 min-[1280px]:grid-cols-1";

export const BUYER_LIVE_MAIN_SECTION =
  "min-w-0 space-y-2 min-[1280px]:grid min-[1280px]:h-full min-[1280px]:min-h-0 min-[1280px]:grid-rows-[minmax(0,1fr)_auto] min-[1280px]:gap-2 min-[1280px]:space-y-0";

/** Desktop buyer shell: 20% chat · 60% stage · 20% lineup */
export const BUYER_LIVE_DESKTOP_GRID =
  "grid h-full min-h-0 w-full max-w-[1920px] grid-cols-[minmax(0,20%)_minmax(0,60%)_minmax(0,20%)] gap-2 px-2 py-2 md:gap-2 md:px-3 md:py-2";

export const BUYER_LIVE_DESKTOP_COL =
  "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/80";
