import { describe, expect, it } from "vitest";
import { stripeConnectMobileReturnUrls, stripeConnectPublicAppBase } from "@/lib/stripe-connect-public-app-url";

describe("stripeConnectPublicAppBase", () => {
  it("prefers STRIPE_CONNECT_PUBLIC_APP_URL", () => {
    const prev = process.env.STRIPE_CONNECT_PUBLIC_APP_URL;
    process.env.STRIPE_CONNECT_PUBLIC_APP_URL = "https://beta.shopgetvaulted.com/";
    try {
      expect(stripeConnectPublicAppBase()).toBe("https://beta.shopgetvaulted.com");
    } finally {
      if (prev === undefined) delete process.env.STRIPE_CONNECT_PUBLIC_APP_URL;
      else process.env.STRIPE_CONNECT_PUBLIC_APP_URL = prev;
    }
  });

  it("uses request host when env URLs are local", () => {
    const prevAuth = process.env.NEXTAUTH_URL;
    const prevPublic = process.env.NEXT_PUBLIC_SITE_URL;
    const prevExplicit = process.env.STRIPE_CONNECT_PUBLIC_APP_URL;
    delete process.env.STRIPE_CONNECT_PUBLIC_APP_URL;
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const req = new Request("https://beta.shopgetvaulted.com/api/stripe/connect/create-onboarding-link", {
        headers: {
          host: "beta.shopgetvaulted.com",
          "x-forwarded-host": "beta.shopgetvaulted.com",
          "x-forwarded-proto": "https",
        },
      });
      expect(stripeConnectPublicAppBase(req)).toBe("https://beta.shopgetvaulted.com");
      const urls = stripeConnectMobileReturnUrls(req);
      expect(urls.returnUrl).toBe("https://beta.shopgetvaulted.com/mobile/stripe-connect-return");
    } finally {
      if (prevAuth === undefined) delete process.env.NEXTAUTH_URL;
      else process.env.NEXTAUTH_URL = prevAuth;
      if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prevPublic;
      if (prevExplicit === undefined) delete process.env.STRIPE_CONNECT_PUBLIC_APP_URL;
      else process.env.STRIPE_CONNECT_PUBLIC_APP_URL = prevExplicit;
    }
  });
});
