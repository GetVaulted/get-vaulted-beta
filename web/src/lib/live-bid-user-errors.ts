export const LIVE_BID_OUTBID_CODE = "LIVE_BID_OUTBID";

export const LIVE_BID_OUTBID_FALLBACK =
  "Someone else got there first — raise your bid to stay in.";

export function liveBidOutbidMessage(args: {
  minNextBidUsd?: number;
  formatMoney: (n: number) => string;
}): string {
  const min = args.minNextBidUsd;
  if (min != null && Number.isFinite(min) && min > 0) {
    return `Someone else bid first. Next bid is ${args.formatMoney(min)}.`;
  }
  return LIVE_BID_OUTBID_FALLBACK;
}

export function liveBidOutbidJsonBody(args: {
  minNextBidUsd?: number;
  formatMoney: (n: number) => string;
}) {
  const min = args.minNextBidUsd;
  return {
    error: liveBidOutbidMessage(args),
    code: LIVE_BID_OUTBID_CODE,
    minNextBidUsd: min != null && Number.isFinite(min) && min > 0 ? min : undefined,
  };
}
