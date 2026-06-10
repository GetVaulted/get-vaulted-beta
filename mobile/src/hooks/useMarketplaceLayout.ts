import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  computeMarketplaceLayoutMetrics,
  type MarketplaceLayoutMetrics,
} from '../lib/marketplaceUiScale';

export function useMarketplaceLayout(): MarketplaceLayoutMetrics {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(
    () => computeMarketplaceLayoutMetrics(width, height, insets.bottom),
    [width, height, insets.bottom],
  );
}
