import { describe, expect, it } from "vitest";
import {
  buildExclusiveHostPinUpdates,
  hostPinnedBuyerVariant,
  hostSpotBoardPinEnabled,
  pinnedVariantBuyerPrimaryLabel,
  variantIsAvailable,
} from "@/lib/live-item-variant-presets";
import { mergeVariantPurchasedIntoItems } from "@/lib/live-room-variant-merge";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import type { LiveItemVariantDTO } from "@/lib/live-item-variant-serialize";

const pytVariants: Omit<LiveItemVariantDTO, "quantityInitial" | "sortOrder">[] = [
  {
    id: "chiefs",
    liveRoomItemId: "item_pyt",
    label: "Chiefs",
    priceUsd: 40,
    quantityRemaining: 1,
    soldCount: 0,
    isHot: false,
    imageUrl: "",
    color: "",
    status: "available",
    buyerUsername: null,
  },
  {
    id: "bills",
    liveRoomItemId: "item_pyt",
    label: "Bills",
    priceUsd: 40,
    quantityRemaining: 1,
    soldCount: 0,
    isHot: false,
    imageUrl: "",
    color: "",
    status: "available",
    buyerUsername: null,
  },
];

function pytItem(overrides: Partial<LiveRoomItemDTO> = {}): LiveRoomItemDTO {
  return {
    id: "item_pyt",
    title: "PYT Break",
    displayTitle: "PYT Break",
    status: "active",
    salesFormat: "variant_selection",
    variantAssignmentMode: "pick",
    sortOrder: 0,
    itemVersion: 0,
    createdAt: new Date().toISOString(),
    variants: pytVariants.map((v) => ({ ...v, quantityInitial: 1, sortOrder: 0 })),
    ...overrides,
  } as unknown as LiveRoomItemDTO;
}

describe("PYT team pinning", () => {
  it("host can pin an available PYT team", () => {
    const updates = buildExclusiveHostPinUpdates(
      [{ id: "chiefs" }, { id: "bills" }],
      "chiefs",
    );
    expect(updates).toEqual([
      { id: "chiefs", isHot: true },
      { id: "bills", isHot: false },
    ]);
    expect(hostSpotBoardPinEnabled({ hostMode: true, hasPinHandler: true, variantId: "chiefs", sold: false })).toBe(
      true,
    );
  });

  it("buyer sees pinned team CTA", () => {
    const pinned = hostPinnedBuyerVariant(
      [
        { ...pytVariants[0], isHot: true },
        pytVariants[1],
      ],
      "pick",
    );
    expect(pinned?.id).toBe("chiefs");
    expect(pinnedVariantBuyerPrimaryLabel("variant_selection", 40)).toBe("Place bid $40.00");
  });

  it("buyer cannot pin teams", () => {
    expect(
      hostSpotBoardPinEnabled({ hostMode: false, hasPinHandler: true, variantId: "chiefs", sold: false }),
    ).toBe(false);
    expect(
      hostSpotBoardPinEnabled({ hostMode: true, hasPinHandler: false, variantId: "chiefs", sold: false }),
    ).toBe(false);
  });

  it("sold team cannot be pinned again", () => {
    expect(variantIsAvailable({ quantityRemaining: 0, status: "sold_out" })).toBe(false);
    expect(
      hostSpotBoardPinEnabled({ hostMode: true, hasPinHandler: true, variantId: "chiefs", sold: true }),
    ).toBe(false);
    expect(
      hostPinnedBuyerVariant([{ ...pytVariants[0], isHot: true, quantityRemaining: 0, status: "sold_out" }], "pick"),
    ).toBeNull();
  });

  it("selling pinned team marks only that team sold", () => {
    const item = pytItem({
      quantity: 32,
      quantityInitial: 32,
      soldQuantity: 0,
      remainingQuantity: 32,
      currentUnitNumber: 1,
      displayTitle: "PYT Break #1",
      progressLabel: "0 / 32 sold",
      variants: [
        { ...pytVariants[0], isHot: true, quantityInitial: 1, sortOrder: 0 },
        { ...pytVariants[1], quantityInitial: 1, sortOrder: 1 },
      ],
    });
    const next = mergeVariantPurchasedIntoItems([item], {
      itemId: "item_pyt",
      variantId: "chiefs",
      itemVersion: 1,
      quantity: 1,
    });
    const chiefs = next[0]?.variants?.find((v) => v.id === "chiefs");
    const bills = next[0]?.variants?.find((v) => v.id === "bills");
    expect(chiefs?.status).toBe("sold_out");
    expect(chiefs?.quantityRemaining).toBe(0);
    expect(chiefs?.isHot).toBe(false);
    expect(bills?.status).toBe("available");
    expect(bills?.quantityRemaining).toBe(1);
    expect(next[0]?.displayTitle).toBe("PYT Break #2");
    expect(next[0]?.soldQuantity).toBe(1);
    expect(next[0]?.progressLabel).toBe("1 / 32 sold");
  });
});
