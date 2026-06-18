import { Keyboard, Pressable, StyleSheet } from 'react-native';

type Props = {
  /** When true, taps on the stage/video layer dismiss the keyboard. */
  active: boolean;
};

/**
 * Transparent layer for live rooms: sits above video but below chat/composer chrome
 * so buyers can tap the stream to hide the keyboard without blocking controls.
 */
export function KeyboardDismissStageShield({ active }: Props) {
  if (!active) return null;

  return (
    <Pressable
      style={styles.shield}
      onPress={Keyboard.dismiss}
      accessibilityRole="button"
      accessibilityLabel="Dismiss keyboard"
    />
  );
}

const styles = StyleSheet.create({
  shield: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
});
