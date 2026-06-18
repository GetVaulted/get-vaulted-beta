import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../ui/UserAvatar';
import { colors, radii, spacing } from '../../theme';
import type { FeaturedCreator } from '../../types';
import type { SaleActivity } from '../../types';

type PulledProps = {
  sale: SaleActivity;
};

export function BrowsePulledCard({ sale }: PulledProps) {
  const uri =
    sale.imageUrl ??
    'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&q=80&auto=format&fit=crop';

  return (
    <View style={styles.pulledCard}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.pulledBody}>
        <Text style={styles.pulledKicker}>Recently sold</Text>
        <Text style={styles.pulledItem} numberOfLines={2}>
          {sale.item}
        </Text>
        <Text style={styles.pulledAmt}>{sale.amount}</Text>
        <Text style={styles.pulledCh} numberOfLines={1}>
          {sale.channel}
        </Text>
        <Text style={styles.pulledTime}>{sale.timeAgo}</Text>
      </View>
    </View>
  );
}

type CuratorProps = {
  creator: FeaturedCreator;
  onViewListings?: () => void;
  onSeeLive?: () => void;
};

export function BrowseCuratorCard({ creator, onViewListings, onSeeLive }: CuratorProps) {
  const { host, specialty, status, statusLabel } = creator;
  const live = status === 'live';

  return (
    <View style={styles.curatorCard}>
      <UserAvatar uri={host.avatarUrl} name={host.name} username={host.handle} size={56} tone="light" borderWidth={1} />
      <Text style={styles.curatorName} numberOfLines={1}>
        {host.name}
      </Text>
      <Text style={styles.curatorSpec} numberOfLines={2}>
        {specialty}
      </Text>
      <View style={styles.statusLine}>
        <View style={[styles.statusDot, live && styles.statusDotOn]} />
        <Text style={styles.statusLabel}>{statusLabel}</Text>
      </View>
      {onViewListings ? (
        <Pressable style={styles.shopBtn} onPress={onViewListings}>
          <Text style={styles.shopBtnText}>View listings</Text>
        </Pressable>
      ) : null}
      {live && onSeeLive ? (
        <Pressable style={styles.liveLink} onPress={onSeeLive}>
          <Text style={styles.liveLinkText}>See live</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pulledCard: {
    width: 168,
    height: 232,
    marginRight: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pulledBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
  },
  pulledKicker: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pulledItem: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  pulledAmt: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  pulledCh: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 6,
  },
  pulledTime: {
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  curatorCard: {
    width: 188,
    marginRight: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
  },
  curatorAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  curatorName: {
    marginTop: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  curatorSpec: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    minHeight: 30,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.textMuted,
  },
  statusDotOn: {
    backgroundColor: colors.live,
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  shopBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  shopBtnText: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 13,
  },
  liveLink: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  liveLinkText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
