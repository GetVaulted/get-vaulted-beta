import { describe, expect, it } from "vitest";
import {
  buildHelpArticleSitemapEntries,
  buildStaticSitemapEntries,
  SITEMAP_STATIC_PATHS,
} from "@/lib/sitemap-entries";

describe("sitemap-entries", () => {
  it("includes all static marketing and legal paths", () => {
    expect(SITEMAP_STATIC_PATHS).toContain("/marketplace");
    expect(SITEMAP_STATIC_PATHS).toContain("/privacy");
    const entries = buildStaticSitemapEntries(new Date("2026-07-09T00:00:00.000Z"));
    // Static pages plus one crawlable page per marketplace category.
    expect(entries).toHaveLength(SITEMAP_STATIC_PATHS.length + 6);
    expect(entries[0]?.url).toBe("https://shopgetvaulted.com/");
    expect(entries.map((e) => e.url)).toContain("https://shopgetvaulted.com/marketplace/category/trading-cards");
  });

  it("includes every help center article", () => {
    const entries = buildHelpArticleSitemapEntries();
    expect(entries.length).toBeGreaterThan(40);
    expect(entries[0]?.url).toMatch(/^https:\/\/shopgetvaulted\.com\/support\//);
  });
});
