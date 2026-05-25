import type { TipRecipientMode } from "@/generated/prisma/client";

export type LiveTipRoomFields = {
  sellerId: string;
  tipRecipientMode: TipRecipientMode;
  tipModeratorId: string | null;
};

export type ParsedLiveTipConfig = {
  tipModeratorId: string | null;
  tipRecipientMode: TipRecipientMode;
};

export function parseTipRecipientMode(raw: unknown): TipRecipientMode {
  return raw === "moderator" ? "moderator" : "host";
}

/** Parse create/edit payload for moderator selection + tip routing toggle. */
export function parseLiveTipConfigFromBody(body: {
  tipModeratorId?: unknown;
  tipRecipientMode?: unknown;
  /** UI toggle alias — when true with a moderator selected, routes tips to moderator. */
  tipsToModerator?: unknown;
}): ParsedLiveTipConfig {
  if ("tipModeratorId" in body && (body.tipModeratorId === null || body.tipModeratorId === "")) {
    return { tipModeratorId: null, tipRecipientMode: "host" };
  }

  const tipModeratorId =
    typeof body.tipModeratorId === "string" && body.tipModeratorId.trim()
      ? body.tipModeratorId.trim()
      : null;

  if (!tipModeratorId) {
    return { tipModeratorId: null, tipRecipientMode: "host" };
  }

  const routeToModerator =
    body.tipsToModerator === true || parseTipRecipientMode(body.tipRecipientMode) === "moderator";

  return {
    tipModeratorId,
    tipRecipientMode: routeToModerator ? "moderator" : "host",
  };
}

/** Resolve the user id that should receive tips for this room configuration. */
export function resolveLiveTipRecipientUserId(room: LiveTipRoomFields): string {
  if (room.tipRecipientMode === "moderator" && room.tipModeratorId) {
    return room.tipModeratorId;
  }
  return room.sellerId;
}

/** Get Vaulted platform fee on tips is always zero (Stripe processing fees still apply). */
export function liveTipApplicationFeeCents(): number {
  return 0;
}

export function serializeLiveTipConfig(room: {
  tipRecipientMode: TipRecipientMode;
  tipModeratorId: string | null;
  tipModerator?: { id: string; username: string } | null;
}) {
  return {
    tipRecipientMode: room.tipRecipientMode,
    tipModeratorId: room.tipModeratorId,
    tipModeratorUsername: room.tipModerator?.username?.trim() || null,
    tipsToModerator: room.tipRecipientMode === "moderator" && Boolean(room.tipModeratorId),
  };
}
