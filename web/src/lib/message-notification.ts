import type { MessageThreadInbox } from "@/generated/prisma/client";

/** Stable notification type for a message that landed in the recipient's inbox. */
export const MESSAGE_RECEIVED_TYPE = "message_received";
/** Stable notification type for a first message that landed in the recipient's request folder. */
export const MESSAGE_REQUESTED_TYPE = "message_requested";

export type MessageNotification = { type: string; title: string; bodyPrefix: string };

function titleFor(senderUsername: string | null): string {
  return senderUsername ? `@${senderUsername}` : "New message";
}

/**
 * Notification type + title for the FIRST message of a thread. The title is always the sender's
 * username so it's visible at a glance in the inbox/push notification; the request-vs-received
 * distinction (previously carried by the title text) is now carried by `bodyPrefix`, which the
 * caller prepends to the message preview:
 *  - `request` inbox  → "Message request: …" (a cold contact waiting to be accepted)
 *  - `primary` inbox  → no prefix (mutual follow / prior trust)
 */
export function firstMessageNotification(
  inbox: MessageThreadInbox,
  senderUsername: string | null,
): MessageNotification {
  const title = titleFor(senderUsername);
  if (inbox === "request") {
    return { type: MESSAGE_REQUESTED_TYPE, title, bodyPrefix: "Message request: " };
  }
  return { type: MESSAGE_RECEIVED_TYPE, title, bodyPrefix: "" };
}

/** Replies inside an existing (already-visible) thread are always "message_received". */
export function replyMessageNotification(senderUsername: string | null): MessageNotification {
  return { type: MESSAGE_RECEIVED_TYPE, title: titleFor(senderUsername), bodyPrefix: "" };
}
