import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import { validateAddressCreateInput, type AddressInput } from "@/lib/address-book";
import { verifyAddressCreateData } from "@/lib/apply-address-verification";
import { ensureBuyerShippingFromSellerShipFrom } from "@/lib/ensure-buyer-shipping-from-seller-ship-from";
import { syncBuyerWalletShippingToOpenOrders } from "@/lib/live-buy-now-purchase";

async function enrichShippingAddressForLabels<T extends { type: string; email: string | null }>(
  userId: string,
  data: T,
): Promise<T> {
  if (data.type !== "shipping") return data;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return {
    ...data,
    email: data.email ?? user?.email ?? null,
  };
}

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;
  await ensureBuyerShippingFromSellerShipFrom(auth.userId);
  const addresses = await prisma.address.findMany({
    where: { userId: auth.userId },
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ addresses });
}

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;
  let body: AddressInput;
  try {
    body = (await req.json()) as AddressInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = validateAddressCreateInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const verified = await verifyAddressCreateData(parsed.data);
  if (!verified.ok) {
    return NextResponse.json(verified.body, { status: verified.status });
  }
  const data = await enrichShippingAddressForLabels(auth.userId, verified.data);
  const address = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.address.updateMany({
        where: { userId: auth.userId, type: data.type, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: {
        userId: auth.userId,
        ...data,
      },
    });
  });
  let syncedOpenOrders = 0;
  if (data.type === "shipping") {
    try {
      const sync = await syncBuyerWalletShippingToOpenOrders(auth.userId);
      syncedOpenOrders = sync.updatedOrderIds.length;
    } catch (e) {
      console.error("[api/account/addresses POST] sync open order shipping", e);
    }
  }
  return NextResponse.json(
    {
      address,
      verified: data.isVerified,
      corrected: verified.corrected,
      syncedOpenOrders,
    },
    { status: 201 },
  );
}
