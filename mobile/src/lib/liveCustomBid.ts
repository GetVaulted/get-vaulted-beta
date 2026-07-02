export type LiveCustomBidMode = 'exact' | 'reserve';

export type LiveCustomBidPayload = {
  amountUsd: number;
  maxProxyUsd?: number;
};

export function validateLiveCustomBidAmount(amountUsd: number, minNextBidUsd: number): string | null {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return 'Enter a valid bid amount.';
  }
  if (amountUsd + 0.001 < minNextBidUsd) {
    return `Minimum bid is $${minNextBidUsd.toFixed(2)}.`;
  }
  return null;
}

export function resolveLiveCustomBidPayload(args: {
  mode: LiveCustomBidMode;
  enteredUsd: number;
  minNextBidUsd: number;
}): LiveCustomBidPayload {
  const err = validateLiveCustomBidAmount(args.enteredUsd, args.minNextBidUsd);
  if (err) throw new Error(err);
  if (args.mode === 'exact') {
    return { amountUsd: args.enteredUsd };
  }
  return { amountUsd: args.minNextBidUsd, maxProxyUsd: args.enteredUsd };
}

export const LIVE_CUSTOM_BID_MODE_COPY = {
  exact: {
    label: 'Exact bid',
    description: 'Instant bid — places the exact amount you enter on the lot now.',
  },
  reserve: {
    label: 'Max bid',
    description: 'Placeholder max — bids the minimum now and keeps you winning up to this amount.',
  },
} as const;
