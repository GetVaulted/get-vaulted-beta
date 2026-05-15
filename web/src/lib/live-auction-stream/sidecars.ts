/**
 * Optional dual-write of canonical auction events to Redis Streams and/or Kafka after Postgres append.
 * Partition key for both is `liveRoomId` (per-room total order via `seq`).
 *
 * **Latency:** callers on the bid realtime path should not `await` this function — use
 * `scheduleCanonicalAuctionEventSidecars` from `live-auction-fanout-flush` (fire-and-forget).
 *
 * Env:
 * - `REDIS_URL` — enables `XADD` to `auction:{liveRoomId}` (~ retention trim).
 * - `KAFKA_BROKERS` — comma-separated list; `KAFKA_TOPIC_AUCTION_EVENTS` (default `auction.events`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any;

async function getRedis(): Promise<any | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (redisClient === null) return null;
  if (redisClient) return redisClient;
  try {
    const { createClient } = await import("redis");
    const c = createClient({ url });
    c.on("error", (err) => {
      console.error("[auction-redis]", err);
    });
    await c.connect();
    redisClient = c;
    return c;
  } catch (e) {
    console.error("[auction-redis] connect failed", e);
    redisClient = null;
    return null;
  }
}

export async function publishRedisCanonicalAuctionEvent(row: {
  liveRoomId: string;
  seq: number;
  eventType: string;
  payload: unknown;
}): Promise<void> {
  const c = await getRedis();
  if (!c) return;
  const key = `auction:${row.liveRoomId}`;
  await c.xAdd(
    key,
    "*",
    {
      seq: String(row.seq),
      type: row.eventType,
      payload: JSON.stringify(row.payload),
    },
    {
      TRIM: {
        strategy: "MAXLEN",
        strategyModifier: "~",
        threshold: 200_000,
      },
    },
  );
}

let kafkaProducer: any;

async function getKafkaProducer(): Promise<any | null> {
  const brokers = process.env.KAFKA_BROKERS?.trim();
  if (!brokers) return null;
  if (kafkaProducer === null) return null;
  if (kafkaProducer) return kafkaProducer;
  try {
    const { Kafka, logLevel } = await import("kafkajs");
    const kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID?.trim() || "get-vaulted-auction",
      brokers: brokers.split(",").map((b) => b.trim()).filter(Boolean),
      logLevel: logLevel.NOTHING,
    });
    const producer = kafka.producer({ allowAutoTopicCreation: true });
    await producer.connect();
    kafkaProducer = producer;
    return producer;
  } catch (e) {
    console.error("[auction-kafka] connect failed", e);
    kafkaProducer = null;
    return null;
  }
}

export async function publishKafkaCanonicalAuctionEvent(row: {
  liveRoomId: string;
  seq: number;
  eventType: string;
  payload: unknown;
}): Promise<void> {
  const producer = await getKafkaProducer();
  if (!producer) return;
  const topic = process.env.KAFKA_TOPIC_AUCTION_EVENTS?.trim() || "auction.events";
  const value = JSON.stringify({
    liveRoomId: row.liveRoomId,
    seq: row.seq,
    eventType: row.eventType,
    payload: row.payload,
    emittedAt: new Date().toISOString(),
  });
  await producer.send({
    topic,
    messages: [
      {
        key: row.liveRoomId,
        value,
        headers: { seq: String(row.seq), liveRoomId: row.liveRoomId },
      },
    ],
  });
}

/** Fire-and-forget sidecars; failures are logged only (Postgres remains source of truth). */
export async function publishCanonicalAuctionEventSidecars(row: {
  liveRoomId: string;
  seq: number;
  eventType: string;
  payload: unknown;
}): Promise<void> {
  const results = await Promise.allSettled([
    publishRedisCanonicalAuctionEvent(row),
    publishKafkaCanonicalAuctionEvent(row),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("[auction-sidecars]", r.reason);
  }
}

/** Never blocks compat Supabase emit — use after `emitBidPlaced` in latency-sensitive paths. */
export function scheduleCanonicalAuctionEventSidecars(row: {
  liveRoomId: string;
  seq: number;
  eventType: string;
  payload: unknown;
}): void {
  void publishCanonicalAuctionEventSidecars(row).catch((e) => {
    console.error("[auction-sidecars] scheduled publish failed", e);
  });
}
