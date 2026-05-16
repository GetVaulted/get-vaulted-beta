import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

export type QuickLaunchId = 'go_live' | 'schedule' | 'listing' | 'inventory';

const CARDS: {
  id: QuickLaunchId;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  hero?: boolean;
}[] = [
  { id: 'go_live', title: 'Go Live', sub: 'Open command center · take the lane', icon: 'radio', hero: true },
  { id: 'schedule', title: 'Schedule Vault Event', sub: 'Countdown · reminders · hype', icon: 'calendar' },
  { id: 'listing', title: 'Marketplace Listing', sub: 'Permanent collector discovery', icon: 'storefront-outline' },
  { id: 'inventory', title: 'Add Live Inventory', sub: 'Queue lots for your live lane', icon: 'layers-outline' },
];

export function SellerHQQuickLaunch({ onAction }: { onAction: (id: QuickLaunchId) => void }) {
  const hero = CARDS.find((c) => c.hero)!;
  const rest = CARDS.filter((c) => !c.hero);

  return (
    <View style={styles.wrap}>
      <Text style={hq.sectionEyebrow}>Quick launch</Text>
      <Text style={hq.sectionTitle}>Run the room in one tap</Text>
      <Pressable
        style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
        onPress={() => onAction(hero.id)}
        accessibilityRole="button"
        accessibilityLabel={hero.title}
      >
        <LinearGradient
          colors={['#F0D56A', '#D4AF37', '#8B7328']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroInner}>
          <View style={styles.heroIcon}>
            <Ionicons name={hero.icon} size={32} color="#0a0a0a" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{hero.title}</Text>
            <Text style={styles.heroSub}>{hero.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={28} color="rgba(0,0,0,0.45)" />
        </View>
      </Pressable>
      <View style={styles.grid}>
        {rest.map((c) => (
          <Pressable
            key={c.id}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            onPress={() => onAction(c.id)}
          >
            <LinearGradient
              colors={['rgba(212,175,55,0.12)', 'rgba(12,11,9,0.98)']}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name={c.icon} size={26} color={colors.gold} />
            <Text style={styles.tileTitle}>{c.title}</Text>
            <Text style={styles.tileSub}>{c.sub}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  pressed: { opacity: 0.92 },
  heroCard: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    minHeight: 88,
    marginBottom: spacing.sm,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#0a0a0a', letterSpacing: -0.3 },
  heroSub: { fontSize: 13, fontWeight: '600', color: 'rgba(0,0,0,0.65)', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 118,
    minWidth: 150,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    overflow: 'hidden',
    padding: spacing.md,
    justifyContent: 'flex-end',
    gap: 6,
  },
  tileTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  tileSub: { fontSize: 11, color: colors.textMuted, lineHeight: 14 },
});
