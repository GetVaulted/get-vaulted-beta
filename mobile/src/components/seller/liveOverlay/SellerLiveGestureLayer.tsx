import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../../../theme';

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function SellerLiveGestureLayer({
  onOpenQueue,
  onOpenBroadcast,
  onSold,
  onSkip,
  onSync,
  children,
}: {
  onOpenQueue: () => void;
  onOpenBroadcast: () => void;
  onSold: () => void;
  onSkip: () => void;
  onSync: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const swipeY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy < -18 && Math.abs(g.dy) > Math.abs(g.dx),
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderMove: (_, g) => {
        if (g.dy < 0) swipeY.setValue(Math.min(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -72) onOpenQueue();
        Animated.spring(swipeY, { toValue: 0, friction: 7, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const actions: QuickAction[] = [
    { key: 'queue', label: 'Queue', icon: 'layers-outline', onPress: () => { setMenuOpen(false); onOpenQueue(); } },
    { key: 'sold', label: 'Sold', icon: 'checkmark-circle-outline', onPress: () => { setMenuOpen(false); onSold(); } },
    { key: 'skip', label: 'Skip', icon: 'play-skip-forward-outline', onPress: () => { setMenuOpen(false); onSkip(); } },
    { key: 'sync', label: 'Sync', icon: 'refresh-outline', onPress: () => { setMenuOpen(false); onSync(); } },
    { key: 'signal', label: 'Broadcast', icon: 'videocam-outline', onPress: () => { setMenuOpen(false); onOpenBroadcast(); } },
  ];

  return (
    <View style={styles.fill} pointerEvents="box-none" {...panResponder.panHandlers}>
      {children}
      <Pressable
        style={styles.longPressZone}
        onLongPress={() => setMenuOpen(true)}
        delayLongPress={480}
        accessibilityLabel="Hold for seller quick actions"
      />
      <Animated.View style={[styles.swipeHint, { transform: [{ translateY: swipeY }] }]} pointerEvents="none">
        <Text style={styles.swipeHintTxt}>Swipe up · queue</Text>
      </Animated.View>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCard}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.menuAndroid} />
            )}
            <Text style={styles.menuTitle}>Host controls</Text>
            <View style={styles.menuGrid}>
              {actions.map((a) => (
                <Pressable key={a.key} style={styles.menuBtn} onPress={a.onPress}>
                  <Ionicons name={a.icon} size={22} color={colors.gold} />
                  <Text style={styles.menuLbl}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  longPressZone: {
    position: 'absolute',
    top: '20%',
    bottom: '42%',
    left: '12%',
    right: '24%',
    zIndex: 2,
  },
  swipeHint: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    zIndex: 3,
    opacity: 0.35,
  },
  swipeHintTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.5,
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: spacing.lg,
  },
  menuCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    padding: spacing.lg,
  },
  menuAndroid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,11,9,0.94)',
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  menuBtn: {
    width: 88,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
