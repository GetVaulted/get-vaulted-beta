import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  formatShippoTransactionMessages,
  resolveShippoPurchaseLabel,
  resolveShippoTransactionLabel,
} from "./shippo-transaction-label";

vi.mock("@/lib/shippo", () => ({
  shippoGetTransaction: vi.fn(),
}));

import { shippoGetTransaction } from "@/lib/shippo";

describe("formatShippoTransactionMessages", () => {
  it("joins Shippo error messages", () => {
    expect(
      formatShippoTransactionMessages([
        { text: "Invalid recipient address." },
        { text: "Weight exceeds limit." },
      ]),
    ).toBe("Invalid recipient address. Weight exceeds limit.");
  });
});

describe("resolveShippoTransactionLabel", () => {
  beforeEach(() => {
    vi.mocked(shippoGetTransaction).mockReset();
  });

  it("returns label url on SUCCESS", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_1",
      status: "SUCCESS",
      label_url: "https://label.example/a.pdf",
      tracking_number: "1Z999",
    });

    await expect(resolveShippoTransactionLabel("tx_1")).resolves.toEqual({
      transactionId: "tx_1",
      labelUrl: "https://label.example/a.pdf",
      trackingNumber: "1Z999",
      trackingUrl: null,
      shippingStatus: "SUCCESS",
    });
  });

  it("throws Shippo messages on ERROR", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_1",
      status: "ERROR",
      messages: [{ text: "USPS account not connected." }],
    });

    await expect(resolveShippoTransactionLabel("tx_1")).rejects.toThrow("USPS account not connected.");
  });
});

describe("resolveShippoPurchaseLabel", () => {
  beforeEach(() => {
    vi.mocked(shippoGetTransaction).mockReset();
  });

  it("uses immediate purchase response when label is present", async () => {
    await expect(
      resolveShippoPurchaseLabel({
        object_id: "tx_2",
        status: "SUCCESS",
        label_url: "https://label.example/b.pdf",
      }),
    ).resolves.toMatchObject({
      transactionId: "tx_2",
      labelUrl: "https://label.example/b.pdf",
    });
    expect(shippoGetTransaction).not.toHaveBeenCalled();
  });

  it("throws when purchase returns ERROR", async () => {
    await expect(
      resolveShippoPurchaseLabel({
        object_id: "tx_3",
        status: "ERROR",
        messages: [{ text: "Invalid ship-from address." }],
      }),
    ).rejects.toThrow("Invalid ship-from address.");
  });
});
