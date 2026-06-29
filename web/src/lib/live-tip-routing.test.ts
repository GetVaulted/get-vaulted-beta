import { describe, expect, it } from "vitest";
import { liveTipApplicationFeeCents, parseLiveTipConfigFromBody, resolveLiveTipRecipientUserId, formatLiveTipChatMessage } from "@/lib/live-tip-routing";

describe("parseLiveTipConfigFromBody", () => {
  it("defaults to host when no moderator", () => {
    expect(parseLiveTipConfigFromBody({})).toEqual({
      tipModeratorId: null,
      tipRecipientMode: "host",
    });
  });

  it("clears moderator when null is sent", () => {
    expect(parseLiveTipConfigFromBody({ tipModeratorId: null })).toEqual({
      tipModeratorId: null,
      tipRecipientMode: "host",
    });
  });

  it("routes to moderator when toggle is on", () => {
    expect(
      parseLiveTipConfigFromBody({
        tipModeratorId: "mod_1",
        tipsToModerator: true,
      }),
    ).toEqual({
      tipModeratorId: "mod_1",
      tipRecipientMode: "moderator",
    });
  });

  it("keeps host routing when moderator selected but toggle off", () => {
    expect(
      parseLiveTipConfigFromBody({
        tipModeratorId: "mod_1",
        tipsToModerator: false,
      }),
    ).toEqual({
      tipModeratorId: "mod_1",
      tipRecipientMode: "host",
    });
  });
});

describe("resolveLiveTipRecipientUserId", () => {
  it("returns host by default", () => {
    expect(
      resolveLiveTipRecipientUserId({
        sellerId: "host_1",
        tipRecipientMode: "host",
        tipModeratorId: "mod_1",
      }),
    ).toBe("host_1");
  });

  it("returns moderator when mode is moderator", () => {
    expect(
      resolveLiveTipRecipientUserId({
        sellerId: "host_1",
        tipRecipientMode: "moderator",
        tipModeratorId: "mod_1",
      }),
    ).toBe("mod_1");
  });
});

describe("liveTipApplicationFeeCents", () => {
  it("is always zero platform fee", () => {
    expect(liveTipApplicationFeeCents()).toBe(0);
  });
});

describe("formatLiveTipChatMessage", () => {
  it("formats username, amount, and money emoji", () => {
    expect(formatLiveTipChatMessage({ senderUsername: "brysmith31", amountUsd: 5 })).toBe(
      "brysmith31 tipped $5.00 💰",
    );
  });

  it("appends optional note after emoji", () => {
    expect(
      formatLiveTipChatMessage({ senderUsername: "buyer1", amountUsd: 12.5, message: "Great show!" }),
    ).toBe("buyer1 tipped $12.50 💰 — Great show!");
  });
});
