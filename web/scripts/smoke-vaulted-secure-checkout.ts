/**
 * Local smoke test for Vaulted Secure Checkout (≥ $5,000 path) using Trustap **stub** mode.
 *
 * From repo root (after `npx prisma migrate deploy` and `.env` with `DATABASE_URL`):
 *   npx tsx scripts/smoke-vaulted-secure-checkout.ts
 *
 * If `TRUSTAP_USE_STUB_RESPONSE` is unset, defaults to `1` for convenience.
 * Never use stub mode in production (`NODE_ENV=production` + stub is blocked at boot and in the Trustap client).
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { createBuyNowCheckoutSession } from "../src/services/payments";
import { prisma } from "../src/lib/prisma";

const TRUSTAP_SELLER = "1-00000000-0000-4000-8000-000000000099";

async function main() {
  if (!process.env.TRUSTAP_USE_STUB_RESPONSE) {
    process.env.TRUSTAP_USE_STUB_RESPONSE = "1";
    console.log("[smoke] TRUSTAP_USE_STUB_RESPONSE unset — defaulting to 1 (stub).\n");
  }
  process.env.ESCROW_PROVIDER ??= "trustap";
  process.env.TRUSTAP_API_KEY ??= "smoke_local_dummy_key";
  process.env.TRUSTAP_API_BASE_URL ??= "https://api.trustap.com";
  process.env.NEXTAUTH_URL ??= "http://localhost:3000";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_smoke_dummy";

  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("smoke-password-123", 4);

  const seller = await prisma.user.create({
    data: {
      email: `smoke_escrow_seller_${stamp}@test.internal`,
      username: `smokeEscSeller${stamp}`,
      emailVerified: new Date(),
      passwordHash,
      stripeAccountId: "acct_smoke_test",
      stripeOnboardingComplete: true,
      trustapUserId: TRUSTAP_SELLER,
      shipFromName: "Smoke Seller",
      shipFromStreet: "1 Test St",
      shipFromCity: "Austin",
      shipFromState: "TX",
      shipFromZip: "78701",
      shipFromCountry: "US",
    },
  });

  const buyer = await prisma.user.create({
    data: {
      email: `smoke_escrow_buyer_${stamp}@test.internal`,
      username: `smokeEscBuyer${stamp}`,
      emailVerified: new Date(),
      passwordHash,
    },
  });

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      title: `Smoke high-value listing ${stamp}`,
      description: "Smoke test for Vaulted Secure Checkout (escrow threshold).",
      category: "Trading Cards",
      condition: "NM",
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 4980,
      shippingPriceUsd: 25,
      handlingTime: "1–2 business days",
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    },
  });

  const subtotal = listing.priceUsd + listing.shippingPriceUsd;
  console.log(`[smoke] Listing ${listing.id} subtotal $${subtotal} (expect escrow ≥ $5000)\n`);

  const { url } = await createBuyNowCheckoutSession({
    buyerId: buyer.id,
    listingId: listing.id,
    shipping: {
      shipRecipientName: "Smoke Buyer",
      shipAddress: "200 Test Ave",
      shipCity: "Dallas",
      shipState: "TX",
      shipZip: "75201",
      shipCountry: "US",
    },
  });

  const order = await prisma.order.findFirst({
    where: { listingId: listing.id },
    select: {
      id: true,
      paymentMethod: true,
      escrowTransactionId: true,
      escrowCheckoutUrl: true,
      escrowProvider: true,
      escrowFeeCents: true,
    },
  });

  console.log("[smoke] Order:", order?.id);
  console.log("[smoke] paymentMethod:", order?.paymentMethod);
  console.log("[smoke] escrowProvider:", order?.escrowProvider);
  console.log("[smoke] escrowTransactionId:", order?.escrowTransactionId);
  console.log("[smoke] escrowFeeCents:", order?.escrowFeeCents);
  console.log("[smoke] Checkout URL (open in browser):\n", url);
  console.log("\n[smoke] Done. Delete users/listing/order from DB if you no longer need them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
