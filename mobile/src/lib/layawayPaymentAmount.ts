export type LayawayPaymentAmount =
  | { ok: true; amountUsd: number }
  | { ok: false; error: string };

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Parses the amount a buyer typed for a partial layaway payment ("125", "$1,250.50"). The server
 * also caps the charge at the remaining balance; rejecting here just gives a clearer message.
 */
export function parseLayawayPaymentAmount(raw: string, remainingBalanceUsd: number): LayawayPaymentAmount {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return { ok: false, error: 'Enter how much you want to pay.' };
  if (!/^\d*\.?\d{0,2}$/.test(cleaned)) return { ok: false, error: 'Enter a valid dollar amount.' };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Enter an amount greater than $0.' };
  const amountUsd = Math.round(n * 100) / 100;
  if (amountUsd > remainingBalanceUsd + 0.005) {
    return { ok: false, error: `That is more than your remaining balance of ${formatUsd(remainingBalanceUsd)}.` };
  }
  return { ok: true, amountUsd };
}
