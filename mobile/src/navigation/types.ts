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
  AuthSignUp: undefined;
  ProfileEdit: undefined;
  ProductDetail: { productId: string };
  SellerHostRoom: { roomId: string };
  MessagesInbox: undefined;
  MessageThread: { threadId: string };
  MessageCompose: {
    listingId?: string;
    liveRoomId?: string;
    initialDraft?: string;
  };
  CreateListingFlow: NavigatorScreenParams<CreateListingStackParamList> | undefined;
  Settings: undefined;
  SettingsAccount: undefined;
  ChangeEmail: undefined;
  ChangePassword: undefined;
  DeleteAccount: undefined;
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
  WriteReview: {
    reviewType: ReviewType;
    referenceId: string;
    subjectUserId: string;
    subjectDisplayName?: string;
  };
  NotificationInbox: undefined;
  VaultEventRecap: { roomId: string };
  VaultComms: undefined;
  BuyerOrders: undefined;
  BuyerOrderDetail: { orderId: string };
};
