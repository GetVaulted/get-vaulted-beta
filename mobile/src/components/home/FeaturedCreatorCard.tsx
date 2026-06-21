import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../ui/UserAvatar';
import { colors, radii, spacing, typography } from '../../theme';
import type { FeaturedCreator } from '../../types';

type Props = {
  creator: FeaturedCreator;
  onFollow: () => void;
  onPress?: () => void;
  following?: boolean;
  followBusy?: boolean;
};

export function FeaturedCreatorCard({ creator, onFollow, onPress, following = false, followBusy = false }: Props) {
  const { host, specialty, status, statusLabel } = creator;
  const live = status === 'live';
  const scheduled = status === 'scheduled';

  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      <View style={styles.top}>
        <UserAvatar uri={host.avatarUrl} name={host.name} username={host.handle} size={48} tone="light" borderWidth={1} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {host.name}
            </Text>
            {host.verified ? (
              <View style={styles.verified}>
                <Ionicons name="shield-checkmark" size={12} color={colors.gold} />
              </View>
            ) : null}
          </View>
          <Text style={styles.specialty} numberOfLines={1}>
            {specialty}
          </Text>
          <Text style={styles.followers}>{host.followers} followers</Text>
        </View>
      </View>
      <View style={[styles.statusPill, live && styles.statusLive, scheduled && styles.statusSoon]}>
        <View style={[styles.statusDot, live && styles.statusDotOn]} />
        <Text style={[styles.statusText, live && styles.statusTextLive]}>{statusLabel}</Text>
      </View>
      <Pressable
        style={[styles.follow, following && styles.followOn, followBusy && styles.followBusy]}
        onPress={(e) => {
          e.stopPropagation?.();
          onFollow();
        }}
        disabled={followBusy}
      >
        <Text style={[styles.followText, following && styles.followTextOn]}>
          {followBusy ? '…' : following ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    marginRight: 0,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: spacing.sm,
  },
  top: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    flexShrink: 1,
  },
  verified: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  specialty: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  followers: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusLive: {
    borderColor: colors.live,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
  },
  statusSoon: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.goldSoft,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  statusDotOn: {
    backgroundColor: colors.live,
  },
  statusText: {
    ...typography.micro,
    fontSize: 10,
    color: colors.textMuted,
  },
  statusTextLive: {
    color: colors.textPrimary,
  },
  follow: {
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  followOn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  followBusy: {
    opacity: 0.65,
  },
  followText: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 14,
  },
  followTextOn: {
    color: colors.gold,
  },
});
