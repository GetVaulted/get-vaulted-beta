import { Share } from 'react-native';
import { buildReferralJoinUrl } from '../../../shared/referral-link';
import { getSiteBaseUrl } from './siteUrls';

/** Full shareable referral link, e.g. `https://shopgetvaulted.com/join?ref=K7H3N9Q2MW`. */
export function referralJoinUrl(referralCode: string): string {
  return buildReferralJoinUrl(referralCode, getSiteBaseUrl());
}

/** Opens the OS share sheet with the user's referral link. */
export async function shareReferralLinkNative(referralCode: string): Promise<boolean> {
  const url = referralJoinUrl(referralCode);
  try {
    await Share.share({
      message: `Join me on Get Vaulted — sign up with my link and we'll both get $10 in credit after your first order.\n${url}`,
    });
    return true;
  } catch {
    return false;
  }
}
