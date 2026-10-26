import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import {
  getPhoneVerificationBlock,
  isPhoneVerificationRequired,
  maskPhoneLast4,
  normalizePhoneE164,
  phoneVerificationRequiredFromMs,
} from "@/lib/phone-verification";
import { prisma } from "@/lib/prisma";

const NEW = new Date("2026-11-01T00:00:00Z");
const OLD = new Date("2026-01-01T00:00:00Z");
const env = { PHONE_VERIFICATION_REQUIRED_FROM: "2026-10-27T00:00:00Z" } as unknown as NodeJS.ProcessEnv;

describe("normalizePhoneE164", () => {
  it("accepts common US formats", () => {
    expect(normalizePhoneE164("(804) 555-0142")).toBe("+18045550142");
    expect(normalizePhoneE164("804-555-0142")).toBe("+18045550142");
    expect(normalizePhoneE164("1 804 555 0142")).toBe("+18045550142");
    expect(normalizePhoneE164("+1 804 555 0142")).toBe("+18045550142");
  });
  it("accepts international numbers that start with +", () => {
    expect(normalizePhoneE164("+44 7700 900123")).toBe("+447700900123");
  });
  it("rejects junk", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("12345")).toBeNull();
    expect(normalizePhoneE164("000-000-0000")).toBeNull();
    expect(normalizePhoneE164("(104) 555-0142")).toBeNull();
    expect(normalizePhoneE164(5551234567 as unknown)).toBeNull();
    expect(normalizePhoneE164("+1 123 555 0142")).toBeNull();
  });
});

describe("isPhoneVerificationRequired", () => {
  it("is never required when no cutoff is configured and the account is not flagged", () => {
    expect(
      isPhoneVerificationRequired({ phoneVerifiedAt: null, phoneVerificationRequired: false, createdAt: NEW }, {} as NodeJS.ProcessEnv),
    ).toBe(false);
  });
  it("requires new accounts after the cutoff, not older ones", () => {
    expect(isPhoneVerificationRequired({ phoneVerifiedAt: null, phoneVerificationRequired: false, createdAt: NEW }, env)).toBe(true);
    expect(isPhoneVerificationRequired({ phoneVerifiedAt: null, phoneVerificationRequired: false, createdAt: OLD }, env)).toBe(false);
  });
  it("requires a flagged older account", () => {
    expect(isPhoneVerificationRequired({ phoneVerifiedAt: null, phoneVerificationRequired: true, createdAt: OLD }, {} as NodeJS.ProcessEnv)).toBe(true);
  });
  it("never requires an already verified account", () => {
    expect(isPhoneVerificationRequired({ phoneVerifiedAt: new Date(), phoneVerificationRequired: true, createdAt: NEW }, env)).toBe(false);
  });
  it("ignores an unparseable cutoff", () => {
    expect(phoneVerificationRequiredFromMs({ PHONE_VERIFICATION_REQUIRED_FROM: "soon" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("maskPhoneLast4", () => {
  it("returns only the last four digits", () => {
    expect(maskPhoneLast4("+18045550142")).toBe("0142");
    expect(maskPhoneLast4(null)).toBeNull();
  });
});

describe("getPhoneVerificationBlock", () => {
  it("blocks a flagged unverified account with the 403 body and does not cache the block", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      createdAt: OLD,
      phoneVerifiedAt: null,
      phoneVerificationRequired: true,
    } as never);
    const block = await getPhoneVerificationBlock("u-flagged");
    expect(block).toMatchObject({ status: 403, code: "PHONE_VERIFICATION_REQUIRED" });
    await getPhoneVerificationBlock("u-flagged");
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
  it("lets a normal account through and caches the answer", async () => {
    vi.mocked(prisma.user.findUnique).mockClear();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      createdAt: OLD,
      phoneVerifiedAt: null,
      phoneVerificationRequired: false,
    } as never);
    expect(await getPhoneVerificationBlock("u-ok")).toBeNull();
    expect(await getPhoneVerificationBlock("u-ok")).toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
  it("fails open when the lookup throws", async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("db down"));
    expect(await getPhoneVerificationBlock("u-err")).toBeNull();
  });
});
