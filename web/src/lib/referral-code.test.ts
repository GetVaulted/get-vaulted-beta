import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  REFERRAL_CODE_LENGTH,
  allocateUniqueReferralCode,
  ensureUserReferralCode,
  generateReferralCode,
  normalizeReferralCodeInput,
  resolveReferrerIdFromReferralInput,
} from "@/lib/referral-code";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateReferralCode", () => {
  it("returns a fixed-length unambiguous alphanumeric code", () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(code).toMatch(/^[A-Z2-9]+$/);
    expect(code).not.toMatch(/[01ILO]/);
  });
});

describe("normalizeReferralCodeInput", () => {
  it("trims and caps input length", () => {
    expect(normalizeReferralCodeInput("  abc  ")).toBe("abc");
    expect(normalizeReferralCodeInput("x".repeat(40))).toHaveLength(32);
  });
});

describe("allocateUniqueReferralCode", () => {
  it("retries when a generated code is already taken", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: "taken" })
      .mockResolvedValueOnce(null);
    const code = await allocateUniqueReferralCode(prismaMock);
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("ensureUserReferralCode", () => {
  it("returns an existing code without writing", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ referralCode: "K7H3N9Q2MW" });
    await expect(ensureUserReferralCode("user_1")).resolves.toBe("K7H3N9Q2MW");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("persists a new code when missing", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ referralCode: null });
    prismaMock.user.update.mockResolvedValue({ referralCode: "ABCDEFGHJK" });
    await expect(ensureUserReferralCode("user_1")).resolves.toBe("ABCDEFGHJK");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_1" },
        data: { referralCode: expect.stringMatching(/^[A-Z2-9]{10}$/) },
      }),
    );
  });
});

describe("resolveReferrerIdFromReferralInput", () => {
  it("resolves by secret referral code first", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "referrer_secret" });
    await expect(resolveReferrerIdFromReferralInput("k7h3n9q2mw", prismaMock)).resolves.toBe(
      "referrer_secret",
    );
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { referralCode: "K7H3N9Q2MW" },
      select: { id: true },
    });
  });

  it("falls back to legacy username links", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "referrer_legacy" });
    await expect(resolveReferrerIdFromReferralInput("SomeUser", prismaMock)).resolves.toBe(
      "referrer_legacy",
    );
    expect(prismaMock.user.findUnique).toHaveBeenLastCalledWith({
      where: { username: "someuser" },
      select: { id: true },
    });
  });

  it("returns null for empty or unknown input", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(resolveReferrerIdFromReferralInput("", prismaMock)).resolves.toBeNull();
    await expect(resolveReferrerIdFromReferralInput("!!!", prismaMock)).resolves.toBeNull();
  });
});
