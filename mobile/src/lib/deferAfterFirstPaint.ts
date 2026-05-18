import { InteractionManager } from 'react-native';

type DeferHandle = { cancel: () => void };

/** Run work after interactions settle — keeps first paint and tab transitions smooth. */
export function deferAfterFirstPaint(fn: () => void, delayMs = 0): DeferHandle {
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const handle = InteractionManager.runAfterInteractions(() => {
    if (cancelled) return;
    if (delayMs > 0) {
      timeoutId = setTimeout(() => {
        if (!cancelled) fn();
      }, delayMs);
    } else {
      fn();
    }
  });

  return {
    cancel: () => {
      cancelled = true;
      handle.cancel();
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}
