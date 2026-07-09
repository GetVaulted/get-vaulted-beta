import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUserFindUnique, mockAddressFindFirst, mockAddressUpdate, mockAddressCreate, mockTransaction } = vi.hoisted(
  () => ({
    mockUserFindUnique: vi.fn(),
    mockAddressFindFirst: vi.fn(),
    mockAddressUpdate: vi.fn(),
    mockAddressCreate: vi.fn(),
    mockTransaction: vi.fn(),
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    address: {
      findFirst: mockAddressFindFirst,
      update: mockAddressUpdate,
      create: mockAddressCreate,
      updateMany: vi.fn(),
    },
    $transaction: mockTransaction,
  },
}));

import { ensureBuyerShippingFromSellerShipFrom } from "@/lib/ensure-buyer-shipping-from-seller-ship-from";

const sellerUser = {
  email: "seller@example.com",
  name: "Seller Name",
  username: "seller1",
  shipFromName: "Seller Name",
  shipFromStreet: "100 Main St",
  shipFromCity: "Austin",
  shipFromState: "TX",
  shipFromZip: "78701",
  shipFromCountry: "US",
  defaultShipFromAddressId: "addr_sf",
  defaultShipFromAddress: {
    name: "Warehouse",
    fullName: "Seller Name",
    line1: "100 Main St",
    line2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
    phone: "+15125550100",
    isVerified: true,
  },
};

describe("ensureBuyerShippingFromSellerShipFrom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(sellerUser);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        address: {
          updateMany: vi.fn(),
          create: mockAddressCreate,
        },
      }),
    );
  });

  it("creates a default shipping address from seller ship-from when none exists", async () => {
    mockAddressFindFirst.mockResolvedValue(null);
    mockAddressCreate.mockResolvedValue({ id: "ship_1" });

    const result = await ensureBuyerShippingFromSellerShipFrom("user_1");

    expect(result).toEqual({ created: true, updated: false, addressId: "ship_1" });
    expect(mockAddressCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          type: "shipping",
          line1: "100 Main St",
          phone: "5125550100",
          isDefault: true,
        }),
      }),
    );
  });

  it("skips when a complete shipping address already exists", async () => {
    mockAddressFindFirst.mockResolvedValue({
      id: "ship_existing",
      line1: "200 Oak",
      city: "Dallas",
      state: "TX",
      postalCode: "75201",
      country: "US",
      phone: "+15125550199",
    });

    const result = await ensureBuyerShippingFromSellerShipFrom("user_1");

    expect(result).toEqual({ created: false, updated: false, addressId: "ship_existing" });
    expect(mockAddressCreate).not.toHaveBeenCalled();
  });

  it("updates incomplete shipping rows from seller ship-from", async () => {
    mockAddressFindFirst.mockResolvedValue({
      id: "ship_partial",
      line1: "100 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
      phone: null,
    });
    mockAddressUpdate.mockResolvedValue({ id: "ship_partial" });

    const result = await ensureBuyerShippingFromSellerShipFrom("user_1");

    expect(result).toEqual({ created: false, updated: true, addressId: "ship_partial" });
    expect(mockAddressUpdate).toHaveBeenCalled();
  });
});
