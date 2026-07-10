import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { IVSRealTimeClient, CreateEncoderConfigurationCommand } from "@aws-sdk/client-ivs-realtime";

/** One-time setup: create an IVS Real-Time encoder configuration and return its ARN. */
export async function GET() {
  return POST();
}

export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const region =
    process.env.VAULTED_AWS_REGION?.trim() ||
    process.env.VAULTED_AWS_DEFAULT_REGION?.trim() ||
    "us-east-1";
  const accessKeyId =
    process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim() ||
    "";

  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: "AWS credentials not configured on this server." }, { status: 500 });
  }

  const existing = process.env.LIVE_STAGE_ENCODER_CONFIG_ARN?.trim();
  if (existing) {
    return NextResponse.json({ arn: existing, note: "Already set — no new config created." });
  }

  try {
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
      return NextResponse.json({ error: "AWS returned no ARN." }, { status: 500 });
    }

    return NextResponse.json({ arn, note: "Encoder configuration created. Set LIVE_STAGE_ENCODER_CONFIG_ARN to this ARN in Netlify and redeploy." });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
