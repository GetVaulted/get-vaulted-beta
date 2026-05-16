import { useMemo } from 'react';
import type { SellerConnectStatusResponse } from '../../api/stripeConnectRepository';
import { isSellerHQApproved, type SellerHQEntryPhase } from '../../lib/sellerHubEntry';
import { SellerHQPremiumBanner } from './hq/SellerHQPremiumBanner';

export function SellerHQEntryBanner({
  hasUser,
  connect,
  connectLoading,
  onPress,
  compact: _compact,
}: {
  hasUser: boolean;
  connect: SellerConnectStatusResponse | null;
  connectLoading?: boolean;
  onPress: (phase: SellerHQEntryPhase) => void;
  compact?: boolean;
}) {
  const setupProgress = useMemo(() => {
    const approved = isSellerHQApproved(connect);
    if (approved) return 1;
    if (!connect) return 0.15;
    if (connect.stripe_account_id?.trim()) return 0.65;
    if (connect.stripeConfigured) return 0.45;
    return 0.25;
  }, [connect]);

  return (
    <SellerHQPremiumBanner
      hasUser={hasUser}
      connect={connect}
      connectLoading={connectLoading}
      setupProgress={setupProgress}
      onPress={onPress}
    />
  );
}
