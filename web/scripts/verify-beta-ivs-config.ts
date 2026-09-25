/**
 * Preflight AWS IVS configuration for beta streaming tests.
 * Does not create channels or print secrets.
 *
 * Usage (from web/):
 *   npx tsx scripts/verify-beta-ivs-config.ts
 */
import { config } from "dotenv";
import { IvsClient, ListChannelsCommand } from "@aws-sdk/client-ivs";
import { GetStageCommand, IVSRealTimeClient } from "@aws-sdk/client-ivs-realtime";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BETA_ACCOUNT_ID = "758530011537";
const BETA_IVS_REGION = "us-east-1";
/** Dummy stage ARN — GetStage returns NotFound when Real-Time IAM is OK; AccessDenied when it is not. */
const REALTIME_PROBE_STAGE_ARN = `arn:aws:ivs:${BETA_IVS_REGION}:${BETA_ACCOUNT_ID}:stage/00000000-0000-0000-0000-000000000000`;

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
    process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";
  const channelType = process.env.AWS_IVS_CHANNEL_TYPE?.trim() ?? "STANDARD";
  const latencyMode = process.env.AWS_IVS_LATENCY_MODE?.trim() ?? "LOW";
  const webhookSecret = process.env.IVS_EVENTS_WEBHOOK_SECRET?.trim() ?? "";
  const recordingArn = process.env.AWS_IVS_RECORDING_CONFIGURATION_ARN?.trim() ?? "";
  const recordingsBucket = process.env.AWS_IVS_RECORDINGS_BUCKET?.trim() ?? "";

  console.log("");
  console.log("=== Beta AWS IVS config check ===");
  console.log(`AWS_REGION:              ${region || "(missing)"}`);
  console.log(`AWS_ACCESS_KEY_ID:       ${mask(accessKeyId)}`);
  console.log(`AWS_SECRET_ACCESS_KEY:   ${secretAccessKey ? "(set)" : "(missing)"}`);
  console.log(`AWS_IVS_CHANNEL_TYPE:    ${channelType}`);
  console.log(`AWS_IVS_LATENCY_MODE:    ${latencyMode}`);
  console.log(`IVS_EVENTS_WEBHOOK_SECRET: ${webhookSecret ? "(set)" : "(missing — health polling only)"}`);
  console.log(
    `AWS_IVS_RECORDING_CONFIGURATION_ARN: ${recordingArn ? mask(recordingArn) : "(missing — live VOD off)"}`,
  );
  console.log(
    `AWS_IVS_RECORDINGS_BUCKET: ${recordingsBucket || "(missing — admin ZIP download needs this)"}`,
  );
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

  const credentials = { accessKeyId, secretAccessKey };
  const client = new IvsClient({ region, credentials });
  const realtimeClient = new IVSRealTimeClient({ region, credentials });

  try {
    const out = await client.send(new ListChannelsCommand({ maxResults: 5 }));
    const count = out.channels?.length ?? 0;
    console.log(`IVS API reachable in ${region}. Sample channels listed: ${count}`);
    for (const ch of out.channels ?? []) {
      console.log(`  - ${ch.name ?? "?"} (${ch.arn ?? "?"})`);
    }
  } catch (e) {
    console.error(
      "IVS channel API failed — check IAM permissions (ivs:CreateChannel, ivs:CreateStreamKey, ivs:GetStream, ivs:ListChannels, ivs:TagResource).",
    );
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  try {
    await realtimeClient.send(new GetStageCommand({ arn: REALTIME_PROBE_STAGE_ARN }));
    console.log("IVS Real-Time API reachable (GetStage probe returned without AccessDenied).");
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "ResourceNotFoundException" || name === "StageNotFoundException") {
      console.log("IVS Real-Time IAM OK (GetStage probe: stage not found, authorization passed).");
    } else if (name === "AccessDeniedException" || /not authorized/i.test(String(e))) {
      console.error("");
      console.error("IVS Real-Time IAM missing — Go Live (WebRTC Stage) will fail.");
      console.error(
        "Add ivs:CreateStage, ivs:GetStage, ivs:DeleteStage, ivs:CreateParticipantToken, ivs:StartComposition, ivs:StopComposition, ivs:GetComposition, ivs:ListCompositions",
      );
      console.error("on arn:aws:ivs:us-east-1:758530011537:stage/*, participant-token/*, composition/*");
      console.error("See web/infra/iam/vaulted-beta-ivs-realtime-policy.json");
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    } else {
      console.error("IVS Real-Time API probe failed unexpectedly:");
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  if (!recordingArn) {
    console.warn("Warning: AWS_IVS_RECORDING_CONFIGURATION_ARN unset — new channels will not auto-record.");
    console.warn("See web/infra/iam/LIVE_RECORDINGS.md");
  }
  if (recordingArn && !recordingsBucket) {
    console.warn("Warning: AWS_IVS_RECORDINGS_BUCKET unset — admin archive download will fail.");
  }

  console.log("");
  console.log("IVS test flow:");
  console.log("  1. Seller: POST /api/live-rooms/{id}/stream/stage-token (host WebRTC Go Live)");
  console.log("  2. Buyer: GET /api/live-rooms/{id}/stream/stage-token (subscribe-only token)");
  console.log("  3. Legacy OBS path: POST /api/live-rooms/{id}/stream/provision → RTMPS + stream key");
  console.log("  4. Buyer: GET /api/live-rooms/{id}/stream → playbackUrl + streamHealth only");
  console.log("  5. After end show: Recording State Change webhook → LiveStreamReplay ready → admin ZIP");
  console.log("");
  console.log("See web/docs/aws-ivs-live-qa-checklist.md and web/infra/iam/LIVE_RECORDINGS.md.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
