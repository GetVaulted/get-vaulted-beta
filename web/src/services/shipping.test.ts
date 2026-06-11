import { describe, expect, it } from "vitest";
import { buildOrderUpdateForShippoFulfillment, mapShippoTrackingToFulfillment } from "@/services/shipping";

describe("mapShippoTrackingToFulfillment", () => {
  it("maps delivered", () => {
    expect(mapShippoTrackingToFulfillment("DELIVERED")).toBe("delivered");
  });

  it("maps out for delivery", () => {
    expect(mapShippoTrackingToFulfillment("OUT_FOR_DELIVERY")).toBe("out_for_delivery");
  });

  it("maps transit", () => {
    expect(mapShippoTrackingToFulfillment("IN_TRANSIT")).toBe("in_transit");
    expect(mapShippoTrackingToFulfillment("TRANSIT")).toBe("in_transit");
  });

  it("maps exception-like statuses", () => {
    expect(mapShippoTrackingToFulfillment("FAILURE")).toBe("exception");
  });

  it("returns null for empty or pre-transit", () => {
    expect(mapShippoTrackingToFulfillment(undefined)).toBe(null);
    expect(mapShippoTrackingToFulfillment("PRE_TRANSIT")).toBe(null);
  });
});

describe("buildOrderUpdateForShippoFulfillment", () => {
  it("marks shipped on first in_transit scan", () => {
    const update = buildOrderUpdateForShippoFulfillment({
      mapped: "in_transit",
      carrierStatus: "TRANSIT",
      order: { status: "paid", shippedAt: null, carrierAcceptedAt: null },
    });
    expect(update.status).toBe("shipped");
    expect(update.shippedAt).toBeInstanceOf(Date);
    expect(update.carrierAcceptedAt).toBeInstanceOf(Date);
    expect(update.fulfillmentStatus).toBe("in_transit");
  });

  it("sets delivery timestamps on delivered", () => {
    const update = buildOrderUpdateForShippoFulfillment({
      mapped: "delivered",
      carrierStatus: "DELIVERED",
      order: { status: "shipped", shippedAt: new Date(), carrierAcceptedAt: new Date() },
    });
    expect(update.status).toBe("delivered");
    expect(update.deliveryConfirmedAt).toBeInstanceOf(Date);
  });

  it("keeps shipped status on out for delivery", () => {
    const update = buildOrderUpdateForShippoFulfillment({
      mapped: "out_for_delivery",
      carrierStatus: "OUT_FOR_DELIVERY",
      order: { status: "paid", shippedAt: null, carrierAcceptedAt: null },
    });
    expect(update.status).toBe("shipped");
    expect(update.fulfillmentStatus).toBe("out_for_delivery");
  });
});
