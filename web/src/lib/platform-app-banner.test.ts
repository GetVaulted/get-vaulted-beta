import { describe, expect, it } from "vitest";
import { parseAppBannerUpdate, resolvePublicAppBanner } from "./platform-app-banner";

describe("resolvePublicAppBanner", () => {
  const base = {
    enabled: true,
    title: "Invite friends. Earn credit.",
    body: "Share your link.",
    ctaLabel: "Get my link",
    href: "/account/referrals",
    dismissKey: "referral-v1",
    startsAt: null as string | null,
    endsAt: null as string | null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  it("returns null when disabled", () => {
    expect(resolvePublicAppBanner({ ...base, enabled: false })).toBeNull();
  });

  it("returns public fields when enabled", () => {
    expect(resolvePublicAppBanner(base)).toEqual({
      title: base.title,
      body: base.body,
      ctaLabel: base.ctaLabel,
      href: base.href,
      dismissKey: base.dismissKey,
    });
  });

  it("respects schedule window", () => {
    const now = Date.parse("2026-08-01T12:00:00.000Z");
    expect(
      resolvePublicAppBanner(
        { ...base, startsAt: "2026-08-01T13:00:00.000Z" },
        now,
      ),
    ).toBeNull();
    expect(
      resolvePublicAppBanner({ ...base, endsAt: "2026-08-01T11:00:00.000Z" }, now),
    ).toBeNull();
  });
});

describe("parseAppBannerUpdate", () => {
  it("accepts referral promo fields", () => {
    const parsed = parseAppBannerUpdate({
      enabled: true,
      title: "Earn credit",
      body: "Invite friends",
      ctaLabel: "Open",
      href: "/account/referrals",
      dismissKey: "referral-v2",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.href).toBe("/account/referrals");
    expect(parsed.data.enabled).toBe(true);
  });

  it("rejects unsafe href schemes", () => {
    const parsed = parseAppBannerUpdate({ href: "javascript:alert(1)" });
    expect(parsed.ok).toBe(false);
  });
});
