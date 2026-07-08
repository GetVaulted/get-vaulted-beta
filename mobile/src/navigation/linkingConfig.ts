import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import type { RootStackParamList } from './types';

const expoPrefix = Linking.createURL('/');

/** Deep links + Universal Links for shared live show URLs. */
export const navigationLinking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    expoPrefix,
    'getvaulted://',
    'https://shopgetvaulted.com',
    'https://www.shopgetvaulted.com',
    'https://beta.shopgetvaulted.com',
  ],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Live: {
            path: 'live',
            screens: {
              LiveDiscovery: '',
              LiveRoom: ':streamId',
            },
          },
        },
      },
      ProductDetail: 'listing/:productId',
      // `/orders/{id}` (buyer order detail) — same path `openNotificationHref.ts` already routes
      // for buyer-facing order pushes.
      BuyerOrderDetail: 'orders/:orderId',
      // `/seller/listings/{id}` (seller Vault Studio for one listing, e.g. shared from a "new
      // offer" push: `?offerId=...`) — mirrors `openNotificationHref.ts`'s handling of the same
      // path. MUST be declared before/alongside `SellerProfileByUsername` below: React Navigation
      // sorts `config.screens` from most- to least-specific by static path segments regardless of
      // object key order (see `getStateFromPath`'s config sort), so this static `seller/listings`
      // segment always wins over the generic `seller/:username` param for a URL like
      // `/seller/listings/lst_1` — but keeping the more specific entry first here too for
      // readability. `offerId` isn't declared as a path param, so it's picked up automatically
      // from the query string per React Navigation's default query-param-to-route-param behavior.
      SellerListingManagement: 'seller/listings/:listingId',
      // `/seller/{username}` (public seller shop) — resolves the username to a user id before
      // landing on `SellerShop`, mirroring `openNotificationHref.ts`'s handling of the same path
      // for "new follower" pushes. Note: `/marketplace/{id}` is a legacy alias that server-side
      // redirects to `/listing/{id}` (see `web/src/lib/listing-routes.ts`), so it doesn't need a
      // separate entry here — a shared `/marketplace/{id}` link is already the same resource as
      // `listing/:productId` above by the time a browser would hand it to the app.
      SellerProfileByUsername: 'seller/:username',
      // `/join?ref=<username>` — shared referral link. Only reachable if the app is already
      // installed (this is a universal-link fallback, not deferred/post-install attribution); a
      // referrer's link otherwise opens the web signup page in a browser, which is a complete
      // fallback on its own. `ref` is picked up from the query string automatically.
      AuthSignUp: 'join',
    },
  },
};
