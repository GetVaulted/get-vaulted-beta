/**
 * Preflight AWS IVS configuration for beta streaming tests.
 * Does not create channels or print secrets.
 *
 * Usage (from web/):
 *   npx tsx scripts/verify-beta-ivs-config.ts
 */
import { config } from "dotenv";
import { IvsClient, ListChannelsCommand } from "@aws-sdk/client-ivs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

function mask(value: string | undefined): string {
  const v = value?.trim() ?? "";
  if (!v) return "(missing)";
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

async function main() {
  const region =
    process.env.VAULTED_AWS_REGION?.trim() ||
    process.env.VAULTED_AWS_DEFAULT_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "";
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID?.trim() || process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY?.trim() || process.env.VAULTED_AWS_SECRET_ACCESS_KEY?.trim() || "";
  const channelType = process.env.AWS_IVS_CHANNEL_TYPE?.trim() ?? "STANDARD";
  const latencyMode = process.env.AWS_IVS_LATENCY_MODE?.trim() ?? "LOW";
  const webhookSecret = process.env.IVS_EVENTS_WEBHOOK_SECRET?.trim() ?? "";

  console.log("");
  console.log("=== Beta AWS IVS config check ===");
  console.log(`AWS_REGION:              ${region || "(missing)"}`);
  console.log(`AWS_ACCESS_KEY_ID:       ${mask(accessKeyId)}`);
  console.log(`AWS_SECRET_ACCESS_KEY:   ${secretAccessKey ? "(set)" : "(missing)"}`);
  console.log(`AWS_IVS_CHANNEL_TYPE:    ${channelType}`);
  console.log(`AWS_IVS_LATENCY_MODE:    ${latencyMode}`);
  console.log(`IVS_EVENTS_WEBHOOK_SECRET: ${webhookSecret ? "(set)" : "(missing — health polling only)"}`);
  console.log("");

  const missing: string[] = [];
  if (!region) missing.push("AWS_REGION");
  if (!accessKeyId) missing.push("AWS_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY");

  if (missing.length) {
    console.error(`Missing required IVS env: ${missing.join(", ")}`);
    console.error("Set these on Netlify beta (server-only) — never in mobile client.");
    process.exit(1);
  }

  const client = new IvsClient({ region });
  try {
    const out = await client.send(new ListChannelsCommand({ maxResults: 5 }));
    const count = out.channels?.length ?? 0;
    console.log(`IVS API reachable in ${region}. Sample channels listed: ${count}`);
    for (const ch of out.channels ?? []) {
      console.log(`  - ${ch.name ?? "?"} (${ch.arn ?? "?"})`);
    }
    console.log("");
    console.log("IVS test flow:");
    console.log("  1. Seller: POST /api/live-rooms/{id}/stream/provision (host only)");
    console.log("  2. Seller: OBS/Larix → RTMPS ingest + stream key (never shown to buyers)");
    console.log("  3. Seller: PATCH /api/live-rooms/{id} { action: start }");
    console.log("  4. Buyer: GET /api/live-rooms/{id}/stream → playbackUrl + streamHealth only");
    console.log("");
    console.log("See web/docs/aws-ivs-live-qa-checklist.md for full E2E steps.");
  } catch (e) {
    console.error("IVS API call failed — check IAM permissions (ivs:CreateChannel, ivs:CreateStreamKey, ivs:GetStream, ivs:ListChannels).");
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
