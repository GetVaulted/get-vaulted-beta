import { rootNavigationRef } from './rootNavigationRef';

export function openSellerSetup() {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SellerSetupWizard');
  }
}
