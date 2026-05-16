import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// Mirrors production helper logic for error classification (no DB).
function isMissingColumnError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return e.code === "P2022";
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /column.*does not exist|Unknown column/i.test(msg);
}

describe("isMissingColumnError", () => {
  it("detects P2022", () => {
    const err = new Prisma.PrismaClientKnownRequestError("col missing", {
      code: "P2022",
      clientVersion: "test",
    });
    expect(isMissingColumnError(err)).toBe(true);
  });
});
