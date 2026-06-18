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

  if (path.startsWith('/account/offers') || ctx?.type?.includes('offer')) {
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

  if (path.startsWith('/account/listings') || ctx?.type === 'item_sold' || ctx?.type === 'seller_ready_to_ship') {
    n.navigate('MainTabs', { screen: 'HQ' });
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
