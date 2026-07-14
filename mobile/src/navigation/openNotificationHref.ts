import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { openSellerLayaways } from './openSellerLayaways';
import { openSellerOrderDetail } from './openSellerOrderDetail';
import { openMessageThread } from './openMessages';
import { rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';

type RootNav = NavigationProp<RootStackParamList>;

export type NotificationHrefContext = {
  type?: string;
  notificationId?: string;
};

function nav(navigation?: NavigationProp<ParamListBase>): RootNav | null {
  if (navigation) return navigation as RootNav;
  if (rootNavigationRef.isReady()) return rootNavigationRef as unknown as RootNav;
  return null;
}

/** Navigate from a server notification href (push tap or inbox). */
export function openNotificationHref(
  navigation: NavigationProp<ParamListBase> | undefined,
  href: string,
  ctx?: NotificationHrefContext,
): boolean {
  const n = nav(navigation);
  if (!n) return false;

  const path = href.split('?')[0]?.split('#')[0] ?? '';

  // Internal-only scheme used by locally-generated notifications (e.g. `notifyFollow`) that
  // already know the user id and don't need the async username lookup `/seller/{username}`
  // requires — see notificationStore.ts.
  const localUserProfileMatch = path.match(/^\/account\/users\/([^/]+)/);
  if (localUserProfileMatch?.[1]) {
    n.navigate('UserProfile', { userId: decodeURIComponent(localUserProfileMatch[1]) });
    return true;
  }

  const messageMatch = path.match(/\/account\/messages\/([^/]+)/);
  if (messageMatch?.[1]) {
    openMessageThread(n, decodeURIComponent(messageMatch[1]));
    return true;
  }
  if (path === '/account/messages') {
    n.navigate('MessagesInbox');
    return true;
  }

  const sellerOrderMatch = path.match(/\/account\/sales\/([^/]+)/);
  if (sellerOrderMatch?.[1] && sellerOrderMatch[1] !== 'layaways') {
    openSellerOrderDetail(n, decodeURIComponent(sellerOrderMatch[1]));
    return true;
  }
  if (path.startsWith('/account/sales')) {
    n.navigate('MainTabs', { screen: 'HQ' });
    return true;
  }

  const buyerOrderMatch = path.match(/\/orders\/([^/]+)/);
  if (buyerOrderMatch?.[1]) {
    const orderId = decodeURIComponent(buyerOrderMatch[1]);
    const sellerTypes = new Set([
      'seller_ready_to_ship',
      'item_sold',
      'seller_label_created',
      'seller_order_delivered',
      'auction_payment_expired_seller',
      'auction_pending_payment',
    ]);
    if (ctx?.type && sellerTypes.has(ctx.type)) {
      openSellerOrderDetail(n, orderId);
      return true;
    }
    n.navigate('BuyerOrderDetail', { orderId });
    return true;
  }

  const layawayMatch = path.match(/\/account\/layaways\/([^/]+)/);
  if (layawayMatch?.[1]) {
    openSellerLayaways(n, { layawayId: decodeURIComponent(layawayMatch[1]) });
    return true;
  }
  if (path.includes('/layaways')) {
    openSellerLayaways(n);
    return true;
  }

  if (path.startsWith('/account/orders')) {
    const liveTab = href.includes('view=live');
    n.navigate('BuyerOrders', liveTab ? { source: 'live' } : undefined);
    return true;
  }

  if (path.startsWith('/account/offers') || (ctx?.type?.includes('offer') && !ctx?.type?.startsWith('trade_'))) {
    n.navigate('MainTabs', { screen: 'Marketplace' });
    return true;
  }

  const tradeOfferMatch = path.match(/^\/trade\/([^/]+)/);
  if (tradeOfferMatch?.[1] && tradeOfferMatch[1] !== 'new' && tradeOfferMatch[1] !== 'offers') {
    const offerId = decodeURIComponent(tradeOfferMatch[1]);
    n.navigate('MainTabs', {
      screen: 'TradeCenter',
      params: { screen: 'ReviewOffer', params: { offerId } },
    });
    return true;
  }
  if (path.startsWith('/trade')) {
    n.navigate('MainTabs', { screen: 'TradeCenter' });
    return true;
  }

  const liveMatch = path.match(/^\/live\/([^/]+)/);
  if (liveMatch?.[1]) {
    n.navigate('MainTabs', {
      screen: 'Live',
      params: { screen: 'LiveRoom', params: { streamId: decodeURIComponent(liveMatch[1]) } },
    });
    return true;
  }

  if (path.startsWith('/account/seller') || ctx?.type === 'stripe_connect_action_required') {
    n.navigate('MainTabs', { screen: 'HQ' });
    return true;
  }

  if (path.startsWith('/account/listings') || ctx?.type === 'item_sold' || ctx?.type === 'seller_ready_to_ship') {
    n.navigate('MainTabs', { screen: 'HQ' });
    return true;
  }

  // Seller Vault Studio for one listing (e.g. "new offer" push: `/seller/listings/{id}?offerId=...`).
  const sellerListingMatch = path.match(/^\/seller\/listings\/([^/]+)/);
  if (sellerListingMatch?.[1]) {
    const listingId = decodeURIComponent(sellerListingMatch[1]);
    const offerId = new URLSearchParams(href.split('?')[1] ?? '').get('offerId')?.trim();
    n.navigate('SellerListingManagement', offerId ? { listingId, offerId } : { listingId });
    return true;
  }

  // Public seller profile (e.g. "new follower" push: `/seller/{username}`). Excludes the
  // seller-only management paths above so they aren't misread as a username of "listings"/"live".
  const sellerProfileMatch = path.match(/^\/seller\/([^/]+)/);
  if (sellerProfileMatch?.[1] && !['listings', 'live'].includes(sellerProfileMatch[1])) {
    n.navigate('SellerProfileByUsername', { username: decodeURIComponent(sellerProfileMatch[1]) });
    return true;
  }

  const listingMatch = path.match(/\/marketplace\/([^/]+)/) ?? path.match(/\/listing\/([^/]+)/);
  if (listingMatch?.[1]) {
    n.navigate('ProductDetail', { productId: decodeURIComponent(listingMatch[1]) });
    return true;
  }

  if (ctx?.type === 'message_received') {
    n.navigate('MessagesInbox');
    return true;
  }

  n.navigate('NotificationInbox');
  return true;
}
