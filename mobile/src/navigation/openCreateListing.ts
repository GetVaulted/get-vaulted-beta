import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { fetchSellerAccount } from '../api/sellerAccountRepository';
import type { ListingChannel } from '../createListing/listingChannel';
import {
  isSellerActivated,
  normalizeSellerReadinessChecks,
  resolveWizardCompleteFromSources,
} from '../lib/seller-setup-state';
import { readSellerWizardComplete } from '../lib/sellerWizardStorage';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { getSellerSetupSnapshot, isSellerSetupUnlocked } from '../hooks/useSellerSetupState';
import { openSellerSetup } from './openSellerSetup';
import { navigateAuthLogin } from './rootNavigationRef';

export type OpenCreateListingOptions = {
  draftId?: string;
  /** Skip chooser when opening from a channel-specific HQ action. */
  channel?: ListingChannel;
};

function navigateCreateListing(
  navigation: NavigationProp<ParamListBase>,
  opts: OpenCreateListingOptions,
) {
  const tabNav = navigation.getParent();
  const root = tabNav?.getParent?.() ?? tabNav;
  if (!root || !('navigate' in root)) return;

  if (opts.draftId) {
    (root as NavigationProp<ParamListBase>).navigate('CreateListingFlow', {
      screen: 'CreateListingMedia',
      params: { draftId: opts.draftId },
    });
    return;
  }

  if (opts.channel) {
    (root as NavigationProp<ParamListBase>).navigate('CreateListingFlow', {
      screen: 'CreateListingMedia',
      params: { reset: true, channel: opts.channel },
    });
    return;
  }

  (root as NavigationProp<ParamListBase>).navigate('CreateListingFlow', {
    screen: 'CreateListingChooseChannel',
  });
}

/** From HQ (nested in tabs): open root Create Listing flow. Requires Supabase + signed-in user. */
export async function openCreateListing(
  navigation: NavigationProp<ParamListBase>,
  options?: string | OpenCreateListingOptions,
) {
  const opts: OpenCreateListingOptions =
    typeof options === 'string' ? { draftId: options } : (options ?? {});

  if (!isSupabaseConfigured()) {
    Alert.alert('Configuration', 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.');
    return;
  }
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    navigateAuthLogin();
    return;
  }

  const sticky = getSellerSetupSnapshot();
  if (isSellerSetupUnlocked(sticky)) {
    navigateCreateListing(navigation, opts);
    return;
  }

  const localWizard = await readSellerWizardComplete();
  try {
    const payload = await fetchSellerAccount(data.session.access_token);
    const checks = normalizeSellerReadinessChecks(payload.readiness?.checks as Record<string, boolean> | undefined);
    const wizardResolved = resolveWizardCompleteFromSources({
      sellerSetupWizardCompletedAt: payload.sellerSetupWizardCompletedAt,
      setupWizardComplete: payload.setupWizardComplete,
      localWizardComplete: localWizard,
      stickyServerConfirmed: sticky.serverWizardConfirmed,
      serverResponded: true,
    });
    if (!isSellerActivated(checks, wizardResolved.wizardComplete)) {
      Alert.alert(
        'Seller setup required',
        'Complete seller setup to create listings and unlock Seller HQ.',
        [
          { text: 'Continue setup', onPress: () => openSellerSetup() },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
  } catch {
    if (isSellerSetupUnlocked(getSellerSetupSnapshot())) {
      navigateCreateListing(navigation, opts);
      return;
    }
    Alert.alert('Seller setup', 'We could not verify your seller status. Try again from Seller HQ.');
    return;
  }

  navigateCreateListing(navigation, opts);
}
