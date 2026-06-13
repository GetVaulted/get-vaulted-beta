import type { ItemTrustMetrics } from "@/lib/marketplace-item-trust";

function TrustStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 px-3 py-3 sm:px-4 sm:py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold leading-snug sm:text-[15px] ${
          highlight ? "text-gold-bright" : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function MarketplaceItemTrustVault({ metrics }: { metrics: ItemTrustMetrics }) {
  return (
    <section aria-label="Seller trust" className="rounded-2xl border border-gold/15 bg-gold/[0.04] p-4 sm:p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/80">Trust vault</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-3">
        <TrustStat label="Seller level" value={metrics.sellerLevel ?? "Vault seller"} highlight />
        <TrustStat label="Completed sales" value={metrics.completedSales} />
        <TrustStat label="Account standing" value={metrics.accountStanding} />
        <TrustStat label="Response time" value={metrics.responseTime} />
        <TrustStat label="Ship performance" value={metrics.shipPerformance} />
        <TrustStat label="Authentication" value={metrics.authenticationStatus} />
      </div>
    </section>
  );
}
