import { describe, expect, it } from "vitest";
import {
  containsProfanity,
  evaluateUsernamePolicy,
  USERNAME_UNAVAILABLE_MESSAGE,
  usernamePolicyUserMessage,
} from "@/lib/username-policy";

describe("username-policy", () => {
  it("blocks obvious and obfuscated profanity", () => {
    expect(containsProfanity("fuck_you")).toBe(true);
    expect(containsProfanity("sh1t_head")).toBe(true);
    expect(usernamePolicyUserMessage("profanity")).toBe(USERNAME_UNAVAILABLE_MESSAGE);
  });

  it("allows clean usernames", () => {
    expect(evaluateUsernamePolicy("card_collector").ok).toBe(true);
  });
});
