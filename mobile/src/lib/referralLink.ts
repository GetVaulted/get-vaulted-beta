import { Platform, Share } from 'react-native';
import { buildReferralJoinUrl } from '../../../shared/referral-link';
import { getSiteBaseUrl } from './siteUrls';

/** Full shareable referral link, e.g. `https://shopgetvaulted.com/join?ref=K7H3N9Q2MW`. */
export function referralJoinUrl(referralCode: string): string {
  return buildReferralJoinUrl(referralCode, getSiteBaseUrl());
}

export function referralShareText(referralCode: string): string {
  const code = referralCode.trim().toUpperCase();
  return `Use my Get Vaulted code ${code} — we both get $10 after your first order.`;
}

/** Opens the OS share sheet with the user's referral link. */
export async function shareReferralLinkNative(referralCode: string): Promise<boolean> {
  const url = referralJoinUrl(referralCode);
  const text = referralShareText(referralCode);
  try {
    if (Platform.OS === 'ios') {
      // Keep URL out of `message` so iMessage shows one clean preview + short invite line.
      await Share.share({ message: text, url });
    } else {
      await Share.share({ message: `${text}\n${url}` });
    }
    return true;
  } catch {
    return false;
  }
}
