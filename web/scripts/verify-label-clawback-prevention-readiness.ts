/**
 * Static readiness check for failed-label clawback prevention (no deploy, no money movement).
 *
 * Usage: npx tsx scripts/verify-label-clawback-prevention-readiness.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(webRoot, rel), "utf8");
}

function includesAll(src: string, needles: string[]): boolean {
  return needles.every((n) => src.includes(n));
}

async function main() {
  const bundled = read("src/services/shipping/bundled-labels.ts");
  const charge = read("src/services/shipping/charge-seller-label-cost.ts");
  const shippoStatus = read("src/services/shipping/shippo-label-refund-status.ts");
  const shippoResolve = read("src/lib/shippo-transaction-label.ts");
  const retry = read("src/app/api/admin/orders/[id]/retry-label-cost/route.ts");
  const labelFinance = read("src/services/shipping/label-finance.ts");
  const ledger = read("src/lib/admin/order-financial-ledger.ts");
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260720120000_shipment_label_finance/migration.sql",
  );

  const checks = [
    {
      id: "bundled_requires_success",
      ok: includesAll(bundled, ["isShippoLabelPurchaseSuccessful", "purchaseSucceeded"]),
      detail: "Bundled path uses isShippoLabelPurchaseSuccessful before clawback.",
    },
    {
      id: "invalid_blocks_purchase_success",
      ok: includesAll(shippoStatus, ['objectState === "INVALID"', "affirmativelyPurchased"]),
      detail: "INVALID object_state cannot be affirmatively purchased.",
    },
    {
      id: "resolve_throws_on_invalid",
      ok: includesAll(shippoResolve, ['objectState === "INVALID"', "Label was not purchased"]),
      detail: "resolveShippoPurchaseLabel / poll reject INVALID.",
    },
    {
      id: "charge_hard_gate",
      ok: includesAll(charge, [
        "SHIPPO_PURCHASE_NOT_SUCCESSFUL",
        "verifyShippoLabelRefundStatus",
        'verdict !== "chargeable"',
      ]),
      detail: "chargeSellerForLabelCost independently rejects non-chargeable Shippo evidence.",
    },
    {
      id: "failed_stores_quoted_not_chargeable",
      ok: includesAll(charge, ["quotedLabelCostCents: labelCostCents", "labelCostCents: 0", "failed_purchase"]),
      detail: "Failed purchases store quotedLabelCostCents with chargeable labelCostCents=0.",
    },
    {
      id: "retry_uses_charge_gate",
      ok: includesAll(retry, ["chargeSellerForLabelCost", "isLabelCostChargeable"]),
      detail: "Admin retry route goes through chargeSellerForLabelCost / chargeable filter.",
    },
    {
      id: "summaries_from_chargeable_finance",
      ok: includesAll(labelFinance, [
        "isLabelCostChargeable",
        "failed_purchase",
        "chargeableLabelCostCents",
        "netSellerDeductionCents",
      ]),
      detail: "Order summaries derived from chargeable label-finance records.",
    },
    {
      id: "ledger_backward_compatible",
      ok: includesAll(ledger, [
        "labelFinances.length > 0",
        "resolveActualLabelCostCents",
        "No purchased Shippo label recorded",
      ]),
      detail: "Ledger safely reads orders with zero ShipmentLabelFinance rows.",
    },
    {
      id: "schema_has_failed_purchase_and_quoted",
      ok: includesAll(schema, ["failed_purchase", "quotedLabelCostCents", "repairCreditIdempotencyKey"]),
      detail: "Prisma schema includes failed_purchase + quotedLabelCostCents.",
    },
    {
      id: "migration_present",
      ok: includesAll(migration, ["ShipmentLabelFinance", "failed_purchase", "quotedLabelCostCents"]),
      detail: "Migration SQL present for ShipmentLabelFinance.",
    },
  ];

  const failed = checks.filter((c) => !c.ok);
  const report = {
    mode: "PREVENTION_READINESS_STATIC_CHECK",
    ready: failed.length === 0,
    passed: checks.filter((c) => c.ok).length,
    failed: failed.length,
    checks,
    backwardCompatibility: {
      ordersWithoutLabelFinanceRows:
        "Supported: ledger falls back to Order.shippingLabelCost* / packages; retry uses legacy path when labelFinances.length === 0.",
      preventionWithoutBackfill:
        "Safe: new purchases go through SUCCESS gate; historical rows unchanged until repair/backfill.",
      migrationDoesNotMoveMoney: true,
    },
    note: "Static code check only. Deploy separately after human review.",
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
