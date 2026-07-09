import { describe, expect, it, vi } from "vitest";
import { marketplaceCatalogVisibilityChanged, maybeEmitMarketplaceCatalogChanged } from "./listing-catalog-emit";

const { emitMarketplaceCatalogChanged } = vi.hoisted(() => ({
  emitMarketplaceCatalogChanged: vi.fn(),
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitMarketplaceCatalogChanged,
}));

describe("listing-catalog-emit", () => {
  it("detects publish and unpublish transitions", () => {
    expect(
      marketplaceCatalogVisibilityChanged(
        { status: "draft", moderationRemovedAt: null },
        { status: "active", moderationRemovedAt: null },
      ),
    ).toBe(true);
    expect(
      marketplaceCatalogVisibilityChanged(
        { status: "active", moderationRemovedAt: null },
        { status: "sold", moderationRemovedAt: null },
      ),
    ).toBe(true);
    expect(
      marketplaceCatalogVisibilityChanged(
        { status: "active", moderationRemovedAt: null },
        { status: "active", moderationRemovedAt: null },
      ),
    ).toBe(false);
  });

  it("emits only when catalog visibility changes", () => {
    emitMarketplaceCatalogChanged.mockClear();
    maybeEmitMarketplaceCatalogChanged({
      before: { status: "draft", moderationRemovedAt: null },
      after: { status: "active", moderationRemovedAt: null },
      listingId: "lst_1",
      sellerId: "usr_1",
      reason: "published",
    });
    expect(emitMarketplaceCatalogChanged).toHaveBeenCalledWith({
      listingId: "lst_1",
      sellerId: "usr_1",
      reason: "published",
    });

    emitMarketplaceCatalogChanged.mockClear();
    maybeEmitMarketplaceCatalogChanged({
      before: { status: "active", moderationRemovedAt: null },
      after: { status: "active", moderationRemovedAt: null },
      listingId: "lst_1",
    });
    expect(emitMarketplaceCatalogChanged).not.toHaveBeenCalled();
  });
});
