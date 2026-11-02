import { describe, expect, it } from "vitest";
import {
  addRevealChatHold,
  isRevealChatLineHeld,
  nextRevealChatRelease,
  releaseRevealChatHold,
  REVEAL_CHAT_HOLD_MAX_MS,
  REVEAL_CHAT_HOLD_TAIL_MS,
  revealChatLineBuyer,
  type RevealChatHolds,
} from "../../../shared/reveal-chat-hold";

const line = (body: string, messageType = "system") => ({ body, messageType });

describe("reveal chat hold", () => {
  it("parses the buyer from a reveal line only", () => {
    expect(revealChatLineBuyer("@Bob got Chase Card")).toBe("bob");
    expect(revealChatLineBuyer("Bob got Chase")).toBeNull();
    expect(revealChatLineBuyer("@bob nice pull")).toBeNull();
  });

  it("hides the buyer's line until the reveal finishes", () => {
    const holds: RevealChatHolds = new Map();
    addRevealChatHold(holds, "@Bob", 7000, 1000);
    expect(isRevealChatLineHeld(holds, line("@bob got Chase"), 5000)).toBe(true);
    expect(isRevealChatLineHeld(holds, line("@bob got Chase"), 1000 + 7000 + REVEAL_CHAT_HOLD_TAIL_MS)).toBe(false);
  });

  it("does not hide other buyers, chat messages, or non-reveal lines", () => {
    const holds: RevealChatHolds = new Map();
    addRevealChatHold(holds, "bob", 7000, 0);
    expect(isRevealChatLineHeld(holds, line("@amy got Chase"), 10)).toBe(false);
    expect(isRevealChatLineHeld(holds, line("@bob got Chase", "chat"), 10)).toBe(false);
    expect(isRevealChatLineHeld(holds, line("bob joined"), 10)).toBe(false);
  });

  it("releases early when the reveal is dismissed", () => {
    const holds: RevealChatHolds = new Map();
    addRevealChatHold(holds, "bob", 7000, 0);
    releaseRevealChatHold(holds, "bob", 2000);
    expect(isRevealChatLineHeld(holds, line("@bob got X"), 2000 + REVEAL_CHAT_HOLD_TAIL_MS)).toBe(false);
  });

  it("caps a hold so a stuck reveal can't hide chat for long", () => {
    const holds: RevealChatHolds = new Map();
    addRevealChatHold(holds, "bob", 10 * 60_000, 0);
    expect(isRevealChatLineHeld(holds, line("@bob got X"), REVEAL_CHAT_HOLD_MAX_MS)).toBe(false);
  });

  it("reports the next release and prunes expired holds", () => {
    const holds: RevealChatHolds = new Map();
    addRevealChatHold(holds, "bob", 1000, 0);
    addRevealChatHold(holds, "amy", 5000, 0);
    expect(nextRevealChatRelease(holds, 0)).toBe(1000 + REVEAL_CHAT_HOLD_TAIL_MS);
    expect(nextRevealChatRelease(holds, 3000)).toBe(5000 + REVEAL_CHAT_HOLD_TAIL_MS);
    expect(holds.has("bob")).toBe(false);
  });
});
