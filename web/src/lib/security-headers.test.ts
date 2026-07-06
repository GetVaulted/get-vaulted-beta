import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicyReportOnly, buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  function headerMap() {
    return Object.fromEntries(buildSecurityHeaders().map((h) => [h.key, h.value]));
  }

  it("enforces clickjacking protection", () => {
    const headers = headerMap();
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
  });

  it("enforces MIME-sniffing protection", () => {
    const headers = headerMap();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("enforces HSTS with a long max-age and includeSubDomains", () => {
    const headers = headerMap();
    const hsts = headers["Strict-Transport-Security"];
    expect(hsts).toContain("includeSubDomains");
    const maxAgeMatch = hsts.match(/max-age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    expect(Number(maxAgeMatch?.[1])).toBeGreaterThanOrEqual(31536000); // >= 1 year
  });

  it("sets a safe Referrer-Policy", () => {
    const headers = headerMap();
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("restricts sensitive Permissions-Policy features by default", () => {
    const headers = headerMap();
    const policy = headers["Permissions-Policy"];
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
  });

  it("ships CSP in report-only mode (does not block yet)", () => {
    const headers = headerMap();
    expect(headers["Content-Security-Policy-Report-Only"]).toBeTruthy();
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });
});

describe("buildContentSecurityPolicyReportOnly", () => {
  it("disallows framing by other origins", () => {
    expect(buildContentSecurityPolicyReportOnly()).toContain("frame-ancestors 'self'");
  });

  it("disallows plugin/object embeds", () => {
    expect(buildContentSecurityPolicyReportOnly()).toContain("object-src 'none'");
  });

  it("restricts form submissions to same-origin", () => {
    expect(buildContentSecurityPolicyReportOnly()).toContain("form-action 'self'");
  });

  it("allows Stripe.js for payment processing", () => {
    expect(buildContentSecurityPolicyReportOnly()).toContain("https://js.stripe.com");
  });

  it("allows Supabase for auth/storage/realtime", () => {
    const csp = buildContentSecurityPolicyReportOnly();
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
  });
});
