import Link from "next/link";
import type { SellerLevel } from "@/generated/prisma/enums";
import { SELLER_LEVEL_DESCRIPTIONS, sellerLevelLabel } from "@/services/payout/seller-level";

export type SellerProfileHeroStats = {
  followerCount: number;
  followingCount: number;
  salesOrderCount: number;
  activeListingsCount: number;
  sellerLevel: SellerLevel;
  memberSince: Date;
  isOwnShop: boolean;
};

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function StatCell({
  value,
  label,
  hint,
  href,
}: {
  value: string;
  label: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="font-mono text-xl font-black tabular-nums text-zinc-50 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p> : null}
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

export function SellerProfileStatsBar({ stats }: { stats: SellerProfileHeroStats }) {
  const levelLabel = sellerLevelLabel(stats.sellerLevel);
  const levelDescription = SELLER_LEVEL_DESCRIPTIONS[stats.sellerLevel];

  return (
    <div className="mt-4 space-y-4">
      <div
        className="flex flex-wrap items-start justify-start gap-x-6 gap-y-3 sm:gap-x-10"
        aria-label="Profile stats"
      >
        <StatCell
          value={formatCount(stats.followerCount)}
          label="Followers"
          href={stats.isOwnShop ? "/account/following" : undefined}
        />
        {stats.isOwnShop ? (
          <StatCell
            value={formatCount(stats.followingCount)}
            label="Following"
            href="/account/following"
          />
        ) : null}
        <StatCell value={formatCount(stats.salesOrderCount)} label="Sales" />
        <StatCell value="—" label="Rating" hint="Reviews soon" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-bold uppercase tracking-wide text-gold-bright">
          {levelLabel}
        </span>
        <span className="text-zinc-500">
          {stats.activeListingsCount} active listing{stats.activeListingsCount === 1 ? "" : "s"}
        </span>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-500">
          Member since {stats.memberSince.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        </span>
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{levelDescription}</p>
    </div>
  );
}
