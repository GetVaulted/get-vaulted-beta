import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SellerListingStudio } from "@/components/seller/SellerListingStudio";
import { getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage listing — Vault Seller Studio",
  description: "Seller listing management console on Get Vaulted.",
};

export default async function SellerListingManagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  const { id: raw } = await params;
  const listingId = decodeURIComponent(raw ?? "");

  if (!session?.user?.id) {
    redirect(`/signin?returnTo=${encodeURIComponent(`/seller/listings/${encodeURIComponent(listingId)}`)}`);
  }

  const row = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { sellerId: true, title: true },
  });

  if (!row || row.sellerId !== session.user.id) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[#030303]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <p className="font-display text-xl font-bold text-foreground">Listing not found</p>
          <p className="mt-2 text-sm text-zinc-500">This listing does not exist or is not in your seller account.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      <SellerListingStudio listingId={listingId} />
    </main>
  );
}
