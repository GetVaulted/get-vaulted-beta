import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = Pick<PrismaClient, "user">;

type UserStripeRow = { id: string; email: string | null; username: string | null; stripeAccountId: string | null };

function trimBase(u: string): string {
  return u.trim().replace(/\/$/, "");
}

function isPrivateHostname(hostname: string): boolean {
  if (/^192\.168\./i.test(hostname)) return true;
  if (/^10\./i.test(hostname)) return true;
  const m = /^172\.(\d+)\./i.exec(hostname);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

/**
 * Stripe Connect rejects `business_profile.url` for localhost/LAN/http-on-private-IP.
 * Those values often come from `NEXTAUTH_URL` during local dev.
 */
function isUnacceptableStripeBusinessUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local")) return true;
    if (u.protocol === "http:" && isPrivateHostname(h)) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Public HTTPS base used only for Stripe `business_profile.url` (not NextAuth redirects).
 * Override with `STRIPE_CONNECT_BUSINESS_PROFILE_BASE_URL` when `NEXTAUTH_URL` is non-public.
 */
function publicBaseForStripeBusinessProfile(): string {
  const override = process.env.STRIPE_CONNECT_BUSINESS_PROFILE_BASE_URL?.trim();
  if (override) {
    return trimBase(override.startsWith("http") ? override : `https://${override}`);
  }
  const auth = trimBase(process.env.NEXTAUTH_URL ?? "");
  if (auth && !isUnacceptableStripeBusinessUrl(auth)) return auth;
  return "https://shopgetvaulted.com";
}

function sellerStripeBusinessProfileUrl(user: Pick<UserStripeRow, "username">): string {
  const base = publicBaseForStripeBusinessProfile();
  return user.username?.trim()
    ? `${base}/seller/${encodeURIComponent(user.username.trim())}`
    : base;
}

const stripeConnectBusinessUrlHealAttempted = new Set<string>();

async function maybeHealStripeConnectBusinessProfileUrl(
  stripe: Stripe,
  accountId: string,
  user: Pick<UserStripeRow, "username">,
): Promise<void> {
  if (stripeConnectBusinessUrlHealAttempted.has(accountId)) return;
  try {
    const acct = await stripe.accounts.retrieve(accountId);
    const cur = acct.business_profile?.url ?? "";
    const desired = sellerStripeBusinessProfileUrl(user);
    if (cur && !isUnacceptableStripeBusinessUrl(cur)) {
      stripeConnectBusinessUrlHealAttempted.add(accountId);
      return;
    }
    await stripe.accounts.update(accountId, {
      business_profile: { url: desired },
    });
    stripeConnectBusinessUrlHealAttempted.add(accountId);
  } catch (e) {
    console.warn("[ensureSellerStripeExpressAccountId] could not heal Stripe business_profile.url", e);
  }
}

/**
 * Ensures the seller has a Stripe Connect Express account id (creates the account if missing).
 * Used by redirect onboarding and Connect embedded onboarding.
 */
export async function ensureSellerStripeExpressAccountId(
  db: Db,
  stripe: Stripe,
  sellerId: string,
): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: sellerId },
    select: { id: true, email: true, username: true, stripeAccountId: true },
  });
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }
  let accountId = user.stripeAccountId ?? null;
  if (!accountId) {
    console.info("[ensureSellerStripeExpressAccountId] creating connected account", {
      sellerId: user.id,
      email: user.email,
    });
    const sellerUrl = sellerStripeBusinessProfileUrl(user);
    const profileBase = {
      name: user.username?.trim() ? `${user.username.trim()} on Get Vaulted` : "Get Vaulted Seller",
      product_description:
        "Seller offers trading cards, collectibles, and live auction items through the Get Vaulted marketplace.",
      mcc: "5999" as const,
    };
    const createPayload = (url: string | undefined) =>
      ({
        type: "express" as const,
        country: "US" as const,
        email: user.email ?? undefined,
        business_type: "individual" as const,
        business_profile: url ? { ...profileBase, url } : profileBase,
        capabilities: {
          card_payments: { requested: true as const },
          transfers: { requested: true as const },
        },
        metadata: { userId: user.id },
      }) satisfies Stripe.AccountCreateParams;

    let acct: Stripe.Account;
    try {
      acct = await stripe.accounts.create(createPayload(sellerUrl));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const urlRejected = /url|business_profile|invalid/i.test(msg);
      if (!urlRejected) throw e;
      const fallbackUrl = publicBaseForStripeBusinessProfile();
      acct = await stripe.accounts.create(createPayload(fallbackUrl));
    }
    accountId = acct.id;
    await db.user.update({
      where: { id: user.id },
      data: { stripeAccountId: accountId },
    });
    console.info("[ensureSellerStripeExpressAccountId] connected account created", {
      sellerId: user.id,
      stripeAccountId: accountId,
    });
    return accountId;
  }

  console.info("[ensureSellerStripeExpressAccountId] reusing connected account", {
    sellerId: user.id,
    stripeAccountId: accountId,
  });
  await maybeHealStripeConnectBusinessProfileUrl(stripe, accountId, user);
  return accountId;
}
