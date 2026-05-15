import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import type { Host } from '../../types';

type Props = {
  host: Host;
  onFollowPress?: () => void;
  following?: boolean;
  compact?: boolean;
};

export function HostRow({ host, onFollowPress, following, compact }: Props) {
  return (
    <View style={[styles.row, compact && styles.compact]}>
      <Image source={{ uri: host.avatarUrl }} style={styles.avatar} />
      <View style={styles.textCol}>
        <View style={styles.nameRow}>
          <Text style={[typography.subtitle, styles.name]} numberOfLines={1}>
            {host.name}
          </Text>
          {host.verified ? (
            <View style={styles.verified}>
              <Text style={styles.verifiedText}>✓</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          {host.handle} · {host.followers}
        </Text>
      </View>
      {onFollowPress ? (
        <Pressable
          onPress={onFollowPress}
          style={({ pressed }) => [
            styles.follow,
            following && styles.following,
            pressed && styles.followPressed,
          ]}
        >
          <Text style={[styles.followText, following && styles.followTextOn]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  compact: {
    paddingVertical: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: colors.textPrimary,
  },
  verified: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  verifiedText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
  },
  handle: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  follow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  following: {
    backgroundColor: colors.goldSoft,
  },
  followPressed: {
    opacity: 0.85,
  },
  followText: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 13,
  },
  followTextOn: {
    color: colors.textPrimary,
  },
});
