import { FeaturedMarketplaceSection } from "@/components/sections/FeaturedMarketplaceSection";
import { Hero } from "@/components/sections/Hero";
import { HomeFirstLoginSellerBanner } from "@/components/sections/HomeFirstLoginSellerBanner";
import { HomeStartSellingSection } from "@/components/sections/HomeStartSellingSection";
import { LiveNowSection } from "@/components/sections/LiveNowSection";
import { TrustedBySection } from "@/components/sections/TrustedBySection";
import { UpcomingBreaksSection } from "@/components/sections/UpcomingBreaksSection";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { isLiveMarketplacePubliclyAvailable } from "@/lib/live-coming-soon";
import { buildIndexablePageMetadata, buildWebSiteJsonLd } from "@/lib/site-seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildIndexablePageMetadata({
  title: "Get Vaulted — Buy, Sell & Collect Premium Cards & Memorabilia",
  description:
    "Live breaks, auctions, and trusted seller shops for sports cards, memorabilia, sneakers, watches, and collectibles.",
  path: "/",
});

export default function Home() {
  const liveMarketplaceEnabled = isLiveMarketplacePubliclyAvailable();

  return (
    <main className="flex-1">
      <JsonLdScript data={buildWebSiteJsonLd()} />
      <Hero liveMarketplaceEnabled={liveMarketplaceEnabled} />
      <HomeFirstLoginSellerBanner />
      <LiveNowSection />
      <FeaturedMarketplaceSection />
      <HomeStartSellingSection />
      <UpcomingBreaksSection />
      <TrustedBySection />
    </main>
  );
}
