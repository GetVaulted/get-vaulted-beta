import { InteractionManager, Platform } from 'react-native';

/** Wait for RN Modal dismiss/settle before presenting Stripe's Android Activity. */
export const ANDROID_PAYMENT_SHEET_MODAL_SETTLE_MS = 350;

/**
 * Recovery used to jump straight into card entry (`startWith: 'card'`), which on Android
 * auto-presents PaymentSheet from inside nested RN Modals — buyers got a stuck spinner /
 * untappable overlay until the host cancelled the failure.
 *
 * Android recovery should open the method picker first; PaymentSheet runs only after an
 * explicit tap (and after Modal settle).
 */
export function walletRecoveryPaymentSetupStartWith(
  platform: typeof Platform.OS = Platform.OS,
): 'picker' | 'card' {
  return platform === 'android' ? 'picker' : 'card';
}

/** True when recovery should auto-open the payment-setup panel on wallet open. */
export function shouldOpenWalletPaymentSetupOnRecovery(args: {
  shippingRecovery: boolean;
  platform?: typeof Platform.OS;
}): boolean {
  if (args.shippingRecovery) return false;
  // Always open payment setup on card recovery — Android uses picker, iOS uses card form.
  return true;
}

export function shouldUseAndroidPaymentSheetForCard(
  platform: typeof Platform.OS = Platform.OS,
): boolean {
  return platform === 'android';
}

/**
 * Give Android Modal / DialogFragment time to finish layout before launching Stripe's
 * PaymentSheet Activity. Presenting in the same frame as a Modal mount leaves a ghost
 * blocker that eats all touches.
 */
export function settleBeforeAndroidPaymentSheet(
  platform: typeof Platform.OS = Platform.OS,
  settleMs = ANDROID_PAYMENT_SHEET_MODAL_SETTLE_MS,
): Promise<void> {
  if (platform !== 'android') return Promise.resolve();
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, settleMs);
    });
  });
}
