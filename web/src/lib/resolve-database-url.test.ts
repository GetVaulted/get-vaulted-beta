import { describe, expect, it } from "vitest";
import { supabaseProjectRefFromUrl } from "@/lib/resolve-database-url";

describe("supabaseProjectRefFromUrl", () => {
  it("parses Supabase HTTPS host", () => {
    expect(supabaseProjectRefFromUrl("https://xkaaicokjgmpbctfermj.supabase.co")).toBe("xkaaicokjgmpbctfermj");
  });

  it("parses pooler postgres URI", () => {
    expect(
      supabaseProjectRefFromUrl(
        "postgresql://postgres.xkaaicokjgmpbctfermj:secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres",
      ),
    ).toBe("xkaaicokjgmpbctfermj");
  });
});
