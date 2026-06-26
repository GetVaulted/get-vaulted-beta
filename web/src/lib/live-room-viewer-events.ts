export const VIEWER_EVENT_JOIN_BODY = "joined 🔥";
export const VIEWER_EVENT_JOIN_BODY_LEGACY = "joined 👋";
export const VIEWER_EVENT_SHARE_BODY = "shared this show ✉️";
export const HOST_ENDING_LIVE_BODY = "Host is ending the live.";

export const VIEWER_JOIN_DEDUPE_WINDOW_MS = 30_000;

const JOIN_BODIES = new Set([VIEWER_EVENT_JOIN_BODY, VIEWER_EVENT_JOIN_BODY_LEGACY]);

export function isHostEndingLiveBody(body: string | null | undefined): boolean {
  return body?.trim() === HOST_ENDING_LIVE_BODY;
}

export function isViewerJoinChatBody(body: string | null | undefined): boolean {
  const text = body?.trim();
  return Boolean(text && JOIN_BODIES.has(text));
}

/** Join/share system rows render inline (username + body) without a chat colon. */
export function isInlineViewerEventBody(body: string | null | undefined): boolean {
  const text = body?.trim();
  if (!text) return false;
  return isViewerJoinChatBody(text) || text === VIEWER_EVENT_SHARE_BODY || isHostEndingLiveBody(text);
}
