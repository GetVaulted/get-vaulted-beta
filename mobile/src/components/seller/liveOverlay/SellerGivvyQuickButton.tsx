import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GIVVY_UI } from '../../../lib/givvyUi';
import { LIVE_ROOM_TEXT_PROPS } from '../../../lib/liveRoomUiScale';
import { radii, spacing } from '../../../theme';

const PILL_MIN_H = 44;
const PILL_ICON = 13;
const PILL_LABEL = 10;

type Props = {
  top: number;
  onPress: () => void;
};

/** Standalone Givvys entry — sits directly under the seller header banner. */
export function SellerGivvyQuickButton({ top, onPress }: Props) {
  return (
    <View style={[styles.host, { top }]} pointerEvents="box-none">
      <Pressable
        style={styles.btn}
        onPress={onPress}
        accessibilityLabel="Giveaways"
        hitSlop={4}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidFill} />
        )}
        <View style={styles.inner}>
          <Ionicons name="gift-outline" size={PILL_ICON} color={GIVVY_UI.icon} />
          <Text style={styles.label} numberOfLines={1} {...LIVE_ROOM_TEXT_PROPS}>
            Givvys
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.sm,
    zIndex: 13,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: PILL_MIN_H,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GIVVY_UI.border,
    backgroundColor: GIVVY_UI.pillBg,
    overflow: 'hidden',
  },
  androidFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GIVVY_UI.androidFill,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  label: {
    fontSize: PILL_LABEL,
    fontWeight: '800',
    color: GIVVY_UI.label,
    lineHeight: 12,
    flexShrink: 0,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});
