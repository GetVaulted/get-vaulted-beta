import { useMemo } from 'react';
import type { SellerConnectStatusResponse } from '../../api/stripeConnectRepository';
import {
  computeSellerStudioReadinessProgress,
  type SellerHQEntryPhase,
} from '../../lib/sellerHubEntry';
import { SellerHQPremiumBanner } from './hq/SellerHQPremiumBanner';

export function SellerHQEntryBanner({
  hasUser,
  connect,
  connectLoading,
  onPress,
  compact: _compact,
  sellerActivated,
  wizardComplete,
}: {
  hasUser: boolean;
  connect: SellerConnectStatusResponse | null;
  connectLoading?: boolean;
  onPress: (phase: SellerHQEntryPhase) => void;
  compact?: boolean;
  sellerActivated?: boolean;
  wizardComplete?: boolean;
}) {
  const setupProgress = useMemo(
    () =>
      computeSellerStudioReadinessProgress(connect, {
        sellerActivated,
        wizardComplete,
      }),
    [connect, sellerActivated, wizardComplete],
  );

  return (
    <SellerHQPremiumBanner
      hasUser={hasUser}
      connect={connect}
      connectLoading={connectLoading}
      setupProgress={setupProgress}
      sellerActivated={sellerActivated}
      wizardComplete={wizardComplete}
      onPress={onPress}
    />
  );
}
