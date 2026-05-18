import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../../../theme';
import type { BroadcastStatus } from './broadcastStatus';

const TONE_STYLES = {
  preparing: {
    bg: 'rgba(255,179,64,0.15)',
    border: 'rgba(255,179,64,0.45)',
    dot: '#FFB340',
    text: '#FFB340',
  },
  live: {
    bg: 'rgba(52,199,89,0.15)',
    border: 'rgba(52,199,89,0.45)',
    dot: colors.success,
    text: colors.success,
  },
  unstable: {
    bg: 'rgba(255,59,48,0.12)',
    border: 'rgba(255,59,48,0.4)',
    dot: colors.live,
    text: '#FF8A8A',
  },
  checking: {
    bg: 'rgba(212,175,55,0.12)',
    border: 'rgba(212,175,55,0.35)',
    dot: colors.gold,
    text: colors.gold,
  },
};

export function BroadcastStatusPill({ status }: { status: BroadcastStatus }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  const tone = TONE_STYLES[status.tone];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: status.tone === 'live' ? 600 : 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: status.tone === 'live' ? 600 : 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, status.tone]);

  return (
    <View style={[styles.shell, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Animated.View style={[styles.dot, { backgroundColor: tone.dot, opacity: pulse }]} />
      <Text style={[styles.txt, { color: tone.text }]}>{status.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  txt: { fontSize: 12, fontWeight: '800' },
});
