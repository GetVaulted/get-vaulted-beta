/**
 * Post-wipe bootstrap: fresh sellerqa + buyerqa with Stripe snapshot and buyer wallet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  BETA_QA_ADMIN_EMAIL,
  BETA_QA_ADMIN_USERNAME,
  BETA_QA_BUYER_EMAIL,
  BETA_QA_BUYER_USERNAME,
  BETA_QA_SELLER_EMAIL,
  BETA_QA_SELLER_USERNAME,
} from "../../src/lib/beta-qa-scope";
import { ensureStripeCustomerIdForUser } from "../../src/lib/stripe-customer";
import { getStripe, isStripeConfigured } from "../../src/lib/stripe";

export function qaPassword(): string {
  return (
    process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() ||
    process.env.BETA_QA_PASSWORD?.trim() ||
    "VaultedBetaQA1!"
  );
}

export function adminQaPassword(): string {
  return process.env.BETA_QA_ADMIN_PASSWORD?.trim() || "AdminBeta123!";
}

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < 500) return null;
    page += 1;
  }
}

async function ensureAuthUserWithPassword(
  admin: SupabaseClient,
  spec: { email: string; username: string; displayName: string },
  password: string,
): Promise<string> {
  const existing = await findAuthUserIdByEmail(admin, spec.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing, {
      password,
      email_confirm: true,
      user_metadata: { username: spec.username, display_name: spec.displayName },
    });
    if (error) throw new Error(`updateUserById ${spec.email}: ${error.message}`);
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password,
    email_confirm: true,
    user_metadata: { username: spec.username, display_name: spec.displayName },
  });
  if (error) throw new Error(`createUser ${spec.email}: ${error.message}`);
  const authId = data.user?.id;
  if (!authId) throw new Error(`No auth id for ${spec.email}`);
  return authId;
}

async function ensureAuthUser(
  admin: SupabaseClient,
  spec: { email: string; username: string; displayName: string },
): Promise<string> {
  return ensureAuthUserWithPassword(admin, spec, qaPassword());
}

export async function seedAdminQaAccount(
  p: PrismaClient,
  admin: SupabaseClient,
  log: (msg: string) => void,
) {
  const spec = {
    email: BETA_QA_ADMIN_EMAIL,
    username: BETA_QA_ADMIN_USERNAME,
    displayName: "Admin QA",
  };
  const authId = await ensureAuthUserWithPassword(admin, spec, adminQaPassword());
  const existing = await p.user.findUnique({ where: { id: authId } });
  if (existing) {
    await p.user.update({
      where: { id: authId },
      data: {
        email: spec.email.toLowerCase(),
        username: spec.username,
        name: spec.displayName,
        role: "admin",
        emailVerified: new Date(),
        suspendedAt: null,
      },
    });
    log(`  adminqa: updated Prisma admin (${spec.email})`);
    return;
  }

  await p.user.create({
    data: {
      id: authId,
      email: spec.email.toLowerCase(),
      username: spec.username,
      name: spec.displayName,
      role: "admin",
      emailVerified: new Date(),
    },
  });
  log(`  adminqa: created Prisma admin (${spec.email})`);
}

export async function seedBetaQaSlateAccounts(
  p: PrismaClient,
  admin: SupabaseClient,
  log: (msg: string) => void,
) {
  await seedAdminQaAccount(p, admin, log);
  await seedFreshBetaQaAccounts(p, admin, log);
}

export async function seedFreshBetaQaAccounts(
  p: PrismaClient,
  admin: SupabaseClient,
  log: (msg: string) => void,
) {
  const specs = [
    {
      email: BETA_QA_SELLER_EMAIL,
      username: BETA_QA_SELLER_USERNAME,
      displayName: "Seller QA",
      isSeller: true,
    },
    {
      email: BETA_QA_BUYER_EMAIL,
      username: BETA_QA_BUYER_USERNAME,
      displayName: "Buyer QA",
      isSeller: false,
    },
  ];

  for (const spec of specs) {
    const authId = await ensureAuthUser(admin, spec);
    const existing = await p.user.findUnique({ where: { id: authId } });
    if (existing) {
      log(`  Prisma User exists: ${spec.email}`);
      continue;
    }

    await p.user.create({
      data: {
        id: authId,
        email: spec.email.toLowerCase(),
        username: spec.username,
        name: spec.displayName,
        emailVerified: new Date(),
        shipFromName: spec.isSeller ? "Seller QA Ship From" : undefined,
        shipFromStreet: spec.isSeller ? "100 Beta QA Blvd" : undefined,
        shipFromCity: spec.isSeller ? "Austin" : undefined,
        shipFromState: spec.isSeller ? "TX" : undefined,
        shipFromZip: spec.isSeller ? "78701" : undefined,
        shipFromCountry: spec.isSeller ? "US" : undefined,
      },
    });
    log(`  created Prisma User ${spec.email}`);
  }

  const seller = await p.user.findFirst({
    where: { email: { equals: BETA_QA_SELLER_EMAIL, mode: "insensitive" } },
    select: { id: true },
  });
  const buyer = await p.user.findFirst({
    where: { email: { equals: BETA_QA_BUYER_EMAIL, mode: "insensitive" } },
    select: { id: true },
  });
  if (!seller || !buyer) throw new Error("Canonical QA users missing after seed");

  await p.user.update({
    where: { id: seller.id },
    data: {
      stripeAccountId: "acct_beta_qa_smoke",
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeRequirementsDue: null,
      stripeVerificationStatus: null,
      shipFromName: "Seller QA Ship From",
      shipFromStreet: "100 Beta QA Blvd",
      shipFromCity: "Austin",
      shipFromState: "TX",
      shipFromZip: "78701",
      shipFromCountry: "US",
    },
  });
  log("  sellerqa: Stripe Connect snapshot + ship-from ready");

  const sellerShipFrom = await p.address.create({
    data: {
      userId: seller.id,
      type: "ship_from",
      name: "Shipping address",
      fullName: "Seller QA Ship From",
      line1: "100 Beta QA Blvd",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
      email: BETA_QA_SELLER_EMAIL,
      phone: "5555550100",
      isDefault: true,
      isVerified: true,
    },
  });
  await p.user.update({
    where: { id: seller.id },
    data: { defaultShipFromAddressId: sellerShipFrom.id },
  });

  await p.address.create({
    data: {
      userId: buyer.id,
      type: "shipping",
      name: "Home",
      fullName: "Buyer QA",
      line1: "200 Beta Buyer St",
      city: "Austin",
      state: "TX",
      postalCode: "78702",
      country: "US",
      email: BETA_QA_BUYER_EMAIL,
      phone: "5555550200",
      isDefault: true,
    },
  });
  log("  buyerqa: default shipping address");

  if (isStripeConfigured()) {
    const customerId = await ensureStripeCustomerIdForUser(buyer.id);
    const stripe = getStripe();
    const cards = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
    if (cards.data.length === 0) {
      const pm = await stripe.paymentMethods.create({
        type: "card",
        card: { token: "tok_visa" },
      });
      await stripe.paymentMethods.attach(pm.id, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pm.id },
      });
      log(`  buyerqa: attached test card (${customerId})`);
    } else {
      log(`  buyerqa: ${cards.data.length} saved card(s)`);
    }
  } else {
    log("  STRIPE_SECRET_KEY not set — run node scripts/_beta-seed-buyer-card.mjs after wipe");
  }
}

export async function listAllAuthUsers(admin: SupabaseClient) {
  const all: { id: string; email: string | undefined }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    for (const u of users) {
      all.push({ id: u.id, email: u.email });
    }
    if (users.length < 500) break;
    page += 1;
  }
  return all;
}

export async function deleteAllSupabaseAuthUsers(
  admin: SupabaseClient,
  log: (msg: string) => void,
) {
  const users = await listAllAuthUsers(admin);
  log(`  deleting ${users.length} Supabase Auth user(s) …`);
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email ?? u.id}: ${error.message}`);
  }
  log(`  deleted ${users.length} Auth user(s)`);
}
