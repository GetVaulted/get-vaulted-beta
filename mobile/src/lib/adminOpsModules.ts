import { Ionicons } from '@expo/vector-icons';
import type { AdminOverviewMetrics } from '../api/adminOpsRepository';

export type AdminOpsModuleId =
  | 'live-shows'
  | 'support-tickets'
  | 'trust'
  | 'fulfillment'
  | 'moderation'
  | 'users'
  | 'notifications'
  | 'seller-risk'
  | 'health';

export type AdminOpsModuleRoute =
  | 'AdminLiveShows'
  | 'AdminSupportTickets'
  | 'AdminTrust'
  | 'AdminFulfillment'
  | 'AdminModeration'
  | 'AdminUsers'
  | 'AdminNotifications'
  | 'AdminSellerRisk'
  | 'AdminHealth';

export type AdminOpsModule = {
  id: AdminOpsModuleId;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Count key from overview metrics, when applicable */
  metricKey?: keyof AdminOverviewMetrics;
  route: AdminOpsModuleRoute;
};

/** In-app Ops modules (V1 + V1.5). Deep desk tools stay on web. */
export const ADMIN_OPS_MODULES: AdminOpsModule[] = [
  {
    id: 'live-shows',
    title: 'Live shows',
    description: 'Active and paused rooms — end, cancel, flag',
    icon: 'radio-outline',
    metricKey: 'liveActive',
    route: 'AdminLiveShows',
  },
  {
    id: 'support-tickets',
    title: 'Support tickets',
    description: 'Open buyer and seller requests',
    icon: 'chatbox-ellipses-outline',
    metricKey: 'openSupportTickets',
    route: 'AdminSupportTickets',
  },
  {
    id: 'trust',
    title: 'Trust & reports',
    description: 'User, listing, live, and chat reports',
    icon: 'shield-checkmark-outline',
    metricKey: 'openReports',
    route: 'AdminTrust',
  },
  {
    id: 'fulfillment',
    title: 'Orders & refunds',
    description: 'Open orders, layaways, refund triage',
    icon: 'bag-handle-outline',
    metricKey: 'openOrders',
    route: 'AdminFulfillment',
  },
  {
    id: 'moderation',
    title: 'Moderation',
    description: 'Pending and flagged marketplace listings',
    icon: 'eye-outline',
    metricKey: 'pendingListings',
    route: 'AdminModeration',
  },
  {
    id: 'users',
    title: 'Users',
    description: 'Search, suspend, restore, verification',
    icon: 'people-outline',
    metricKey: 'suspendedUsers',
    route: 'AdminUsers',
  },
  {
    id: 'notifications',
    title: 'Mass notifications',
    description: 'Push a title and message to every user',
    icon: 'megaphone-outline',
    route: 'AdminNotifications',
  },
  {
    id: 'seller-risk',
    title: 'Seller risk',
    description: 'Payout reviews and seller standing',
    icon: 'warning-outline',
    metricKey: 'sellersPendingPayoutReview',
    route: 'AdminSellerRisk',
  },
  {
    id: 'health',
    title: 'Platform health',
    description: 'Stripe, IVS, Shippo, API pulse',
    icon: 'pulse-outline',
    route: 'AdminHealth',
  },
];
