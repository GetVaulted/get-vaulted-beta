import { describe, expect, it } from "vitest";
import {
  addRevealChatHold,
  isRevealChatLineHeld,
  nextRevealChatRelease,
  releaseRevealChatHold,
  REVEAL_CHAT_HOLD_MAX_MS,
  REVEAL_CHAT_HOLD_TAIL_MS,
  revealChatLineBuyer,
  RevealChatGate,
  REVEAL_CHAT_PENDING_GRACE_MS,
  REVEAL_CHAT_WARMUP_MS,
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

describe("RevealChatGate", () => {
  const T0 = 1_000_000;
  const READY = T0 + REVEAL_CHAT_WARMUP_MS;
  const got = (id: string, buyer = "bob") => ({ id, body: `@${buyer} got Chase`, messageType: "system" });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  const spin = { spinId: "s1", buyerUsername: "bob" };

  it("never hides chat that was there when the screen opened", () => {
    const g = new RevealChatGate(T0);
    expect(ids(g.visible([got("old")], (m) => m, T0))).toEqual(["old"]);
  });

  it("holds the line when it arrives in the same render as the reveal", () => {
    const g = new RevealChatGate(T0);
    g.syncSpin(spin, 7000, READY);
    expect(ids(g.visible([got("m1")], (m) => m, READY + 10))).toEqual([]);
    expect(ids(g.visible([got("m1")], (m) => m, READY + 7500))).toEqual(["m1"]);
  });

  it("holds a line that arrives BEFORE the reveal, then for the whole animation", () => {
    const g = new RevealChatGate(T0);
    expect(ids(g.visible([got("m1")], (m) => m, READY))).toEqual([]);
    g.syncSpin(spin, 7000, READY + 300);
    expect(ids(g.visible([got("m1")], (m) => m, READY + 5000))).toEqual([]);
    expect(ids(g.visible([got("m1")], (m) => m, READY + 300 + 7500))).toEqual(["m1"]);
  });

  it("shows the line after a short grace if no reveal ever comes", () => {
    const g = new RevealChatGate(T0);
    expect(ids(g.visible([got("m1")], (m) => m, READY))).toEqual([]);
    expect(ids(g.visible([got("m1")], (m) => m, READY + REVEAL_CHAT_PENDING_GRACE_MS))).toEqual(["m1"]);
  });

  it("does not hold ordinary chat", () => {
    const g = new RevealChatGate(T0);
    g.syncSpin(spin, 7000, READY);
    const chat = { id: "c1", body: "@bob got lucky lol", messageType: "chat" };
    expect(ids(g.visible([chat], (m) => m, READY + 10))).toEqual(["c1"]);
  });

  it("keeps a shown line shown when the same buyer's next reveal starts", () => {
    const g = new RevealChatGate(T0);
    g.syncSpin(spin, 7000, READY);
    g.visible([got("m1")], (m) => m, READY + 8000);
    g.syncSpin({ spinId: "s2", buyerUsername: "bob" }, 7000, READY + 9000);
    expect(ids(g.visible([got("m1"), got("m2")], (m) => m, READY + 9100))).toEqual(["m1"]);
  });
});
