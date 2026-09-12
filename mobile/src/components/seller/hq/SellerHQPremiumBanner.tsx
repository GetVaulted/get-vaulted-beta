import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  resolveSellerHQEntryPhase,
  sellerHQEntryCopy,
  type SellerHQEntryPhase,
} from '../../../lib/sellerHubEntry';
import type { SellerConnectStatusResponse } from '../../../api/stripeConnectRepository';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

export function SellerHQPremiumBanner({
  hasUser,
  connect,
  connectLoading,
  setupProgress,
  sellerActivated,
  wizardComplete,
  onPress,
}: {
  hasUser: boolean;
  connect: SellerConnectStatusResponse | null;
  connectLoading?: boolean;
  setupProgress: number;
  sellerActivated?: boolean;
  wizardComplete?: boolean;
  onPress: (phase: SellerHQEntryPhase) => void;
}) {
  const phase = resolveSellerHQEntryPhase({
    hasUser,
    connect,
    sellerActivated,
    wizardComplete,
  });
  const copy = sellerHQEntryCopy(phase);
  const ready = phase === 'ready';
  const showProgress = !ready && setupProgress < 1;

  return (
    <Pressable
      onPress={() => onPress(phase)}
      style={({ pressed }) => [styles.shell, hq.elevatedShadow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={copy.cta}
    >
      <LinearGradient
        colors={
          ready
            ? ['rgba(212,175,55,0.35)', 'rgba(24,20,12,0.95)', 'rgba(8,8,10,0.98)']
            : ['rgba(120,90,40,0.4)', 'rgba(18,16,12,0.96)', 'rgba(5,5,5,0.99)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.glowOrb} />
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={[styles.iconRing, ready && styles.iconRingReady]}>
            <Ionicons name={copy.icon} size={24} color={ready ? colors.gold : '#E8C547'} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>{ready ? 'Vault verified lane' : 'Seller studio access'}</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.body}>{copy.body}</Text>
          </View>
        </View>
        {showProgress ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={['#E8C547', colors.gold, '#9A7B2C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.round(setupProgress * 100)}%` }]}
              />
            </View>
            <Text style={styles.progressLbl}>{Math.round(setupProgress * 100)}% studio readiness</Text>
          </View>
        ) : null}
        <View style={styles.ctaRow}>
          {connectLoading && !connect ? (
            <ActivityIndicator color={colors.gold} />
          ) : (
            <>
              <Text style={styles.cta}>{copy.cta}</Text>
              <Ionicons name="arrow-forward-circle" size={22} color={colors.gold} />
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  glowOrb: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(212,175,55,0.15)',
  },
  inner: { padding: spacing.md, gap: spacing.sm },
  topRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRingReady: {
    borderColor: 'rgba(52,199,89,0.5)',
    backgroundColor: 'rgba(52,199,89,0.12)',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  body: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 4 },
  progressBlock: { gap: 6, marginTop: spacing.xs },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLbl: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: spacing.xs,
  },
  cta: { fontSize: 14, fontWeight: '800', color: colors.gold },
});
