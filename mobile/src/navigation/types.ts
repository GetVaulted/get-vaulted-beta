import type { NavigatorScreenParams } from '@react-navigation/native';
import type { DisputeContextType, ReviewType, SupportCategory } from '../platform/types';

export type LiveStackParamList = {
  LiveDiscovery: undefined;
  LiveRoom: { streamId: string };
};

export type TradeCenterStackParamList = {
  TradeCenterHome: undefined;
  InitiateTrade: { requestedListingId?: string } | undefined;
  ReviewOffer: { offerId: string };
  CounterOffer: { offerId: string };
  TradeCheckout: { offerId: string };
  TradeDetail: { tradeId: string };
  TradeCenterQa: { focusTradeId?: string } | undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Marketplace: undefined;
  Live: NavigatorScreenParams<LiveStackParamList> | undefined;
  TradeCenter: NavigatorScreenParams<TradeCenterStackParamList> | undefined;
  HQ: undefined;
};

export type CreateListingStackParamList = {
  CreateListingChooseChannel: undefined;
  CreateListingMedia: { draftId?: string; reset?: boolean; channel?: 'marketplace' | 'live_show' } | undefined;
  CreateListingType: undefined;
  CreateListingCategory: undefined;
  CreateListingDetails: undefined;
  CreateListingPricing: undefined;
  CreateListingShipping: undefined;
  CreateListingLiveShipping: undefined;
  CreateListingReview: undefined;
};

export type RootStackParamList = {
  LaunchIntro: { instantAuth?: boolean } | undefined;
  AuthWelcome: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  AuthLogin: undefined;
  /** `ref` pre-fills from a shared referral link (`/join?ref=<username>`) when present — same
   *  query param name as the web signup page, so `linkingConfig.ts`'s default query-string-to-
   *  route-param mapping picks it up with no extra parsing. */
  AuthSignUp: { ref?: string } | undefined;
  /** OAuth / first-time members must confirm username (+ optional referral) before MainTabs. */
  CompleteProfileSetup: { ref?: string } | undefined;
  ProfileEdit: undefined;
  ProductDetail: { productId: string };
  MarketplaceCheckout: { listingId: string; mode: 'buy_now' | 'layaway'; walletSetupFirst?: boolean };
  SellerListingManagement: { listingId: string; offerId?: string };
  SellerHostRoom: { roomId: string };
  MessagesInbox: undefined;
  MessageThread: { threadId: string };
  MessageCompose: {
    listingId?: string;
    liveRoomId?: string;
    sellerUserId?: string;
    sellerUsername?: string;
    initialDraft?: string;
  };
  CreateListingFlow: NavigatorScreenParams<CreateListingStackParamList> | undefined;
  Settings: undefined;
  BuyerWallet: undefined;
  SellerSetupWizard: undefined;
  QaEnvironmentDiagnostics: undefined;
  SettingsAccount: undefined;
  ChangeEmail: undefined;
  ChangePassword: undefined;
  DeleteAccount: undefined;
  CommunityGuidelines: undefined;
  ReportingSafety: undefined;
  HelpCenter: { focusSearch?: boolean } | undefined;
  HelpArticle: { articleId: string };
  ContactSupport:
    | {
        category?: SupportCategory;
        referenceType?: string;
        referenceId?: string;
      }
    | undefined;
  SupportInbox: undefined;
  SupportTicketDetail: { ticketId: string };
  OpenDispute: { contextType: DisputeContextType; referenceId?: string };
  DisputeDetail: { disputeId: string };
  UserProfile: { userId: string };
  /** Public seller storefront — all listings with shop tabs (mirrors web `/seller/{username}`). */
  SellerShop: { sellerId: string; tab?: 'all' | 'buy_now' | 'auctions' | 'sold' };
  /** Resolves a `/seller/{username}` link to `SellerShop`. */
  SellerProfileByUsername: { username: string };
  FollowersFollowing: { tab?: 'followers' | 'following' } | undefined;
  WriteReview: {
    reviewType: ReviewType;
    referenceId: string;
    subjectUserId: string;
    subjectDisplayName?: string;
  };
  NotificationInbox: undefined;
  VaultEventRecap: { roomId: string };
  VaultComms: undefined;
  BuyerOrders: { source?: 'marketplace' | 'live' } | undefined;
  BuyerOrderDetail: { orderId: string };
  BuyerLayaways: undefined;
  Watchlist: undefined;
  SellerLayaways: { filter?: 'active' | 'ready' | 'overdue' } | undefined;
  SellerLayawayDetail: { layawayId: string };
  SellerOrderDetail: { orderId: string };
  PromoEntry: { slug: string };
  VaultSearch: { initialQuery?: string } | undefined;
};
