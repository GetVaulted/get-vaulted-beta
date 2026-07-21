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
  const code = referralCode.trim().toUpperCase();
  try {
    await Share.share({
      message: `Join me on Get Vaulted — download the app, then sign up with my invite code ${code} (or open my link). We'll both get $10 in credit after your first order.\n${url}`,
    });
    return true;
  } catch {
    return false;
  }
}
