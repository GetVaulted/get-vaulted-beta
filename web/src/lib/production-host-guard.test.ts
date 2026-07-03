import { describe, expect, it } from "vitest";
import { findProductionHostEnvVar, isProductionSiteUrl } from "@/lib/production-host-guard";

describe("isProductionSiteUrl", () => {
  it("returns true for the bare production apex domain", () => {
    expect(isProductionSiteUrl("https://shopgetvaulted.com")).toBe(true);
    expect(isProductionSiteUrl("shopgetvaulted.com")).toBe(true);
  });

  it("returns true for the www subdomain", () => {
    expect(isProductionSiteUrl("https://www.shopgetvaulted.com")).toBe(true);
  });

  it("returns false for the beta subdomain (regression: beta must never be treated as production)", () => {
    expect(isProductionSiteUrl("https://beta.shopgetvaulted.com")).toBe(false);
  });

  it("returns false for localhost, Netlify previews, and unrelated hosts", () => {
    expect(isProductionSiteUrl("http://localhost:3000")).toBe(false);
    expect(isProductionSiteUrl("https://get-vaulted-beta--deploy-preview-42.netlify.app")).toBe(false);
    expect(isProductionSiteUrl("https://example.com")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isProductionSiteUrl(null)).toBe(false);
    expect(isProductionSiteUrl(undefined)).toBe(false);
    expect(isProductionSiteUrl("")).toBe(false);
  });
});

describe("findProductionHostEnvVar", () => {
  it("returns null when no site-url env vars are set", () => {
    expect(findProductionHostEnvVar({})).toBeNull();
  });

  it("returns null when site-url env vars point at beta", () => {
    expect(
      findProductionHostEnvVar({
        NEXT_PUBLIC_SITE_URL: "https://beta.shopgetvaulted.com",
        NEXTAUTH_URL: "https://beta.shopgetvaulted.com",
      }),
    ).toBeNull();
  });

  it("flags NEXT_PUBLIC_SITE_URL when it points at production (regression: catches a production env pull used against a beta-only script)", () => {
    expect(
      findProductionHostEnvVar({
        NEXT_PUBLIC_SITE_URL: "https://shopgetvaulted.com",
      }),
    ).toBe("NEXT_PUBLIC_SITE_URL");
  });

  it("flags NEXTAUTH_URL when it points at production even if NEXT_PUBLIC_SITE_URL is unset", () => {
    expect(
      findProductionHostEnvVar({
        NEXTAUTH_URL: "https://shopgetvaulted.com",
      }),
    ).toBe("NEXTAUTH_URL");
  });
});
