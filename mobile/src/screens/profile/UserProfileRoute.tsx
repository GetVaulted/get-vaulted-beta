import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import type { RootStackParamList } from '../../navigation/types';
import { SellerShopScreen } from './SellerShopScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

/**
 * Every "view profile" tap (live chat, creators, orders, notifications…) navigates to the
 * `UserProfile` route. It now renders the redesigned profile so there is one profile layout
 * everywhere, instead of the old Vault profile only reached from a product page.
 */
export function UserProfileRoute({ navigation, route }: Props) {
  const shopRoute = useMemo(
    () => ({
      key: route.key,
      name: 'SellerShop' as const,
      params: { sellerId: route.params.userId },
    }),
    [route.key, route.params.userId],
  );
  return (
    <SellerShopScreen
      navigation={navigation as unknown as NativeStackScreenProps<RootStackParamList, 'SellerShop'>['navigation']}
      route={shopRoute}
    />
  );
}
