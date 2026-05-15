import { CommonActions } from '@react-navigation/native';
import { rootNavigationRef } from './rootNavigationRef';

/**
 * Sets guest explore mode, then resets to main tabs on the next tick so
 * `guestExploreMode` is visible when the tree mounts.
 */
export function enterGuestExploreAndOpenHome(enterGuestExplore: () => void) {
  enterGuestExplore();
  setTimeout(() => {
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
        }),
      );
    }
  }, 0);
}
