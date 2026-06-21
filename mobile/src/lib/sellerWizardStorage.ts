import AsyncStorage from '@react-native-async-storage/async-storage';

export const SELLER_WIZARD_COMPLETE_KEY = 'gv_seller_wizard_complete';
export const SELLER_HQ_ACTIVATED_KEY = 'gv_seller_hq_activated';
export const SELLER_WIZARD_COMPLETE_EVENT = 'gv-seller-wizard-complete';

export async function readSellerWizardComplete(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(SELLER_WIZARD_COMPLETE_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function readSellerHqActivated(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(SELLER_HQ_ACTIVATED_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markSellerWizardCompleteLocal(): Promise<void> {
  await AsyncStorage.setItem(SELLER_WIZARD_COMPLETE_KEY, '1');
}

export async function markSellerHqActivatedLocal(): Promise<void> {
  await AsyncStorage.setItem(SELLER_HQ_ACTIVATED_KEY, '1');
}

export async function clearSellerWizardComplete(): Promise<void> {
  await AsyncStorage.removeItem(SELLER_WIZARD_COMPLETE_KEY);
}
