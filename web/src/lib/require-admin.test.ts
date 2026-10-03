import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
  requireUserIdFromSupabaseBearer: vi.fn(),
  requestHasSupabaseBearer: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getServerSessionSafe: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: hoisted.findUnique },
  },
}));

vi.mock("@/lib/mobile-supabase-bearer", () => ({
  requestHasSupabaseBearer: hoisted.requestHasSupabaseBearer,
}));

vi.mock("@/lib/require-supabase-bearer", () => ({
  requireUserIdFromSupabaseBearer: hoisted.requireUserIdFromSupabaseBearer,
}));

import { requireAdmin } from "@/lib/require-admin";
import { getServerSessionSafe } from "@/lib/auth";

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requestHasSupabaseBearer.mockReturnValue(false);
  });

  it("returns ok for an active admin", async () => {
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "admin_1" } } as never);
    hoisted.findUnique.mockResolvedValue({ role: "admin", suspendedAt: null });

    const result = await requireAdmin();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe("admin_1");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSessionSafe).mockResolvedValue(null);

    const result = await requireAdmin();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "user_1" } } as never);
    hoisted.findUnique.mockResolvedValue({ role: "user", suspendedAt: null });

    const result = await requireAdmin();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns 403 for a suspended admin (regression: suspension must block admin API access, not just the admin UI)", async () => {
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "admin_2" } } as never);
    hoisted.findUnique.mockResolvedValue({ role: "admin", suspendedAt: new Date("2026-01-01T00:00:00Z") });

    const result = await requireAdmin();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("accepts mobile Supabase Bearer for an active admin", async () => {
    const request = new Request("http://localhost/api/admin/me", {
      headers: { Authorization: "Bearer mobile.jwt" },
    });
    hoisted.requestHasSupabaseBearer.mockReturnValue(true);
    hoisted.requireUserIdFromSupabaseBearer.mockResolvedValue({
      userId: "admin_mobile",
      supabaseAuthUserId: "sb_1",
    });
    hoisted.findUnique.mockResolvedValue({ role: "admin", suspendedAt: null });

    const result = await requireAdmin(request);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe("admin_mobile");
    expect(getServerSessionSafe).not.toHaveBeenCalled();
  });

  it("returns 403 for Bearer non-admin", async () => {
    const request = new Request("http://localhost/api/admin/me", {
      headers: { Authorization: "Bearer mobile.jwt" },
    });
    hoisted.requestHasSupabaseBearer.mockReturnValue(true);
    hoisted.requireUserIdFromSupabaseBearer.mockResolvedValue({
      userId: "user_mobile",
      supabaseAuthUserId: "sb_2",
    });
    hoisted.findUnique.mockResolvedValue({ role: "user", suspendedAt: null });

    const result = await requireAdmin(request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("propagates Bearer auth failures", async () => {
    const request = new Request("http://localhost/api/admin/me", {
      headers: { Authorization: "Bearer bad" },
    });
    hoisted.requestHasSupabaseBearer.mockReturnValue(true);
    hoisted.requireUserIdFromSupabaseBearer.mockResolvedValue(
      NextResponse.json({ error: "Invalid or expired session" }, { status: 401 }),
    );

    const result = await requireAdmin(request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
