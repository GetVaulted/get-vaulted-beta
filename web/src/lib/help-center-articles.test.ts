import { describe, expect, it } from "vitest";
import { getHelpArticle, HELP_ARTICLES, HELP_SECTIONS, searchHelpArticles } from "@/lib/help-center-articles";

describe("help-center-articles", () => {
  it("has articles for every section", () => {
    for (const section of HELP_SECTIONS) {
      const articles = HELP_ARTICLES.filter((a) => a.sectionId === section.id);
      expect(articles.length).toBeGreaterThan(0);
    }
  });

  it("finds articles by body keywords", () => {
    const results = searchHelpArticles("pyt");
    expect(results.some((a) => a.id === "live-pyt-pyd")).toBe(true);
  });

  it("loads article by id", () => {
    expect(getHelpArticle("buy-wallet")?.title).toMatch(/Vault Wallet/i);
  });
});
