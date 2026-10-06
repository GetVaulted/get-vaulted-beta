import type { PublicSellerReview } from "@/lib/seller-review-queries";
import type { ReviewSummary } from "@/lib/seller-reviews";

function Stars({ rating, size = "text-sm" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} leading-none text-gold-bright`} role="img" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-zinc-700">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function SellerReviewsSection({
  summary,
  reviews,
}: {
  summary: ReviewSummary;
  reviews: PublicSellerReview[];
}) {
  return (
    <section aria-label="Buyer reviews">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-black tracking-tight text-foreground">Reviews</h2>
        {summary.count > 0 ? (
          <span className="text-xs text-zinc-500">
            {summary.average?.toFixed(1)} average · {summary.count.toLocaleString("en-US")} verified buyer
            {summary.count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {summary.count === 0 ? (
        <p className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-sm text-zinc-500">
          No reviews yet. Buyers can review a seller after their order is delivered.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
            <div>
              <p className="font-mono text-4xl font-black tabular-nums text-zinc-50">{summary.average?.toFixed(1)}</p>
              <Stars rating={Math.round(summary.average ?? 0)} size="text-base" />
              <p className="mt-1 text-xs text-zinc-500">{summary.count.toLocaleString("en-US")} reviews</p>
            </div>
            <ul className="space-y-1.5" aria-label="Rating breakdown">
              {summary.distribution.map((n, i) => {
                const stars = 5 - i;
                const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
                return (
                  <li key={stars} className="flex items-center gap-3 text-xs text-zinc-400">
                    <span className="w-9 shrink-0 tabular-nums">{stars} star</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <span className="block h-full rounded-full bg-gold/70" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-7 shrink-0 text-right tabular-nums text-zinc-500">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <ul className="mt-3 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars rating={r.rating} />
                  <span className="text-xs font-semibold text-zinc-300">@{r.buyer.username}</span>
                  <span className="text-xs text-zinc-600">
                    {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {r.body ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-300">{r.body}</p> : null}
                {r.tags.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <li key={t} className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-zinc-400">
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {r.itemTitle ? <p className="mt-2 truncate text-[11px] text-zinc-600">Purchased: {r.itemTitle}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
