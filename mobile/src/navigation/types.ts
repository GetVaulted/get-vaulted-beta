import type { NavigatorScreenParams } from '@react-navigation/native';

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
  Discover: undefined;
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
  AuthSignUp: undefined;
  ProfileEdit: undefined;
  ProductDetail: { productId: string };
  CreateListingFlow: NavigatorScreenParams<CreateListingStackParamList> | undefined;
};
