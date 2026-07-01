import { describe, expect, it } from "vitest";
import {
  normalizePhoneForShippo,
  resolveBuyerShippoContact,
  resolveSellerShippoContact,
  withShippoContact,
} from "@/lib/shippo-label-contacts";

describe("normalizePhoneForShippo", () => {
  it("accepts 10-digit US numbers", () => {
    expect(normalizePhoneForShippo("(555) 123-4567")).toBe("5551234567");
  });

  it("strips leading country code", () => {
    expect(normalizePhoneForShippo("+1 555-123-4567")).toBe("5551234567");
  });

  it("rejects too-short numbers", () => {
    expect(normalizePhoneForShippo("55512")).toBeNull();
  });
});

describe("resolveSellerShippoContact", () => {
  it("requires email and phone", () => {
    expect(
      resolveSellerShippoContact({
        userEmail: "seller@example.com",
        addressPhone: "5551234567",
      }),
    ).toEqual({ email: "seller@example.com", phone: "5551234567" });
  });

  it("returns null when phone missing", () => {
    expect(resolveSellerShippoContact({ userEmail: "seller@example.com" })).toBeNull();
  });
});

describe("resolveBuyerShippoContact", () => {
  it("requires buyer address phone", () => {
    expect(
      resolveBuyerShippoContact({
        userEmail: "buyer@example.com",
        addressPhone: "5559876543",
      }),
    ).toEqual({ email: "buyer@example.com", phone: "5559876543" });
  });

  it("returns null when phone missing", () => {
    expect(resolveBuyerShippoContact({ userEmail: "buyer@example.com" })).toBeNull();
  });
});

describe("withShippoContact", () => {
  it("adds email and phone to address payload", () => {
    expect(
      withShippoContact(
        {
          name: "Seller",
          street1: "1 Main",
          city: "Austin",
          state: "TX",
          zip: "78701",
          country: "US",
        },
        { email: "seller@example.com", phone: "5551234567" },
      ),
    ).toMatchObject({ email: "seller@example.com", phone: "5551234567" });
  });
});
