import { describe, expect, it } from "vitest";
import {
  containsProfanity,
  evaluateUsernamePolicy,
  isReservedUsername,
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

  it("allows vaulted alone but blocks Get Vaulted brand names", () => {
    expect(evaluateUsernamePolicy("vaulted").ok).toBe(true);
    expect(evaluateUsernamePolicy("vaulted_cards").ok).toBe(true);
    expect(evaluateUsernamePolicy("the_vaulted_one").ok).toBe(true);

    expect(isReservedUsername("getvaulted")).toBe(true);
    expect(isReservedUsername("get_vaulted")).toBe(true);
    expect(isReservedUsername("shop_get_vaulted")).toBe(true);
    expect(evaluateUsernamePolicy("getvaulted").ok).toBe(false);
    expect(evaluateUsernamePolicy("get_vaulted").ok).toBe(false);
  });
});
