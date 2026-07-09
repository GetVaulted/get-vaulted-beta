import type { MetadataRoute } from "next";
import { canonicalShareSiteUrl } from "@/lib/live-room-share-metadata";

export default function robots(): MetadataRoute.Robots {
  const site = canonicalShareSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/marketplace",
          "/listing/",
          "/seller/",
          "/live/",
          "/support",
          "/app",
          "/merch",
          "/terms",
          "/privacy",
          "/community-guidelines",
          "/dmca",
          "/prohibited-items",
          "/reporting-safety",
          "/account-deletion",
        ],
        disallow: [
          "/account/",
          "/admin/",
          "/api/",
          "/checkout/",
          "/orders/",
          "/signin",
          "/signup",
          "/complete-profile",
          "/forgot-password",
          "/reset-password",
          "/seller/listings/",
          "/seller/live/",
          "/sell/",
          "/qa/",
          "/mobile/",
          "/support/tickets/",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
