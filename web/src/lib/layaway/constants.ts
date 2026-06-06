/** Minimum listing price (USD) for seller layaway eligibility. */
export const LAYAWAY_MIN_LISTING_PRICE_USD = 500;

/** Non-refundable deposit as a fraction of item price (excludes shipping). */
export const LAYAWAY_DEPOSIT_FRACTION = 0.25;

export const LAYAWAY_PLAN_DAYS = {
  thirty_day: 30,
  sixty_day: 60,
} as const;

export type LayawayPlanKey = keyof typeof LAYAWAY_PLAN_DAYS;

/** Buyer reminder schedule by plan (days after start). */
export const LAYAWAY_REMINDER_DAYS: Record<LayawayPlanKey, number[]> = {
  thirty_day: [7, 21, 27],
  sixty_day: [14, 30, 45, 55],
};

/** Final warning sent on expiration day (day index = plan length). */
export function layawayFinalWarningDay(plan: LayawayPlanKey): number {
  return LAYAWAY_PLAN_DAYS[plan];
}

/** Order `paymentStatus` while layaway is in progress (not fully paid). */
export const PAYMENT_LAYAWAY_ACTIVE = "layaway_active" as const;

/** Order `paymentStatus` after layaway converts to a normal paid marketplace order. */
export const PAYMENT_LAYAWAY_COMPLETED = "layaway_completed" as const;

export const LAYAWAY_TERMS_COPY = [
  "25% non-refundable deposit required",
  "Item will not ship until paid in full",
  "Remaining balance must be paid within your selected term",
  "Failure to complete payment will result in forfeiture of deposit",
] as const;
