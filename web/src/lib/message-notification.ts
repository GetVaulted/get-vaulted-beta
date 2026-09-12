import type { MessageThreadInbox } from "@/generated/prisma/client";

/** Stable notification type for a message that landed in the recipient's inbox. */
export const MESSAGE_RECEIVED_TYPE = "message_received";
/** Stable notification type for a first message that landed in the recipient's request folder. */
export const MESSAGE_REQUESTED_TYPE = "message_requested";

export type MessageNotification = { type: string; title: string };

/**
 * Notification type + title for the FIRST message of a thread, chosen by where the thread landed:
 *  - `request` inbox  → "Message Requested" (a cold contact waiting to be accepted)
 *  - `primary` inbox  → "Received a Message" (mutual follow / prior trust)
 */
export function firstMessageNotification(inbox: MessageThreadInbox): MessageNotification {
  if (inbox === "request") {
    return { type: MESSAGE_REQUESTED_TYPE, title: "Message Requested" };
  }
  return { type: MESSAGE_RECEIVED_TYPE, title: "Received a Message" };
}

/** Replies inside an existing (already-visible) thread are always "Received a Message". */
export const REPLY_MESSAGE_NOTIFICATION: MessageNotification = {
  type: MESSAGE_RECEIVED_TYPE,
  title: "Received a Message",
};
