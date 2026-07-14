import { describe, expect, it, vi } from 'vitest';

// `rootNavigationRef` is only used as a fallback when no navigation prop is passed (never
// exercised by these tests), and importing the real `@react-navigation/native` package as a
// runtime value (rather than a type) isn't supported by this project's vitest setup — see the
// existing `openMarketplaceCommerce.test.ts` for the same pattern.
vi.mock('./rootNavigationRef', () => ({
  rootNavigationRef: { isReady: () => false, navigate: vi.fn() },
}));

// eslint-disable-next-line import/order -- must import after vi.mock calls above
import { openNotificationHref } from './openNotificationHref';

function fakeNav() {
  return { navigate: vi.fn() } as unknown as NonNullable<Parameters<typeof openNotificationHref>[0]>;
}

describe('openNotificationHref', () => {
  it('routes a buyer order href to BuyerOrderDetail', () => {
    const nav = fakeNav();
    expect(openNotificationHref(nav, '/orders/order_1')).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('BuyerOrderDetail', { orderId: 'order_1' });
  });

  it('routes a seller order href to SellerOrderDetail when the type is seller-facing', () => {
    const nav = fakeNav();
    expect(openNotificationHref(nav, '/orders/order_1', { type: 'item_sold' })).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('SellerOrderDetail', { orderId: 'order_1' });
  });

  it('routes /account/seller to Seller HQ for Stripe Connect follow-up', () => {
    const nav = fakeNav();
    expect(openNotificationHref(nav, '/account/seller', { type: 'stripe_connect_action_required' })).toBe(
      true,
    );
    expect(nav.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'HQ' });
  });

  it('routes a listing href to ProductDetail', () => {
    const nav = fakeNav();
    expect(openNotificationHref(nav, '/listing/lst_1')).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('ProductDetail', { productId: 'lst_1' });
  });

  // FIX 2 — "new follower" push notifications used to fall through to the generic notification
  // inbox instead of the follower's profile because no `/seller/{username}` handler existed.
  describe('/seller/{username} — seller profile (new follower)', () => {
    it('routes to SellerProfileByUsername with the decoded username', () => {
      const nav = fakeNav();
      expect(openNotificationHref(nav, '/seller/vinylvault')).toBe(true);
      expect(nav.navigate).toHaveBeenCalledWith('SellerProfileByUsername', { username: 'vinylvault' });
    });

    it('decodes a URL-encoded username', () => {
      const nav = fakeNav();
      expect(openNotificationHref(nav, `/seller/${encodeURIComponent('vinyl vault')}`)).toBe(true);
      expect(nav.navigate).toHaveBeenCalledWith('SellerProfileByUsername', { username: 'vinyl vault' });
    });

    it('supports a trailing sub-path after the username', () => {
      const nav = fakeNav();
      expect(openNotificationHref(nav, '/seller/vinylvault/reviews')).toBe(true);
      expect(nav.navigate).toHaveBeenCalledWith('SellerProfileByUsername', { username: 'vinylvault' });
    });

    it('does not treat /seller/listings/... as a username', () => {
      const nav = fakeNav();
      openNotificationHref(nav, '/seller/listings/lst_1');
      expect(nav.navigate).not.toHaveBeenCalledWith('SellerProfileByUsername', expect.anything());
    });

    it('does not treat /seller/live as a username', () => {
      const nav = fakeNav();
      openNotificationHref(nav, '/seller/live');
      expect(nav.navigate).not.toHaveBeenCalledWith('SellerProfileByUsername', expect.anything());
    });
  });

  it('routes a trade offer href to ReviewOffer in Trade Center', () => {
    const nav = fakeNav();
    expect(openNotificationHref(nav, '/trade/trade_1', { type: 'trade_offer_received' })).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('MainTabs', {
      screen: 'TradeCenter',
      params: { screen: 'ReviewOffer', params: { offerId: 'trade_1' } },
    });
  });

  // FIX 3 — "new offer" push notifications used to fall through to the generic notification
  // inbox instead of the seller's listing management screen because no `/seller/listings/{id}`
  // handler existed.
  describe('/seller/listings/{id} — seller listing management (new offer)', () => {
    it('routes to SellerListingManagement with the listing id', () => {
      const nav = fakeNav();
      expect(openNotificationHref(nav, '/seller/listings/lst_1')).toBe(true);
      expect(nav.navigate).toHaveBeenCalledWith('SellerListingManagement', { listingId: 'lst_1' });
    });

    it('forwards the offerId query param so the studio can highlight the offer', () => {
      const nav = fakeNav();
      expect(openNotificationHref(nav, '/seller/listings/lst_1?offerId=offer_42')).toBe(true);
      expect(nav.navigate).toHaveBeenCalledWith('SellerListingManagement', {
        listingId: 'lst_1',
        offerId: 'offer_42',
      });
    });

    it('decodes an encoded listing id', () => {
      const nav = fakeNav();
      const encoded = encodeURIComponent('lst 1');
      expect(openNotificationHref(nav, `/seller/listings/${encoded}`)).toBe(true);
      expect(nav.navigate).toHaveBeenCalledWith('SellerListingManagement', { listingId: 'lst 1' });
    });
  });

  it('falls back to NotificationInbox for an unrecognized href', () => {
    const nav = fakeNav();
    expect(openNotificationHref(nav, '/something/unknown')).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('NotificationInbox');
  });

  it('returns false when there is no navigation and the root ref is not ready', () => {
    expect(openNotificationHref(undefined, '/listing/lst_1')).toBe(false);
  });
});
