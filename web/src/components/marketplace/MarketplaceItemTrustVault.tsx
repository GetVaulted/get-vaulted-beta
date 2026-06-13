import type { ItemTrustMetrics } from "@/lib/marketplace-item-trust";

function TrustIcon({ kind }: { kind: "level" | "sales" | "standing" | "response" | "ship" | "auth" }) {
  const paths = {
    level: "M8 1.5l2.2 1.1 2.4-.3.6 2.3 1.9 1.5-1.9 1.5-.6 2.3-2.4-.3L8 10.5l-2.2-1.1-2.4.3-.6-2.3L1.9 5.8l1.9-1.5.6-2.3 2.4.3L8 1.5z",
    sales: "M2 12V6l6-3 6 3v6l-6 3-6-3zm6-1.2 4.5-2.25V6.55L8 8.8 3.5 6.55v2.2L8 10.8z",
    standing: "M8 2l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L6.2 6.2l4-.6L8 2z",
    response: "M8 14a6 6 0 100-12 6 6 0 000 12zm0-1.5A4.5 4.5 0 118 3.5a4.5 4.5 0 010 9zM7.25 5h1.5v3.25l2.5 1.5-.75 1.25-2.75-1.65V5z",
    ship: "M2 11h1v1.5h1V11h8v1.5h1V11h1l-1.5-5H3.5L2 11zm2.2-3.5h7.6l.75 2.5H3.45l.75-2.5z",
    auth: "M8 1.5 3 3.75v4.5c0 3.1 2.1 5.5 5 6.75 2.9-1.25 5-3.65 5-6.75v-4.5L8 1.5zm3.2 4.35L7.1 9.75 5.8 8.45l.95-.95 1.35 1.35 2.85-2.85.95.95z",
  };
  return (
    <svg className="size-5 text-gold-bright/90" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d={paths[kind]} />
    </svg>
  );
}

function TrustStat({
  icon,
  label,
  value,
}: {
  icon: "level" | "sales" | "standing" | "response" | "ship" | "auth";
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-3 text-center">
      <TrustIcon kind={icon} />
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-bold leading-tight text-zinc-50 sm:text-[15px]">{value}</p>
    </div>
  );
}

export function MarketplaceItemTrustVault({ metrics }: { metrics: ItemTrustMetrics }) {
  return (
    <section
      aria-label="Seller trust"
      className="rounded-xl border border-white/[0.07] bg-[#101014] px-2 py-1 sm:px-3"
    >
      <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
        <div className="col-span-3 grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.06]">
          <TrustStat icon="level" label="Seller level" value={metrics.sellerLevel ?? "Vault seller"} />
          <TrustStat icon="sales" label="Completed sales" value={metrics.completedSales} />
          <TrustStat icon="standing" label="Standing" value={metrics.accountStanding} />
        </div>
        <div className="col-span-3 grid grid-cols-3 divide-x divide-white/[0.06]">
          <TrustStat icon="response" label="Response time" value={metrics.responseTime} />
          <TrustStat icon="ship" label="Ship on time" value={metrics.shipPerformance.replace(" on time", "")} />
          <TrustStat icon="auth" label="Authentication" value={metrics.authenticationStatus} />
        </div>
      </div>
    </section>
  );
}
