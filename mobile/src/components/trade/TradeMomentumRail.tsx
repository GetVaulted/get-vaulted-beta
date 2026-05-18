import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TradeMomentumItem } from '../../types/tradeUi';
import { colors, radii, spacing } from '../../theme';

export function TradeMomentumRail({
  title,
  items,
}: {
  title: string;
  items: TradeMomentumItem[];
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.handleRow}>
                  <Text style={styles.handle} numberOfLines={1}>
                    {item.handle}
                  </Text>
                  {item.verified ? (
                    <Ionicons name="checkmark-circle" size={14} color={colors.gold} />
                  ) : null}
                </View>
                {item.completionPct ? (
                  <Text style={styles.rep}>{item.completionPct}</Text>
                ) : null}
              </View>
              <Text style={styles.status}>{item.status}</Text>
            </View>
            <Text style={styles.headline} numberOfLines={2}>
              {item.headline}
            </Text>
            <Text style={styles.value}>{item.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  rail: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  card: {
    width: 200,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  handle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rep: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  status: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.live,
  },
  headline: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  value: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.gold,
  },
});
