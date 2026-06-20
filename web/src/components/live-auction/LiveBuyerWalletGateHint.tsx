type Props = {
  /** When true, render nothing. */
  hide: boolean;
  paymentReady: boolean;
  shippingReady: boolean;
  className?: string;
  onOpenWallet?: () => void;
};

/**
 * Inline copy for live buyers missing a saved card and/or shipping address (Wallet).
 */
export function LiveBuyerWalletGateHint({
  hide,
  paymentReady,
  shippingReady,
  className,
  onOpenWallet,
}: Props) {
  if (hide) return null;
  const base = className ?? "mt-2 text-[10px] text-amber-200/90";
  if (paymentReady && shippingReady) return null;

  const openWallet = onOpenWallet ? (
    <button
      type="button"
      onClick={onOpenWallet}
      className="font-semibold text-gold-bright underline-offset-2 hover:underline"
    >
      Set up wallet here
    </button>
  ) : null;

  return (
    <p className={base}>
      {!paymentReady && !shippingReady
        ? "Add a saved card and shipping address to bid and buy in this show. "
        : !paymentReady
          ? "Add a saved card (verified with a $0 authorization for bids). "
          : "Add a shipping address so purchases and wins can ship to you. "}
      {openWallet}
      {openWallet ? " — stays on this live screen." : null}
    </p>
  );
}
