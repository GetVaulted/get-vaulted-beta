import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { isResendEmailConfigured, sendResendEmail } from "@/lib/resend-email";

const ADMIN_ALERT_SOURCE = "admin_alert";

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

export type NotifyAdminsInput = {
  type: "admin_new_user" | "admin_seller_onboarded" | string;
  title: string;
  body: string;
  href: string;
  /** Idempotency key — one alert per key (WebhookEventLog). */
  dedupeKey: string;
};

/**
 * Fan out an ops alert to every non-suspended admin: in-app notification (+ push) and Resend email.
 * Fire-and-forget from signup / seller onboarding — never throw to callers.
 */
export async function notifyAdmins(input: NotifyAdminsInput): Promise<{ notified: number; skipped: boolean }> {
  const dedupeKey = input.dedupeKey.trim().slice(0, 200);
  if (!dedupeKey) return { notified: 0, skipped: true };

  try {
    const already = await prisma.webhookEventLog.findFirst({
      where: { source: ADMIN_ALERT_SOURCE, externalId: dedupeKey, processed: true },
      select: { id: true },
    });
    if (already) return { notified: 0, skipped: true };

    await prisma.webhookEventLog.create({
      data: {
        source: ADMIN_ALERT_SOURCE,
        externalId: dedupeKey,
        eventType: input.type.slice(0, 120),
        payload: JSON.stringify({ title: input.title, body: input.body, href: input.href }).slice(0, 4000),
        processed: true,
      },
    });
  } catch (e) {
    // Unique race or DB error — if another request won the race, skip; otherwise log and continue.
    const already = await prisma.webhookEventLog.findFirst({
      where: { source: ADMIN_ALERT_SOURCE, externalId: dedupeKey, processed: true },
      select: { id: true },
    });
    if (already) return { notified: 0, skipped: true };
    console.error("[notifyAdmins] dedupe write failed", e);
  }

  const admins = await prisma.user.findMany({
    where: { role: "admin", suspendedAt: null, accountDeletedAt: null },
    select: { id: true, email: true },
  });
  if (!admins.length) {
    console.warn("[notifyAdmins] no admin users to notify", { type: input.type, dedupeKey });
    return { notified: 0, skipped: false };
  }

  const base = publicSiteBase();
  const path = input.href.startsWith("/") ? input.href : `/${input.href}`;
  const absoluteHref = `${base}${path}`;

  let notified = 0;
  for (const admin of admins) {
    const id = await createNotification(prisma, {
      userId: admin.id,
      type: input.type,
      title: input.title,
      body: input.body,
      href: path,
    });
    if (id) notified += 1;

    if (isResendEmailConfigured() && admin.email?.trim()) {
      const subject = input.title.slice(0, 200);
      const text = `${input.body}\n\nOpen: ${absoluteHref}\n`;
      const html = `<p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(absoluteHref)}">Open in Get Vaulted</a></p>`;
      void sendResendEmail({ to: admin.email.trim(), subject, text, html }).then((r) => {
        if (!r.ok) console.warn("[notifyAdmins] email failed", { to: admin.email, reason: r.reason });
      });
    }
  }

  return { notified, skipped: false };
}

/** Schedule without blocking the request that triggered the alert. */
export function scheduleNotifyAdmins(input: NotifyAdminsInput): void {
  void notifyAdmins(input).catch((e) => {
    console.error("[notifyAdmins] failed", e);
  });
}
