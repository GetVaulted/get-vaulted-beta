import { FlatList, ScrollView } from 'react-native';

const SCROLL_KEYBOARD_DEFAULTS = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
};

type ScrollComponentWithDefaults = {
  defaultProps?: Record<string, unknown>;
};

function patchScrollDefaults(component: ScrollComponentWithDefaults) {
  const existing = component.defaultProps ?? {};
  component.defaultProps = {
    ...existing,
    keyboardShouldPersistTaps:
      existing.keyboardShouldPersistTaps ?? SCROLL_KEYBOARD_DEFAULTS.keyboardShouldPersistTaps,
    keyboardDismissMode:
      existing.keyboardDismissMode ?? SCROLL_KEYBOARD_DEFAULTS.keyboardDismissMode,
  };
}

/** Apply app-wide scroll list defaults so taps outside inputs dismiss the keyboard. */
export function setupKeyboardDismissBehavior(): void {
  patchScrollDefaults(ScrollView as unknown as ScrollComponentWithDefaults);
  patchScrollDefaults(FlatList as unknown as ScrollComponentWithDefaults);
}
