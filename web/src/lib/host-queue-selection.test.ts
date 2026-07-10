import { describe, expect, it } from "vitest";
import { hostPinLotBlocked } from "@/lib/host-queue-selection";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

function row(item: Partial<LiveRoomItemDTO>) {
  return {
    item: {
      id: "item-1",
      salesFormat: "auction",
      biddingOpen: false,
      auctionEndsAt: null,
      ...item,
    } as LiveRoomItemDTO,
  };
}

describe("hostPinLotBlocked", () => {
  it("blocks while a non-variant timed auction is live", () => {
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    expect(
      hostPinLotBlocked(
        row({
          biddingOpen: true,
          auctionEndsAt: "2026-07-10T18:01:00.000Z",
        }),
        now,
      ),
    ).toBe(true);
  });

  it("does not block after the auction timer has elapsed", () => {
    const now = Date.parse("2026-07-10T18:02:00.000Z");
    expect(
      hostPinLotBlocked(
        row({
          biddingOpen: true,
          auctionEndsAt: "2026-07-10T18:01:00.000Z",
        }),
        now,
      ),
    ).toBe(false);
  });

  it("does not block variant/PYT boards", () => {
    expect(
      hostPinLotBlocked(
        row({
          salesFormat: "variant_selection",
          biddingOpen: true,
          auctionEndsAt: "2026-07-10T18:01:00.000Z",
        }),
        Date.parse("2026-07-10T18:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
