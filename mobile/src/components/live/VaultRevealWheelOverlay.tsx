import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  landingRotationDeg,
  type VaultRevealSpinPayload,
} from '../../lib/vaultRevealSpin';
import { colors, radii, spacing } from '../../theme';

const WHEEL_SIZE = 300;
const CX = WHEEL_SIZE / 2;
const CY = WHEEL_SIZE / 2;
const R = WHEEL_SIZE / 2 - 4;
const SEGMENT_COLORS = ['#047857', '#059669', '#10b981', '#34d399', '#065f46', '#0d9488'];

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segmentPath(startAngle: number, endAngle: number) {
  const start = polar(CX, CY, R, endAngle);
  const end = polar(CX, CY, R, startAngle);
  const large = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${CX} ${CY} L ${start.x} ${start.y} A ${R} ${R} 0 ${large} 0 ${end.x} ${end.y} Z`;
}

function shortLabel(label: string) {
  const bare = label.trim().replace(/^@/, '') || 'entrant';
  return bare.length > 9 ? `${bare.slice(0, 8)}…` : bare;
}

export function VaultRevealWheelOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const seenRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const segments = useMemo(() => {
    if (!spin?.labels.length) return [];
    const slice = 360 / spin.labels.length;
    return spin.labels.map((label, i) => ({
      label,
      start: i * slice,
      end: (i + 1) * slice,
      mid: i * slice + slice / 2,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]!,
    }));
  }, [spin]);

  useEffect(() => {
    if (!spin) {
      setPhase('idle');
      anim.setValue(0);
      seenRef.current = null;
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      return;
    }
    if (seenRef.current === spin.spinId) return;
    seenRef.current = spin.spinId;
    setPhase('spinning');
    anim.setValue(0);
    const target = landingRotationDeg(spin.winnerIndex, spin.labels.length);
    Animated.timing(anim, {
      toValue: target,
      duration: spin.durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setPhase('done');
    });
    dismissTimerRef.current = setTimeout(() => onDismiss(), spin.durationMs + 2200);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [anim, onDismiss, spin]);

  const spinInterpolate = anim.interpolate({
    inputRange: [0, 3600],
    outputRange: ['0deg', '3600deg'],
    extrapolate: 'extend',
  });

  if (!spin) return null;

  const winner = spin.winnerLabel.replace(/^@/, '');

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onDismiss}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Vault reveal</Text>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {spin.title}
        </Text>
        <Text style={styles.meta}>
          {spin.kind === 'break_pyt' ? 'PYT randomizer' : 'Giveaway'} · {spin.labels.length} on wheel
        </Text>

        <View style={styles.wheelWrap}>
          <View style={styles.pointer} />
          <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
            <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
              {segments.map((seg, i) => (
                <G key={`${seg.label}-${i}`}>
                  <Path d={segmentPath(seg.start, seg.end)} fill={seg.color} stroke="#0a0a0a" strokeWidth={1} />
                  <SvgText
                    x={CX}
                    y={CY - R * 0.58}
                    fill="#ecfdf5"
                    fontSize={spin.labels.length > 16 ? 7 : spin.labels.length > 10 ? 8 : 9}
                    fontWeight="700"
                    textAnchor="middle"
                    transform={`rotate(${seg.mid} ${CX} ${CY})`}
                  >
                    {shortLabel(seg.label)}
                  </SvgText>
                </G>
              ))}
            </Svg>
          </Animated.View>
          <View style={styles.hub}>
            <Text style={styles.hubTxt}>GV</Text>
          </View>
        </View>

        {phase === 'done' ? (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerKicker}>{spin.kind === 'break_pyt' ? 'First pick' : 'Winner'}</Text>
            <Text style={styles.winnerName}>@{winner}</Text>
            {spin.kind === 'break_pyt' && spin.assignments?.length ? (
              <Text style={styles.assignMeta}>Full order locked · {spin.assignments.length} spots</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.spinningRow}>
            <ActivityIndicator color={colors.gold} size="small" />
            <Text style={styles.spinningTxt}>Spinning…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  close: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  meta: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  pointer: {
    position: 'absolute',
    top: -6,
    zIndex: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 22,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.gold,
  },
  hub: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  hubTxt: { fontSize: 12, fontWeight: '900', color: colors.gold },
  winnerBox: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.45)',
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  winnerKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6ee7b7',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  winnerName: { fontSize: 24, fontWeight: '900', color: '#ecfdf5', marginTop: 4 },
  assignMeta: { fontSize: 10, color: '#a7f3d0', marginTop: 4 },
  spinningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spinningTxt: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
});
