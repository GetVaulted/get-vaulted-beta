/** Canonical USD rounding for persisted prices and display (2 decimal places). */
export function roundUsd(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
