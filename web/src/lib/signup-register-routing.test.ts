import { describe, expect, it } from "vitest";
import { signupRequiresOtpVerification } from "./signup-register-routing";

describe("signupRequiresOtpVerification", () => {
  it("skips OTP for immediate Supabase signup", () => {
    expect(
      signupRequiresOtpVerification({
        ok: true,
        verificationMethod: "immediate",
        needsEmailConfirmation: false,
      }),
    ).toBe(false);
  });

  it("skips OTP when needsEmailConfirmation is false even without verificationMethod", () => {
    expect(signupRequiresOtpVerification({ ok: true, needsEmailConfirmation: false })).toBe(false);
  });

  it("requires OTP for resend_code", () => {
    expect(signupRequiresOtpVerification({ ok: true, verificationMethod: "resend_code" })).toBe(true);
  });

  it("requires OTP for legacy { ok: true } Resend response", () => {
    expect(signupRequiresOtpVerification({ ok: true })).toBe(true);
  });
});
