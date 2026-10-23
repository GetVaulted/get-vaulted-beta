import { useCallback, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';

/**
 * Largest finger travel (screen points) between touch-down and release that still counts as a tap.
 * Anything further was a drag/scroll, so the tile should not open.
 */
export const TAP_MAX_MOVE_PX = 10;

/** True when the finger stayed put. Missing/invalid coordinates count as a tap so presses never get lost. */
export function isTap(
  startX: number | undefined,
  startY: number | undefined,
  endX: number | undefined,
  endY: number | undefined,
  maxMove: number = TAP_MAX_MOVE_PX,
): boolean {
  if (![startX, startY, endX, endY].every((n) => typeof n === 'number' && Number.isFinite(n))) return true;
  return Math.hypot((endX as number) - (startX as number), (endY as number) - (startY as number)) <= maxMove;
}

/**
 * Drop-in handlers for a tile `Pressable` that sits inside a scrolling list: ignores a release that
 * follows a drag, so brushing a tile while scrolling does not open it.
 * Usage: `const tap = useTapGuard(onPress);` then `<Pressable onPressIn={tap.onPressIn} onPress={tap.onPress} />`.
 */
export function useTapGuard(onPress: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onPressIn = useCallback((e: GestureResponderEvent) => {
    start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  }, []);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      const s = start.current;
      start.current = null;
      if (s && !isTap(s.x, s.y, e.nativeEvent.pageX, e.nativeEvent.pageY)) return;
      onPress();
    },
    [onPress],
  );

  return { onPressIn, onPress: handlePress };
}
