import type { OrderRefundRequestKind, OrderRefundRequestStatus } from "@/generated/prisma/enums";

export type OrderRefundRequestDto = {
  id: string;
  orderId: string;
  kind: OrderRefundRequestKind;
  status: OrderRefundRequestStatus;
  reason: string;
  photoUrls: string[];
  sellerDenyReason: string | null;
  supportNote: string | null;
  returnTrackingNumber: string | null;
  returnCarrier: string | null;
  sellerDirect: boolean;
  escalatedAt: string | null;
  sellerRespondedAt: string | null;
  supportResolvedAt: string | null;
  returnReceivedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeOrderRefundRequest(row: {
  id: string;
  orderId: string;
  kind: OrderRefundRequestKind;
  status: OrderRefundRequestStatus;
  reason: string;
  photoUrls: string[];
  sellerDenyReason: string | null;
  supportNote: string | null;
  returnTrackingNumber: string | null;
  returnCarrier: string | null;
  sellerDirect: boolean;
  escalatedAt: Date | null;
  sellerRespondedAt: Date | null;
  supportResolvedAt: Date | null;
  returnReceivedAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): OrderRefundRequestDto {
  return {
    id: row.id,
    orderId: row.orderId,
    kind: row.kind,
    status: row.status,
    reason: row.reason,
    photoUrls: row.photoUrls,
    sellerDenyReason: row.sellerDenyReason,
    supportNote: row.supportNote,
    returnTrackingNumber: row.returnTrackingNumber,
    returnCarrier: row.returnCarrier,
    sellerDirect: row.sellerDirect,
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    sellerRespondedAt: row.sellerRespondedAt?.toISOString() ?? null,
    supportResolvedAt: row.supportResolvedAt?.toISOString() ?? null,
    returnReceivedAt: row.returnReceivedAt?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
