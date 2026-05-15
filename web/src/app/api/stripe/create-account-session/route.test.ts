import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  accountSessionsCreate: vi.fn(),
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
    user: { findUnique: hoisted.findUnique, update: hoisted.update },
  },
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: vi.fn(() => true),
  getStripe: vi.fn(() => ({
    accounts: { create: vi.fn().mockResolvedValue({ id: "acct_new_test" }) },
    accountSessions: { create: hoisted.accountSessionsCreate },
  })),
}));

import { POST } from "@/app/api/stripe/create-account-session/route";
import { getServerSessionSafe } from "@/lib/auth";
import { isStripeConfigured, getStripe } from "@/lib/stripe";

describe("POST /api/stripe/create-account-session", () => {
  beforeEach(() => {
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "seller_1" } } as never);
    hoisted.findUnique.mockResolvedValue({
      id: "seller_1",
      email: "s@test.internal",
      stripeAccountId: "acct_existing_1",
    });
    hoisted.accountSessionsCreate.mockResolvedValue({ client_secret: "acs_secret_abc" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns clientSecret when Stripe session is created", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { clientSecret?: string };
    expect(j.clientSecret).toBe("acs_secret_abc");
    expect(hoisted.accountSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_existing_1",
        components: {
          account_onboarding: {
            enabled: true,
          },
        },
      }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSessionSafe).mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 503 when Stripe is not configured", async () => {
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "seller_1" } } as never);
    vi.mocked(isStripeConfigured).mockReturnValueOnce(false);
    const res = await POST();
    expect(res.status).toBe(503);
  });

  it("creates Connect account when seller has no stripeAccountId", async () => {
    hoisted.findUnique.mockResolvedValueOnce({
      id: "seller_2",
      email: "s2@test.internal",
      username: "sellerTwo",
      stripeAccountId: null,
    });
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "seller_2" } } as never);
    const accountsCreate = vi.fn().mockResolvedValue({ id: "acct_created_2" });
    vi.mocked(getStripe).mockReturnValueOnce({
      accounts: { create: accountsCreate },
      accountSessions: { create: hoisted.accountSessionsCreate },
    } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        country: "US",
        business_type: "individual",
        business_profile: expect.objectContaining({
          name: "sellerTwo on Get Vaulted",
          product_description: expect.stringContaining("Get Vaulted marketplace"),
          url: "https://shopgetvaulted.com/seller/sellerTwo",
          mcc: "5999",
        }),
      }),
    );
    expect(hoisted.update).toHaveBeenCalledWith({
      where: { id: "seller_2" },
      data: { stripeAccountId: "acct_created_2" },
    });
  });
});
