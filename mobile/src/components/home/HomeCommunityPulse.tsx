import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { UserAvatar } from '../ui/UserAvatar';
import type { HomeCommunityPulseItem } from '../../lib/homeFeedDerivations';
import { colors, radii, spacing } from '../../theme';

const TONE_COLOR: Record<HomeCommunityPulseItem['tone'], string> = {
  live: colors.live,
  listing: colors.gold,
  event: '#8B9DC3',
  seller: colors.gold,
};

export function HomeCommunityPulse({ items }: { items: readonly HomeCommunityPulseItem[] }) {
  return (
    <View style={styles.wrap}>
      {items.map((item, index) => (
        <View key={item.id} style={[styles.row, index < items.length - 1 && styles.rowBorder]}>
          {item.imageUrl ? (
            <VaultImage uri={item.imageUrl} width={40} height={40} contentFit="cover" style={styles.thumb} />
          ) : item.avatarUrl || item.displayName ? (
            <UserAvatar
              uri={item.avatarUrl}
              name={item.displayName ?? 'Vault'}
              username={item.displayName ?? 'vault'}
              size={36}
              tone="light"
              borderWidth={1}
            />
          ) : (
            <View style={[styles.iconWrap, { backgroundColor: `${TONE_COLOR[item.tone]}18` }]}>
              <Ionicons name="pulse" size={16} color={TONE_COLOR[item.tone]} />
            </View>
          )}
          <View style={styles.copy}>
            <Text style={styles.headline} numberOfLines={2}>{item.headline}</Text>
            <Text style={styles.meta} numberOfLines={1}>{item.meta}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: '#111',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 3 },
  headline: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
