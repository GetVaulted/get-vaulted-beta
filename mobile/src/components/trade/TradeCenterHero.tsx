import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=80&auto=format&fit=crop';

export function TradeCenterHero() {
  return (
    <View style={styles.shell}>
      <Image source={{ uri: HERO_IMAGE }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(8,8,10,0.55)', 'rgba(8,8,10,0.88)', 'rgba(5,5,5,0.98)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(212,175,55,0.14)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.goldWash}
        pointerEvents="none"
      />
      <View style={styles.inner}>
        <View style={styles.kickerRow}>
          <Ionicons name="shield-checkmark" size={14} color={colors.gold} />
          <Text style={styles.kicker}>Secure collector network</Text>
        </View>
        <Text style={styles.title}>Trade Center</Text>
        <Text style={styles.sub}>
          Verified inventory, protected labels, and private vault-to-vault deals — built for trusted collector
          trading.
        </Text>
        <View style={styles.chips}>
          <Chip label="Protected offers" />
          <Chip label="Vault verified" />
          <Chip label="Deal rooms" />
        </View>
      </View>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipTxt}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    minHeight: 168,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  goldWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  inner: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
    zIndex: 1,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: spacing.sm,
    fontSize: 28,
    fontWeight: '300',
    color: colors.textPrimary,
    letterSpacing: -0.8,
  },
  sub: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 20,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
});
