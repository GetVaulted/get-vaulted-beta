/**
 * One-time setup: create an IVS Real-Time encoder configuration and print its ARN.
 * The ARN must be set as LIVE_STAGE_ENCODER_CONFIG_ARN in Netlify env vars.
 * Usage: npx tsx scripts/create-ivs-encoder-config.ts
 */
import { IVSRealTimeClient, CreateEncoderConfigurationCommand } from "@aws-sdk/client-ivs-realtime";

async function main() {
  const region = process.env.VAULTED_AWS_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1";
  const accessKeyId = process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.VAULTED_AWS_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";

  if (!accessKeyId || !secretAccessKey) {
    console.error("ERROR: AWS credentials not found in environment. Need VAULTED_AWS_ACCESS_KEY_ID and VAULTED_AWS_SECRET_ACCESS_KEY.");
    process.exit(1);
  }

  console.log(`Region: ${region}`);
  console.log(`Key ID ends with: ...${accessKeyId.slice(-4)}`);

  const client = new IVSRealTimeClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const out = await client.send(
    new CreateEncoderConfigurationCommand({
      name: "get-vaulted-default",
      video: {
        width: 1280,
        height: 720,
        framerate: 30,
        bitrate: 2_500_000,
      },
    }),
  );

  const arn = out.encoderConfiguration?.arn;
  if (!arn) {
    console.error("ERROR: No ARN returned from AWS.");
    process.exit(1);
  }

  console.log("\n✅ Encoder configuration created!");
  console.log("ARN:", arn);
  console.log("\nRun this to set it in Netlify:");
  console.log(`netlify env:set LIVE_STAGE_ENCODER_CONFIG_ARN "${arn}"`);
}

main().catch((e) => {
  console.error("FAILED:", e.message ?? e);
  process.exit(1);
});
