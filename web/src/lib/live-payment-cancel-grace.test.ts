import { describe, expect, it } from "vitest";
import {
  BANK_VERIFICATION_CANCEL_GRACE_MS,
  cancelGraceRemainingMs,
  isBankVerificationReason,
} from "./live-payment-cancel-grace";

describe("isBankVerificationReason", () => {
  it("matches the bank-verification reason", () => {
    expect(isBankVerificationReason("Your bank requires additional verification.")).toBe(true);
    expect(isBankVerificationReason("Authentication required")).toBe(true);
  });

  it("does not match declines, shipping problems, or phone verification", () => {
    expect(isBankVerificationReason("Your card was declined.")).toBe(false);
    expect(isBankVerificationReason("Payment is still processing.")).toBe(false);
    expect(isBankVerificationReason("Phone verification is required for this purchase.")).toBe(false);
    expect(isBankVerificationReason(null)).toBe(false);
    expect(isBankVerificationReason(undefined)).toBe(false);
  });
});

describe("cancelGraceRemainingMs", () => {
  const failedAt = new Date("2026-11-22T20:18:04.000Z");
  const t0 = failedAt.getTime();
  const verification = { failureReason: "Your bank requires additional verification.", failedAt };

  it("holds the full grace right after a verification failure", () => {
    expect(cancelGraceRemainingMs(verification, t0)).toBe(BANK_VERIFICATION_CANCEL_GRACE_MS);
  });

  it("counts down and then allows cancelling", () => {
    expect(cancelGraceRemainingMs(verification, t0 + 12_000)).toBe(78_000);
    expect(cancelGraceRemainingMs(verification, t0 + BANK_VERIFICATION_CANCEL_GRACE_MS)).toBe(0);
    expect(cancelGraceRemainingMs(verification, t0 + BANK_VERIFICATION_CANCEL_GRACE_MS + 5_000)).toBe(0);
  });

  it("never delays cancelling an ordinary decline", () => {
    expect(cancelGraceRemainingMs({ failureReason: "Your card was declined.", failedAt }, t0)).toBe(0);
    expect(cancelGraceRemainingMs({ failureReason: null, failedAt }, t0)).toBe(0);
  });

  it("fails open when the timestamp cannot be read", () => {
    expect(cancelGraceRemainingMs({ ...verification, failedAt: new Date("not a date") }, t0)).toBe(0);
  });
});
