import type { Metadata } from "next";
import { MarketplaceBrowse } from "@/components/marketplace/MarketplaceBrowse";

export const metadata: Metadata = {
  title: "Marketplace — Get Vaulted",
  description:
    "Browse verified listings, grails, slabs, and collector drops. Fixed-price collectibles separate from live streams.",
};

export default function MarketplacePage() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[#030303]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-[min(520px,62vh)] bg-[radial-gradient(ellipse_90%_70%_at_50%_-15%,rgba(201,162,39,0.11),transparent_58%)]" />
        <div className="absolute inset-y-0 left-0 w-[min(28vw,420px)] bg-[radial-gradient(ellipse_80%_60%_at_0%_30%,rgba(201,162,39,0.05),transparent_70%)]" />
        <div className="absolute inset-y-0 right-0 w-[min(24vw,360px)] bg-[radial-gradient(ellipse_70%_50%_at_100%_40%,rgba(100,120,160,0.06),transparent_72%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/80 to-transparent" />
      </div>
      <div className="relative">
        <MarketplaceBrowse />
      </div>
    </main>
  );
}
