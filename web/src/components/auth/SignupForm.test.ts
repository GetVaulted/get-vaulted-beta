import { describe, expect, it } from "vitest";
import { getPasswordRequirements, isPasswordStrongEnough } from "./SignupForm";

// Password policy (bug fix, 2026-07): modest, non-punishing strength requirement — 8+ characters,
// at least one letter, and at least one number. Deliberately no special-character/mixed-case
// requirement, since that would add signup friction without much of a security benefit here.
describe("getPasswordRequirements", () => {
  it("reports all requirements unmet for an empty password", () => {
    const reqs = getPasswordRequirements("");
    expect(reqs.find((r) => r.key === "length")?.met).toBe(false);
    expect(reqs.find((r) => r.key === "letter")?.met).toBe(false);
    expect(reqs.find((r) => r.key === "number")?.met).toBe(false);
  });

  it("flags a too-short password even if it has a letter and a number", () => {
    const reqs = getPasswordRequirements("ab1");
    expect(reqs.find((r) => r.key === "length")?.met).toBe(false);
    expect(reqs.find((r) => r.key === "letter")?.met).toBe(true);
    expect(reqs.find((r) => r.key === "number")?.met).toBe(true);
  });

  it("flags a long password with no digits", () => {
    const reqs = getPasswordRequirements("longpasswordnodigits");
    expect(reqs.find((r) => r.key === "length")?.met).toBe(true);
    expect(reqs.find((r) => r.key === "letter")?.met).toBe(true);
    expect(reqs.find((r) => r.key === "number")?.met).toBe(false);
  });

  it("flags a long numeric-only password with no letters", () => {
    const reqs = getPasswordRequirements("12345678");
    expect(reqs.find((r) => r.key === "length")?.met).toBe(true);
    expect(reqs.find((r) => r.key === "letter")?.met).toBe(false);
    expect(reqs.find((r) => r.key === "number")?.met).toBe(true);
  });

  it("meets all requirements for a plain 8+ char password with a letter and a number", () => {
    const reqs = getPasswordRequirements("password1");
    expect(reqs.every((r) => r.met)).toBe(true);
  });
});

describe("isPasswordStrongEnough", () => {
  it("rejects short, letter-only, and number-only passwords", () => {
    expect(isPasswordStrongEnough("")).toBe(false);
    expect(isPasswordStrongEnough("short1")).toBe(false);
    expect(isPasswordStrongEnough("alllettersnodigits")).toBe(false);
    expect(isPasswordStrongEnough("12345678")).toBe(false);
  });

  it("does NOT require special characters or mixed case (intentionally modest policy)", () => {
    expect(isPasswordStrongEnough("password1")).toBe(true);
    expect(isPasswordStrongEnough("ALLCAPS9X")).toBe(true);
  });

  it("accepts a normal 8+ char password containing a letter and a number", () => {
    expect(isPasswordStrongEnough("goldrush7")).toBe(true);
  });
});
