import { Alert } from 'react-native';
import { navigateAuthLogin, navigateAuthSignUp } from './rootNavigationRef';

export function alertGuestLiveRestricted() {
  Alert.alert(
    'Live shows',
    'You’re exploring Get Vaulted without an account. Sign in or create an account to join live shows.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Sign in', onPress: navigateAuthLogin },
      { text: 'Create account', onPress: navigateAuthSignUp },
    ],
  );
}

export function alertGuestBuyRestricted() {
  Alert.alert(
    'Account required',
    'Sign in or create an account to buy, bid, trade, or make offers.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Sign in', onPress: navigateAuthLogin },
      { text: 'Create account', onPress: navigateAuthSignUp },
    ],
  );
}
