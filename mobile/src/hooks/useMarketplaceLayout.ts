import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  computeMarketplaceLayoutMetrics,
  type MarketplaceLayoutMetrics,
} from '../lib/marketplaceUiScale';
import { useAppLayout } from '../layout/AppLayoutProvider';

export function useMarketplaceLayout(): MarketplaceLayoutMetrics {
  const { layoutWidth, layoutHeight } = useAppLayout();
  const insets = useSafeAreaInsets();
  return useMemo(
    () => computeMarketplaceLayoutMetrics(layoutWidth, layoutHeight, insets.bottom),
    [layoutWidth, layoutHeight, insets.bottom],
  );
}
