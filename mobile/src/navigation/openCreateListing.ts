import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { fetchSellerAccount } from '../api/sellerAccountRepository';
import type { ListingChannel } from '../createListing/listingChannel';
import { isSellerActivated, normalizeSellerReadinessChecks } from '../lib/seller-setup-state';
import { readSellerWizardComplete } from '../lib/sellerWizardStorage';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { openSellerSetup } from './openSellerSetup';
import { navigateAuthLogin } from './rootNavigationRef';

export type OpenCreateListingOptions = {
  draftId?: string;
  /** Skip chooser when opening from a channel-specific HQ action. */
  channel?: ListingChannel;
};

/** From HQ (nested in tabs): open root Create Listing flow. Requires Supabase + signed-in user. */
export async function openCreateListing(
  navigation: NavigationProp<ParamListBase>,
  options?: string | OpenCreateListingOptions
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

  const wizardDone = await readSellerWizardComplete();
  try {
    const payload = await fetchSellerAccount(data.session.access_token);
    const checks = normalizeSellerReadinessChecks(payload.readiness?.checks as Record<string, boolean> | undefined);
    const serverWizard = payload.setupWizardComplete === true;
    if (!isSellerActivated(checks, serverWizard || wizardDone)) {
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
    Alert.alert('Seller setup', 'We could not verify your seller status. Try again from Seller HQ.');
    return;
  }

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
