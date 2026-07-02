import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { HomeDiscoveryLane } from '../../lib/homeFeedDerivations';
import { colors, radii, spacing } from '../../theme';

const CARD_H = 98;
const CARD_GAP = spacing.sm;
const END_PAD = spacing.lg * 3;

const ICONS: Record<HomeDiscoveryLane['icon'], keyof typeof Ionicons.glyphMap> = {
  hammer: 'hammer-outline',
  layers: 'layers-outline',
  diamond: 'diamond-outline',
  calendar: 'calendar-outline',
  pricetag: 'pricetag-outline',
  time: 'time-outline',
  people: 'people-outline',
};

const ACCENT_ICONS: Partial<Record<string, keyof typeof Ionicons.glyphMap>> = {
  auctions: 'flash-outline',
  breaks: 'grid-outline',
  marketplace: 'diamond-outline',
  drops: 'gift-outline',
  under50: 'pricetags-outline',
  ending: 'hourglass-outline',
  sellers: 'people-outline',
};

/** Wider cards for multi-word labels so nothing clips awkwardly. */
const LANE_CARD_WIDTH: Partial<Record<string, number>> = {
  auctions: 108,
  marketplace: 104,
  drops: 112,
  ending: 104,
  sellers: 104,
};

const DEFAULT_CARD_W = 96;

function laneCardWidth(laneId: string): number {
  return LANE_CARD_WIDTH[laneId] ?? DEFAULT_CARD_W;
}

export function HomeDiscoveryStrip({
  lanes,
  onPressLane,
}: {
  lanes: HomeDiscoveryLane[];
  onPressLane: (laneId: string) => void;
}) {
  return (
    <View style={styles.bleedWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {lanes.map((lane) => {
          const accent = ACCENT_ICONS[lane.id] ?? ICONS[lane.icon];
          const cardW = laneCardWidth(lane.id);
          return (
            <Pressable
              key={lane.id}
              onPress={() => onPressLane(lane.id)}
              style={({ pressed }) => [
                styles.card,
                { width: cardW },
                pressed && styles.cardPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={[lane.label, lane.countLabel].filter(Boolean).join(', ')}
            >
              <LinearGradient colors={lane.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={['rgba(212,175,55,0.12)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons
                name={accent}
                size={cardW >= 110 ? 52 : 46}
                color="rgba(212,175,55,0.11)"
                style={styles.bgIcon}
              />
              <View style={styles.iconWrap}>
                <Ionicons name={ICONS[lane.icon]} size={16} color={colors.gold} />
              </View>
              <Text style={styles.label} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.88}>
                {lane.label}
              </Text>
              {lane.countLabel ? (
                <Text style={styles.count} numberOfLines={1}>
                  {lane.countLabel}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        <View style={styles.swipePeek} pointerEvents="none" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bleedWrap: {
    marginHorizontal: -spacing.lg,
  },
  row: {
    gap: CARD_GAP,
    paddingLeft: spacing.lg,
    paddingRight: END_PAD,
    alignItems: 'stretch',
  },
  card: {
    height: CARD_H,
    borderRadius: radii.md + 2,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'space-between',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  bgIcon: {
    position: 'absolute',
    right: -4,
    bottom: -6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.24)',
  },
  label: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 13,
  },
  count: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.gold,
  },
  swipePeek: {
    width: spacing.sm,
    height: CARD_H,
  },
});
