import type { ReportReason, ReportTargetType } from "@/generated/prisma/enums";

export const REPORT_TARGET_TYPES: ReportTargetType[] = [
  "user",
  "listing",
  "live_room",
  "message",
  "order",
  "break",
];

export const REPORT_REASONS: ReportReason[] = [
  "harassment",
  "counterfeit",
  "scam_fraud",
  "spam",
  "inappropriate_content",
  "fake_bids",
  "seller_misconduct",
  "buyer_misconduct",
  "ip_violation",
  "other",
];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment",
  counterfeit: "Counterfeit / fake item",
  scam_fraud: "Scam / fraud",
  spam: "Spam",
  inappropriate_content: "Inappropriate content",
  fake_bids: "Fake bids / shill bidding",
  seller_misconduct: "Seller misconduct",
  buyer_misconduct: "Buyer misconduct",
  ip_violation: "IP / copyright violation",
  other: "Other",
};

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  user: "User",
  listing: "Listing",
  live_room: "Live show",
  message: "Chat message",
  order: "Order",
  break: "Break spot",
};

export function isReportTargetType(v: string): v is ReportTargetType {
  return (REPORT_TARGET_TYPES as string[]).includes(v);
}

export function isReportReason(v: string): v is ReportReason {
  return (REPORT_REASONS as string[]).includes(v);
}

export type CreateReportInput = {
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
  liveRoomId?: string | null;
};
