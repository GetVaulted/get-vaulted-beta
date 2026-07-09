import { useMemo } from 'react';
import { useScreenSafeInsets } from '../lib/screenSafeInsets';
import {
  computeMarketplaceLayoutMetrics,
  type MarketplaceLayoutMetrics,
} from '../lib/marketplaceUiScale';
import { useAppLayout } from '../layout/AppLayoutProvider';

export function useMarketplaceLayout(): MarketplaceLayoutMetrics {
  const { layoutWidth, layoutHeight } = useAppLayout();
  const insets = useScreenSafeInsets();
  return useMemo(
    () => computeMarketplaceLayoutMetrics(layoutWidth, layoutHeight, insets.bottom),
    [layoutWidth, layoutHeight, insets.bottom],
  );
}
