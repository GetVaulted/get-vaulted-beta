import { describe, expect, it } from "vitest";
import { buildOrderLifecycleEmailContent, buildOrderLifecycleTemplateVariables } from "@/lib/order-lifecycle-email";
import { RESEND_TEMPLATE_DEFINITIONS } from "@/lib/resend-templates/definitions";
import { buildSignupVerificationTemplateVariables } from "@/lib/send-verification-email";

describe("buildOrderLifecycleEmailContent", () => {
  it("builds purchase confirmation with total", () => {
    const out = buildOrderLifecycleEmailContent({
      userId: "u1",
      kind: "purchase_complete",
      orderId: "ord_1",
      listingTitle: "1952 Topps Mickey Mantle",
      totalUsd: 1250,
    });
    expect(out.subject).toContain("Order confirmed");
    expect(out.subject).toContain("Mickey Mantle");
    expect(out.text).toContain("$1,250.00");
    expect(out.html).toContain("ord_1");
  });

  it("includes tracking on shipped emails", () => {
    const out = buildOrderLifecycleEmailContent({
      userId: "u1",
      kind: "order_shipped",
      orderId: "ord_2",
      listingTitle: "Vintage Rolex",
      trackingNumber: "1Z999AA10123456784",
    });
    expect(out.text).toContain("1Z999AA10123456784");
    expect(out.subject).toContain("Shipped");
  });
});

describe("buildOrderLifecycleTemplateVariables", () => {
  it("maps purchase confirmation to Resend template variables", () => {
    const vars = buildOrderLifecycleTemplateVariables({
      userId: "u1",
      kind: "purchase_complete",
      orderId: "ord_1",
      listingTitle: "1952 Topps Mickey Mantle",
      totalUsd: 1250,
    });
    expect(vars.HEADLINE).toBe("Order confirmed");
    expect(vars.BODY_HTML).toContain("Mickey Mantle");
    expect(vars.BODY_HTML).toContain("$1,250.00");
    expect(vars.ORDER_URL).toContain("ord_1");
    expect(vars.TEXT_BODY).toContain("$1,250.00");
  });
});

describe("RESEND_TEMPLATE_DEFINITIONS", () => {
  it("defines order shell and signup templates with Resend placeholders", () => {
    expect(RESEND_TEMPLATE_DEFINITIONS).toHaveLength(2);
    const orderShell = RESEND_TEMPLATE_DEFINITIONS.find((d) => d.name === "gv-order-email-shell");
    expect(orderShell?.html).toContain("{{{HEADLINE}}}");
    expect(orderShell?.html).toContain("{{{BODY_HTML}}}");
    expect(orderShell?.variables.map((v) => v.key)).toEqual([
      "HEADLINE",
      "BODY_HTML",
      "CTA_LABEL",
      "ORDER_URL",
      "TEXT_BODY",
    ]);

    const signup = RESEND_TEMPLATE_DEFINITIONS.find((d) => d.name === "gv-signup-verification");
    expect(signup?.html).toContain("{{{VERIFICATION_CODE}}}");
  });
});

describe("buildSignupVerificationTemplateVariables", () => {
  it("includes code and expiry phrase", () => {
    const vars = buildSignupVerificationTemplateVariables("123456");
    expect(vars.VERIFICATION_CODE).toBe("123456");
    expect(vars.EXPIRES_PHRASE).toMatch(/expires/i);
  });
});
