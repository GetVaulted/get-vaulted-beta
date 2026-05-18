/** Future-ready trust snapshot for profiles and seller cards. */
export type TrustProfile = {
  userId: string;
  successfulSales: number;
  successfulTrades: number;
  disputeCount: number;
  disputeRate: number;
  responseRate: number;
  shipSpeedScore: number;
  vaultVerified: boolean;
  trustedTraderTier: 'none' | 'bronze' | 'silver' | 'gold' | 'vault';
  breakerReputation: number;
  collectorScore: number;
  averageRating: number;
  reviewCount: number;
};
