import { describe, expect, it } from "vitest";
import {
  PROFILE_BIO_MAX,
  normalizeProfileBannerUrl,
  normalizeProfileBio,
  normalizeProfileLinks,
  profileLinkDisplay,
  profileLinksFromStored,
} from "@/lib/seller-profile-fields";

describe("normalizeProfileBio", () => {
  it("leaves undefined alone and clears on blank/null", () => {
    expect(normalizeProfileBio(undefined)).toBeUndefined();
    expect(normalizeProfileBio(null)).toBeNull();
    expect(normalizeProfileBio("   \n ")).toBeNull();
    expect(normalizeProfileBio(42)).toBeUndefined();
  });
  it("strips control chars and collapses blank lines", () => {
    expect(normalizeProfileBio("Hi\u0000 there\r\n\r\n\r\n\r\nSecond")).toBe("Hi there\n\nSecond");
  });
  it("caps at the max length by characters", () => {
    const out = normalizeProfileBio("a".repeat(500)) as string;
    expect(Array.from(out).length).toBe(PROFILE_BIO_MAX);
  });
});

describe("normalizeProfileBannerUrl", () => {
  it("accepts http(s) only", () => {
    expect(normalizeProfileBannerUrl("https://x.supabase.co/b.jpg")).toBe("https://x.supabase.co/b.jpg");
    expect(normalizeProfileBannerUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeProfileBannerUrl("/relative.jpg")).toBeUndefined();
    expect(normalizeProfileBannerUrl("")).toBeNull();
  });
});

describe("normalizeProfileLinks", () => {
  it("normalizes handles and urls to canonical urls", () => {
    const r = normalizeProfileLinks({
      instagram: "@mnmheat",
      tiktok: "https://www.tiktok.com/@mnm.heat?lang=en",
      x: "twitter.com/mnmheat",
      youtube: "@mnmheat",
      website: "mnmheat.com/shop",
    });
    expect(r).toEqual({
      ok: true,
      links: {
        instagram: "https://instagram.com/mnmheat",
        tiktok: "https://www.tiktok.com/@mnm.heat",
        x: "https://x.com/mnmheat",
        youtube: "https://www.youtube.com/@mnmheat",
        website: "https://mnmheat.com/shop",
      },
    });
  });
  it("drops blanks and returns null when empty", () => {
    expect(normalizeProfileLinks({ instagram: "  " })).toEqual({ ok: true, links: null });
    expect(normalizeProfileLinks(null)).toEqual({ ok: true, links: null });
    expect(normalizeProfileLinks(undefined)).toBeUndefined();
  });
  it("rejects a network link pointing at another host", () => {
    const r = normalizeProfileLinks({ instagram: "https://evil.com/mnmheat" });
    expect(r).toEqual({ ok: false, key: "instagram", error: "Instagram link is not valid." });
  });
  it("rejects bad websites", () => {
    for (const w of ["javascript:alert(1)", "http://localhost:3000", "http://10.0.0.1", "https://user:pw@a.com", "nodot"]) {
      expect(normalizeProfileLinks({ website: w })).toMatchObject({ ok: false, key: "website" });
    }
  });
  it("rejects invalid handles", () => {
    expect(normalizeProfileLinks({ x: "this_handle_is_way_too_long" })).toMatchObject({ ok: false, key: "x" });
    expect(normalizeProfileLinks({ instagram: "bad handle" })).toMatchObject({ ok: false, key: "instagram" });
  });
  it("ignores unknown keys", () => {
    expect(normalizeProfileLinks({ myspace: "x", instagram: "abc" })).toEqual({
      ok: true,
      links: { instagram: "https://instagram.com/abc" },
    });
  });
});

describe("profileLinksFromStored", () => {
  it("re-validates stored values and orders them", () => {
    const list = profileLinksFromStored({ website: "https://a.com/", instagram: "https://instagram.com/abc", x: "javascript:1" });
    expect(list.map((l) => l.key)).toEqual(["instagram", "website"]);
  });
  it("returns [] for junk", () => {
    expect(profileLinksFromStored(null)).toEqual([]);
    expect(profileLinksFromStored([1])).toEqual([]);
  });
});

describe("profileLinkDisplay", () => {
  it("shows handles and bare hosts", () => {
    expect(profileLinkDisplay("instagram", "https://instagram.com/mnmheat")).toBe("@mnmheat");
    expect(profileLinkDisplay("tiktok", "https://www.tiktok.com/@mnm.heat")).toBe("@mnm.heat");
    expect(profileLinkDisplay("website", "https://www.mnmheat.com/shop")).toBe("mnmheat.com");
    expect(profileLinkDisplay("youtube", "https://www.youtube.com/@mnmheat")).toBe("@mnmheat");
  });
});
