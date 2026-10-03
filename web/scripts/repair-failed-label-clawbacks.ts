/**
 * Controlled repair for improper seller clawbacks on failed Shippo label purchases.
 *
 * DEFAULT: dry-run (no Stripe mutations, no DB credit writes).
 *
 * Usage examples:
 *   npx tsx scripts/repair-failed-label-clawbacks.ts --order-id=cmrr427ae000909kyjrurbm1r
 *   npx tsx scripts/repair-failed-label-clawbacks.ts --manifest=reports/label-clawback-exposure.manifest.json
 *   npx tsx scripts/repair-failed-label-clawbacks.ts --manifest=... --apply --max-total-credit-cents=10000
 *
 * Refuses to run when:
 * - requested credits exceed available balance (pending excluded)
 * - manifest SHA-256 changed after approval (--expect-manifest-sha256=...)
 * - an order no longer matches its dry-run classification
 * - an existing restoring transfer is found (idempotent skip / refuse duplicate)
 * - any proposed credit lacks complete evidence
 * - unexpected classification encountered (--stop-on-unexpected-classification, default on)
 *
 * Does NOT deploy. Does NOT move money unless --apply is explicitly passed.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const APPLY = process.argv.includes("--apply");
const STOP_ON_UNEXPECTED = !process.argv.includes("--no-stop-on-unexpected-classification");

const orderIdArg = process.argv.find((a) => a.startsWith("--order-id="));
const manifestArg = process.argv.find((a) => a.startsWith("--manifest="));
const maxCreditArg = process.argv.find((a) => a.startsWith("--max-total-credit-cents="));
const expectShaArg = process.argv.find((a) => a.startsWith("--expect-manifest-sha256="));

const ORDER_ID = orderIdArg?.slice("--order-id=".length)?.trim() || null;
const MANIFEST_PATH = manifestArg
  ? path.resolve(webRoot, manifestArg.slice("--manifest=".length))
  : null;
const MAX_TOTAL_CREDIT_CENTS = maxCreditArg
  ? Math.max(0, Number(maxCreditArg.split("=")[1]) || 0)
  : null;
const EXPECT_MANIFEST_SHA = expectShaArg?.slice("--expect-manifest-sha256=".length)?.trim() || null;

const ORIGINAL_ORDER_ID = "cmrr427ae000909kyjrurbm1r";
const ORIGINAL_CREDIT_CENTS = 3502;
const ORIGINAL_KEY = `failed_label_clawback_credit_${ORIGINAL_ORDER_ID}_3502`;

type ManifestRow = {
  orderId: string;
  sellerId: string;
  sellerStripeAccountId: string | null;
  proposedCreditCents: number;
  failedShippoTransactionIds: string[];
  originalStripeReversalIds: string[];
  repairClassification: string;
  repairIdempotencyKey: string | null;
  evidenceSummary: string;
  safeToApply: boolean;
  blocker: string | null;
};

const CREDIT_CLASSES = new Set([
  "FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED",
  "PARTIAL_FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED",
  "NEITHER_LABEL_CHARGED",
]);

async function main() {
  if (!ORDER_ID && !MANIFEST_PATH) {
    console.error(
      JSON.stringify({
        error: "Provide --order-id=... or --manifest=...",
        mode: APPLY ? "APPLY" : "DRY_RUN",
      }),
    );
    process.exit(1);
  }

  let rows: ManifestRow[] = [];
  if (MANIFEST_PATH) {
    if (!fs.existsSync(MANIFEST_PATH)) {
      console.error(JSON.stringify({ error: "MANIFEST_NOT_FOUND", path: MANIFEST_PATH }));
      process.exit(1);
    }
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    const hash = createHash("sha256").update(raw).digest("hex");
    if (EXPECT_MANIFEST_SHA && EXPECT_MANIFEST_SHA !== hash) {
      console.error(
        JSON.stringify({
          error: "MANIFEST_HASH_MISMATCH",
          expected: EXPECT_MANIFEST_SHA,
          actual: hash,
          message: "Manifest contents changed after approval. Re-review before --apply.",
        }),
      );
      process.exit(1);
    }
    const parsed = JSON.parse(raw) as { rows?: ManifestRow[] } | ManifestRow[];
    rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
    if (ORDER_ID) rows = rows.filter((r) => r.orderId === ORDER_ID);
  } else if (ORDER_ID) {
    rows = [
      {
        orderId: ORDER_ID,
        sellerId: "",
        sellerStripeAccountId: null,
        proposedCreditCents: ORDER_ID === ORIGINAL_ORDER_ID ? ORIGINAL_CREDIT_CENTS : 0,
        failedShippoTransactionIds: [],
        originalStripeReversalIds: [],
        repairClassification:
          ORDER_ID === ORIGINAL_ORDER_ID ? "NEITHER_LABEL_CHARGED" : "MANUAL_REVIEW_REQUIRED",
        repairIdempotencyKey: ORDER_ID === ORIGINAL_ORDER_ID ? ORIGINAL_KEY : null,
        evidenceSummary: "single-order mode — re-validate via exposure scan before apply",
        safeToApply: false,
        blocker: "Single-order mode requires live reclassification before apply.",
      },
    ];
  }

  const { getStripe, isStripeConfigured } = await import("../src/lib/stripe");
  const { prisma } = await import("../src/lib/prisma");
  const { applyNeitherLabelChargedRepair, planNeitherLabelChargedRepair } = await import(
    "../src/services/shipping/repair-neither-label-charged"
  );
  const { verifyShippoLabelRefundStatus } = await import(
    "../src/services/shipping/shippo-label-refund-status"
  );
  const { findExistingFailedLabelRepairTransfer } = await import(
    "../src/services/shipping/repair-neither-label-charged"
  );

  if (!isStripeConfigured()) {
    console.error(JSON.stringify({ error: "STRIPE_NOT_CONFIGURED" }));
    process.exit(1);
  }
  const stripe = getStripe();
  const balance = await stripe.balance.retrieve();
  const availableUsd = (balance.available ?? [])
    .filter((b) => b.currency === "usd")
    .reduce((s, b) => s + (b.amount ?? 0), 0);
  const pendingUsd = (balance.pending ?? [])
    .filter((b) => b.currency === "usd")
    .reduce((s, b) => s + (b.amount ?? 0), 0);

  const requestedTotal = rows.reduce((s, r) => s + Math.max(0, r.proposedCreditCents), 0);
  if (MAX_TOTAL_CREDIT_CENTS != null && requestedTotal > MAX_TOTAL_CREDIT_CENTS) {
    console.error(
      JSON.stringify({
        error: "MAX_TOTAL_CREDIT_EXCEEDED",
        requestedTotal,
        maxTotalCreditCents: MAX_TOTAL_CREDIT_CENTS,
      }),
    );
    process.exit(1);
  }

  if (APPLY && requestedTotal > availableUsd) {
    console.error(
      JSON.stringify({
        error: "INSUFFICIENT_PLATFORM_BALANCE",
        requestedTotal,
        availableUsd,
        pendingUsd,
        note: "Pending balance is not counted as available.",
      }),
    );
    process.exit(1);
  }

  const results: Array<Record<string, unknown>> = [];
  let creditedTotal = 0;

  for (const row of rows) {
    const result: Record<string, unknown> = {
      orderId: row.orderId,
      proposedCreditCents: row.proposedCreditCents,
      repairClassification: row.repairClassification,
      repairIdempotencyKey: row.repairIdempotencyKey,
      mode: APPLY ? "APPLY" : "DRY_RUN",
    };

    if (!CREDIT_CLASSES.has(row.repairClassification)) {
      result.status = "REFUSED_UNEXPECTED_CLASSIFICATION";
      result.blocker = row.repairClassification;
      results.push(result);
      if (STOP_ON_UNEXPECTED) {
        console.error(JSON.stringify({ error: "STOP_ON_UNEXPECTED_CLASSIFICATION", result }, null, 2));
        process.exit(1);
      }
      continue;
    }

    if (!row.repairIdempotencyKey || row.proposedCreditCents <= 0) {
      result.status = "REFUSED_INCOMPLETE_EVIDENCE";
      result.blocker = "Missing idempotency key or proposed credit.";
      results.push(result);
      if (STOP_ON_UNEXPECTED) process.exit(1);
      continue;
    }

    if (!row.failedShippoTransactionIds?.length && row.orderId !== ORIGINAL_ORDER_ID) {
      // Live-validate Shippo for single-order / incomplete manifest rows.
      const order = await prisma.order.findUnique({
        where: { id: row.orderId },
        select: { shippoTransactionId: true, liveShippingSessionId: true },
      });
      const pkgs = order
        ? await prisma.shipmentPackage.findMany({
            where: {
              OR: [
                { orderId: row.orderId },
                ...(order.liveShippingSessionId
                  ? [{ liveShippingSessionId: order.liveShippingSessionId }]
                  : []),
              ],
            },
            select: { shippoTransactionId: true },
          })
        : [];
      const txIds = [
        ...new Set(
          [order?.shippoTransactionId, ...pkgs.map((p) => p.shippoTransactionId)]
            .map((id) => id?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const failed: string[] = [];
      for (const txId of txIds) {
        const ev = await verifyShippoLabelRefundStatus(txId);
        if (ev.verdict === "failed_purchase") failed.push(txId);
      }
      row.failedShippoTransactionIds = failed;
      if (failed.length === 0) {
        result.status = "REFUSED_INCOMPLETE_EVIDENCE";
        result.blocker = "No failed Shippo transactions found on re-check.";
        results.push(result);
        if (STOP_ON_UNEXPECTED) process.exit(1);
        continue;
      }
    }

    const order = await prisma.order.findUnique({
      where: { id: row.orderId },
      select: {
        id: true,
        sellerId: true,
        seller: { select: { stripeAccountId: true } },
      },
    });
    if (!order) {
      result.status = "ORDER_NOT_FOUND";
      results.push(result);
      if (STOP_ON_UNEXPECTED) process.exit(1);
      continue;
    }

    const destination = order.seller.stripeAccountId?.trim() || null;
    if (!destination) {
      result.status = "SELLER_NO_CONNECT";
      results.push(result);
      if (STOP_ON_UNEXPECTED) process.exit(1);
      continue;
    }

    try {
      const acct = await stripe.accounts.retrieve(destination);
      if (acct.deleted) {
        result.status = "DESTINATION_ACCOUNT_INVALID";
        results.push(result);
        if (STOP_ON_UNEXPECTED) process.exit(1);
        continue;
      }
    } catch {
      result.status = "DESTINATION_ACCOUNT_INVALID";
      results.push(result);
      if (STOP_ON_UNEXPECTED) process.exit(1);
      continue;
    }

    const existing = await findExistingFailedLabelRepairTransfer({
      destinationAccountId: destination,
      orderId: row.orderId,
      idempotencyKey: row.repairIdempotencyKey,
    });
    if (existing.length > 0) {
      result.status = "ALREADY_CREDITED_STRIPE";
      result.existingTransferIds = existing.map((t) => t.id);
      result.note = "Restoring transfer already exists — will not create a duplicate.";
      results.push(result);
      continue;
    }

    // Original order: use dedicated planner/applier (keeps 3502 + key unchanged).
    if (row.orderId === ORIGINAL_ORDER_ID) {
      const plan = await planNeitherLabelChargedRepair(ORIGINAL_ORDER_ID);
      result.livePlan = {
        classification: plan.classification,
        proposedCreditCents: plan.proposedCreditCents,
        idempotencyKey: plan.idempotencyKey,
        balanceSufficient: plan.balanceSufficient,
        remainingCreditCents: plan.remainingCreditCents,
      };
      if (plan.proposedCreditCents !== ORIGINAL_CREDIT_CENTS || plan.idempotencyKey !== ORIGINAL_KEY) {
        result.status = "CLASSIFICATION_DRIFT";
        result.blocker = "Original order proposal drifted from locked 3502¢ / idempotency key.";
        results.push(result);
        process.exit(1);
      }
      if (!APPLY) {
        result.status = "DRY_RUN_OK";
        results.push(result);
        continue;
      }
      const applied = await applyNeitherLabelChargedRepair(ORIGINAL_ORDER_ID);
      result.applied = applied;
      result.status = applied.ok ? "APPLIED" : "APPLY_FAILED";
      if (applied.ok) creditedTotal += ORIGINAL_CREDIT_CENTS;
      results.push(result);
      if (!applied.ok && STOP_ON_UNEXPECTED) process.exit(1);
      continue;
    }

    // Generic batch path (future): dry-run only until dedicated multi-order applier is wired.
    if (!APPLY) {
      result.status = "DRY_RUN_OK";
      result.note =
        "Generic batch credit path designed; apply for non-original orders requires finance row backfill + dedicated applier.";
      results.push(result);
      continue;
    }

    result.status = "APPLY_NOT_IMPLEMENTED_FOR_GENERIC_ROW";
    result.blocker =
      "Only the locked original order NEITHER_LABEL_CHARGED applier is wired. Expand after manifest review.";
    results.push(result);
    if (STOP_ON_UNEXPECTED) process.exit(1);
  }

  const summary = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    requestedTotalCreditCents: requestedTotal,
    creditedTotalCents: creditedTotal,
    platformAvailableUsdCents: availableUsd,
    platformPendingUsdCents: pendingUsd,
    pendingDoesNotCountAsAvailable: true,
    maxTotalCreditCents: MAX_TOTAL_CREDIT_CENTS,
    rowCount: rows.length,
    results,
    note: APPLY
      ? "Apply mode executed only for supported rows."
      : "Dry-run only. No seller credits issued.",
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
