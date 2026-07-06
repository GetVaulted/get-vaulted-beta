import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types';

const fetchBuyerPaymentMethods = vi.fn();
const fetchBuyerShippingAddresses = vi.fn();

vi.mock('../api/buyerWalletRepository', () => ({
  fetchBuyerPaymentMethods: (...args: unknown[]) => fetchBuyerPaymentMethods(...args),
  fetchBuyerShippingAddresses: (...args: unknown[]) => fetchBuyerShippingAddresses(...args),
}));

vi.mock('./rootNavigationRef', () => ({
  navigateAuthLogin: vi.fn(),
}));

// eslint-disable-next-line import/order -- must import after vi.mock calls above
import { Alert } from 'react-native';
import {
  openMarketplaceBuyNow,
  openMarketplaceLayaway,
  openMarketplaceMakeOffer,
} from './openMarketplaceCommerce';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'listing-1',
    title: 'Vintage Rolex',
    category: 'watches',
    imageGradient: ['#000', '#111'],
    vaultVerified: true,
    listingPrice: '$1,200',
    seller: { id: 'seller-1', name: 'Seller', handle: '@seller', avatarUrl: '', verified: true, followers: '10' },
    ...overrides,
  };
}

function fakeNav() {
  return { navigate: vi.fn(), replace: vi.fn() } as unknown as Parameters<typeof openMarketplaceBuyNow>[0];
}

// Bug fix regression: a rejected wallet-readiness prefetch (network error / non-OK API
// response / 15s timeout) must surface an Alert, not fail silently like it used to.
describe('openMarketplaceBuyNow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an Alert instead of failing silently when the wallet readiness check throws', async () => {
    fetchBuyerPaymentMethods.mockRejectedValue(new Error('Could not load payment methods.'));
    fetchBuyerShippingAddresses.mockResolvedValue([]);
    const nav = fakeNav();

    await openMarketplaceBuyNow(nav, product(), { accessToken: 'token', guestExploreMode: false });

    expect(nav.navigate).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', 'Could not load payment methods.');
  });

  it('falls back to generic copy when the thrown error has no message', async () => {
    fetchBuyerPaymentMethods.mockRejectedValue(new Error());
    fetchBuyerShippingAddresses.mockResolvedValue([]);
    const nav = fakeNav();

    await openMarketplaceBuyNow(nav, product(), { accessToken: 'token', guestExploreMode: false });

    expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', 'Please try again.');
  });

  it('replaces the listing modal with checkout when the wallet is fully ready', async () => {
    fetchBuyerPaymentMethods.mockResolvedValue({
      paymentMethods: [{ id: 'pm1', brand: 'visa', last4: '4242', expMonth: 1, expYear: 30 }],
      stripeConfigured: true,
    });
    fetchBuyerShippingAddresses.mockResolvedValue([{ id: 'addr1' }]);
    const nav = fakeNav();

    await openMarketplaceBuyNow(nav, product(), { accessToken: 'token', guestExploreMode: false });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('MarketplaceCheckout', {
      listingId: 'listing-1',
      mode: 'buy_now',
      walletSetupFirst: false,
    });
  });

  it('replaces the listing modal with wallet-first checkout when the wallet is incomplete', async () => {
    fetchBuyerPaymentMethods.mockResolvedValue({ paymentMethods: [], stripeConfigured: true });
    fetchBuyerShippingAddresses.mockResolvedValue([]);
    const nav = fakeNav();

    await openMarketplaceBuyNow(nav, product(), { accessToken: 'token', guestExploreMode: false });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('MarketplaceCheckout', {
      listingId: 'listing-1',
      mode: 'buy_now',
      walletSetupFirst: true,
    });
  });

  it('prompts sign-in without ever calling the wallet check for guests', async () => {
    const nav = fakeNav();

    await openMarketplaceBuyNow(nav, product(), { accessToken: undefined, guestExploreMode: true });

    expect(fetchBuyerPaymentMethods).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});

// Same latent bug as openMarketplaceBuyNow: a rejected wallet-readiness prefetch must
// surface an Alert instead of leaving the layaway flow silently stuck.
describe('openMarketplaceLayaway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an Alert instead of failing silently when the wallet readiness check throws', async () => {
    fetchBuyerPaymentMethods.mockRejectedValue(new Error('Could not load payment methods.'));
    fetchBuyerShippingAddresses.mockResolvedValue([]);
    const nav = fakeNav();

    await openMarketplaceLayaway(nav, product(), { accessToken: 'token', guestExploreMode: false });

    expect(nav.navigate).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', 'Could not load payment methods.');
  });

  it('replaces the listing modal with checkout when the wallet is fully ready', async () => {
    fetchBuyerPaymentMethods.mockResolvedValue({
      paymentMethods: [{ id: 'pm1', brand: 'visa', last4: '4242', expMonth: 1, expYear: 30 }],
      stripeConfigured: true,
    });
    fetchBuyerShippingAddresses.mockResolvedValue([{ id: 'addr1' }]);
    const nav = fakeNav();

    await openMarketplaceLayaway(nav, product(), { accessToken: 'token', guestExploreMode: false });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('MarketplaceCheckout', {
      listingId: 'listing-1',
      mode: 'layaway',
      walletSetupFirst: false,
    });
  });
});

// Same latent bug as openMarketplaceBuyNow: a rejected wallet-readiness prefetch must
// surface an Alert instead of leaving the make-offer sheet silently stuck closed.
describe('openMarketplaceMakeOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an Alert instead of failing silently when the wallet readiness check throws', async () => {
    fetchBuyerPaymentMethods.mockRejectedValue(new Error('Could not load payment methods.'));
    fetchBuyerShippingAddresses.mockResolvedValue([]);
    const nav = fakeNav();
    const onOpen = vi.fn();

    await openMarketplaceMakeOffer(nav, onOpen, product(), { accessToken: 'token', guestExploreMode: false });

    expect(onOpen).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', 'Could not load payment methods.');
  });

  it('opens the offer sheet with no Alert when the wallet is fully ready', async () => {
    fetchBuyerPaymentMethods.mockResolvedValue({
      paymentMethods: [{ id: 'pm1', brand: 'visa', last4: '4242', expMonth: 1, expYear: 30 }],
      stripeConfigured: true,
    });
    fetchBuyerShippingAddresses.mockResolvedValue([{ id: 'addr1' }]);
    const nav = fakeNav();
    const onOpen = vi.fn();

    await openMarketplaceMakeOffer(nav, onOpen, product(), { accessToken: 'token', guestExploreMode: false });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('prompts sign-in without ever calling the wallet check for guests', async () => {
    const nav = fakeNav();
    const onOpen = vi.fn();

    await openMarketplaceMakeOffer(nav, onOpen, product(), { accessToken: undefined, guestExploreMode: true });

    expect(fetchBuyerPaymentMethods).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
