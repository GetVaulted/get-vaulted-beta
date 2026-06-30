export const LIVE_BID_OUTBID_CODE = 'LIVE_BID_OUTBID';

export const LIVE_BID_OUTBID_TITLE = 'Outbid';

export const LIVE_BID_OUTBID_FALLBACK =
  'Someone else got there first — tap bid again to raise your offer.';

export type LiveBidFailureKind = 'outbid' | 'validation' | 'generic';

export type LiveBidFailureDisplay = {
  kind: LiveBidFailureKind;
  title: string;
  message: string;
  minNextBidUsd?: number;
};

export class LiveBidError extends Error {
  readonly code?: string;
  readonly minNextBidUsd?: number;
  readonly status?: number;

  constructor(
    message: string,
    opts?: { code?: string; minNextBidUsd?: number; status?: number },
  ) {
    super(message);
    this.name = 'LiveBidError';
    this.code = opts?.code;
    this.minNextBidUsd = opts?.minNextBidUsd;
    this.status = opts?.status;
  }
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function looksLikeOutbidMessage(message: string): boolean {
  return /someone else|another higher|outbid|bid first|got there first/i.test(message);
}

export function resolveLiveBidFailureDisplay(err: unknown): LiveBidFailureDisplay {
  if (err instanceof LiveBidError) {
    if (err.code === LIVE_BID_OUTBID_CODE) {
      const min = err.minNextBidUsd;
      const message =
        min != null && Number.isFinite(min)
          ? `Someone else bid first. Next bid is ${fmtUsd(min)}.`
          : err.message.trim() || LIVE_BID_OUTBID_FALLBACK;
      return { kind: 'outbid', title: LIVE_BID_OUTBID_TITLE, message, minNextBidUsd: min };
    }
    const msg = err.message.trim() || 'Something went wrong placing your bid.';
    if (looksLikeOutbidMessage(msg)) {
      return { kind: 'outbid', title: LIVE_BID_OUTBID_TITLE, message: msg, minNextBidUsd: err.minNextBidUsd };
    }
    return { kind: 'generic', title: 'Bid not placed', message: msg };
  }

  if (err instanceof Error) {
    const msg = err.message.trim();
    if (/bid must be at least/i.test(msg)) {
      return {
        kind: 'outbid',
        title: LIVE_BID_OUTBID_TITLE,
        message: 'Someone else bid first. Check the new high bid and try again.',
      };
    }
    if (looksLikeOutbidMessage(msg)) {
      return { kind: 'outbid', title: LIVE_BID_OUTBID_TITLE, message: msg };
    }
    return { kind: 'generic', title: 'Bid not placed', message: msg || 'Try again in a moment.' };
  }

  return { kind: 'generic', title: 'Bid not placed', message: 'Try again in a moment.' };
}

export function isLiveBidOutbidFailure(err: unknown): boolean {
  return resolveLiveBidFailureDisplay(err).kind === 'outbid';
}
