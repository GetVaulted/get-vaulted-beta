import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  GiveawayCampaignStatus,
  GiveawayEntryType,
  PlatformCreditSourceType,
  PlatformCreditStatus,
  UserRole,
} from "@/generated/prisma/enums";

const prismaMock = vi.hoisted(() => ({
  giveawayCampaign: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  giveawayEntryLedger: {
    create: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  giveawayFraudFlag: {
    create: vi.fn(),
  },
  platformCredit: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  notification: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { pickWeightedWinner } from "@/lib/giveaway/draw";
import {
  isDisposableEmailDomain,
  looksLikeTestAccountEmail,
} from "@/lib/giveaway/disposable-email";
import { isGiveawayEligibleUser, onUserEmailVerifiedForGiveaways } from "@/lib/giveaway/entries";
import { awardPlatformCredit } from "@/lib/giveaway/platform-credit";
import { flagGiveawayFraud } from "@/lib/giveaway/fraud";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.count.mockResolvedValue(0);
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("disposable / test email helpers", () => {
  it("flags known disposable domains", () => {
    expect(isDisposableEmailDomain("a@mailinator.com")).toBe(true);
    expect(isDisposableEmailDomain("buyer@gmail.com")).toBe(false);
  });

  it("flags test account patterns", () => {
    expect(looksLikeTestAccountEmail("qa+foo@getvaulted.com")).toBe(true);
    expect(looksLikeTestAccountEmail("real@shopgetvaulted.com")).toBe(false);
  });
});

describe("isGiveawayEligibleUser", () => {
  const base = {
    id: "u1",
    email: "ok@example.org",
    emailVerified: new Date(),
    role: UserRole.user,
    suspendedAt: null,
    accountDeletedAt: null,
    createdAt: new Date(),
    referredById: null,
  };

  it("requires verified non-admin non-suspended users", () => {
    expect(isGiveawayEligibleUser(base)).toBe(true);
    expect(isGiveawayEligibleUser({ ...base, emailVerified: null })).toBe(false);
    expect(isGiveawayEligibleUser({ ...base, role: UserRole.admin })).toBe(false);
    expect(isGiveawayEligibleUser({ ...base, suspendedAt: new Date() })).toBe(false);
    expect(isGiveawayEligibleUser({ ...base, email: "test+x@example.com" })).toBe(false);
  });
});

describe("pickWeightedWinner", () => {
  it("weights by quantity so multi-entry users can win", () => {
    const tickets = [
      { userId: "a", weight: 1 },
      { userId: "b", weight: 99 },
    ];
    let bWins = 0;
    for (let i = 0; i < 40; i++) {
      const pick = pickWeightedWinner(tickets, `seed-${i}`);
      if (pick.winnerUserId === "b") bWins += 1;
      expect(pick.drawSeed).toBeTruthy();
      expect(pick.drawHash).toHaveLength(64);
      expect(pick.ticketIndex).toBeGreaterThanOrEqual(0);
      expect(pick.ticketIndex).toBeLessThan(100);
    }
    expect(bWins).toBeGreaterThan(20);
  });

  it("throws when there are no tickets", () => {
    expect(() => pickWeightedWinner([], "x")).toThrow("no_tickets");
  });
});

describe("awardPlatformCredit", () => {
  it("creates a new available credit row", async () => {
    prismaMock.platformCredit.create.mockResolvedValue({ id: "pc1" });
    const result = await awardPlatformCredit({
      userId: "u1",
      amountUsd: 500,
      sourceType: PlatformCreditSourceType.giveaway_prize,
      sourceRef: "draw_1",
    });
    expect(result).toEqual({ id: "pc1", created: true });
    expect(prismaMock.platformCredit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          amountUsd: 500,
          status: PlatformCreditStatus.available,
          sourceType: PlatformCreditSourceType.giveaway_prize,
          sourceRef: "draw_1",
        }),
      }),
    );
  });

  it("is idempotent on unique (sourceType, sourceRef)", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
    });
    prismaMock.platformCredit.create.mockRejectedValue(err);
    prismaMock.platformCredit.findUnique.mockResolvedValue({ id: "pc_existing" });
    const result = await awardPlatformCredit({
      userId: "u1",
      amountUsd: 500,
      sourceType: PlatformCreditSourceType.giveaway_prize,
      sourceRef: "draw_1",
    });
    expect(result).toEqual({ id: "pc_existing", created: false });
  });
});

