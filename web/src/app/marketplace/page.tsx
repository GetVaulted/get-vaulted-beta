import type { Metadata } from "next";
import { MarketplaceBrowse } from "@/components/marketplace/MarketplaceBrowse";

export const metadata: Metadata = {
  title: "Marketplace — Get Vaulted",
  description:
    "Browse verified listings, grails, slabs, and collector drops. Fixed-price collectibles separate from live streams.",
};

export default function MarketplacePage() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(420px,55vh)] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(201,162,39,0.09),transparent_55%)]"
        aria-hidden
      />
      <MarketplaceBrowse />
    </main>
  );
}
