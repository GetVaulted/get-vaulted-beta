import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const hoisted = vi.hoisted(() => ({
  resolveSeller: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/resolve-account-seller-user", () => ({
  resolveAccountSellerUserId: hoisted.resolveSeller,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: hoisted.userFindUnique, update: hoisted.userUpdate } },
}));

import { GET, POST } from "@/app/api/account/seller/live-terms/route";
import { CURRENT_SELLER_TERMS_VERSION } from "@/lib/seller-live-terms";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));

describe("seller live-terms route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveSeller.mockResolvedValue({ userId: "seller_1" });
  });

  it("reports required for a seller on an older terms version", async () => {
    hoisted.userFindUnique.mockResolvedValue({ role: "seller", sellerTermsVersion: "2026-07-03" });
    const res = await GET(new Request("http://x"));
    expect(await res.json()).toEqual({ required: true, version: CURRENT_SELLER_TERMS_VERSION });
  });

  it("reports not required once the current version is accepted, and for admins", async () => {
    hoisted.userFindUnique.mockResolvedValue({ role: "seller", sellerTermsVersion: CURRENT_SELLER_TERMS_VERSION });
    expect(((await (await GET(new Request("http://x"))).json()) as { required: boolean }).required).toBe(false);
    hoisted.userFindUnique.mockResolvedValue({ role: "admin", sellerTermsVersion: null });
    expect(((await (await GET(new Request("http://x"))).json()) as { required: boolean }).required).toBe(false);
  });

  it("passes through the auth failure", async () => {
    hoisted.resolveSeller.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });

  it("records acceptance of the current version", async () => {
    const at = new Date("2026-10-06T12:00:00.000Z");
    hoisted.userUpdate.mockResolvedValue({ sellerTermsVersion: CURRENT_SELLER_TERMS_VERSION, sellerTermsAcceptedAt: at });
    const res = await post({ accepted: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ required: false, version: CURRENT_SELLER_TERMS_VERSION, acceptedAt: at.toISOString() });
    expect(hoisted.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "seller_1" },
        data: expect.objectContaining({ sellerTermsVersion: CURRENT_SELLER_TERMS_VERSION }),
      }),
    );
  });

  it("rejects a POST that does not explicitly accept", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ accepted: false })).status).toBe(400);
    expect(hoisted.userUpdate).not.toHaveBeenCalled();
  });
});