describe("flagGiveawayFraud", () => {
  it("stores a fraud flag without throwing", async () => {
    prismaMock.giveawayFraudFlag.create.mockResolvedValue({ id: "f1" });
    await flagGiveawayFraud({
      campaignId: "c1",
      userId: "u1",
      reason: "disposable_email",
      detail: "mailinator",
    });
    expect(prismaMock.giveawayFraudFlag.create).toHaveBeenCalled();
  });

  it("swallows duplicate unique violations", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
    });
    prismaMock.giveawayFraudFlag.create.mockRejectedValue(err);
    await expect(
      flagGiveawayFraud({
        campaignId: "c1",
        userId: "u1",
        reason: "duplicate_email",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("onUserEmailVerifiedForGiveaways idempotency", () => {
  it("uses unique idempotency keys for signup and referral entries", async () => {
    const startsAt = new Date("2026-07-01T00:00:00Z");
    const endsAt = new Date("2026-08-31T00:00:00Z");
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "referee") {
        return {
          id: "referee",
          email: "new@shop.com",
          emailVerified: new Date("2026-07-15T00:00:00Z"),
          role: UserRole.user,
          suspendedAt: null,
          accountDeletedAt: null,
          createdAt: new Date("2026-07-10T00:00:00Z"),
          referredById: "referrer",
        };
      }
      if (where.id === "referrer") {
        return {
          id: "referrer",
          email: "ref@shop.com",
          emailVerified: new Date("2026-01-01T00:00:00Z"),
          role: UserRole.user,
          suspendedAt: null,
          accountDeletedAt: null,
          createdAt: new Date("2025-01-01T00:00:00Z"),
          referredById: null,
        };
      }
      return null;
    });

    prismaMock.giveawayCampaign.findMany.mockResolvedValue([
      {
        id: "camp1",
        status: GiveawayCampaignStatus.active,
        startsAt,
        endsAt,
      },
    ]);
    prismaMock.giveawayEntryLedger.create.mockResolvedValue({ id: "e1" });
    prismaMock.giveawayFraudFlag.create.mockResolvedValue({ id: "f1" });

    await onUserEmailVerifiedForGiveaways("referee");

    const keys = prismaMock.giveawayEntryLedger.create.mock.calls.map(
      (c) => (c[0] as { data: { idempotencyKey: string } }).data.idempotencyKey,
    );
    expect(keys).toContain("camp1:new_signup:referee");
    expect(keys).toContain("camp1:referral:referrer:referee");

    const types = prismaMock.giveawayEntryLedger.create.mock.calls.map(
      (c) => (c[0] as { data: { entryType: string } }).data.entryType,
    );
    expect(types).toContain(GiveawayEntryType.new_signup);
    expect(types).toContain(GiveawayEntryType.referral);
  });

  it("treats duplicate ledger inserts as no-ops", async () => {
    const startsAt = new Date("2026-07-01T00:00:00Z");
    const endsAt = new Date("2026-08-31T00:00:00Z");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u@shop.com",
      emailVerified: new Date(),
      role: UserRole.user,
      suspendedAt: null,
      accountDeletedAt: null,
      createdAt: new Date("2026-07-10T00:00:00Z"),
      referredById: null,
    });
    prismaMock.giveawayCampaign.findMany.mockResolvedValue([
      { id: "camp1", status: GiveawayCampaignStatus.active, startsAt, endsAt },
    ]);
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
    });
    prismaMock.giveawayEntryLedger.create.mockRejectedValue(err);
    prismaMock.giveawayFraudFlag.create.mockResolvedValue({});

    await expect(onUserEmailVerifiedForGiveaways("u1")).resolves.toBeUndefined();
  });
});
