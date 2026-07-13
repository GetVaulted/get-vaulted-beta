"use client";

import Link from "next/link";

export type SalesViewTab = "ship" | "all" | "live" | "layaways";

type Props = {
  active: SalesViewTab;
};

const TAB_CLASS = (sel: boolean) =>
  `rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
    sel
      ? "border-gold/45 bg-gold/12 text-gold-bright"
      : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
  }`;

/** Page-local Sales tools — distinct from the seller account strip. */
export function AccountSalesViewTabs({ active }: Props) {
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Sales views">
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
