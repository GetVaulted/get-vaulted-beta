import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import type { ScheduledStream } from '../../types';
import { categoryMeta } from '../../data/categoryTaxonomy';

type Props = {
  event: ScheduledStream;
  onRemind: () => void;
};

function formatInterested(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k interested`;
  return `${n} interested`;
}

export function VaultDropCard({ event, onRemind }: Props) {
  const cat = categoryMeta[event.category].label;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={event.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBand}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.tagRow}>
          <View style={styles.catTag}>
            <Text style={styles.catTagText}>{cat}</Text>
          </View>
          <View style={styles.dropTag}>
            <Text style={styles.dropTagText}>{event.eventTag}</Text>
          </View>
        </View>
        <Text style={styles.time}>{event.startsAt}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
      </LinearGradient>
      <View style={styles.body}>
        <View style={styles.hostRow}>
          <Image source={{ uri: event.host.avatarUrl }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.hostName} numberOfLines={1}>
                {event.host.name}
              </Text>
              {event.host.verified ? (
                <Ionicons name="shield-checkmark" size={14} color={colors.gold} />
              ) : null}
            </View>
            <Text style={styles.interested}>
              {event.interestedCount > 0 ? formatInterested(event.interestedCount) : 'Interest updates when fans tap in'}
            </Text>
          </View>
        </View>
        <Pressable style={styles.remind} onPress={onRemind}>
          <Ionicons name="notifications-outline" size={18} color={colors.gold} />
          <Text style={styles.remindText}>Remind me</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 248,
    marginRight: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  heroBand: {
    minHeight: 132,
    padding: spacing.lg,
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  tagRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  catTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  catTagText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dropTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dropTagText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  time: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hostName: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
  },
  interested: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  remind: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  remindText: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 14,
  },
});
