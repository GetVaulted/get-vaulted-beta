import { describe, expect, it } from "vitest";
import { EscrowStatus } from "@/generated/prisma/enums";
import {
  EscrowInvalidTransitionError,
  assertValidEscrowTransition,
  isValidEscrowTransition,
} from "@/services/escrow/state-machine";

describe("assertValidEscrowTransition", () => {
  it("allows the happy-path chain", () => {
    expect(() => assertValidEscrowTransition(null, EscrowStatus.pending)).not.toThrow();
    expect(() => assertValidEscrowTransition(EscrowStatus.pending, EscrowStatus.buyer_paid)).not.toThrow();
    expect(() => assertValidEscrowTransition(EscrowStatus.buyer_paid, EscrowStatus.seller_shipped)).not.toThrow();
    expect(() => assertValidEscrowTransition(EscrowStatus.seller_shipped, EscrowStatus.delivered)).not.toThrow();
    expect(() =>
      assertValidEscrowTransition(EscrowStatus.delivered, EscrowStatus.inspection_period),
    ).not.toThrow();
    expect(() => assertValidEscrowTransition(EscrowStatus.delivered, EscrowStatus.approved)).not.toThrow();
    expect(() =>
      assertValidEscrowTransition(EscrowStatus.inspection_period, EscrowStatus.approved),
    ).not.toThrow();
    expect(() => assertValidEscrowTransition(EscrowStatus.approved, EscrowStatus.funds_released)).not.toThrow();
  });

  it("allows dispute from in-flight states", () => {
    expect(() => assertValidEscrowTransition(EscrowStatus.pending, EscrowStatus.disputed)).not.toThrow();
    expect(() => assertValidEscrowTransition(EscrowStatus.buyer_paid, EscrowStatus.disputed)).not.toThrow();
  });

  it("allows cancel from in-flight states including disputed", () => {
    expect(() => assertValidEscrowTransition(EscrowStatus.buyer_paid, EscrowStatus.cancelled)).not.toThrow();
    expect(() => assertValidEscrowTransition(EscrowStatus.disputed, EscrowStatus.cancelled)).not.toThrow();
  });

  it("rejects skipping (buyer_paid → funds_released)", () => {
    expect(() => assertValidEscrowTransition(EscrowStatus.buyer_paid, EscrowStatus.funds_released)).toThrow(
      EscrowInvalidTransitionError,
    );
  });

  it("rejects buyer_paid → delivered (must ship first)", () => {
    expect(() => assertValidEscrowTransition(EscrowStatus.buyer_paid, EscrowStatus.delivered)).toThrow(
      EscrowInvalidTransitionError,
    );
  });

  it("rejects inspection_period → funds_released (must approve first)", () => {
    expect(() =>
      assertValidEscrowTransition(EscrowStatus.inspection_period, EscrowStatus.funds_released),
    ).toThrow(EscrowInvalidTransitionError);
  });

  it("allows seller_shipped → approved only with opt-in bypass", () => {
    expect(() => assertValidEscrowTransition(EscrowStatus.seller_shipped, EscrowStatus.approved)).toThrow(
      EscrowInvalidTransitionError,
    );
    expect(() =>
      assertValidEscrowTransition(EscrowStatus.seller_shipped, EscrowStatus.approved, {
        allowSellerShippedRelease: true,
      }),
    ).not.toThrow();
  });

  it("isValidEscrowTransition returns boolean", () => {
    expect(isValidEscrowTransition(EscrowStatus.pending, EscrowStatus.buyer_paid)).toBe(true);
    expect(isValidEscrowTransition(EscrowStatus.pending, EscrowStatus.funds_released)).toBe(false);
  });
});
