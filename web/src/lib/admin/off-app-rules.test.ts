import { describe, expect, it } from "vitest";
import { contextIndices, evaluateOffAppMessage, threadLevel } from "./off-app-rules";

describe("off-app watch rules", () => {
  it("flags asking for money by Zelle as a likely off-app sale", () => {
    const v = evaluateOffAppMessage("If you zelle me $120 I can close the whole thing for you bro.");
    expect(v?.level).toBe("high");
    expect(v?.tags).toContain("payment_app");
    expect(v?.tags).toContain("sending_money");
    expect(v?.amounts).toEqual(["$120"]);
  });

  it("flags 'mark it down for the platform' fee talk", () => {
    const v = evaluateOffAppMessage("I can take Venmo or Zelle and still mark it down for the platform");
    expect(v?.level).toBe("high");
    expect(v?.tags).toContain("fee_talk");
  });

  it("flags claiming a sale on the platform to pay commission", () => {
    const v = evaluateOffAppMessage("You can send it to my phone number and I'll claim it on the platform to pay commission.");
    expect(v?.level).toBe("high");
    expect(v?.tags).toContain("fee_talk");
  });

  it("flags 'can we do Zelle instead' as a payment-app mention", () => {
    expect(evaluateOffAppMessage("Can we do Zelle instead")?.level).toBe("medium");
    expect(evaluateOffAppMessage("Okay that’ll work what’s your Zelle?")?.level).toBe("medium");
  });

  it("treats a bare phone number or 'text me' as low (contact swap only)", () => {
    expect(evaluateOffAppMessage("2676580338")?.level).toBe("low");
    expect(evaluateOffAppMessage("Yo. 314-413-7640. Mike.")?.level).toBe("low");
    expect(evaluateOffAppMessage("shoot me a text when you go live")?.level).toBe("low");
  });

  it("flags Discord and social invites as low", () => {
    const v = evaluateOffAppMessage("https://discord.gg/abc123 join my discord");
    expect(v?.level).toBe("low");
    expect(v?.tags).toContain("social_move");
  });

  it("does not match tracking numbers or ordinary talk", () => {
    expect(evaluateOffAppMessage("9434650105796037339578")).toBeNull();
    expect(evaluateOffAppMessage("What came out of the last break? Thanks!")).toBeNull();
    expect(evaluateOffAppMessage("")).toBeNull();
    expect(evaluateOffAppMessage(null)).toBeNull();
  });

  it("picks the worst level for a thread and builds context windows", () => {
    expect(threadLevel(["low", "high", "medium"])).toBe("high");
    expect(threadLevel(["low", "medium"])).toBe("medium");
    expect(contextIndices(10, [3], 1)).toEqual([2, 3, 4]);
    expect(contextIndices(10, [0, 9], 1)).toEqual([0, 1, 8, 9]);
    expect(contextIndices(5, [2, 3], 1)).toEqual([1, 2, 3, 4]);
  });
});
