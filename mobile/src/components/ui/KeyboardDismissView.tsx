import type { PropsWithChildren } from 'react';
import { Keyboard, Pressable, StyleSheet } from 'react-native';

/** Wraps the app so taps on non-interactive areas dismiss the keyboard. */
export function KeyboardDismissView({ children }: PropsWithChildren) {
  return (
    <Pressable style={styles.root} onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
