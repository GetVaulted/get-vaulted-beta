import { describe, expect, it, vi, afterEach } from "vitest";
import {
  normalizeDatabaseUrlForServerlessRuntime,
  supabaseProjectRefFromUrl,
} from "@/lib/resolve-database-url";

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

describe("normalizeDatabaseUrlForServerlessRuntime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves direct db host unchanged", () => {
    const url = "postgresql://postgres:secret@db.xkaaicokjgmpbctfermj.supabase.co:5432/postgres";
    expect(normalizeDatabaseUrlForServerlessRuntime(url)).toBe(url);
  });

  it("switches session pooler to transaction pool in production serverless", () => {
    vi.stubEnv("NODE_ENV", "production");
    const url =
      "postgresql://postgres.xkaaicokjgmpbctfermj:secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres";
    const out = normalizeDatabaseUrlForServerlessRuntime(url);
    expect(out).toContain(":6543/");
    expect(out).toContain("pgbouncer=true");
    expect(out).toContain("connection_limit=1");
  });
});
