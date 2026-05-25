import { FeaturedMarketplaceSection } from "@/components/sections/FeaturedMarketplaceSection";
import { Hero } from "@/components/sections/Hero";
import { HomeFirstLoginSellerBanner } from "@/components/sections/HomeFirstLoginSellerBanner";
import { HomeStartSellingSection } from "@/components/sections/HomeStartSellingSection";
import { LiveNowSection } from "@/components/sections/LiveNowSection";
import { TrustedBySection } from "@/components/sections/TrustedBySection";
import { UpcomingBreaksSection } from "@/components/sections/UpcomingBreaksSection";
import { isLiveMarketplacePubliclyAvailable } from "@/lib/live-coming-soon";

export default function Home() {
  const liveMarketplaceEnabled = isLiveMarketplacePubliclyAvailable();

  return (
    <main className="flex-1">
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
