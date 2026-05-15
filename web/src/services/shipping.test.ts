import { describe, expect, it } from "vitest";
import { mapShippoTrackingToFulfillment } from "@/services/shipping";

describe("mapShippoTrackingToFulfillment", () => {
  it("maps delivered", () => {
    expect(mapShippoTrackingToFulfillment("DELIVERED")).toBe("delivered");
  });

  it("maps transit", () => {
    expect(mapShippoTrackingToFulfillment("IN_TRANSIT")).toBe("in_transit");
  });

  it("maps exception-like statuses", () => {
    expect(mapShippoTrackingToFulfillment("FAILURE")).toBe("exception");
  });

  it("returns null for empty", () => {
    expect(mapShippoTrackingToFulfillment(undefined)).toBe(null);
  });
});
