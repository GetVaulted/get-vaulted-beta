import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveGiveawayRow } from '../../../api/liveGiveawayRepository';
import type { HostGiveawayAction } from '../../../hooks/useHostGiveawayActions';
import { GIVVY_UI } from '../../../lib/givvyUi';
import { radii, spacing } from '../../../theme';

type RailButton = {
  key: string;
  label: string;
  action?: HostGiveawayAction;
  onPress?: () => void;
  tone: 'green' | 'amber' | 'violet' | 'muted' | 'danger' | 'neutral';
};

function buttonsForGiveaway(
  giveaway: LiveGiveawayRow,
  onManage: () => void,
): RailButton[] {
  switch (giveaway.status) {
    case 'draft':
      return [
        { key: 'open', label: 'Open', action: 'open_entries', tone: 'green' },
        { key: 'cancel', label: 'Cancel', action: 'cancel', tone: 'muted' },
        { key: 'delete', label: 'Delete', action: 'delete', tone: 'danger' },
        { key: 'manage', label: 'Manage', onPress: onManage, tone: 'neutral' },
      ];
    case 'entries_open':
      return [
        { key: 'close', label: 'Close', action: 'close_entries', tone: 'amber' },
        { key: 'draw', label: 'Draw', action: 'draw', tone: 'violet' },
        { key: 'cancel', label: 'Cancel', action: 'cancel', tone: 'muted' },
        { key: 'delete', label: 'Delete', action: 'delete', tone: 'danger' },
      ];
    case 'entries_closed':
      return [
        { key: 'draw', label: 'Draw', action: 'draw', tone: 'violet' },
        { key: 'cancel', label: 'Cancel', action: 'cancel', tone: 'muted' },
        { key: 'delete', label: 'Delete', action: 'delete', tone: 'danger' },
        { key: 'manage', label: 'Manage', onPress: onManage, tone: 'neutral' },
      ];
    default:
      return [];
  }
}

const toneStyles = {
  green: { border: 'rgba(52,211,153,0.45)', bg: 'rgba(16,185,129,0.18)', text: '#a7f3d0' },
  amber: { border: 'rgba(251,191,36,0.45)', bg: 'rgba(245,158,11,0.16)', text: '#fde68a' },
  violet: { border: 'rgba(167,139,250,0.5)', bg: 'rgba(139,92,246,0.2)', text: '#ddd6fe' },
  muted: { border: 'rgba(255,255,255,0.16)', bg: 'rgba(0,0,0,0.45)', text: 'rgba(255,255,255,0.72)' },
  danger: { border: 'rgba(248,113,113,0.4)', bg: 'rgba(127,29,29,0.35)', text: '#fecaca' },
  neutral: { border: 'rgba(255,255,255,0.14)', bg: 'rgba(0,0,0,0.55)', text: 'rgba(255,255,255,0.88)' },
} as const;

type Props = {
  giveaway: LiveGiveawayRow;
  busy?: boolean;
  onAction: (id: string, action: HostGiveawayAction) => void;
  onOpenManage: () => void;
};

/** Host controls for the active open-lane giveaway (Close / Draw / Cancel / Delete). */
export function SellerHostGiveawayRail({ giveaway, busy = false, onAction, onOpenManage }: Props) {
  const buttons = buttonsForGiveaway(giveaway, onOpenManage);
  if (buttons.length === 0) return null;

  return (
    <View style={styles.rail} pointerEvents="box-none">
      <View style={styles.panel}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidFill} />
        )}
        <View style={styles.panelInner}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Givvy
            </Text>
            <Text style={styles.headerMeta}>{giveaway.entryCount} in</Text>
          </View>
          {buttons.map((btn) => {
            const tone = toneStyles[btn.tone];
            return (
              <Pressable
                key={btn.key}
                accessibilityRole="button"
                accessibilityLabel={btn.label}
                disabled={busy}
                hitSlop={4}
                onPress={() => {
                  if (btn.onPress) {
                    btn.onPress();
                    return;
                  }
                  if (btn.action) onAction(giveaway.id, btn.action);
                }}
                style={({ pressed }) => [
                  styles.btn,
                  {
                    borderColor: tone.border,
                    backgroundColor: tone.bg,
                    opacity: busy ? 0.45 : pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Text style={[styles.btnTxt, { color: tone.text }]}>{btn.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    alignItems: 'flex-end',
  },
  panel: {
    minWidth: 72,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GIVVY_UI.border,
    overflow: 'hidden',
  },
  androidFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,24,27,0.9)',
  },
  panelInner: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 6,
    alignItems: 'stretch',
  },
  header: {
    alignItems: 'center',
    gap: 1,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: GIVVY_UI.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    lineHeight: 12,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  headerMeta: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  btn: {
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTxt: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    lineHeight: 11,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});
