import Link from "next/link";

export type SellerProfileHeroStats = {
  followerCount: number;
  followingCount: number;
  salesOrderCount: number;
  showsHosted: number;
  isOwnShop: boolean;
};

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function StatCell({ value, label, href }: { value: string; label: string; href?: string }) {
  const inner = (
    <>
      <p className="font-mono text-xl font-black tabular-nums text-zinc-50 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="min-w-[4.5rem] rounded-xl px-2 py-1 text-center transition hover:bg-white/[0.04] hover:text-gold-bright"
      >
        {inner}
      </Link>
    );
  }
  return <div className="min-w-[4.5rem] px-2 py-1 text-center">{inner}</div>;
}

/** Four-up strip under the profile name: sales, followers, shows hosted (plus following on your own profile). */
export function SellerProfileStatsBar({ stats }: { stats: SellerProfileHeroStats }) {
  return (
    <div
      className="mt-4 flex flex-wrap items-start justify-start gap-x-6 gap-y-3 sm:gap-x-10"
      aria-label="Profile stats"
    >
      <StatCell value={formatCount(stats.salesOrderCount)} label="Sales" />
      <StatCell
        value={formatCount(stats.followerCount)}
        label="Followers"
        href={stats.isOwnShop ? "/account/following" : undefined}
      />
      {stats.isOwnShop ? (
        <StatCell value={formatCount(stats.followingCount)} label="Following" href="/account/following" />
      ) : null}
      <StatCell value={formatCount(stats.showsHosted)} label="Shows" />
    </div>
  );
}
