import type { MetadataRoute } from "next";
import { buildFullSitemapEntries, buildHelpArticleSitemapEntries, buildStaticSitemapEntries } from "@/lib/sitemap-entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    return await buildFullSitemapEntries();
  } catch (e) {
    console.error("[sitemap] fatal error — serving static + help articles only", e);
    const now = new Date();
    return [...buildStaticSitemapEntries(now), ...buildHelpArticleSitemapEntries(now)];
  }
}
