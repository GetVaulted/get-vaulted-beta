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

  const rows = await prisma.pushDeviceToken.findMany({
    where: { userId },
    select: { expoPushToken: true },
  });
  for (const row of rows) tokens.add(row.expoPushToken);

  const admin = getSupabaseAdminClient();
  if (admin) {
    const { data } = await admin
      .from("push_device_tokens")
      .select("expo_push_token")
      .eq("user_id", userId);
    for (const row of data ?? []) {
      if (typeof row.expo_push_token === "string" && row.expo_push_token.trim()) {
        tokens.add(row.expo_push_token.trim());
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

    const messages: ExpoPushMessage[] = pushTokens.map((to) => ({
      to,
      sound: "default",
      title: payload.title.slice(0, 200),
      body: payload.body.slice(0, 2000),
      data: {
        href: payload.href.slice(0, 2000),
        type: payload.type,
        notificationId: payload.notificationId ?? "",
      },
      channelId: "vault-default",
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
          if (process.env.NODE_ENV !== "production") {
            console.warn("[push] ticket error", ticket.message, ticket.details);
          }
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
