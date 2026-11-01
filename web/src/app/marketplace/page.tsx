import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarketplaceBrowse } from "@/components/marketplace/MarketplaceBrowse";
import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";
import { buildIndexablePageMetadata } from "@/lib/site-seo";
import {
  loadMarketplaceInitialPage,
  marketplacePagePath,
  parseMarketplacePageParam,
} from "@/lib/marketplace-browse-ssr";

// Listings change constantly; render per request so the server-built grid (what Google reads) is current.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parseMarketplacePageParam((await searchParams).page);
  return buildIndexablePageMetadata({
    title: page > 1 ? `Marketplace — Page ${page} — Get Vaulted` : "Marketplace — Get Vaulted",
    description:
      "Browse verified listings, grails, slabs, and collector drops. Fixed-price collectibles separate from live streams.",
    // Each numbered page is its own canonical URL, so every page of listings can be indexed.
    path: marketplacePagePath("All", page),
  });
}

export default async function MarketplacePage({ searchParams }: Props) {
  const page = parseMarketplacePageParam((await searchParams).page);
  const initial = await loadMarketplaceInitialPage({ page });
  if (initial && page > 1 && page > initial.totalPages) notFound();
  return (
    <MarketplaceShell>
      <Suspense fallback={null}>
        <MarketplaceBrowse initial={initial} />
      </Suspense>
    </MarketplaceShell>
  );
}
