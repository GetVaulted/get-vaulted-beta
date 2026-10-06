import Link from "next/link";
import type { SellerLevel } from "@/generated/prisma/enums";
import { profileLinkDisplay, type ProfileLinkKey } from "@/lib/seller-profile-fields";
import type { ProfileShow, ProfileTrust } from "@/lib/seller-profile-public";
import type { ReviewSummary } from "@/lib/seller-reviews";

const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

function showDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", dateFmt);
}

function showDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { ...dateFmt, hour: "numeric", minute: "2-digit" });
}

export function SellerBanner({ url }: { url: string | null }) {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0d11] sm:h-44 lg:h-52">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className="h-full w-full bg-[radial-gradient(ellipse_70%_120%_at_20%_0%,rgba(201,162,39,0.14),transparent_60%)]"
          aria-hidden
        />
      )}
    </div>
  );
}

const SELLER_LEVEL_TONE: Partial<Record<SellerLevel, string>> = {
  elite_vault_verified: "border-gold/50 bg-gold/20 text-gold-bright",
};

export function SellerBadges({ trust }: { trust: ProfileTrust }) {
  const tone = SELLER_LEVEL_TONE[trust.sellerLevel] ?? "border-gold/30 bg-gold/10 text-gold-bright";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tone}`}
      >
        {trust.sellerLevelLabel}
      </span>
      {trust.emailVerified ? (
        <span className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200">
          Verified
        </span>
      ) : null}
    </div>
  );
}

export function SellerBio({ bio }: { bio: string | null }) {
  if (!bio) return null;
  return <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-zinc-300">{bio}</p>;
}

export function SellerLinks({ links }: { links: { key: ProfileLinkKey; label: string; url: string }[] }) {
  if (!links.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Seller links">
      {links.map((l) => (
        <li key={l.key}>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.1] px-3 text-xs font-medium text-zinc-300 transition hover:border-gold/35 hover:text-gold-bright"
          >
            <span className="text-zinc-500">{l.label}</span>
            <span>{profileLinkDisplay(l.key, l.url)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ShowThumb({ show }: { show: ProfileShow }) {
  return (
    <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#121218]">
      {show.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={show.thumbnailUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-zinc-600" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="M16 10l5-3v10l-5-3" />
          </svg>
        </span>
      )}
    </div>
  );
}

/** Live now / Next show / Last live — whichever applies, in that order of importance. */
export function SellerShowCard({
  liveNow,
  nextShow,
  lastLive,
}: {
  liveNow: ProfileShow | null;
  nextShow: ProfileShow | null;
  lastLive: ProfileShow | null;
}) {
  const show = liveNow ?? nextShow ?? lastLive;
  if (!show) return null;
  const kicker = liveNow
    ? "Live now"
    : nextShow
      ? `Next show · ${showDateTime(nextShow.scheduledStartAt)}`
      : `Last live · ${showDate(lastLive?.endedAt ?? lastLive?.startedAt ?? null)}`;
  return (
    <Link
      href={`/live/${encodeURIComponent(show.id)}`}
      className={`group flex items-center gap-3 rounded-2xl border p-4 transition ${
        liveNow
          ? "border-rose-500/40 bg-rose-500/[0.07] hover:border-rose-400/60"
          : "border-white/[0.08] bg-white/[0.02] hover:border-gold/30"
      }`}
    >
      <ShowThumb show={show} />
      <div className="min-w-0">
        <p
          className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${
            liveNow ? "text-rose-200" : "text-zinc-500"
          }`}
        >
          {liveNow ? <span className="size-1.5 animate-pulse rounded-full bg-rose-400" aria-hidden /> : null}
          {kicker}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-zinc-100 group-hover:text-gold-bright">{show.title}</p>
        <p className="truncate text-xs text-zinc-500">{show.category}</p>
      </div>
    </Link>
  );
}

export function SellerTrustCard({ trust, reviews }: { trust: ProfileTrust; reviews: ReviewSummary }) {
  const rows: { label: string; value: string }[] = [
    { label: "Seller level", value: trust.sellerLevelLabel },
    { label: "Items sold", value: trust.ordersCompleted.toLocaleString("en-US") },
    {
      label: "Member since",
      value: new Date(trust.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    },
    { label: "Email", value: trust.emailVerified ? "Verified" : "Not verified" },
    {
      label: "Buyer reviews",
      value:
        reviews.count > 0
          ? `${reviews.average?.toFixed(1)} ★ (${reviews.count.toLocaleString("en-US")})`
          : "None yet",
    },
  ];
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4" aria-label="Trust and credentials">
      <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Trust</h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{trust.sellerLevelDescription}</p>
      <dl className="mt-3 divide-y divide-white/[0.06]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="text-zinc-500">{r.label}</dt>
            <dd className="font-medium text-zinc-100">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SellerRecentShows({ shows, totalShows }: { shows: ProfileShow[]; totalShows: number }) {
  if (!shows.length) return null;
  return (
    <section aria-label="Recent shows">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl font-black tracking-tight text-foreground">Recent shows</h2>
        <span className="text-xs text-zinc-500">{totalShows.toLocaleString("en-US")} hosted</span>
      </div>
      <ul className="mt-3 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4">
        {shows.map((s) => (
          <li key={s.id}>
            <Link
              href={`/live/${encodeURIComponent(s.id)}`}
              className="flex items-center justify-between gap-4 py-3 text-sm transition hover:text-gold-bright"
            >
              <span className="min-w-0 truncate font-semibold text-zinc-100">{s.title}</span>
              <span className="shrink-0 text-xs text-zinc-500">
                {s.category} · {showDate(s.endedAt ?? s.startedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
