import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarketplaceBrowse } from "@/components/marketplace/MarketplaceBrowse";
import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";
import { buildIndexablePageMetadata } from "@/lib/site-seo";
import {
  loadMarketplaceInitialPage,
  marketplaceCategoryBySlug,
  marketplacePagePath,
  parseMarketplacePageParam,
} from "@/lib/marketplace-browse-ssr";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Crawlable category page, e.g. /marketplace/category/trading-cards — its own title, description and listings. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const cat = marketplaceCategoryBySlug(decodeURIComponent((await params).category));
  if (!cat) return {};
  const page = parseMarketplacePageParam((await searchParams).page);
  return buildIndexablePageMetadata({
    title: `${cat.category} for sale${page > 1 ? ` — Page ${page}` : ""} — Get Vaulted`,
    description: cat.description,
    path: marketplacePagePath(cat.category, page),
  });
}

export default async function MarketplaceCategoryPage({ params, searchParams }: Props) {
  const cat = marketplaceCategoryBySlug(decodeURIComponent((await params).category));
  if (!cat) notFound();
  const page = parseMarketplacePageParam((await searchParams).page);
  const initial = await loadMarketplaceInitialPage({ page, category: cat.category });
  if (initial && page > 1 && page > initial.totalPages) notFound();
  return (
    <MarketplaceShell>
      <Suspense fallback={null}>
        <MarketplaceBrowse initial={initial} />
      </Suspense>
    </MarketplaceShell>
  );
}
