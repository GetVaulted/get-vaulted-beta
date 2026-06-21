import { StyleSheet, View } from 'react-native';
import { LiveRoomText } from './LiveRoomText';
import { colors, radii, spacing } from '../../theme';

type Props = {
  bottom: number;
  left: number;
  right: number;
  slowModeSeconds: number;
  cooldownSeconds: number;
  chatBlocked: boolean;
};

export function LiveChatSlowModeTimer({
  bottom,
  left,
  right,
  slowModeSeconds,
  cooldownSeconds,
  chatBlocked,
}: Props) {
  if (slowModeSeconds <= 0) return null;

  const label = chatBlocked
    ? `Chat in ${cooldownSeconds}s`
    : `Slow mode · ${slowModeSeconds}s between messages`;

  return (
    <View style={[styles.wrap, { bottom, left, right }]} pointerEvents="none">
      <View style={[styles.chip, chatBlocked && styles.chipActive]}>
        <LiveRoomText style={[styles.text, chatBlocked && styles.textActive]}>{label}</LiveRoomText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 19,
    alignItems: 'flex-start',
  },
  chip: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  chipActive: {
    borderColor: 'rgba(255,215,128,0.45)',
    backgroundColor: 'rgba(255,215,128,0.12)',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  textActive: {
    color: colors.gold,
    fontWeight: '800',
  },
});
