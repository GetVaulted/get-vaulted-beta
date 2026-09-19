import { beforeEach, describe, expect, it, vi } from "vitest";

const paypalCredentialsConfigured = vi.hoisted(() => vi.fn().mockReturnValue(true));
const getPayPalAccessToken = vi.hoisted(() => vi.fn().mockResolvedValue("access_token_123"));
vi.mock("@/lib/paypal-auth", () => ({
  paypalCredentialsConfigured,
  getPayPalAccessToken,
  paypalApiBase: () => "https://api.paypal.example",
}));

import {
  isPayPalRailWalletPaymentMethodId,
  paypalRailWalletMethodType,
  refundPayPalRailCapture,
} from "@/lib/paypal-buyer-rail";
import {
  isPayPalWalletPaymentMethodId,
  paypalPaymentTokenIdFromWalletPmId,
  paypalWalletPaymentMethodId,
} from "@/lib/paypal-buyer-wallet";

describe("paypal-buyer-rail helpers", () => {
  it("recognizes vaulted Venmo and PayPal wallet payment method ids", () => {
    expect(isPayPalRailWalletPaymentMethodId("venmo_tok_abc")).toBe(true);
    expect(isPayPalRailWalletPaymentMethodId("paypal_tok_xyz")).toBe(true);
    expect(isPayPalRailWalletPaymentMethodId("pm_card_123")).toBe(false);
    expect(isPayPalRailWalletPaymentMethodId("")).toBe(false);
    expect(isPayPalRailWalletPaymentMethodId(null)).toBe(false);
  });

  it("maps rail ids to wallet method types", () => {
    expect(paypalRailWalletMethodType("paypal_tok_xyz")).toBe("paypal");
    expect(paypalRailWalletMethodType("venmo_tok_abc")).toBe("venmo");
  });

  it("builds and parses PayPal wallet payment method ids", () => {
    const id = paypalWalletPaymentMethodId("tok_abc");
    expect(id).toBe("paypal_tok_abc");
    expect(isPayPalWalletPaymentMethodId(id)).toBe(true);
    expect(paypalPaymentTokenIdFromWalletPmId(id)).toBe("tok_abc");
  });
});

describe("refundPayPalRailCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paypalCredentialsConfigured.mockReturnValue(true);
    getPayPalAccessToken.mockResolvedValue("access_token_123");
  });

  it("refunds a capture and returns the PayPal refund id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: "refund_1", status: "COMPLETED" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await refundPayPalRailCapture({ processorPaymentId: "CAPTURE123" });

    expect(result).toEqual({ outcome: "refunded", refundId: "refund_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.paypal.example/v2/payments/captures/CAPTURE123/refund");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer access_token_123");

    vi.unstubAllGlobals();
  });

  it("passes a partial amount when amountUsd is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: "refund_2" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    await refundPayPalRailCapture({ processorPaymentId: "CAPTURE123", amountUsd: 12.5 });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ amount: { currency_code: "USD", value: "12.50" } });

    vi.unstubAllGlobals();
  });

  it("returns an error outcome (never throws) when PayPal rejects the refund", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("already refunded"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await refundPayPalRailCapture({ processorPaymentId: "CAPTURE123" });

    expect(result.outcome).toBe("error");
    expect(result).toMatchObject({ code: "PAYPAL_RAIL_REFUND_FAILED" });

    vi.unstubAllGlobals();
  });

  it("fails safely before any network call when PayPal credentials aren't configured", async () => {
    paypalCredentialsConfigured.mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await refundPayPalRailCapture({ processorPaymentId: "CAPTURE123" });

    expect(result).toEqual({ outcome: "error", code: "PAYPAL_RAIL_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("fails safely before any network call when processorPaymentId is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await refundPayPalRailCapture({ processorPaymentId: "" });

    expect(result).toEqual({ outcome: "error", code: "MISSING_PROCESSOR_PAYMENT_ID" });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
