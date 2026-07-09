/** Trade-only listings persist as buy_now + acceptTradeOffers with a $1 placeholder price. */
export function isTradeOnlyListing(row: {
  buyingFormat: string;
  acceptTradeOffers: boolean;
  allowOffers: boolean;
  allowLayaway: boolean;
  priceUsd: number;
}): boolean {
  return (
    row.buyingFormat === "buy_now" &&
    row.acceptTradeOffers === true &&
    row.allowOffers !== true &&
    row.allowLayaway !== true &&
    row.priceUsd === 1
  );
}
