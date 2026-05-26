import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Tracks software keyboard height for bottom-sheet form padding. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setInset(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}

export function logWalletSheet(event: string, detail?: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[wallet sheet] ${event}`, detail ?? '');
  }
}

export function logLiveBidBlocked(reason: string, detail?: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[live bid] blocked ${reason}`, detail ?? '');
  }
}
