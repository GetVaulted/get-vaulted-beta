import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

const CTA_IMAGE =
  'https://images.unsplash.com/photo-158491786544-2fe78d556e8d?w=640&q=85&auto=format&fit=crop';

export function TradeStartDealCta({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Start a trade"
    >
      <Image source={{ uri: CTA_IMAGE }} style={styles.bg} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(212,175,55,0.22)', 'rgba(20,16,10,0.92)', 'rgba(8,8,10,0.98)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="swap-horizontal" size={26} color="#0a0a0a" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Start a trade</Text>
          <Text style={styles.sub}>Build a structured offer — clear terms, then tracked shipping labels after accept.</Text>
        </View>
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={20} color={colors.gold} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    minHeight: 112,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  pressed: { opacity: 0.94 },
  bg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
});
