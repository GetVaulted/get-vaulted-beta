import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SellerHubTabId } from '../../data/sellerHubMock';
import { openCreateListing } from '../../navigation/openCreateListing';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { rootNavigationRef } from '../../navigation/rootNavigationRef';
import type { MainTabParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type DashAction = {
  id: string;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function SellerHQDashboard({
  navigation,
  onOpenTab,
  onSetupPayouts,
}: {
  navigation: BottomTabNavigationProp<MainTabParamList>;
  onOpenTab: (tab: SellerHubTabId) => void;
  onSetupPayouts: () => void;
}) {
  const rootNav = navigation as unknown as NavigationProp<ParamListBase>;

  const actions: DashAction[] = [
    {
      id: 'listing',
      label: 'Create marketplace listing',
      sub: 'Storefront buy now & offers',
      icon: 'storefront-outline',
      onPress: () => void openCreateListing(rootNav, { channel: 'marketplace' }),
    },
    {
      id: 'schedule',
      label: 'Schedule live show',
      sub: 'Plan your next vault event',
      icon: 'calendar-outline',
      onPress: () => onOpenTab('live'),
    },
    {
      id: 'manage-live',
      label: 'Manage live shows',
      sub: 'Host room · go live · queue lots',
      icon: 'radio-outline',
      onPress: () => onOpenTab('live'),
    },
    {
      id: 'manage-listings',
      label: 'Manage marketplace listings',
      sub: 'Drafts, active, and sold',
      icon: 'cube-outline',
      onPress: () => onOpenTab('listings'),
    },
    {
      id: 'shipping',
      label: 'Shipping profiles',
      sub: 'Rates & live-show shipping',
      icon: 'airplane-outline',
      onPress: () => {
        void openCreateListing(rootNav, { channel: 'marketplace' });
      },
    },
    {
      id: 'payout',
      label: 'Payout setup',
      sub: 'Stripe Connect & wallet',
      icon: 'card-outline',
      onPress: onSetupPayouts,
    },
    {
      id: 'orders',
      label: 'Orders & fulfillment',
      sub: 'Ship and track sales',
      icon: 'receipt-outline',
      onPress: () => onOpenTab('orders'),
    },
    {
      id: 'settings',
      label: 'Seller settings',
      sub: 'Profile & vault identity',
      icon: 'settings-outline',
      onPress: () => {
        if (rootNavigationRef.isReady()) {
          rootNavigationRef.navigate('Settings');
        }
      },
    },
  ];

  return (
    <View style={styles.shell}>
      <Text style={styles.heading}>Seller console</Text>
      <Text style={styles.sub}>
        Everything you need to sell on mobile — same tools as web Seller Live, no URL required.
      </Text>
      <View style={styles.grid}>
        {actions.map((a) => (
          <Pressable
            key={a.id}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <View style={styles.tileIcon}>
              <Ionicons name={a.icon} size={20} color={colors.gold} />
            </View>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {a.label}
            </Text>
            <Text style={styles.tileSub} numberOfLines={2}>
              {a.sub}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.secondaryLink} onPress={() => openSellerHQ(navigation, { tab: 'vault' })}>
        <Text style={styles.secondaryLinkTxt}>Vault identity & brand tools</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  heading: {
    ...typography.subtitle,
    fontSize: 18,
    color: colors.textPrimary,
  },
  sub: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    minWidth: 148,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.28)',
    gap: 4,
  },
  tilePressed: { opacity: 0.88 },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tileSub: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 14,
  },
  secondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  secondaryLinkTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
