import { describe, expect, it } from "vitest";
import {
  isOrderPastExcessiveShippingDelay,
  resolveOrderHandlingClockStartAt,
} from "@/services/payout/live-order-handling-clock";

describe("live-order-handling-clock", () => {
  const purchased = new Date("2026-07-01T12:00:00.000Z");
  const showEnded = new Date("2026-07-10T12:00:00.000Z");

  it("starts marketplace handling at purchase time", () => {
    expect(
      resolveOrderHandlingClockStartAt({
        orderCreatedAt: purchased,
        isLiveShowLinked: false,
        liveShowEndedAt: null,
      }),
    ).toEqual(purchased);
  });

  it("does not start live handling until the show ends", () => {
    expect(
      resolveOrderHandlingClockStartAt({
        orderCreatedAt: purchased,
        isLiveShowLinked: true,
        liveShowEndedAt: null,
      }),
    ).toBeNull();
  });

  it("starts live handling at show end", () => {
    expect(
      resolveOrderHandlingClockStartAt({
        orderCreatedAt: purchased,
        isLiveShowLinked: true,
        liveShowEndedAt: showEnded,
      }),
    ).toEqual(showEnded);
  });

  it("does not flag live pre-show sales as delayed before show end", () => {
    expect(
      isOrderPastExcessiveShippingDelay({
        orderCreatedAt: purchased,
        isLiveShowLinked: true,
        liveShowEndedAt: null,
        now: new Date("2026-07-20T12:00:00.000Z"),
        delayDays: 7,
      }),
    ).toBe(false);
  });

  it("flags live sales only after show end + delay window", () => {
    expect(
      isOrderPastExcessiveShippingDelay({
        orderCreatedAt: purchased,
        isLiveShowLinked: true,
        liveShowEndedAt: showEnded,
        now: new Date("2026-07-16T12:00:00.000Z"),
        delayDays: 7,
      }),
    ).toBe(false);

    expect(
      isOrderPastExcessiveShippingDelay({
        orderCreatedAt: purchased,
        isLiveShowLinked: true,
        liveShowEndedAt: showEnded,
        now: new Date("2026-07-18T12:00:00.000Z"),
        delayDays: 7,
      }),
    ).toBe(true);
  });

  it("still flags marketplace delays from purchase day", () => {
    expect(
      isOrderPastExcessiveShippingDelay({
        orderCreatedAt: purchased,
        isLiveShowLinked: false,
        liveShowEndedAt: null,
        now: new Date("2026-07-10T12:00:00.000Z"),
        delayDays: 7,
      }),
    ).toBe(true);
  });
});
