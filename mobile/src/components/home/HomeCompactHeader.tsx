import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BrandLogo } from '../ui/BrandLogo';
import { NotificationBadge } from '../platform/NotificationBadge';
import { colors, radii, spacing } from '../../theme';

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
  const logoWidth = Math.min(128, Math.max(96, width * 0.28));

  return (
    <View style={styles.row}>
      <BrandLogo width={logoWidth} accessibilityLabel="Get Vaulted" />
      <View style={styles.actions}>
        {activeBuyerOrders > 0 ? (
          <Pressable style={styles.ordersChip} onPress={onOrders} accessibilityLabel="My orders">
            <Ionicons name="receipt-outline" size={15} color={colors.gold} />
            <Text style={styles.ordersTxt}>Orders</Text>
            <View style={styles.ordersBadge}>
              <Text style={styles.ordersBadgeTxt}>{activeBuyerOrders}</Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable style={styles.iconBtn} onPress={onNotifications} accessibilityLabel="Notifications">
          <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          <NotificationBadge count={notificationCount} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={onMessages} accessibilityLabel="Messages">
          <Ionicons name="chatbubbles-outline" size={20} color={colors.textPrimary} />
        </Pressable>
        {signedIn ? (
          <Pressable style={styles.iconBtn} onPress={onProfile} accessibilityLabel="Account">
            <Ionicons name="person-circle-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
    flexShrink: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  ordersChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  ordersTxt: { fontSize: 11, fontWeight: '800', color: colors.gold },
  ordersBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  ordersBadgeTxt: { fontSize: 9, fontWeight: '900', color: '#0a0a0a' },
});
