/** Structured breadcrumbs for Stripe money-flow / reconciliation debugging. */
export function moneyFlowLog(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`[MoneyFlow] ${event}`, detail);
  } else {
    console.log(`[MoneyFlow] ${event}`);
  }
}
