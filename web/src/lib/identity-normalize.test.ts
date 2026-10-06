import { describe, expect, it } from "vitest";
import {
  normalizeAddressKey,
  normalizeEmailForComparison,
  normalizePhoneDigits,
} from "@/lib/identity-normalize";

describe("identity-normalize", () => {
  it("collapses gmail aliases", () => {
    expect(normalizeEmailForComparison("John.Doe+test@gmail.com")).toBe("johndoe@gmail.com");
    expect(normalizeEmailForComparison("johndoe@googlemail.com")).toBe("johndoe@gmail.com");
  });

  it("keeps dots on non-gmail", () => {
    expect(normalizeEmailForComparison("john.doe+x@example.com")).toBe("john.doe@example.com");
  });

  it("normalizes address and phone", () => {
    expect(normalizeAddressKey("123 Main St.", "77001-1234")).toBe("123mainst|770011234");
    expect(normalizePhoneDigits("+1 (832) 555-1212")).toBe("8325551212");
  });
});
