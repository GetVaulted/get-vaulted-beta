/** Subset of web `MarketplaceListing` returned by `/api/listings`. */
export type WebMarketplaceListing = {
  id: string;
  title: string;
  price: number;
  imageSeed: string;
  imageUrls?: string[];
  sellerUsername: string;
  sellerLevel?: 'vault_seller' | 'trusted_seller' | 'vault_verified' | 'elite_vault_verified';
  sellerLevelLabel?: string;
  sellerVerified: boolean;
  category: string;
  buyingFormat: 'buy_now' | 'auction';
  auctionTimeLeft?: string;
  condition: string;
  listedAt: string;
  href: string;
  sellerId?: string;
  longDescription?: string;
  vaultPick?: boolean;
  listingStatus?: string;
  allowOffers?: boolean;
  allowLayaway?: boolean;
  acceptTradeOffers?: boolean;
  tradeOnly?: boolean;
  shippingPriceUsd?: number;
  handlingTimeLabel?: string;
  signatureRequired?: boolean;
  shipsFromRegion?: string;
  /** Real completed seller order count (listing detail). */
  sellerCompletedOrderCount?: number;
};
