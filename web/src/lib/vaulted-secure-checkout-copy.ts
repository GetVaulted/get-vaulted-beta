/**
 * Copy for the optional high-value checkout panel (shown only when `ESCROW_ENABLED=true` and totals qualify).
 */
export const VAULTED_SECURE_CHECKOUT = {
  title: "High-value checkout",
  description:
    "For orders above the configured threshold, Get Vaulted may route payment through an additional secure checkout path. Funds move according to that flow’s rules until delivery is confirmed.",
  shortDescription:
    "This cart may use the high-value checkout path. Follow the prompts on the next screen; confirmation comes from the payment processor, not the return page alone.",
  feeLabel: "Processing fee (est.)",
  cta: "Continue to secure checkout",
} as const;
