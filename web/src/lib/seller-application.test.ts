import { describe, expect, it } from "vitest";
import {
  actionRequiresNote,
  applicantCanSubmit,
  nextStatusForAction,
  sellerApprovalBlockMessage,
  validateSellerApplicationInput,
} from "@/lib/seller-application";

const good = {
  whatTheySell: "Football cards and sealed wax",
  whereTheySellNow: "eBay and Whatnot",
  experience: "Three years selling, hosted 50 live breaks.",
  monthlyVolume: "500_2000",
};

describe("validateSellerApplicationInput", () => {
  it("accepts a complete application and collapses whitespace", () => {
    const r = validateSellerApplicationInput({ ...good, whatTheySell: "  Football   cards and\nsealed wax " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.whatTheySell).toBe("Football cards and sealed wax");
  });

  it.each([
    ["whatTheySell", ""],
    ["whatTheySell", "short"],
    ["whereTheySellNow", "ab"],
    ["experience", "tiny"],
    ["monthlyVolume", "a million"],
    ["monthlyVolume", ""],
  ])("rejects bad %s=%j", (field, value) => {
    expect(validateSellerApplicationInput({ ...good, [field]: value }).ok).toBe(false);
  });

  it("rejects over-long answers and non-object bodies", () => {
    expect(validateSellerApplicationInput({ ...good, experience: "x".repeat(2001) }).ok).toBe(false);
    expect(validateSellerApplicationInput(null).ok).toBe(false);
    expect(validateSellerApplicationInput("nope").ok).toBe(false);
  });
});

describe("status rules", () => {
  it("lets applicants submit only when new or asked for more info", () => {
    expect(applicantCanSubmit("not_applied")).toBe(true);
    expect(applicantCanSubmit("info_requested")).toBe(true);
    for (const s of ["pending", "approved", "rejected", "revoked"] as const) {
      expect(applicantCanSubmit(s)).toBe(false);
    }
  });

  it("maps admin actions to the right next status", () => {
    expect(nextStatusForAction("pending", "approve")).toBe("approved");
    expect(nextStatusForAction("info_requested", "approve")).toBe("approved");
    expect(nextStatusForAction("rejected", "approve")).toBe("approved");
    expect(nextStatusForAction("revoked", "approve")).toBe("approved");
    expect(nextStatusForAction("pending", "reject")).toBe("rejected");
    expect(nextStatusForAction("info_requested", "reject")).toBe("rejected");
    expect(nextStatusForAction("pending", "request_info")).toBe("info_requested");
    expect(nextStatusForAction("approved", "revoke")).toBe("revoked");
  });

  it("refuses nonsensical transitions", () => {
    expect(nextStatusForAction("approved", "approve")).toBeNull();
    expect(nextStatusForAction("approved", "reject")).toBeNull();
    expect(nextStatusForAction("approved", "request_info")).toBeNull();
    expect(nextStatusForAction("pending", "revoke")).toBeNull();
    expect(nextStatusForAction("rejected", "reject")).toBeNull();
    expect(nextStatusForAction("info_requested", "request_info")).toBeNull();
  });

  it("requires a message for everything except approve", () => {
    expect(actionRequiresNote("approve")).toBe(false);
    expect(actionRequiresNote("reject")).toBe(true);
    expect(actionRequiresNote("request_info")).toBe(true);
    expect(actionRequiresNote("revoke")).toBe(true);
  });

  it("only approved sellers have no block message", () => {
    expect(sellerApprovalBlockMessage("approved")).toBeNull();
    for (const s of ["not_applied", "pending", "info_requested", "rejected", "revoked"] as const) {
      expect(sellerApprovalBlockMessage(s)).toBeTruthy();
    }
  });
});
