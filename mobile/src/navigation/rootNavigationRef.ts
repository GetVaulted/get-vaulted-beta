import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToAuthWelcome() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'LaunchIntro', params: { instantAuth: true } }],
      }),
    );
  }
}

export function navigateAuthLogin() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('AuthLogin');
  }
}

export function navigateAuthSignUp() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('AuthSignUp');
  }
}

export function navigateToMainHq() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'HQ' } }],
      }),
    );
  }
}

export function navigateToSellerHostRoom(roomId: string) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SellerHostRoom', { roomId });
  }
}

export function navigateToMainHome() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
      }),
    );
  }
}
