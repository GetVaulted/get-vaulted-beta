import { prisma } from "@/lib/prisma";
import { escapeResendHtml, RESEND_EMAIL_BRAND } from "@/lib/resend-templates/brand";
import { RESEND_TEMPLATE_ORDER_SHELL } from "@/lib/resend-templates/definitions";
import { buildEmailShellInline } from "@/lib/resend-templates/shell";
import { isResendHostedTemplatesEnabled, sendResendEmail, sendResendTemplateEmail } from "@/lib/resend-email";

/** Matches in-app `Notification.type` values for order lifecycle. */
export type OrderLifecycleEmailKind =
  | "purchase_complete"
  | "seller_ready_to_ship"
  | "order_label_created"
  | "order_shipped"
  | "order_in_transit"
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

function siteOrigin(): string {
  const u = process.env.NEXTAUTH_URL?.trim() || "https://shopgetvaulted.com";
  return u.replace(/\/$/, "");
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

type OrderEmailCopy = {
  subject: string;
  text: string;
  headline: string;
  bodyHtml: string;
  ctaLabel: string;
};

function buildOrderEmailCopy(input: OrderLifecycleEmailInput): OrderEmailCopy {
  const title = truncateTitle(input.listingTitle);
  const link = orderUrl(input.orderId);
  const tracking = input.trackingNumber?.trim();
  const total =
    typeof input.totalUsd === "number" && Number.isFinite(input.totalUsd)
      ? fmtUsd(input.totalUsd)
      : null;
  const { text: brandText } = RESEND_EMAIL_BRAND;
  const safeTitle = escapeResendHtml(title);

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
        headline: "Order confirmed",
        bodyHtml: `Thanks for your purchase. <strong style="color:${brandText};">${safeTitle}</strong> is confirmed${total ? ` for <strong style="color:${brandText};">${escapeResendHtml(total)}</strong>` : ""}. We'll email you when it ships.`,
        ctaLabel: "View order",
      };
    case "seller_ready_to_ship":
      return {
        subject: `New sale — ship ${title}`,
        text: [`You sold ${title} on Get Vaulted.`, "", `Create a label or mark shipped: ${link}`].join("\n"),
        headline: "New order to ship",
        bodyHtml: `<strong style="color:${brandText};">${safeTitle}</strong> is paid. Create a shipping label or mark it shipped from Sales.`,
        ctaLabel: "Open order",
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
        headline: "Label created",
        bodyHtml: `Your order for <strong style="color:${brandText};">${safeTitle}</strong> has a carrier label.${tracking ? ` Tracking: <strong style="color:${brandText};">${escapeResendHtml(tracking)}</strong>.` : ""}`,
        ctaLabel: "Track order",
      };
    case "order_shipped":
      return {
        subject: `Shipped — ${title}`,
        text: [
          `Carrier scanned ${title} — your package is on its way.`,
          tracking ? `Tracking: ${tracking}` : "",
          "",
          `View order: ${link}`,
        ]
          .filter(Boolean)
          .join("\n"),
        headline: "Shipped",
        bodyHtml: `Carrier scanned <strong style="color:${brandText};">${safeTitle}</strong> — your package is on its way.${tracking ? ` Tracking: <strong style="color:${brandText};">${escapeResendHtml(tracking)}</strong>.` : ""}`,
        ctaLabel: "Track order",
      };
    case "order_in_transit":
      return {
        subject: `In transit — ${title}`,
        text: [
          `${title} is in transit with the carrier.`,
          tracking ? `Tracking: ${tracking}` : "",
          "",
          `View order: ${link}`,
        ]
          .filter(Boolean)
          .join("\n"),
        headline: "In transit",
        bodyHtml: `<strong style="color:${brandText};">${safeTitle}</strong> is in transit.${tracking ? ` Tracking: <strong style="color:${brandText};">${escapeResendHtml(tracking)}</strong>.` : ""}`,
        ctaLabel: "Track order",
      };
    case "order_out_for_delivery":
      return {
        subject: `Out for delivery — ${title}`,
        text: [`${title} is out for delivery today.`, "", `View order: ${link}`].join("\n"),
        headline: "Out for delivery",
        bodyHtml: `<strong style="color:${brandText};">${safeTitle}</strong> is out for delivery today.`,
        ctaLabel: "View order",
      };
    case "order_delivered":
      return {
        subject: `Delivered — ${title}`,
        text: [`${title} was delivered.`, "", `View order: ${link}`].join("\n"),
        headline: "Delivered",
        bodyHtml: `Carrier reports <strong style="color:${brandText};">${safeTitle}</strong> was delivered.`,
        ctaLabel: "View order",
      };
    case "seller_order_delivered":
      return {
        subject: `Buyer received — ${title}`,
        text: [`Carrier reports ${title} was delivered to your buyer.`, "", `View order: ${link}`].join("\n"),
        headline: "Order delivered",
        bodyHtml: `Carrier reports <strong style="color:${brandText};">${safeTitle}</strong> reached your buyer.`,
        ctaLabel: "View order",
      };
    default:
      return {
        subject: `Order update — ${title}`,
        text: `Order update for ${title}: ${link}`,
        headline: "Order update",
        bodyHtml: `There is an update on your order for <strong style="color:${brandText};">${safeTitle}</strong>.`,
        ctaLabel: "View order",
      };
  }
}

export function buildOrderLifecycleEmailContent(input: OrderLifecycleEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const copy = buildOrderEmailCopy(input);
  const link = orderUrl(input.orderId);
  return {
    subject: copy.subject,
    text: copy.text,
    html: buildEmailShellInline({
      headline: copy.headline,
      bodyHtml: copy.bodyHtml,
      ctaLabel: copy.ctaLabel,
      ctaHref: link,
    }),
  };
}

export function buildOrderLifecycleTemplateVariables(input: OrderLifecycleEmailInput): Record<string, string> {
  const copy = buildOrderEmailCopy(input);
  const link = orderUrl(input.orderId);
  return {
    HEADLINE: copy.headline,
    BODY_HTML: copy.bodyHtml,
    CTA_LABEL: copy.ctaLabel,
    ORDER_URL: link,
    TEXT_BODY: copy.text,
  };
}

export async function sendOrderLifecycleEmail(input: OrderLifecycleEmailInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  const to = user?.email?.trim();
  if (!to) return;

  const copy = buildOrderEmailCopy(input);
  const result = isResendHostedTemplatesEnabled()
    ? await sendResendTemplateEmail({
        to,
        subject: copy.subject,
        templateId: RESEND_TEMPLATE_ORDER_SHELL,
        variables: buildOrderLifecycleTemplateVariables(input),
      })
    : await sendResendEmail({ to, subject: copy.subject, text: copy.text, html: buildOrderLifecycleEmailContent(input).html });

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
