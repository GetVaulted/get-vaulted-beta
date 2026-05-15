import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { ListingChannel } from '../createListing/listingChannel';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
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
