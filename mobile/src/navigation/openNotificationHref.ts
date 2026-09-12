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

/**
 * True while the seller is on the live-hosting screen (broadcasting or running their queue).
 * `item_sold` fires on every single sale during a live show, so a seller who taps that push
 * banner mid-show — easy to do by reflex, or by an accidental swipe — used to get yanked straight
 * out of their broadcast into Command Center (`MainTabs` -> `HQ`) with no way back except
 * re-opening the room. They already see sales land in real time in the Sales sheet, so routing
 * these routine sale-activity taps away from the live screen is never useful and only disruptive.
 */
function isCurrentlyHostingLive(): boolean {
  if (!rootNavigationRef.isReady()) return false;
  try {
    return rootNavigationRef.getCurrentRoute()?.name === 'SellerHostRoom';
  } catch {
    return false;
  }
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
    if (isCurrentlyHostingLive()) return true;
    openSellerOrderDetail(n, decodeURIComponent(sellerOrderMatch[1]));
    return true;
  }
  if (path.startsWith('/account/sales')) {
    if (isCurrentlyHostingLive()) return true;
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
      if (isCurrentlyHostingLive()) return true;
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

  // Referral credits live in Vault Wallet on mobile (Account → Vault Wallet → Referral Credit).
  if (
    path.startsWith('/account/referrals') ||
    path.startsWith('/account/wallet') ||
    path.startsWith('/account/vault-wallet')
  ) {
    n.navigate('BuyerWallet');
    return true;
  }

  // Seller Vault Studio for one listing (e.g. "new offer" push: `/seller/listings/{id}?offerId=...`).
  // Must run before any type-based "offer" fallback — production always sends type `offer_received`.
  const sellerListingMatch = path.match(/^\/seller\/listings\/([^/]+)/);
  if (sellerListingMatch?.[1]) {
    const listingId = decodeURIComponent(sellerListingMatch[1]);
    const offerId = new URLSearchParams(href.split('?')[1] ?? '').get('offerId')?.trim();
    n.navigate('SellerListingManagement', offerId ? { listingId, offerId } : { listingId });
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

  // Buyer "your offers" web path — mobile has no dedicated screen yet.
  // Do NOT match on type alone: that used to send seller `offer_received` to Marketplace
  // and skip `/seller/listings/...` above.
  if (path.startsWith('/account/offers')) {
    n.navigate('MainTabs', { screen: 'Marketplace' });
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

  // Host console deep link (T−15 “get ready” push).
  const hostConsoleMatch = path.match(/^\/seller\/live\/([^/]+)\/console/);
  if (hostConsoleMatch?.[1]) {
    n.navigate('SellerHostRoom', { roomId: decodeURIComponent(hostConsoleMatch[1]) });
    return true;
  }

  if (path.startsWith('/account/seller') || ctx?.type === 'stripe_connect_action_required') {
    if (isCurrentlyHostingLive()) return true;
    n.navigate('MainTabs', { screen: 'HQ' });
    return true;
  }

  if (path.startsWith('/account/listings') || ctx?.type === 'item_sold' || ctx?.type === 'seller_ready_to_ship') {
    if (isCurrentlyHostingLive()) return true;
    n.navigate('MainTabs', { screen: 'HQ' });
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

  if (ctx?.type === 'message_received' || ctx?.type === 'message_requested') {
    n.navigate('MessagesInbox');
    return true;
  }

  n.navigate('NotificationInbox');
  return true;
}
