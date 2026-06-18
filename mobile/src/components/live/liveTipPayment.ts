import {
  LIVE_TIP_MAX_USD,
  LIVE_TIP_MIN_USD,
  LIVE_TIP_PRESET_AMOUNTS_USD,
  sendLiveTipWithSavedCard,
  type LiveTipSendResult,
} from '../../api/liveTipsRepository';
import type { BuyerPaymentMethodRow } from '../../api/buyerWalletRepository';
import { walletPmLabel } from '../wallet/walletPaymentMethodDisplay';

export { LIVE_TIP_MAX_USD, LIVE_TIP_MIN_USD, LIVE_TIP_PRESET_AMOUNTS_USD };
export type { LiveTipSendResult };

export function formatTipPaymentMethodLabel(
  methods: BuyerPaymentMethodRow[],
  paymentMethodId: string | null | undefined,
): string {
  if (!paymentMethodId?.trim()) return 'Vault Wallet card';
  const pm = methods.find((m) => m.id === paymentMethodId);
  if (!pm) return 'Saved card';
  return walletPmLabel(pm);
}
