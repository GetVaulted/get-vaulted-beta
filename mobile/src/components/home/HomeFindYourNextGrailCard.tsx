import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

const CARD_W = Dimensions.get('window').width - spacing.lg * 2;
const CARD_H = Math.round(Math.min(CARD_W * 0.76, 292));

type Props = {
  onExploreLive: () => void;
  onShopTheVault: () => void;
};

type Silhouette = {
  name: keyof typeof Ionicons.glyphMap;
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotate?: string;
};

function buildSilhouettes(cardW: number, cardH: number): Silhouette[] {
  return [
    { name: 'american-football-outline', x: cardW * 0.04, y: cardH * 0.06, size: 64, opacity: 0.15 },
    { name: 'albums-outline', x: cardW * 0.62, y: cardH * 0.04, size: 68, opacity: 0.17 },
    { name: 'lock-closed-outline', x: cardW * 0.34, y: cardH * 0.08, size: 52, opacity: 0.1 },
    { name: 'watch-outline', x: cardW * 0.78, y: cardH * 0.38, size: 44, opacity: 0.12 },
    { name: 'shirt-outline', x: cardW * 0.06, y: cardH * 0.42, size: 50, opacity: 0.13 },
    { name: 'trophy-outline', x: cardW * 0.48, y: cardH * 0.28, size: 40, opacity: 0.09 },
    { name: 'basketball-outline', x: cardW * 0.22, y: cardH * 0.22, size: 36, opacity: 0.08 },
    { name: 'diamond-outline', x: cardW * 0.84, y: cardH * 0.58, size: 34, opacity: 0.11 },
  ];
}

export function HomeFindYourNextGrailCard({ onExploreLive, onShopTheVault }: Props) {
  const silhouettes = buildSilhouettes(CARD_W, CARD_H);

  return (
    <View style={[styles.shell, { width: CARD_W, minHeight: CARD_H }]}>
      <LinearGradient
        colors={['#221808', '#0e0c08', '#050505']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(212,175,55,0.24)', 'rgba(212,175,55,0.06)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.spotlightBeam}
      />
      <LinearGradient
        colors={['rgba(212,175,55,0.16)', 'transparent', 'rgba(255,59,48,0.06)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.vaultArch} pointerEvents="none">
        <LinearGradient
          colors={['rgba(212,175,55,0.14)', 'rgba(212,175,55,0.03)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={styles.glowGold} pointerEvents="none" />
      <View style={styles.glowRed} pointerEvents="none" />
      {silhouettes.map((item) => (
        <Ionicons
          key={`${item.name}-${item.x}`}
          name={item.name}
          size={item.size}
          color={`rgba(212,175,55,${item.opacity})`}
          style={[
            styles.silhouette,
            { left: item.x, top: item.y, transform: item.rotate ? [{ rotate: item.rotate }] : undefined },
          ]}
        />
      ))}
      <LinearGradient
        colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.94)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <Text style={styles.title}>ENTER THE VAULT</Text>
        <Text style={styles.subtext} numberOfLines={3}>
          Live auctions, breaks, authenticated collectibles, and upcoming drops are waiting inside.
        </Text>
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={onExploreLive}
            accessibilityRole="button"
            accessibilityLabel="Explore Live"
          >
            <Text style={styles.primaryTxt} allowFontScaling={false}>
              Explore Live
            </Text>
            <Ionicons name="arrow-forward" size={15} color="#fff" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            onPress={onShopTheVault}
            accessibilityRole="button"
            accessibilityLabel="Shop the Vault"
          >
            <Text style={styles.secondaryTxt} allowFontScaling={false} numberOfLines={1}>
              Shop the Vault
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg + 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.34)',
  },
  spotlightBeam: {
    position: 'absolute',
    top: 0,
    left: '18%',
    right: '18%',
    height: '72%',
    opacity: 0.95,
  },
  vaultArch: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    width: CARD_W * 0.56,
    height: CARD_H * 0.42,
    borderTopLeftRadius: CARD_W * 0.28,
    borderTopRightRadius: CARD_W * 0.28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: 'rgba(212,175,55,0.12)',
  },
  glowGold: {
    position: 'absolute',
    top: -36,
    right: -16,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  glowRed: {
    position: 'absolute',
    bottom: -24,
    left: -8,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,59,48,0.07)',
  },
  silhouette: {
    position: 'absolute',
  },
  inner: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md + 2,
    gap: spacing.xs,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 0.6,
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  subtext: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.live,
  },
  primaryTxt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#fff',
  },
  secondaryBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.42)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  secondaryTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gold,
    textAlign: 'center',
  },
  pressed: { opacity: 0.92 },
});
