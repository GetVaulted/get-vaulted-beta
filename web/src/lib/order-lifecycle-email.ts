import { prisma } from "@/lib/prisma";
import { sendResendEmail } from "@/lib/resend-email";

/** Matches in-app `Notification.type` values for order lifecycle. */
export type OrderLifecycleEmailKind =
  | "purchase_complete"
  | "seller_ready_to_ship"
  | "order_label_created"
  | "order_shipped"
  | "order_out_for_delivery"
  | "order_delivered"
  | "seller_order_delivered";

export type OrderLifecycleEmailInput = {
  userId: string;
  kind: OrderLifecycleEmailKind;
  orderId: string;
  listingTitle: string;
  trackingNumber?: string | null;
  totalUsd?: number | null;
};

const BRAND = {
  bg: "#0a0a0d",
  card: "#111116",
  border: "rgba(255,255,255,0.08)",
  gold: "#d4af37",
  text: "#fafafa",
  muted: "#a1a1aa",
} as const;

function siteOrigin(): string {
  const u = process.env.NEXTAUTH_URL?.trim() || "https://shopgetvaulted.com";
  return u.replace(/\/$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncateTitle(title: string, max = 90): string {
  const t = title.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function orderUrl(orderId: string): string {
  return `${siteOrigin()}/orders/${encodeURIComponent(orderId)}`;
}

function emailShell(args: { headline: string; bodyHtml: string; ctaLabel: string; ctaHref: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:32px 28px;">
        <tr><td style="color:${BRAND.gold};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Get Vaulted</td></tr>
        <tr><td style="padding-top:16px;color:${BRAND.text};font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(args.headline)}</td></tr>
        <tr><td style="padding-top:12px;color:${BRAND.muted};font-size:15px;line-height:1.55;">${args.bodyHtml}</td></tr>
        <tr><td style="padding-top:24px;">
          <a href="${escapeHtml(args.ctaHref)}" style="display:inline-block;background:linear-gradient(135deg,#c9a227,#e8c547);color:#0a0a0d;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">${escapeHtml(args.ctaLabel)}</a>
        </td></tr>
        <tr><td style="padding-top:28px;color:${BRAND.muted};font-size:12px;line-height:1.5;">You're receiving this because you have a Get Vaulted order. Manage notifications in the app.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildOrderLifecycleEmailContent(input: OrderLifecycleEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const title = truncateTitle(input.listingTitle);
  const link = orderUrl(input.orderId);
  const tracking = input.trackingNumber?.trim();
  const total =
    typeof input.totalUsd === "number" && Number.isFinite(input.totalUsd)
      ? fmtUsd(input.totalUsd)
      : null;

  switch (input.kind) {
    case "purchase_complete":
      return {
        subject: `Order confirmed — ${title}`,
        text: [
          "Your Get Vaulted order is confirmed.",
          "",
          `Item: ${title}`,
          total ? `Total: ${total}` : "",
          "",
          `View order: ${link}`,
        ]
          .filter(Boolean)
          .join("\n"),
        html: emailShell({
          headline: "Order confirmed",
          bodyHtml: `Thanks for your purchase. <strong style="color:${BRAND.text};">${escapeHtml(title)}</strong> is confirmed${total ? ` for <strong style="color:${BRAND.text};">${escapeHtml(total)}</strong>` : ""}. We'll email you when it ships.`,
          ctaLabel: "View order",
          ctaHref: link,
        }),
      };
    case "seller_ready_to_ship":
      return {
        subject: `New sale — ship ${title}`,
        text: [`You sold ${title} on Get Vaulted.`, "", `Create a label or mark shipped: ${link}`].join("\n"),
        html: emailShell({
          headline: "New order to ship",
          bodyHtml: `<strong style="color:${BRAND.text};">${escapeHtml(title)}</strong> is paid. Create a shipping label or mark it shipped from Sales.`,
          ctaLabel: "Open order",
          ctaHref: link,
        }),
      };
    case "order_label_created":
      return {
        subject: `Shipping label created — ${title}`,
        text: [
          `A carrier label was created for ${title}.`,
          tracking ? `Tracking: ${tracking}` : "",
          "",
          `View order: ${link}`,
        ]
          .filter(Boolean)
          .join("\n"),
        html: emailShell({
          headline: "Label created",
          bodyHtml: `Your order for <strong style="color:${BRAND.text};">${escapeHtml(title)}</strong> has a carrier label.${tracking ? ` Tracking: <strong style="color:${BRAND.text};">${escapeHtml(tracking)}</strong>.` : ""}`,
          ctaLabel: "Track order",
          ctaHref: link,
        }),
      };
    case "order_shipped":
      return {
        subject: `On the way — ${title}`,
        text: [
          `${title} is on the way.`,
          tracking ? `Tracking: ${tracking}` : "",
          "",
          `View order: ${link}`,
        ]
          .filter(Boolean)
          .join("\n"),
        html: emailShell({
          headline: "Your order shipped",
          bodyHtml: `<strong style="color:${BRAND.text};">${escapeHtml(title)}</strong> is on the way.${tracking ? ` Tracking: <strong style="color:${BRAND.text};">${escapeHtml(tracking)}</strong>.` : ""}`,
          ctaLabel: "View order",
          ctaHref: link,
        }),
      };
    case "order_out_for_delivery":
      return {
        subject: `Out for delivery — ${title}`,
        text: [`${title} is out for delivery today.`, "", `View order: ${link}`].join("\n"),
        html: emailShell({
          headline: "Out for delivery",
          bodyHtml: `<strong style="color:${BRAND.text};">${escapeHtml(title)}</strong> is out for delivery today.`,
          ctaLabel: "View order",
          ctaHref: link,
        }),
      };
    case "order_delivered":
      return {
        subject: `Delivered — ${title}`,
        text: [`${title} was delivered.`, "", `View order: ${link}`].join("\n"),
        html: emailShell({
          headline: "Delivered",
          bodyHtml: `Carrier reports <strong style="color:${BRAND.text};">${escapeHtml(title)}</strong> was delivered.`,
          ctaLabel: "View order",
          ctaHref: link,
        }),
      };
    case "seller_order_delivered":
      return {
        subject: `Buyer received — ${title}`,
        text: [`Carrier reports ${title} was delivered to your buyer.`, "", `View order: ${link}`].join("\n"),
        html: emailShell({
          headline: "Order delivered",
          bodyHtml: `Carrier reports <strong style="color:${BRAND.text};">${escapeHtml(title)}</strong> reached your buyer.`,
          ctaLabel: "View order",
          ctaHref: link,
        }),
      };
    default:
      return {
        subject: `Order update — ${title}`,
        text: `Order update for ${title}: ${link}`,
        html: emailShell({
          headline: "Order update",
          bodyHtml: `There is an update on your order for <strong style="color:${BRAND.text};">${escapeHtml(title)}</strong>.`,
          ctaLabel: "View order",
          ctaHref: link,
        }),
      };
  }
}

export async function sendOrderLifecycleEmail(input: OrderLifecycleEmailInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  const to = user?.email?.trim();
  if (!to) return;

  const content = buildOrderLifecycleEmailContent(input);
  const result = await sendResendEmail({ to, ...content });
  if (!result.ok && process.env.NODE_ENV !== "production") {
    console.info("[order-lifecycle-email] skipped or failed", { kind: input.kind, orderId: input.orderId, reason: result.reason });
  }
}

/** Fire-and-forget transactional email for an order lifecycle event. */
export function scheduleOrderLifecycleEmail(input: OrderLifecycleEmailInput): void {
  void sendOrderLifecycleEmail(input).catch((e) =>
    console.error("[order-lifecycle-email] unhandled error", { kind: input.kind, orderId: input.orderId, error: e }),
  );
}
