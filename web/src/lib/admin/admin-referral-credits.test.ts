import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralCreditRole, ReferralCreditStatus } from "@/generated/prisma/enums";

const {
  groupBy,
  userCount,
  findManyCredits,
  findManyUsers,
} = vi.hoisted(() => ({
  groupBy: vi.fn(),
  userCount: vi.fn(),
  findManyCredits: vi.fn(),
  findManyUsers: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    referralCredit: {
      groupBy,
      findMany: findManyCredits,
    },
    user: {
      count: userCount,
      findMany: findManyUsers,
      findUnique: vi.fn(),
    },
  },
}));

import {
  getAdminReferralCreditSummary,
  listAdminReferralCredits,
} from "@/lib/admin/admin-referral-credits";

describe("admin referral credits", () => {
  beforeEach(() => {
    groupBy.mockReset();
    userCount.mockReset();
    findManyCredits.mockReset();
    findManyUsers.mockReset();
  });
  it("summarizes outstanding vs spent vs voided", async () => {
    groupBy.mockResolvedValue([
      { status: ReferralCreditStatus.available, _count: { _all: 2 }, _sum: { amountUsd: 20 } },
      { status: ReferralCreditStatus.pending, _count: { _all: 1 }, _sum: { amountUsd: 10 } },
      { status: ReferralCreditStatus.spent, _count: { _all: 3 }, _sum: { amountUsd: 30 } },
      { status: ReferralCreditStatus.voided, _count: { _all: 1 }, _sum: { amountUsd: 10 } },
    ]);
    userCount.mockResolvedValue(7);

    const summary = await getAdminReferralCreditSummary();
    expect(summary.attributedUsers).toBe(7);
    expect(summary.totalOutstandingUsd).toBe(30);
    expect(summary.totalSpentUsd).toBe(30);
    expect(summary.totalVoidedUsd).toBe(10);
    expect(summary.byStatus.find((s) => s.status === "reserved")?.count).toBe(0);
  });

  it("lists credit rows newest first", async () => {
    findManyCredits.mockResolvedValue([
      {
        id: "c1",
        status: ReferralCreditStatus.available,
        role: ReferralCreditRole.referrer,
        amountUsd: 10,
        availableAt: new Date("2026-07-20T00:00:00.000Z"),
        createdAt: new Date("2026-07-06T00:00:00.000Z"),
        voidReason: null,
        voidedAt: null,
        reservedForRef: null,
        spentAt: null,
        spentOrderId: null,
        user: { id: "u1", username: "host", email: "h@x.com", referralCode: "ABC" },
        sourceOrder: {
          id: "o1",
          totalUsd: 40,
          paymentStatus: "paid",
          buyer: { id: "u2", username: "friend" },
        },
      },
    ]);

    const rows = await listAdminReferralCredits({ status: "available", limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user.username).toBe("host");
    expect(rows[0]?.sourceOrder.buyer.username).toBe("friend");
  });
});
