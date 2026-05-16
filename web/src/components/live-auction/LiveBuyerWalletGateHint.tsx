import Link from "next/link";

type Props = {
  /** When true, render nothing. */
  hide: boolean;
  paymentReady: boolean;
  shippingReady: boolean;
  className?: string;
};

/**
 * Inline copy for live buyers missing a saved card and/or shipping address (Wallet).
 */
export function LiveBuyerWalletGateHint({ hide, paymentReady, shippingReady, className }: Props) {
  if (hide) return null;
  const base =
    className ??
    "mt-2 text-[10px] text-amber-200/90";
  if (paymentReady && shippingReady) return null;

  return (
    <p className={base}>
      {!paymentReady ? (
        <>
          Add a saved card (verified with a $0 authorization for bids).{" "}
          <Link href="/account/payment-methods" className="font-semibold text-gold-bright hover:underline">
            Payment methods
          </Link>
        </>
      ) : null}
      {!paymentReady && !shippingReady ? (
        <span className="mx-1 text-zinc-500" aria-hidden>
          ·
        </span>
      ) : null}
      {!shippingReady ? (
        <>
          Add a shipping address so purchases and wins can ship to you.{" "}
          <Link href="/account/payment-methods#wallet-shipping" className="font-semibold text-gold-bright hover:underline">
            Shipping in Wallet
          </Link>
        </>
      ) : null}{" "}
      Saved to your account Wallet.
    </p>
  );
}
