import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

let expoClient: Expo | null = null;

function getExpoClient(): Expo | null {
  if (process.env.EXPO_PUSH_DISABLED === "1") return null;
  if (!expoClient) expoClient = new Expo();
  return expoClient;
}

export type ExpoPushPayload = {
  userId: string;
  title: string;
  body: string;
  href: string;
  type: string;
  notificationId?: string;
};

async function loadExpoPushTokens(userId: string): Promise<string[]> {
  const tokens = new Set<string>();
  const supabaseAuthIds = new Set<string>();

  const rows = await prisma.pushDeviceToken.findMany({
    where: { userId },
    select: { expoPushToken: true, supabaseAuthUserId: true },
  });
  for (const row of rows) {
    if (row.expoPushToken) tokens.add(row.expoPushToken);
    const authId = row.supabaseAuthUserId?.trim();
    if (authId) supabaseAuthIds.add(authId);
  }

  const admin = getSupabaseAdminClient();
  if (admin) {
    for (const authUserId of supabaseAuthIds) {
      const { data } = await admin
        .from("push_device_tokens")
        .select("expo_push_token")
        .eq("user_id", authUserId);
      for (const row of data ?? []) {
        if (typeof row.expo_push_token === "string" && row.expo_push_token.trim()) {
          tokens.add(row.expo_push_token.trim());
        }
      }
    }
  }

  return [...tokens].filter((t) => Expo.isExpoPushToken(t));
}

async function pruneInvalidTokens(invalidTokens: string[]): Promise<void> {
  if (invalidTokens.length === 0) return;
  await prisma.pushDeviceToken.deleteMany({
    where: { expoPushToken: { in: invalidTokens } },
  });
  const admin = getSupabaseAdminClient();
  if (admin) {
    await admin.from("push_device_tokens").delete().in("expo_push_token", invalidTokens);
  }
}

/** Send OS push to all registered devices for a Prisma user. Best-effort; never throws. */
export async function sendExpoPushForUser(payload: ExpoPushPayload): Promise<void> {
  const client = getExpoClient();
  if (!client) return;

  try {
    const pushTokens = await loadExpoPushTokens(payload.userId);
    if (pushTokens.length === 0) return;

    // iOS home-screen icon badge only updates from the APNs `badge` field (or an explicit
    // client setBadgeCountAsync). Without this, pushes alert but the red corner count never
    // appears while the app is backgrounded / killed.
    const unreadCount = await prisma.notification.count({
      where: { userId: payload.userId, readAt: null },
    });

    const messages: ExpoPushMessage[] = pushTokens.map((to) => ({
      to,
      sound: "default",
      title: payload.title.slice(0, 200),
      body: payload.body.slice(0, 2000),
      badge: unreadCount,
      data: {
        href: payload.href.slice(0, 2000),
        type: payload.type,
        notificationId: payload.notificationId ?? "",
      },
      channelId: "vault-default",
      priority: payload.type === "chat_mention" ? "high" : undefined,
    }));

    const chunks = client.chunkPushNotifications(messages);
    const invalid: string[] = [];

    for (const chunk of chunks) {
      const tickets = await client.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === "error") {
          const token = chunk[i]?.to;
          if (typeof token === "string" && ticket.details?.error === "DeviceNotRegistered") {
            invalid.push(token);
          }
          console.warn("[push] ticket error", ticket.message, ticket.details);
        }
      });
    }

    await pruneInvalidTokens(invalid);
  } catch (e) {
    console.error("[push] sendExpoPushForUser failed", e);
  }
}

/** Delay push slightly when notification rows are created inside a transaction. */
export function scheduleExpoPushForUser(payload: ExpoPushPayload, opts?: { deferMs?: number }): void {
  const deferMs = opts?.deferMs ?? 0;
  setTimeout(() => {
    void sendExpoPushForUser(payload);
  }, deferMs);
}

export type ExpoPushBroadcastPayload = {
  userIds: string[];
  title: string;
  body: string;
  href: string;
  type: string;
};

/**
 * Send OS push to every registered device across many users in one pass (admin mass notifications).
 * Reads only the primary Prisma token store (not the Supabase mirror) to avoid an N+1 lookup at
 * broadcast scale — devices registered via the app always write here first. Returns tickets sent.
 */
export async function sendExpoPushBroadcast(payload: ExpoPushBroadcastPayload): Promise<number> {
  const client = getExpoClient();
  if (!client || payload.userIds.length === 0) return 0;

  try {
    const tokenSet = new Set<string>();
    for (const idBatch of chunkArray(payload.userIds, 1000)) {
      const rows = await prisma.pushDeviceToken.findMany({
        where: { userId: { in: idBatch } },
        select: { expoPushToken: true },
      });
      for (const row of rows) tokenSet.add(row.expoPushToken);
    }
    const tokens = [...tokenSet].filter((t) => Expo.isExpoPushToken(t));
    if (tokens.length === 0) return 0;

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: "default",
      title: payload.title.slice(0, 200),
      body: payload.body.slice(0, 2000),
      data: { href: payload.href.slice(0, 2000), type: payload.type },
      channelId: "vault-default",
    }));

    const chunks = client.chunkPushNotifications(messages);
    const invalid: string[] = [];
    let sent = 0;

    for (const chunk of chunks) {
      const tickets = await client.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === "error") {
          const token = chunk[i]?.to;
          if (typeof token === "string" && ticket.details?.error === "DeviceNotRegistered") {
            invalid.push(token);
          }
          console.warn("[push] broadcast ticket error", ticket.message, ticket.details);
        } else {
          sent += 1;
        }
      });
    }

    await pruneInvalidTokens(invalid);
    return sent;
  } catch (e) {
    console.error("[push] sendExpoPushBroadcast failed", e);
    return 0;
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
