import { describe, expect, it } from "vitest";
import {
  canModeratorPerformAction,
  effectiveModeratorLevel,
  isModeratorActionBlockedOnHost,
  resolveViewerRole,
} from "./live-room-moderator-permissions";

describe("live-room-moderator-permissions", () => {
  it("resolves viewer roles", () => {
    expect(resolveViewerRole({ isHost: true, isModerator: false })).toBe("host");
    expect(resolveViewerRole({ isHost: false, isModerator: true })).toBe("moderator");
    expect(resolveViewerRole({ isHost: false, isModerator: false })).toBe("buyer");
  });

  it("treats host as head level", () => {
    expect(effectiveModeratorLevel({ isHost: true, moderatorLevel: null })).toBe("head");
  });

  it("chat mods can delete and timeout but not ban", () => {
    expect(
      canModeratorPerformAction({ actionType: "delete_message", isHost: false, moderatorLevel: "chat" }),
    ).toBe(true);
    expect(canModeratorPerformAction({ actionType: "timeout", isHost: false, moderatorLevel: "chat" })).toBe(
      true,
    );
    expect(canModeratorPerformAction({ actionType: "room_ban", isHost: false, moderatorLevel: "chat" })).toBe(
      false,
    );
  });

  it("show mods can pin and announce", () => {
    expect(
      canModeratorPerformAction({ actionType: "pin_message", isHost: false, moderatorLevel: "show" }),
    ).toBe(true);
    expect(
      canModeratorPerformAction({ actionType: "post_announcement", isHost: false, moderatorLevel: "show" }),
    ).toBe(true);
    expect(canModeratorPerformAction({ actionType: "kick", isHost: false, moderatorLevel: "show" })).toBe(true);
  });

  it("show mods can kick, undo kick, and undo seller bans", () => {
    expect(canModeratorPerformAction({ actionType: "kick", isHost: false, moderatorLevel: "show" })).toBe(true);
    expect(canModeratorPerformAction({ actionType: "unkick", isHost: false, moderatorLevel: "show" })).toBe(true);
    expect(
      canModeratorPerformAction({ actionType: "seller_stream_unban", isHost: false, moderatorLevel: "show" }),
    ).toBe(true);
  });

  it("head mods retain full punitive actions", () => {
    expect(canModeratorPerformAction({ actionType: "kick", isHost: false, moderatorLevel: "head" })).toBe(true);
    expect(
      canModeratorPerformAction({ actionType: "seller_stream_ban", isHost: false, moderatorLevel: "head" }),
    ).toBe(true);
    expect(canModeratorPerformAction({ actionType: "room_ban", isHost: false, moderatorLevel: "head" })).toBe(true);
  });

  it("assigned moderators without level default to show powers", () => {
    expect(
      canModeratorPerformAction({
        actionType: "kick",
        isHost: false,
        moderatorLevel: null,
        isModerator: true,
      }),
    ).toBe(true);
    expect(
      canModeratorPerformAction({
        actionType: "seller_stream_ban",
        isHost: false,
        moderatorLevel: null,
        isModerator: true,
      }),
    ).toBe(true);
  });

  it("blocks assigned moderators from punitive actions on the host", () => {
    const hostId = "host-1";
    expect(isModeratorActionBlockedOnHost({ actionType: "mute", targetUserId: hostId, hostUserId: hostId })).toBe(
      true,
    );
    expect(
      isModeratorActionBlockedOnHost({ actionType: "delete_message", targetUserId: hostId, hostUserId: hostId }),
    ).toBe(true);
    expect(isModeratorActionBlockedOnHost({ actionType: "kick", targetUserId: hostId, hostUserId: hostId })).toBe(
      true,
    );
    expect(isModeratorActionBlockedOnHost({ actionType: "unmute", targetUserId: hostId, hostUserId: hostId })).toBe(
      false,
    );
    expect(isModeratorActionBlockedOnHost({ actionType: "mute", targetUserId: "buyer-1", hostUserId: hostId })).toBe(
      false,
    );
  });
});
