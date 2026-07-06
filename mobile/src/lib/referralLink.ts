import { Share } from 'react-native';
import { buildReferralJoinUrl } from '../../../shared/referral-link';
import { getSiteBaseUrl } from './siteUrls';

/** Full shareable referral link, e.g. `https://shopgetvaulted.com/join?ref=jdoe`. */
export function referralJoinUrl(username: string): string {
  return buildReferralJoinUrl(username, getSiteBaseUrl());
}

/** Opens the OS share sheet with the user's referral link. */
export async function shareReferralLinkNative(username: string): Promise<boolean> {
  const url = referralJoinUrl(username);
  try {
    await Share.share({
      message: `Join me on Get Vaulted — sign up with my link and we'll both get $10 in credit after your first order.\n${url}`,
    });
    return true;
  } catch {
    return false;
  }
}
