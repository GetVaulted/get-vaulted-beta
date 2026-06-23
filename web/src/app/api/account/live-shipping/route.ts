import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCompleteSellerShipFrom } from "@/lib/seller-shipping-readiness";
import { isShippoConfigured, probeShippoApi, shippoTokenKind } from "@/lib/shippo";
import { getSellerLiveShippingDashboard } from "@/services/account/seller-live-shipping-dashboard";
import { processAuctionPaymentExpiries } from "@/services/payments";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await processAuctionPaymentExpiries();

  const [data, seller, shippoProbe] = await Promise.all([
    getSellerLiveShippingDashboard(session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        shipFromStreet: true,
        shipFromCity: true,
        shipFromState: true,
        shipFromZip: true,
        shipFromCountry: true,
        defaultShipFromAddressId: true,
        defaultShipFromAddress: {
          select: { line1: true, city: true, state: true, postalCode: true, country: true },
        },
      },
    }),
    probeShippoApi(),
  ]);

  return NextResponse.json({
    ...data,
    labelSetup: {
      shippoTokenPresent: isShippoConfigured(),
      shippoTokenKind: shippoTokenKind(),
      shippoApiOk: shippoProbe.ok,
      shippoApiError: shippoProbe.ok ? null : shippoProbe.error,
      shipFromComplete: seller ? hasCompleteSellerShipFrom(seller) : false,
    },
  });
}
