import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BrandLogo } from '../ui/BrandLogo';
import { NotificationBadge } from '../platform/NotificationBadge';
import { colors, spacing } from '../../theme';

type Props = {
  notificationCount: number;
  activeBuyerOrders: number;
  signedIn: boolean;
  onOrders: () => void;
  onNotifications: () => void;
  onMessages: () => void;
  onProfile: () => void;
};

export function HomeCompactHeader({
  notificationCount,
  activeBuyerOrders,
  signedIn,
  onOrders,
  onNotifications,
  onMessages,
  onProfile,
}: Props) {
  const { width } = useWindowDimensions();
  const logoWidth = Math.min(108, Math.max(88, width * 0.24));
  return (
    <View style={styles.wrap}>
      <View style={styles.brandRow}>
        <BrandLogo width={logoWidth} accessibilityLabel="Get Vaulted" />
        <View style={styles.actions}>
          {activeBuyerOrders > 0 ? (
            <Pressable style={styles.ordersBtn} onPress={onOrders} accessibilityLabel="My orders">
              <Ionicons name="receipt-outline" size={18} color={colors.gold} />
              <View style={styles.ordersBadge}>
                <Text style={styles.ordersBadgeTxt}>{activeBuyerOrders}</Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable style={styles.iconBtn} onPress={onNotifications} accessibilityLabel="Notifications">
            <Ionicons name="notifications-outline" size={21} color={colors.textPrimary} />
            <NotificationBadge count={notificationCount} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={onMessages} accessibilityLabel="Messages">
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          {signedIn ? (
            <Pressable style={styles.iconBtn} onPress={onProfile} accessibilityLabel="Account">
              <Ionicons name="person-outline" size={20} color={colors.textPrimary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xs,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ordersBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ordersBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  ordersBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0a0a0a',
  },
});
