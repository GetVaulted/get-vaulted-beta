/**
 * Dump full Shippo transaction evidence for the two ERROR txs (no secrets printed).
 * Loads SHIPPO_API_TOKEN from Netlify `dev` context when local env is missing.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const TX_IDS = [
  "2fe5616d2e3748ef9569f193e432bf62",
  "edfcdb0bf1f14935b822c58599c46112",
];

function loadShippoFromNetlifyDev(): string | null {
  const res = spawnSync("npx", ["netlify", "env:list", "--json", "--context", "dev"], {
    cwd: webRoot,
    encoding: "utf8",
    shell: true,
  });
  const stdout = res.stdout ?? "";
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
    const t = j.SHIPPO_API_TOKEN;
    return typeof t === "string" && t.trim().length > 5 ? t.trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.SHIPPO_API_TOKEN?.trim()) {
    const t = loadShippoFromNetlifyDev();
    if (!t) {
      console.error(JSON.stringify({ error: "SHIPPO_API_TOKEN_MISSING" }));
      process.exit(1);
    }
    process.env.SHIPPO_API_TOKEN = t;
  }

  const { verifyShippoLabelRefundStatus } = await import(
    "../src/services/shipping/shippo-label-refund-status"
  );
  const { classifyDualLabelBillingEvidence } = await import(
    "../src/services/shipping/label-charge-evidence"
  );

  const rows = [];
  for (const id of TX_IDS) {
    const evidence = await verifyShippoLabelRefundStatus(id);
    const raw = evidence.rawTransaction ?? {};
    rows.push({
      shippoTransactionId: id,
      verdict: evidence.verdict,
      shippoClassification: evidence.shippoClassification,
      remainsChargeable: evidence.remainsChargeable,
      purchaseProof: evidence.purchaseProof,
      transactionStatus: evidence.transactionStatus,
      messages: evidence.messages,
      refunds: evidence.refunds,
      keyFields: {
        object_id: raw.object_id ?? null,
        object_created: raw.object_created ?? null,
        object_updated: raw.object_updated ?? null,
        status: raw.status ?? null,
        test: raw.test ?? null,
        rate: raw.rate ?? null,
        label_file_type: raw.label_file_type ?? null,
        label_url: raw.label_url ?? null,
        commercial_invoice_url: raw.commercial_invoice_url ?? null,
        tracking_number: raw.tracking_number ?? null,
        tracking_status: raw.tracking_status ?? null,
        tracking_url_provider: raw.tracking_url_provider ?? null,
        metadata: raw.metadata ?? null,
        parcel: raw.parcel ?? null,
        billing: raw.billing ?? null,
        was_test: raw.was_test ?? null,
        qr_code_url: raw.qr_code_url ?? null,
      },
      // Full raw keys for billing discovery (values for large blobs truncated).
      rawKeys: Object.keys(raw).sort(),
      rawSanitized: Object.fromEntries(
        Object.entries(raw).map(([k, v]) => {
          if (typeof v === "string" && v.length > 200) return [k, `${v.slice(0, 80)}…(len=${v.length})`];
          return [k, v];
        }),
      ),
    });
  }

  const billing = classifyDualLabelBillingEvidence({
    firstVerdict: rows[0]?.verdict ?? "unknown",
    secondVerdict: rows[1]?.verdict ?? "unknown",
  });

  console.log(
    JSON.stringify(
      {
        mode: "INSPECT_READONLY",
        transactions: rows,
        correctedOrderClassification: billing,
        note: "labelCostCents in DB is not proof of Shippo billing. ERROR without SUCCESS is never chargeable.",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
