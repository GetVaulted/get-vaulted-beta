import { describe, expect, it } from "vitest";
import {
  isUsernameChangeLocked,
  USERNAME_CHANGE_LOCK_DAYS,
  usernameChangeLockExpiresAt,
} from "./username-change-policy";

describe("username-change-policy", () => {
  it("locks changes for 60 days after username was chosen", () => {
    const chosenAt = new Date("2026-01-01T12:00:00.000Z");
    const expires = usernameChangeLockExpiresAt(chosenAt);
    expect(expires.toISOString()).toBe("2026-03-02T12:00:00.000Z");
    expect(isUsernameChangeLocked(chosenAt, new Date("2026-02-01T00:00:00.000Z"))).toBe(true);
    expect(isUsernameChangeLocked(chosenAt, expires)).toBe(false);
  });

  it("does not lock when username was never confirmed", () => {
    expect(isUsernameChangeLocked(null)).toBe(false);
  });

  it("exports the product lock window", () => {
    expect(USERNAME_CHANGE_LOCK_DAYS).toBe(60);
  });
});
