export type BuyerWalletReadinessSnapshot = {
  paymentReady: boolean;
  shippingReady: boolean;
};

export function buyerWalletReady(snapshot: BuyerWalletReadinessSnapshot): boolean {
  return snapshot.paymentReady && snapshot.shippingReady;
}

export function buyerWalletStatusLabel(snapshot: BuyerWalletReadinessSnapshot): string {
  if (buyerWalletReady(snapshot)) return "Ready for live + checkout";
  const missing: string[] = [];
  if (!snapshot.shippingReady) missing.push("shipping address with contact phone");
  if (!snapshot.paymentReady) missing.push("payment method");
  return `Add ${missing.join(" and ")}`;
}

export function buyerWalletStatusDetail(snapshot: BuyerWalletReadinessSnapshot): string {
  if (buyerWalletReady(snapshot)) {
    return "Saved to your account — reused for live shows, marketplace, and layaway.";
  }
  return "Set up once. Required for live shows and used at marketplace checkout.";
}
