import type { SupportTicketCategory, SupportTicketStatus } from "@/generated/prisma/enums";

export const SUPPORT_TICKET_CATEGORIES = new Set<SupportTicketCategory>([
  "order",
  "shipping",
  "payment",
  "trade",
  "live",
  "account",
  "bug",
  "report_user",
  "other",
]);

export const SUPPORT_TICKET_STATUSES = new Set<SupportTicketStatus>([
  "submitted",
  "in_progress",
  "resolved",
  "closed",
]);

export function supportTicketCategoryLabel(category: SupportTicketCategory): string {
  switch (category) {
    case "order":
      return "Order issue";
    case "shipping":
      return "Shipping issue";
    case "payment":
      return "Payment / payout";
    case "trade":
      return "Trade issue";
    case "live":
      return "Live show issue";
    case "account":
      return "Account issue";
    case "bug":
      return "Bug report";
    case "report_user":
      return "Report user";
    default:
      return "Other";
  }
}

export function supportTicketStatusLabel(status: SupportTicketStatus): string {
  return status.replace(/_/g, " ");
}

export type SupportTicketDto = {
  id: string;
  userId: string;
  username: string | null;
  category: SupportTicketCategory;
  categoryLabel: string;
  subject: string;
  message: string;
  contactEmail: string;
  referenceType: string | null;
  referenceId: string | null;
  status: SupportTicketStatus;
  statusLabel: string;
  adminNotes: string;
  assignedAdminId: string | null;
  assignedAdminUsername: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeSupportTicket(row: {
  id: string;
  userId: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  contactEmail: string;
  referenceType: string | null;
  referenceId: string | null;
  status: SupportTicketStatus;
  adminNotes: string;
  assignedAdminId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: { username: string | null };
  assignedAdmin?: { username: string | null } | null;
}): SupportTicketDto {
  return {
    id: row.id,
    userId: row.userId,
    username: row.user.username,
    category: row.category,
    categoryLabel: supportTicketCategoryLabel(row.category),
    subject: row.subject,
    message: row.message,
    contactEmail: row.contactEmail,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    status: row.status,
    statusLabel: supportTicketStatusLabel(row.status),
    adminNotes: row.adminNotes,
    assignedAdminId: row.assignedAdminId,
    assignedAdminUsername: row.assignedAdmin?.username ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
