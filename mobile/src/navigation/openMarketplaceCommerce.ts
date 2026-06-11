import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert } from 'react-native';
import {
  fetchBuyerPaymentMethods,
  fetchBuyerShippingAddresses,
} from '../api/buyerWalletRepository';
import { navigateAuthLogin } from './rootNavigationRef';
import type { RootStackParamList } from './types';
import {
  consumePendingMarketplaceListingAction,
  setPendingMarketplaceListingAction,
  type MarketplacePendingAction,
} from '../lib/marketplacePendingAction';
import type { Product } from '../types';

export type MarketplaceCommerceAction = MarketplacePendingAction;

export { consumePendingMarketplaceListingAction, setPendingMarketplaceListingAction };

type RootNav = NativeStackNavigationProp<RootStackParamList>;

export function promptMarketplaceSignIn(listingId: string, action: MarketplaceCommerceAction) {
  setPendingMarketplaceListingAction(listingId, action);
  Alert.alert('Account required', 'Sign in to your Get Vaulted account to continue.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Sign in', onPress: navigateAuthLogin },
  ]);
}

export async function ensureBuyerWalletReady(accessToken: string): Promise<{
  paymentReady: boolean;
  shippingReady: boolean;
}> {
  const [pm, addresses] = await Promise.all([
    fetchBuyerPaymentMethods(accessToken),
    fetchBuyerShippingAddresses(accessToken),
  ]);
  return {
    paymentReady: pm.paymentMethods.length > 0,
    shippingReady: addresses.length > 0,
  };
}

async function openMarketplaceCheckout(
  navigation: RootNav,
  product: Product,
  mode: 'buy_now' | 'layaway',
  accessToken: string,
) {
  const ready = await ensureBuyerWalletReady(accessToken);
  const walletSetupFirst = !ready.paymentReady || !ready.shippingReady;
  if (walletSetupFirst) {
    Alert.alert(
      'Wallet setup',
      'Add a saved shipping address and payment method once — they apply to live shows and marketplace checkout.',
      [{ text: 'Continue', style: 'default' }],
    );
  }
  navigation.navigate('MarketplaceCheckout', {
    listingId: product.id,
    mode,
    walletSetupFirst,
  });
}

export async function openMarketplaceBuyNow(
  navigation: RootNav,
  product: Product,
  opts: { accessToken?: string; guestExploreMode: boolean },
) {
  if (opts.guestExploreMode || !opts.accessToken) {
    promptMarketplaceSignIn(product.id, 'buy_now');
    return;
  }
  await openMarketplaceCheckout(navigation, product, 'buy_now', opts.accessToken);
}

export async function openMarketplaceLayaway(
  navigation: RootNav,
  product: Product,
  opts: { accessToken?: string; guestExploreMode: boolean },
) {
  if (opts.guestExploreMode || !opts.accessToken) {
    promptMarketplaceSignIn(product.id, 'layaway');
    return;
  }
  await openMarketplaceCheckout(navigation, product, 'layaway', opts.accessToken);
}

export function openMarketplaceMakeOffer(
  onOpen: () => void,
  product: Product,
  opts: { accessToken?: string; guestExploreMode: boolean },
) {
  if (opts.guestExploreMode || !opts.accessToken) {
    promptMarketplaceSignIn(product.id, 'make_offer');
    return;
  }
  onOpen();
}

export function openMarketplaceTrade(
  rootNav: RootNav,
  product: Product,
  opts: { accessToken?: string; guestExploreMode: boolean },
) {
  if (opts.guestExploreMode || !opts.accessToken) {
    promptMarketplaceSignIn(product.id, 'trade');
    return;
  }
  rootNav.navigate('MainTabs', {
    screen: 'TradeCenter',
    params: {
      screen: 'InitiateTrade',
      params: { requestedListingId: product.id },
    },
  });
}
