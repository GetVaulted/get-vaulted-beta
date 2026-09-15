import { describe, expect, it } from "vitest";
import { scorePeerSignals, type LinkedAccountSignal } from "@/lib/admin/admin-linked-accounts";

describe("scorePeerSignals", () => {
  it("dedupes by kind and sums weights", () => {
    const signals: LinkedAccountSignal[] = [
      { kind: "push_token", label: "push", evidence: "a", weight: 30 },
      { kind: "push_token", label: "push", evidence: "b", weight: 30 },
      { kind: "email_alias", label: "email", evidence: "c", weight: 25 },
    ];
    expect(scorePeerSignals(signals)).toBe(55);
  });
});
