export type BuyerWalletReadiness = {
  paymentReady: boolean;
  shippingReady: boolean;
};

export class WalletIncompleteError extends Error {
  readonly code = 'LIVE_BUYER_WALLET_INCOMPLETE' as const;
  readonly paymentReady: boolean;
  readonly shippingReady: boolean;
  readonly addPaymentMethodsUrl: string;
  readonly addShippingUrl: string;

  constructor(body: {
    error?: string;
    paymentReady?: boolean;
    shippingReady?: boolean;
    addPaymentMethodsUrl?: string;
    addShippingUrl?: string;
  }) {
    super(
      body.error ??
        'Add saved payment method and shipping address to your wallet before bidding, buying, or claiming a spot.',
    );
    this.name = 'WalletIncompleteError';
    this.paymentReady = body.paymentReady === true;
    this.shippingReady = body.shippingReady === true;
    this.addPaymentMethodsUrl = body.addPaymentMethodsUrl ?? '/account/payment-methods';
    this.addShippingUrl = body.addShippingUrl ?? '/account/payment-methods#wallet-shipping';
  }
}

export function isWalletIncompleteError(e: unknown): e is WalletIncompleteError {
  return e instanceof WalletIncompleteError;
}

export function walletReadinessFromSnapshot(snap: {
  paymentReady?: boolean | null;
  shippingReady?: boolean | null;
} | null | undefined): BuyerWalletReadiness | null {
  if (!snap || snap.paymentReady == null || snap.shippingReady == null) return null;
  return { paymentReady: snap.paymentReady, shippingReady: snap.shippingReady };
}

/** True when readiness is known incomplete. Null/unknown is not incomplete for UI chrome. */
export function isWalletIncompleteReadiness(r: BuyerWalletReadiness | null | undefined): boolean {
  if (!r) return false;
  return !r.paymentReady || !r.shippingReady;
}

/** Bids must not proceed until wallet is known-ready (null/unknown blocks). */
export function isWalletReadyForLiveBid(r: BuyerWalletReadiness | null | undefined): boolean {
  return Boolean(r?.paymentReady && r?.shippingReady);
}
