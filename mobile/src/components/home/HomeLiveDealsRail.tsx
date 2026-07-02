import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import type { HomeLiveDealItem } from '../../lib/homeFeedDerivations';
import { colors, radii, spacing } from '../../theme';

const CARD_W = 148;
const CARD_GAP = spacing.sm;
export const LIVE_DEAL_SNAP = CARD_W + CARD_GAP;

export function HomeLiveDealsRail({
  deals,
  onOpenStream,
}: {
  deals: HomeLiveDealItem[];
  onOpenStream: (streamId: string) => void;
}) {
  if (!deals.length) return null;

  return (
    <FlatList
      horizontal
      data={deals}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={LIVE_DEAL_SNAP}
      decelerationRate="fast"
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpenStream(item.streamId)}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${item.subtitle}`}
        >
          <View style={styles.imageWrap}>
            {item.imageUrl ? (
              <VaultImage uri={item.imageUrl} width={CARD_W} height={96} contentFit="cover" style={StyleSheet.absoluteFillObject} />
            ) : (
              <LinearGradient colors={['#201008', '#0a0a0c']} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.imageFade} />
            <View style={styles.kindPill}>
              <Text style={styles.kindTxt}>
                {item.kind === 'auction' ? 'AUCTION' : item.kind === 'break' ? 'BREAK' : 'LIVE'}
              </Text>
            </View>
            {item.priceLabel ? <Text style={styles.price}>{item.priceLabel}</Text> : null}
          </View>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>
            <View style={styles.ctaRow}>
              <Text style={styles.ctaTxt}>Join room</Text>
              <Ionicons name="arrow-forward" size={12} color={colors.live} />
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: CARD_GAP,
    paddingRight: spacing.lg,
  },
  card: {
    width: CARD_W,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.25)',
  },
  pressed: { opacity: 0.92 },
  imageWrap: {
    height: 96,
    backgroundColor: '#111',
  },
  imageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
  },
  kindPill: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,59,48,0.85)',
  },
  kindTxt: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: '#fff',
  },
  price: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  body: {
    padding: spacing.sm + 2,
    gap: 3,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 16,
    minHeight: 32,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ctaTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.live,
  },
});
