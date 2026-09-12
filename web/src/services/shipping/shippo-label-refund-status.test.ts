import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/shippo", () => ({
  shippoFetch: vi.fn(),
  shippoGetTransaction: vi.fn(),
}));

import { shippoFetch, shippoGetTransaction } from "@/lib/shippo";
import {
  classifyShippoLabelRefundVerdict,
  extractProvenNoShippoCharge,
  extractShippoPurchaseProof,
  financeStatusFromShippoVerdict,
  isShippoLabelPurchaseSuccessful,
  verifyShippoLabelRefundStatus,
} from "@/services/shipping/shippo-label-refund-status";

const purchased = extractShippoPurchaseProof({
  status: "SUCCESS",
  label_url: "https://example.com/label.pdf",
  tracking_number: "9400",
});
const errorNoLabel = extractShippoPurchaseProof({
  status: "ERROR",
  label_url: undefined,
  tracking_number: "",
});

describe("extractShippoPurchaseProof", () => {
  it("SUCCESS is affirmatively purchased", () => {
    expect(purchased.affirmativelyPurchased).toBe(true);
    expect(purchased.statusIsSuccess).toBe(true);
  });

  it("ERROR with no label is not affirmatively purchased", () => {
    expect(errorNoLabel.affirmativelyPurchased).toBe(false);
    expect(errorNoLabel.hasLabelUrl).toBe(false);
  });
});

describe("classifyShippoLabelRefundVerdict", () => {
  it("Shippo SUCCESS transaction is chargeable", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "SUCCESS",
        refundStatuses: [],
        purchaseProof: purchased,
      }),
    ).toBe("chargeable");
  });

  it("Shippo ERROR with no billing proof is not chargeable", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "ERROR",
        refundStatuses: [],
        purchaseProof: errorNoLabel,
      }),
    ).toBe("unknown");
  });

  it("empty refund list does not imply chargeable for ERROR", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "ERROR",
        refundStatuses: [],
        purchaseProof: errorNoLabel,
      }),
    ).not.toBe("chargeable");
  });

  it("detects refunded and pending", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "REFUNDED",
        purchaseProof: purchased,
      }),
    ).toBe("refunded");
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "SUCCESS",
        refundStatuses: ["PENDING"],
        purchaseProof: purchased,
      }),
    ).toBe("refund_pending");
  });

  it("ERROR with proven no Shippo charge is failed_purchase", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "ERROR",
        purchaseProof: errorNoLabel,
        provenNoShippoCharge: true,
      }),
    ).toBe("failed_purchase");
  });

  it("detects proven no charge from empty billing.payments on INVALID ERROR", () => {
    expect(
      extractProvenNoShippoCharge(
        {
          status: "ERROR",
          object_state: "INVALID",
          billing: { payments: [] },
        },
        ["Your request has failed due to a billing issue."],
      ),
    ).toBe(true);
    expect(
      extractProvenNoShippoCharge({ status: "ERROR", billing: { payments: [{ amount: "17.51" }] } }, []),
    ).toBe(false);
  });

  it("maps verdicts onto finance statuses without assuming refund on unknown", () => {
    expect(financeStatusFromShippoVerdict("refunded")).toBe("refunded");
    expect(financeStatusFromShippoVerdict("chargeable")).toBe("replaced");
    expect(financeStatusFromShippoVerdict("unknown")).toBe("refund_pending");
    expect(financeStatusFromShippoVerdict("failed_purchase")).toBe("failed_purchase");
  });
});

describe("isShippoLabelPurchaseSuccessful", () => {
  it("requires SUCCESS status and valid transaction id", () => {
    expect(
      isShippoLabelPurchaseSuccessful({
        status: "SUCCESS",
        transactionId: "tx_1",
        labelUrl: "x",
      }),
    ).toBe(true);
    expect(isShippoLabelPurchaseSuccessful({ status: "ERROR", transactionId: "tx_1" })).toBe(false);
    expect(isShippoLabelPurchaseSuccessful({ status: "SUCCESS", transactionId: "" })).toBe(false);
    expect(
      isShippoLabelPurchaseSuccessful({
        status: "SUCCESS",
        transactionId: "tx_1",
        objectState: "INVALID",
      }),
    ).toBe(false);
  });
});

