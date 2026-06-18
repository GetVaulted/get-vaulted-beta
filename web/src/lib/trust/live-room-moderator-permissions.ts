import type { LiveRoomModerationActionType, LiveRoomModeratorLevel } from "@/generated/prisma/enums";

export type LiveViewerRole = "buyer" | "host" | "moderator";

const LEVEL_RANK: Record<LiveRoomModeratorLevel, number> = {
  chat: 1,
  show: 2,
  break: 3,
  head: 4,
};

const ACTION_MIN_LEVEL: Partial<Record<LiveRoomModerationActionType, LiveRoomModeratorLevel>> = {
  delete_message: "chat",
  mute: "chat",
  unmute: "chat",
  timeout: "chat",
  pin_message: "show",
  post_announcement: "show",
  run_giveaway: "show",
  slow_mode: "show",
  block_bidding: "break",
  unblock_bidding: "break",
  kick: "head",
  room_ban: "head",
  unban: "head",
  seller_stream_ban: "head",
};

export function effectiveModeratorLevel(args: {
  isHost: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
}): LiveRoomModeratorLevel | null {
  if (args.isHost) return "head";
  return args.moderatorLevel;
}

export function resolveViewerRole(args: { isHost: boolean; isModerator: boolean }): LiveViewerRole {
  if (args.isHost) return "host";
  if (args.isModerator) return "moderator";
  return "buyer";
}

export function canModeratorPerformAction(args: {
  actionType: LiveRoomModerationActionType;
  isHost: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
  isAdmin?: boolean;
}): boolean {
  if (args.isAdmin) return true;
  const level = effectiveModeratorLevel({
    isHost: args.isHost,
    moderatorLevel: args.moderatorLevel,
  });
  if (!level) return false;

  const required = ACTION_MIN_LEVEL[args.actionType];
  if (!required) return args.isHost;
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

export function listAllowedModerationActions(args: {
  isHost: boolean;
  moderatorLevel: LiveRoomModeratorLevel | null;
}): LiveRoomModerationActionType[] {
  const level = effectiveModeratorLevel(args);
  if (!level) return [];
  const rank = LEVEL_RANK[level];
  return (Object.entries(ACTION_MIN_LEVEL) as [LiveRoomModerationActionType, LiveRoomModeratorLevel][])
    .filter(([, minLevel]) => rank >= LEVEL_RANK[minLevel])
    .map(([action]) => action);
}

const HOST_REVERSIBLE_ACTIONS = new Set<LiveRoomModerationActionType>([
  "unmute",
  "unban",
  "unblock_bidding",
]);

/** Assigned moderators (non-admin) cannot mute/kick/ban/delete messages for the show host. */
export function isModeratorActionBlockedOnHost(args: {
  actionType: LiveRoomModerationActionType;
  targetUserId: string | null | undefined;
  hostUserId: string;
  isAdmin?: boolean;
}): boolean {
  if (!args.targetUserId || args.targetUserId !== args.hostUserId) return false;
  if (args.isAdmin) return false;
  if (HOST_REVERSIBLE_ACTIONS.has(args.actionType)) return false;
  return true;
}
