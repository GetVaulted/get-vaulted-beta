import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { connectFieldsFromStripeAccount } from "@/lib/stripe-connect-account-map";
import { getStripe } from "@/lib/stripe";

/** Fetches latest Connect Account from Stripe and updates every user row with this `stripeAccountId`. */
export async function syncStripeConnectUserRowsForAccountId(accountId: string): Promise<void> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  const { data } = connectFieldsFromStripeAccount(account);
  const flat = data as unknown as Prisma.UserUpdateManyMutationInput;
  await prisma.user.updateMany({
    where: { stripeAccountId: accountId },
    data: flat,
  });
}