// Regression coverage for a confirmed production bug: Shippo's `/refunds/?transaction=<id>`
// does not actually filter by transaction — it returns the same account-wide refund list
// regardless of which transaction id is queried. Before the fix, any single unrelated
// PENDING/QUEUED refund anywhere on the account would poison the verdict of every other
// transaction to "refund_pending", including ones that were affirmatively SUCCESS-purchased
// and never had any refund of their own. These tests must pass only once
// `verifyShippoLabelRefundStatus` filters `list.results` down to entries whose own
// `transaction` field matches the id being verified.
describe("verifyShippoLabelRefundStatus — must not trust Shippo's query-param filtering", () => {
  beforeEach(() => {
    vi.mocked(shippoFetch).mockReset();
    vi.mocked(shippoGetTransaction).mockReset();
  });

  it("an unrelated account-wide PENDING refund must not classify an unrelated SUCCESS transaction as refund_pending", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_real_success",
      status: "SUCCESS",
      label_url: "https://example.com/label.pdf",
      tracking_number: "9400111111",
    });
    // Simulates Shippo ignoring `?transaction=tx_real_success` and echoing back an unrelated
    // refund that belongs to a completely different transaction.
    vi.mocked(shippoFetch).mockResolvedValue({
      results: [
        {
          object_id: "refund_unrelated",
          status: "PENDING",
          transaction: "tx_totally_different_order",
          amount: "5.00",
        },
      ],
    });

    const evidence = await verifyShippoLabelRefundStatus("tx_real_success");

    expect(evidence.verdict).toBe("chargeable");
    expect(evidence.refundStatuses).toEqual([]);
    expect(evidence.refunds).toEqual([]);
  });

  it("still honors a refund whose transaction field genuinely matches the queried id", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_real_refunded",
      status: "SUCCESS",
      label_url: "https://example.com/label.pdf",
      tracking_number: "9400222222",
    });
    vi.mocked(shippoFetch).mockResolvedValue({
      results: [
        { object_id: "refund_real", status: "SUCCESS", transaction: "tx_real_refunded", amount: "5.00" },
      ],
    });

    const evidence = await verifyShippoLabelRefundStatus("tx_real_refunded");

    expect(evidence.verdict).toBe("refunded");
    expect(evidence.refundStatuses).toEqual(["SUCCESS"]);
    expect(evidence.refunds).toHaveLength(1);
    expect(evidence.refunds[0]?.objectId).toBe("refund_real");
  });

  it("filters a mixed account-wide refund list down to only entries matching the queried transaction", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_mixed",
      status: "SUCCESS",
      label_url: "https://example.com/label.pdf",
      tracking_number: "9400333333",
    });
    vi.mocked(shippoFetch).mockResolvedValue({
      results: [
        { object_id: "refund_other_1", status: "PENDING", transaction: "tx_other_1", amount: "9.00" },
        { object_id: "refund_match", status: "SUCCESS", transaction: "tx_mixed", amount: "6.37" },
        { object_id: "refund_other_2", status: "QUEUED", transaction: "tx_other_2", amount: "3.00" },
      ],
    });

    const evidence = await verifyShippoLabelRefundStatus("tx_mixed");

    expect(evidence.refunds).toHaveLength(1);
    expect(evidence.refunds[0]?.objectId).toBe("refund_match");
    expect(evidence.refundStatuses).toEqual(["SUCCESS"]);
    expect(evidence.verdict).toBe("refunded");
  });

  it("an unrelated refund list entry with no transaction field at all is also excluded", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_no_transaction_field",
      status: "SUCCESS",
      label_url: "https://example.com/label.pdf",
      tracking_number: "9400444444",
    });
    vi.mocked(shippoFetch).mockResolvedValue({
      results: [{ object_id: "refund_malformed", status: "PENDING", amount: "5.00" }],
    });

    const evidence = await verifyShippoLabelRefundStatus("tx_no_transaction_field");

    expect(evidence.refunds).toEqual([]);
    expect(evidence.verdict).toBe("chargeable");
  });

  it("an unrelated account-wide SUCCESS (refunded) entry must not mark an unrelated SUCCESS transaction as refunded", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_should_stay_chargeable",
      status: "SUCCESS",
      label_url: "https://example.com/label.pdf",
      tracking_number: "9400555555",
    });
    // Simulates Shippo echoing back a fully-refunded receipt that belongs to a different label.
    vi.mocked(shippoFetch).mockResolvedValue({
      results: [
        {
          object_id: "refund_unrelated_success",
          status: "SUCCESS",
          transaction: "tx_some_other_label_entirely",
          amount: "12.34",
        },
      ],
    });

    const evidence = await verifyShippoLabelRefundStatus("tx_should_stay_chargeable");

    expect(evidence.verdict).toBe("chargeable");
    expect(evidence.refunds).toEqual([]);
    expect(evidence.refundStatuses).toEqual([]);
  });

  it("a refund whose transaction field genuinely matches and is still PENDING returns refund_pending, not chargeable or refunded", async () => {
    vi.mocked(shippoGetTransaction).mockResolvedValue({
      object_id: "tx_genuinely_pending",
      status: "SUCCESS",
      label_url: "https://example.com/label.pdf",
      tracking_number: "9400666666",
    });
    vi.mocked(shippoFetch).mockResolvedValue({
      results: [
        { object_id: "refund_genuine_pending", status: "PENDING", transaction: "tx_genuinely_pending", amount: "8.00" },
      ],
    });

    const evidence = await verifyShippoLabelRefundStatus("tx_genuinely_pending");

    expect(evidence.verdict).toBe("refund_pending");
    expect(evidence.refundStatuses).toEqual(["PENDING"]);
    expect(evidence.refunds).toHaveLength(1);
    expect(evidence.refunds[0]?.transaction).toBe("tx_genuinely_pending");
  });
});
