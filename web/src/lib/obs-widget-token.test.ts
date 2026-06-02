import { describe, expect, it } from "vitest";
import {
  generateObsWidgetTokenPlain,
  hashObsWidgetToken,
  isObsWidgetTokenFormat,
  verifyObsWidgetToken,
} from "@/lib/obs-widget-token";

describe("obs-widget-token", () => {
  it("hashes and verifies a generated token", () => {
    const plain = generateObsWidgetTokenPlain();
    expect(isObsWidgetTokenFormat(plain)).toBe(true);
    const hash = hashObsWidgetToken(plain);
    expect(verifyObsWidgetToken(plain, hash)).toBe(true);
    expect(verifyObsWidgetToken("wrong", hash)).toBe(false);
    expect(verifyObsWidgetToken(plain, hashObsWidgetToken(generateObsWidgetTokenPlain()))).toBe(false);
  });
});
