import { describe, expect, it } from "vitest";
import { canonicalHostRedirects, NON_CANONICAL_HOST_PATTERN } from "@/lib/canonical-host-redirects";

const [rule] = canonicalHostRedirects();
const pathRe = new RegExp(`^/${rule.source.slice("/:path".length)}$`);
const hostRe = new RegExp(`^${NON_CANONICAL_HOST_PATTERN}$`);

describe("canonicalHostRedirects", () => {
  it("permanently redirects pages to shopgetvaulted.com", () => {
    expect(rule.permanent).toBe(true);
    expect(rule.destination).toBe("https://shopgetvaulted.com/:path");
  });

  it("only applies to the .app hosts", () => {
    expect(hostRe.test("shopgetvaulted.app")).toBe(true);
    expect(hostRe.test("www.shopgetvaulted.app")).toBe(true);
    expect(hostRe.test("shopgetvaulted.com")).toBe(false);
    expect(hostRe.test("deploy-preview-12--get-vaulted-beta.netlify.app")).toBe(false);
  });

  it("redirects page paths but leaves API, functions and assets alone", () => {
    for (const p of ["/", "/marketplace", "/listing/abc", "/marketplace/category/trading-cards", "/apiary"]) {
      expect(pathRe.test(p), p).toBe(true);
    }
    for (const p of ["/api/listings", "/_next/static/x.js", "/.netlify/functions/trade-fee-checkout", "/monitoring"]) {
      expect(pathRe.test(p), p).toBe(false);
    }
  });
});
