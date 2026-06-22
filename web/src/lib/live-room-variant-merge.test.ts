import { describe, expect, it } from "vitest";
import { mergeVariantPurchasedIntoItems, pickNewerVariantAwareLiveRoomItem } from "./live-room-variant-merge";
import type { LiveRoomItemDTO, LiveItemVariantDTO } from "@/lib/live-room-serialize";

function variantItem(overrides: Partial<LiveRoomItemDTO> = {}): LiveRoomItemDTO {
  return {
    id: "item_1",
    title: "PYT Break",
    displayTitle: "PYT Break",
    status: "active",
    salesFormat: "variant_selection",
    sortOrder: 0,
    itemVersion: 0,
    createdAt: new Date().toISOString(),
    variants: [
      {
        id: "var_a",
        label: "Team A",
        priceUsd: 25,
        quantityInitial: 1,
        quantityRemaining: 1,
        soldCount: 0,
        status: "available",
        sortOrder: 0,
      },
      {
        id: "var_b",
        label: "Team B",
        priceUsd: 25,
        quantityInitial: 1,
        quantityRemaining: 1,
        soldCount: 0,
        status: "available",
        sortOrder: 1,
      },
    ],
    ...overrides,
  } as unknown as LiveRoomItemDTO;
}

describe("live-room-variant-merge", () => {
  it("decrements quantity on first purchase", () => {
    const next = mergeVariantPurchasedIntoItems([variantItem()], {
      itemId: "item_1",
      variantId: "var_a",
      itemVersion: 1,
      quantity: 1,
    });
    expect(next[0]?.variants?.[0]?.quantityRemaining).toBe(0);
    expect(next[0]?.variants?.[0]?.soldCount).toBe(1);
    expect(next[0]?.variants?.[0]?.status).toBe("sold_out");
    expect(next[0]?.itemVersion).toBe(1);
  });

  it("prefers incoming row when sold count advanced at same itemVersion", () => {
    const prev = variantItem({
      itemVersion: 2,
      variants: [
        {
          id: "var_a",
          label: "Team A",
          priceUsd: 25,
          quantityInitial: 1,
          quantityRemaining: 1,
          soldCount: 0,
          status: "available",
          sortOrder: 0,
        } as LiveItemVariantDTO,
      ],
    });
    const incoming = variantItem({
      itemVersion: 2,
      variants: [
        {
          id: "var_a",
          label: "Team A",
          priceUsd: 25,
          quantityInitial: 1,
          quantityRemaining: 0,
          soldCount: 1,
          status: "sold_out",
          sortOrder: 0,
        } as LiveItemVariantDTO,
      ],
    });
    expect(pickNewerVariantAwareLiveRoomItem(prev, incoming).variants?.[0]?.quantityRemaining).toBe(0);
  });
});
