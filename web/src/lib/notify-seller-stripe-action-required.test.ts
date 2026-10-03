import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotification = vi.hoisted(() => vi.fn().mockResolvedValue("notif_1"));
const sendResendEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const findMany = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "log_1" }));

vi.mock("@/lib/notifications", () => ({ createNotification }));
vi.mock("@/lib/resend-email", () => ({
  isResendEmailConfigured: () => true,
  sendResendEmail,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany },
    webhookEventLog: { findFirst, create },
  },
}));

import {
  notifySellersStripeActionRequired,
  stripeActionRequiredDedupeKey,
} from "@/lib/notify-seller-stripe-action-required";

describe("stripeActionRequiredDedupeKey", () => {
  it("sorts and dedupes currently_due items", () => {
    expect(stripeActionRequiredDedupeKey("u1", ["b", "a", "a"])).toBe("action:u1:a,b");
  });
});

describe("notifySellersStripeActionRequired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: "u1", email: "seller@test.com" }]);
  });

  it("skips when nothing is currently due", async () => {
    const r = await notifySellersStripeActionRequired({
      stripeAccountId: "acct_1",
      currentlyDue: [],
    });
    expect(r.skipped).toBe(true);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("notifies seller once for a due set", async () => {
    const r = await notifySellersStripeActionRequired({
      stripeAccountId: "acct_1",
      currentlyDue: ["individual.verification.document"],
    });
    expect(r.notified).toBe(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "u1",
        type: "stripe_connect_action_required",
        href: "/account/seller",
      }),
    );
    expect(sendResendEmail).toHaveBeenCalled();
  });

  it("does not re-notify for the same due set", async () => {
    findFirst.mockResolvedValue({ id: "existing" });
    const r = await notifySellersStripeActionRequired({
      stripeAccountId: "acct_1",
      currentlyDue: ["individual.verification.document"],
    });
    expect(r.notified).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
