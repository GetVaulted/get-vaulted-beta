import { Ionicons } from '@expo/vector-icons';
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { colors } from '../../theme';
import { vaultFonts } from '../../theme/vaultTypography';

// Only one row stays open at a time.
let openRow: Swipeable | null = null;

/**
 * Swipe a conversation left to reveal Delete. In the Deleted area, swipe left for Delete forever
 * and right for Restore. Revealing then tapping is deliberate: nothing is deleted by a stray swipe.
 */
export function SwipeableThreadRow({
  mode,
  onDelete,
  onRestore,
  onPurge,
  children,
}: {
  mode: 'inbox' | 'deleted';
  onDelete?: () => void;
  onRestore?: () => void;
  onPurge?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<Swipeable>(null);

  const act = (fn?: () => void) => () => {
    ref.current?.close();
    fn?.();
  };

  const renderRight = () => (
    <View style={styles.actions}>
      {mode === 'inbox' ? (
        <Pressable
          style={[styles.action, styles.danger, styles.wide]}
          onPress={act(onDelete)}
          accessibilityRole="button"
          accessibilityLabel="Delete conversation"
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.actionTxt}>Delete</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.action, styles.danger, styles.wider]}
          onPress={act(onPurge)}
          accessibilityRole="button"
          accessibilityLabel="Delete forever"
        >
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.actionTxt}>Delete forever</Text>
        </Pressable>
      )}
    </View>
  );

  const renderLeft = () => (
    <View style={styles.actions}>
      <Pressable
        style={[styles.action, styles.restore, styles.wide]}
        onPress={act(onRestore)}
        accessibilityRole="button"
        accessibilityLabel="Restore conversation"
      >
        <Ionicons name="arrow-undo-outline" size={20} color={colors.background} />
        <Text style={[styles.actionTxt, styles.restoreTxt]}>Restore</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={ref}
      friction={2}
      rightThreshold={36}
      leftThreshold={36}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={renderRight}
      renderLeftActions={mode === 'deleted' ? renderLeft : undefined}
      onSwipeableWillOpen={() => {
        if (openRow && openRow !== ref.current) openRow.close();
        openRow = ref.current;
      }}
      onSwipeableClose={() => {
        if (openRow === ref.current) openRow = null;
      }}
      containerStyle={styles.container}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background },
  actions: { flexDirection: 'row' },
  action: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  wide: { width: 92 },
  wider: { width: 118 },
  danger: { backgroundColor: '#C62E26' },
  restore: { backgroundColor: colors.gold },
  actionTxt: {
    fontFamily: vaultFonts.label,
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#fff',
  },
  restoreTxt: { color: colors.background },
});
