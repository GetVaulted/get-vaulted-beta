import { LayawayStatus } from "@/generated/prisma/enums";

export type SellerLayawayUiBucket = "active" | "readyToShip" | "overdueOrDefaulted";

export type SellerLayawayUiInput = {
  status: string;
  dueAt: Date | string;
  remainingBalanceUsd: number;
};

export type SellerLayawayUi = {
  displayStatus: string;
  bucket: SellerLayawayUiBucket;
};

export function isOverdueActiveLayaway(dueAt: Date | string, status: string): boolean {
  const dueMs = dueAt instanceof Date ? dueAt.getTime() : new Date(dueAt).getTime();
  return status === LayawayStatus.active && Number.isFinite(dueMs) && dueMs < Date.now();
}

/** Single source of truth for seller layaway badges, tabs, and HQ counts. */
export function deriveSellerLayawayUi(input: SellerLayawayUiInput): SellerLayawayUi {
  const status = input.status.trim().toLowerCase();

  if (status === LayawayStatus.defaulted) {
    return { displayStatus: LayawayStatus.defaulted, bucket: "overdueOrDefaulted" };
  }

  if (status === LayawayStatus.refunded) {
    return { displayStatus: "canceled", bucket: "overdueOrDefaulted" };
  }

  if (status === LayawayStatus.completed || status === "paid_off" || input.remainingBalanceUsd <= 0.01) {
    return { displayStatus: LayawayStatus.completed, bucket: "readyToShip" };
  }

  if (status === LayawayStatus.active) {
    if (isOverdueActiveLayaway(input.dueAt, status)) {
      return { displayStatus: "overdue", bucket: "overdueOrDefaulted" };
    }
    return { displayStatus: LayawayStatus.active, bucket: "active" };
  }

  return { displayStatus: status || "inactive", bucket: "overdueOrDefaulted" };
}
