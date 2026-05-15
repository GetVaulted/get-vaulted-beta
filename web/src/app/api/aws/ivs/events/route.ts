import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { applyRecordedIvsStreamState, findLiveRoomIdByIvsChannelArn } from "@/services/ivs";

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function verifyIvsEventsSecret(req: Request): boolean {
  const secret = process.env.IVS_EVENTS_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header = req.headers.get("x-ivs-events-secret");
  return header === secret;
}

function extractChannelAndState(body: unknown): { channelArn: string | null; state: string | null } {
  if (!body || typeof body !== "object") return { channelArn: null, state: null };
  const o = body as Record<string, unknown>;

  if (Array.isArray(o.Records) && o.Records[0] && typeof o.Records[0] === "object") {
    const rec = o.Records[0] as Record<string, unknown>;
    const sns = rec.Sns as Record<string, unknown> | undefined;
    const msg = sns?.Message;
    if (typeof msg === "string") {
      try {
        const inner = JSON.parse(msg) as unknown;
        return extractChannelAndState(inner);
      } catch {
        return { channelArn: null, state: null };
      }
    }
  }

  if (o.detail && typeof o.detail === "object") {
    const d = o.detail as Record<string, unknown>;
    const arn = (d.channelArn ?? d.channel_arn ?? d.ChannelArn ?? d["channel-arn"]) as string | undefined;
    const st = (d.state ?? d.streamState ?? d.stream_state) as string | undefined;
    return { channelArn: typeof arn === "string" ? arn.trim() || null : null, state: typeof st === "string" ? st.trim() || null : null };
  }

  const arn = (o.channelArn ?? o.channel_arn) as string | undefined;
  const st = (o.streamState ?? o.state) as string | undefined;
  return {
    channelArn: typeof arn === "string" ? arn.trim() || null : null,
    state: typeof st === "string" ? st.trim() || null : null,
  };
}

/**
 * First-pass IVS / EventBridge-style stream status ingestion (no AWS SigV4 verification yet).
 *
 * **Security:** requires `IVS_EVENTS_WEBHOOK_SECRET` and `Authorization: Bearer <secret>` or `X-IVS-Events-Secret: <secret>`.
 * Intended for EventBridge → API Gateway / Lambda / HTTPS forwarder in production; treat the URL as internal-only.
 * Payload: supports EventBridge `detail.channelArn` + `detail.state`, or flat `channelArn` + `streamState` / `state`.
 * Rate-limited per client IP; does not log stream keys or raw secrets.
 */
export async function POST(req: Request) {
  if (!process.env.IVS_EVENTS_WEBHOOK_SECRET?.trim()) {
    return NextResponse.json({ error: "IVS events ingestion is not configured (IVS_EVENTS_WEBHOOK_SECRET)." }, { status: 503 });
  }

  const rl = checkRateLimit(`ivs-events:${clientKey(req)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });
  }

  if (!verifyIvsEventsSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channelArn, state } = extractChannelAndState(body);
  if (!channelArn) {
    return NextResponse.json({ error: "Missing channel ARN in payload." }, { status: 400 });
  }
  if (!state) {
    return NextResponse.json({ error: "Missing stream state in payload." }, { status: 400 });
  }

  const roomId = await findLiveRoomIdByIvsChannelArn(channelArn);
  if (!roomId) {
    logIvsOpsServer("ivs_event_ignored", { reason: "no_matching_room" });
    return NextResponse.json({ ok: true, ignored: true, reason: "no_matching_room" });
  }

  const result = await applyRecordedIvsStreamState(roomId, state);
  logIvsOpsServer("ivs_event_ingested", {
    roomId,
    updated: result?.kind === "updated",
    streamHealth: result?.newHealth ?? null,
    stateTokenLen: state.length,
  });
  return NextResponse.json({
    ok: true,
    roomId,
    updated: result?.kind === "updated",
    streamHealth: result?.newHealth ?? null,
    roomVersion: result && "roomVersion" in result ? result.roomVersion : undefined,
  });
}
