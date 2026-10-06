import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { isResendEmailConfigured, sendResendEmail } from "@/lib/resend-email";

const SOURCE = "stripe_connect_seller_alert";
export const STRIPE_CONNECT_ACTION_REQUIRED_TYPE = "stripe_connect_action_required";
export const STRIPE_CONNECT_ACTION_HREF = "/account/seller";

function publicSiteBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.STRIPE_CONNECT_PUBLIC_APP_URL?.trim() ||
    "https://shopgetvaulted.com";
  return raw.replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stable fingerprint of due requirements so the same set does not spam. */
export function stripeActionRequiredDedupeKey(userId: string, currentlyDue: string[]): string {
  const due = [...new Set(currentlyDue.map((d) => d.trim()).filter(Boolean))].sort();
  return `action:${userId}:${due.join(",") || "none"}`.slice(0, 200);
}

export type NotifySellerStripeActionRequiredInput = {
  stripeAccountId: string;
  currentlyDue: string[];
};

/**
 * When Stripe Connect has `currently_due` requirements, notify linked sellers
 * (in-app + push via createNotification, plus Resend email). Deduped per user + due set.
 */
export async function notifySellersStripeActionRequired(
  input: NotifySellerStripeActionRequiredInput,
): Promise<{ notified: number; skipped: boolean }> {
  const currentlyDue = [...new Set(input.currentlyDue.map((d) => d.trim()).filter(Boolean))];
  if (!currentlyDue.length) return { notified: 0, skipped: true };

  const accountId = input.stripeAccountId.trim();
  if (!accountId) return { notified: 0, skipped: true };

  const sellers = await prisma.user.findMany({
    where: {
      stripeAccountId: accountId,
      suspendedAt: null,
      accountDeletedAt: null,
    },
    select: { id: true, email: true },
  });
  if (!sellers.length) return { notified: 0, skipped: true };

  const title = "Stripe needs more information";
  const body =
    "Open Seller HQ and continue Stripe setup to finish identity verification or payout details. Until this is done, you may not be able to publish or go live.";
  const path = STRIPE_CONNECT_ACTION_HREF;
  const absoluteHref = `${publicSiteBase()}${path}`;

  let notified = 0;
  for (const seller of sellers) {
    const dedupeKey = stripeActionRequiredDedupeKey(seller.id, currentlyDue);
    try {
      const already = await prisma.webhookEventLog.findFirst({
        where: { source: SOURCE, externalId: dedupeKey, processed: true },
        select: { id: true },
      });
      if (already) continue;

      await prisma.webhookEventLog.create({
        data: {
          source: SOURCE,
          externalId: dedupeKey,
          eventType: STRIPE_CONNECT_ACTION_REQUIRED_TYPE,
          payload: JSON.stringify({
            stripeAccountId: accountId,
            currentlyDue,
          }).slice(0, 4000),
          processed: true,
        },
      });
    } catch {
      const already = await prisma.webhookEventLog.findFirst({
        where: { source: SOURCE, externalId: dedupeKey, processed: true },
        select: { id: true },
      });
      if (already) continue;
    }

    const id = await createNotification(prisma, {
      userId: seller.id,
      type: STRIPE_CONNECT_ACTION_REQUIRED_TYPE,
      title,
      body,
      href: path,
    });
    if (id) notified += 1;

    if (isResendEmailConfigured() && seller.email?.trim()) {
      const text = `${body}\n\nOpen: ${absoluteHref}\n`;
      const html = `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(absoluteHref)}">Continue in Seller HQ</a></p>`;
      void sendResendEmail({
        to: seller.email.trim(),
        subject: title,
        text,
        html,
      }).then((r) => {
        if (!r.ok) {
          console.warn("[notifySellersStripeActionRequired] email failed", {
            to: seller.email,
            reason: r.reason,
          });
        }
      });
    }
  }

  return { notified, skipped: false };
}

export function scheduleNotifySellersStripeActionRequired(
  input: NotifySellerStripeActionRequiredInput,
): void {
  void notifySellersStripeActionRequired(input).catch((e) => {
    console.error("[notifySellersStripeActionRequired] failed", e);
  });
}
