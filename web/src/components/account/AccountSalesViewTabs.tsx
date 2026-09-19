"use client";

import Link from "next/link";

export type SalesViewTab = "ship" | "all" | "live" | "layaways";

type Props = {
  active: SalesViewTab;
};

const TAB_CLASS = (sel: boolean) =>
  `rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
    sel
      ? "bg-gold/14 text-gold-bright"
      : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
  }`;

/**
 * Page-local Sales view switcher. Rendered as a compact segmented control so
 * it reads as subordinate to the seller nav above it, not a second full-width
 * tab bar competing with it — the caller places it (e.g. beside the page
 * title) rather than this component claiming its own row.
 */
export function AccountSalesViewTabs({ active }: Props) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1"
      role="tablist"
      aria-label="Sales views"
    >
      <Link href="/account/sales" role="tab" aria-selected={active === "ship"} className={TAB_CLASS(active === "ship")}>
        Shipping queue
      </Link>
      <Link
        href="/account/sales?view=all"
        role="tab"
        aria-selected={active === "all"}
        className={TAB_CLASS(active === "all")}
      >
        All orders
      </Link>
      <Link
        href="/account/sales?view=live"
        role="tab"
        aria-selected={active === "live"}
        className={TAB_CLASS(active === "live")}
      >
        Live shows
      </Link>
      <Link
        href="/account/sales/layaways"
        role="tab"
        aria-selected={active === "layaways"}
        className={TAB_CLASS(active === "layaways")}
      >
        Layaways
      </Link>
    </div>
  );
}
