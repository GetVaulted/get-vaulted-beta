import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { isResendEmailConfigured, sendResendEmail } from "@/lib/resend-email";
import type { SellerApplicationAction } from "@/lib/seller-application";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Ops alert: a member applied (or re-submitted after we asked for more info). */
export function notifyAdminsSellerApplication(input: {
  applicationId: string;
  username: string;
  submittedAt: Date;
  resubmitted: boolean;
}): void {
  scheduleNotifyAdmins({
    type: "admin_seller_application",
    title: input.resubmitted ? "Seller application updated" : "New seller application",
    body: `@${input.username} ${input.resubmitted ? "sent more information on" : "applied for"} seller access.`,
    href: "/admin/seller-applications",
    dedupeKey: `seller-application:${input.applicationId}:${input.submittedAt.getTime()}`,
  });
}

const COPY: Record<SellerApplicationAction, { title: string; body: (note: string) => string; subject: string }> = {
  approve: {
    title: "You're approved to sell",
    body: () => "Your seller application was approved. You can finish setup and start listing or go live.",
    subject: "You're approved to sell on Get Vaulted",
  },
  reject: {
    title: "Seller application update",
    body: (note) => `Your seller application wasn't approved. ${note}`.trim(),
    subject: "Your Get Vaulted seller application",
  },
  request_info: {
    title: "We need more info for your seller application",
    body: (note) => `${note} Open your application to reply.`.trim(),
    subject: "More information needed for your Get Vaulted seller application",
  },
  revoke: {
    title: "Your seller access was paused",
    body: (note) => `${note}`.trim() || "Your seller access was paused. Contact support for details.",
    subject: "Your Get Vaulted seller access",
  },
};

/** Tell the applicant about an admin decision: in-app notification (+push) and a best-effort email. */
export async function notifySellerApplicationDecision(input: {
  userId: string;
  action: SellerApplicationAction;
  note: string;
}): Promise<void> {
  const copy = COPY[input.action];
  const note = input.note.trim();
  const body = copy.body(note);
  const href = input.action === "approve" ? "/account/seller/setup" : "/account/seller/apply";

  await createNotification(prisma, {
    userId: input.userId,
    type: "seller_application_decision",
    title: copy.title,
    body,
    href,
  });

  if (!isResendEmailConfigured()) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    if (!user?.email) return;
    const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://shopgetvaulted.com").replace(/\/+$/, "");
    const link = `${base}${href}`;
    await sendResendEmail({
      to: user.email,
      subject: copy.subject,
      text: `${body}\n\n${link}`,
      html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    });
  } catch (e) {
    console.error("[seller-application] decision email failed", e);
  }
}
