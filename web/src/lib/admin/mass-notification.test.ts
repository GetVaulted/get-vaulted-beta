import { describe, expect, it } from "vitest";
import {
  MASS_NOTIFICATION_BODY_MAX,
  MASS_NOTIFICATION_TITLE_MAX,
  validateMassNotificationInput,
} from "./mass-notification";

describe("validateMassNotificationInput", () => {
  it("accepts a well-formed broadcast with no link", () => {
    expect(validateMassNotificationInput({ title: "Big drop tonight", body: "Doors open at 8pm ET." })).toBeNull();
  });

  it("accepts a relative link", () => {
    expect(
      validateMassNotificationInput({ title: "New breaks live", body: "Check the schedule.", href: "/live" }),
    ).toBeNull();
  });

  it("accepts an absolute https link", () => {
    expect(
      validateMassNotificationInput({
        title: "New breaks live",
        body: "Check the schedule.",
        href: "https://shopgetvaulted.com/live",
      }),
    ).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(validateMassNotificationInput({ title: "  ", body: "Body text" })?.field).toBe("title");
  });

  it("rejects an empty body", () => {
    expect(validateMassNotificationInput({ title: "Title", body: "   " })?.field).toBe("body");
  });

  it("rejects a title over the max length", () => {
    const title = "a".repeat(MASS_NOTIFICATION_TITLE_MAX + 1);
    expect(validateMassNotificationInput({ title, body: "Body" })?.field).toBe("title");
  });

  it("rejects a body over the max length", () => {
    const body = "a".repeat(MASS_NOTIFICATION_BODY_MAX + 1);
    expect(validateMassNotificationInput({ title: "Title", body })?.field).toBe("body");
  });

  it("rejects a link that isn't relative or http(s)", () => {
    expect(
      validateMassNotificationInput({ title: "Title", body: "Body", href: "javascript:alert(1)" })?.field,
    ).toBe("href");
  });
});
