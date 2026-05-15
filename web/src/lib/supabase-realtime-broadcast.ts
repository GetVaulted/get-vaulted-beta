import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export function isRealtimeBroadcastConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Avoid unbounded growth in long-lived Node processes (dev server, workers). */
const MAX_CACHED_BROADCAST_CHANNELS = 64;

let publisherClient: SupabaseClient | null = null;

function getPublisherClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing for realtime broadcast");
  }
  if (!publisherClient) {
    publisherClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return publisherClient;
}

type ChannelSlot =
  | { kind: "pending"; promise: Promise<RealtimeChannel> }
  | { kind: "ready"; channel: RealtimeChannel };

const channelSlots = new Map<string, ChannelSlot>();

function evictOneCachedChannelIfNeeded(): void {
  if (channelSlots.size < MAX_CACHED_BROADCAST_CHANNELS) return;
  for (const [name, slot] of channelSlots) {
    if (slot.kind === "ready") {
      try {
        void publisherClient?.removeChannel(slot.channel);
      } catch {
        /* ignore */
      }
      channelSlots.delete(name);
      return;
    }
  }
}

function invalidateChannelSlot(channelName: string): void {
  const slot = channelSlots.get(channelName);
  if (!slot) return;
  if (slot.kind === "ready") {
    try {
      void publisherClient?.removeChannel(slot.channel);
    } catch {
      /* ignore */
    }
  }
  channelSlots.delete(channelName);
}

async function subscribeChannelOnce(channelName: string): Promise<RealtimeChannel> {
  evictOneCachedChannelIfNeeded();
  const supabase = getPublisherClient();
  const channel = supabase.channel(channelName, {
    config: { broadcast: { ack: false, self: true } },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("realtime subscribe timeout")), 15_000);
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timer);
        if (status === "CHANNEL_ERROR") {
          console.warn("[realtime broadcast] subscribe failed", err?.message ?? status, channelName);
        }
        reject(err ?? new Error(String(status)));
      }
    });
  });
  return channel;
}

async function getOrCreateSubscribedChannel(channelName: string): Promise<RealtimeChannel> {
  const existing = channelSlots.get(channelName);
  if (existing?.kind === "ready") return existing.channel;
  if (existing?.kind === "pending") return existing.promise;

  const promise = subscribeChannelOnce(channelName);
  channelSlots.set(channelName, { kind: "pending", promise });
  try {
    const channel = await promise;
    channelSlots.set(channelName, { kind: "ready", channel });
    return channel;
  } catch (e) {
    channelSlots.delete(channelName);
    throw e;
  }
}

/**
 * Broadcast on a Realtime channel (server-only, service role).
 * Reuses a subscribed channel per `channelName` so each emit is a single `send()` instead of
 * subscribe → send → teardown (which was adding multi-second latency per event during live shows).
 */
export async function broadcastRealtimeEventOnce(
  channelName: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return;

  const sendOn = async (ch: RealtimeChannel) => {
    const status = await ch.send({ type: "broadcast", event, payload: payload as never });
    if (status !== "ok") {
      throw new Error(`realtime send: ${JSON.stringify(status)}`);
    }
  };

  try {
    const ch = await getOrCreateSubscribedChannel(channelName);
    await sendOn(ch);
  } catch (first) {
    invalidateChannelSlot(channelName);
    try {
      const ch2 = await getOrCreateSubscribedChannel(channelName);
      await sendOn(ch2);
    } catch (second) {
      console.error("[realtime broadcast]", channelName, event, first, second);
      throw second;
    }
  }
}

/** Fire-and-forget broadcast (never throws to caller). */
export function broadcastRealtimeEvent(channelName: string, event: string, payload: Record<string, unknown>): void {
  void broadcastRealtimeEventOnce(channelName, event, payload).catch((e) => console.error("[realtime broadcast]", e));
}
