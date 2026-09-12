import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Props = {
  compact?: boolean;
  /** Subtle pulse on the LIVE dot (for hero / live cards). */
  pulse?: boolean;
  /** Dot + label only — no chip (stream header / overlays). */
  inline?: boolean;
  /** Override label (default LIVE). */
  label?: string;
  variant?: 'live' | 'scheduled' | 'warning' | 'elsewhere' | 'offline';
};

export function LiveBadge({
  compact,
  pulse,
  inline,
  label = 'LIVE',
  variant = 'live',
}: Props) {
  const dotOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse || variant !== 'live') {
      dotOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, {
          toValue: 0.35,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, variant, dotOpacity]);

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.compact,
        inline && styles.inline,
        variant === 'scheduled' && styles.scheduledWrap,
        variant === 'warning' && styles.warningWrap,
        variant === 'elsewhere' && styles.elsewhereWrap,
        variant === 'offline' && styles.offlineWrap,
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          variant === 'scheduled' && styles.scheduledDot,
          variant === 'warning' && styles.warningDot,
          variant === 'elsewhere' && styles.elsewhereDot,
          variant === 'offline' && styles.offlineDot,
          { opacity: dotOpacity },
        ]}
      />
      <Text
        style={[
          styles.text,
          compact && styles.textCompact,
          variant === 'scheduled' && styles.scheduledText,
          variant === 'warning' && styles.warningText,
          variant === 'elsewhere' && styles.elsewhereText,
          variant === 'offline' && styles.offlineText,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.45)',
  },
  compact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inline: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 5,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  text: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  textCompact: {
    fontSize: 10,
  },
  scheduledWrap: {
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderColor: 'rgba(212,175,55,0.35)',
  },
  scheduledDot: {
    backgroundColor: colors.gold,
  },
  scheduledText: {
    color: colors.gold,
  },
  warningWrap: {
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  warningDot: {
    backgroundColor: '#fbbf24',
  },
  warningText: {
    color: '#fde68a',
  },
  elsewhereWrap: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  elsewhereDot: {
    backgroundColor: '#34d399',
  },
  elsewhereText: {
    color: '#a7f3d0',
  },
  offlineWrap: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  offlineDot: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  offlineText: {
    color: 'rgba(255,255,255,0.7)',
  },
});
