import type { SupportTicketCategory } from "@/generated/prisma/enums";
import { supportTicketCategoryLabel } from "@/lib/support-tickets";

export const SUPPORT_EMAIL = "support@shopgetvaulted.com";
export const SUPPORT_CONTACT_PATH = "/support/contact";
export const SUPPORT_TICKETS_PATH = "/support/tickets";

export const SUPPORT_CONTACT_CATEGORIES: { id: SupportTicketCategory; label: string }[] = [
  { id: "order", label: supportTicketCategoryLabel("order") },
  { id: "shipping", label: supportTicketCategoryLabel("shipping") },
  { id: "payment", label: supportTicketCategoryLabel("payment") },
  { id: "trade", label: supportTicketCategoryLabel("trade") },
  { id: "live", label: supportTicketCategoryLabel("live") },
  { id: "account", label: supportTicketCategoryLabel("account") },
  { id: "bug", label: supportTicketCategoryLabel("bug") },
  { id: "report_user", label: supportTicketCategoryLabel("report_user") },
  { id: "other", label: supportTicketCategoryLabel("other") },
];

export function isSupportTicketCategory(value: string | null | undefined): value is SupportTicketCategory {
  return SUPPORT_CONTACT_CATEGORIES.some((c) => c.id === value);
}

export function buildSupportContactHref(params?: {
  category?: SupportTicketCategory;
  referenceId?: string;
  referenceType?: string;
}): string {
  const sp = new URLSearchParams();
  if (params?.category) sp.set("category", params.category);
  if (params?.referenceId?.trim()) sp.set("referenceId", params.referenceId.trim());
  if (params?.referenceType?.trim()) sp.set("referenceType", params.referenceType.trim());
  const q = sp.toString();
  return q ? `${SUPPORT_CONTACT_PATH}?${q}` : SUPPORT_CONTACT_PATH;
}
