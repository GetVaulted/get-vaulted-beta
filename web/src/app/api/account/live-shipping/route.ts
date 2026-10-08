import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import { hasCompleteSellerShipFrom, sellerNeedsShipFromPhoneOnly } from "@/lib/seller-shipping-readiness";
import { isShippoConfigured, probeShippoApi, shippoTokenKind } from "@/lib/shippo";
import { getSellerLiveShippingDashboard } from "@/services/account/seller-live-shipping-dashboard";
import { processAuctionPaymentExpiries } from "@/services/payments";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Web cookie session OR the app's Supabase bearer token (the app was getting 401 here and showing no bundles).
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const sellerId = auth.userId;

  await processAuctionPaymentExpiries();

  const [data, seller, shippoProbe] = await Promise.all([
    getSellerLiveShippingDashboard(sellerId),
    prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        shipFromStreet: true,
        shipFromCity: true,
        shipFromState: true,
        shipFromZip: true,
        shipFromCountry: true,
        defaultShipFromAddressId: true,
        defaultShipFromAddress: {
          select: { line1: true, city: true, state: true, postalCode: true, country: true, phone: true },
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
      shipFromNeedsPhoneOnly: seller ? sellerNeedsShipFromPhoneOnly(seller) : false,
    },
  });
}
