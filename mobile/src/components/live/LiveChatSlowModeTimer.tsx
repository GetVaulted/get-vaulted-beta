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
  overlayScale?: number;
};

export function LiveChatSlowModeTimer({
  bottom,
  left,
  right,
  slowModeSeconds,
  cooldownSeconds,
  chatBlocked,
  overlayScale = 1,
}: Props) {
  if (slowModeSeconds <= 0) return null;

  const scale = overlayScale > 1 ? overlayScale : 1;
  const label = chatBlocked
    ? `Chat in ${cooldownSeconds}s`
    : `Slow mode · ${slowModeSeconds}s between messages`;

  return (
    <View style={[styles.wrap, { bottom, left, right }]} pointerEvents="none">
      <View
        style={[
          styles.chip,
          chatBlocked && styles.chipActive,
          scale > 1 && {
            paddingHorizontal: Math.round(8 * scale),
            paddingVertical: Math.round(5 * scale),
          },
        ]}
      >
        <LiveRoomText
          style={[
            styles.text,
            chatBlocked && styles.textActive,
            scale > 1 && { fontSize: Math.round(11 * scale) },
          ]}
        >
          {label}
        </LiveRoomText>
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
