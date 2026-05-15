import { FeaturedMarketplaceSection } from "@/components/sections/FeaturedMarketplaceSection";
import { Hero } from "@/components/sections/Hero";
import { LiveNowSection } from "@/components/sections/LiveNowSection";
import { TrustedBySection } from "@/components/sections/TrustedBySection";
import { UpcomingBreaksSection } from "@/components/sections/UpcomingBreaksSection";
import { isLiveMarketplacePubliclyAvailable } from "@/lib/live-coming-soon";

export default function Home() {
  const liveMarketplaceEnabled = isLiveMarketplacePubliclyAvailable();

  return (
    <main className="flex-1">
      <Hero liveMarketplaceEnabled={liveMarketplaceEnabled} />
      <LiveNowSection />
      <FeaturedMarketplaceSection />
      <UpcomingBreaksSection />
      <TrustedBySection />
    </main>
  );
}
