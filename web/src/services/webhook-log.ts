import { prisma } from "@/lib/prisma";

const MAX_PAYLOAD_CHARS = 120_000;

export type WebhookSource = "stripe" | "shippo";

export async function createWebhookLogEntry(args: {
  source: WebhookSource;
  eventType: string;
  payload: string;
  externalId?: string | null;
}): Promise<{ id: string }> {
  const row = await prisma.webhookEventLog.create({
    data: {
      source: args.source,
      eventType: args.eventType.slice(0, 200),
      payload: args.payload.slice(0, MAX_PAYLOAD_CHARS),
      externalId: args.externalId?.slice(0, 200) ?? null,
      processed: false,
      error: null,
    },
    select: { id: true },
  });
  return { id: row.id };
}

export async function updateWebhookLogEntry(
  id: string,
  data: { eventType?: string; externalId?: string | null },
): Promise<void> {
  await prisma.webhookEventLog.update({
    where: { id },
    data: {
      ...(data.eventType != null ? { eventType: data.eventType.slice(0, 200) } : {}),
      ...(data.externalId !== undefined ? { externalId: data.externalId?.slice(0, 200) ?? null } : {}),
    },
  });
}

export async function markWebhookLogSuccess(id: string): Promise<void> {
  await prisma.webhookEventLog.update({
    where: { id },
    data: { processed: true, error: null },
  });
}

export async function markWebhookLogFailure(id: string, message: string): Promise<void> {
  await prisma.webhookEventLog.update({
    where: { id },
    data: { processed: false, error: message.slice(0, 8000) },
  });
}

/**
 * Final rejection (bad signature / not a real provider event). Mark processed so Health does not
 * treat probe traffic as "stuck unprocessed" forever; keep `error` for audit.
 */
export async function markWebhookLogRejected(id: string, message: string): Promise<void> {
  await prisma.webhookEventLog.update({
    where: { id },
    data: { processed: true, error: message.slice(0, 8000) },
  });
}

export async function markWebhookLogSkippedDuplicate(id: string): Promise<void> {
  await prisma.webhookEventLog.update({
    where: { id },
    data: { processed: true, error: "duplicate_external_id_skipped" },
  });
}
