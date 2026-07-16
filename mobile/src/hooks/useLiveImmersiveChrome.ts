import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  computeLiveImmersiveHideDistance,
  LIVE_IMMERSIVE_SPRING,
  resolveLiveImmersiveSnap,
} from '../lib/liveImmersiveChrome';

type Args = {
  stageWidth: number;
  enabled: boolean;
};

export function useLiveImmersiveChrome({ stageWidth, enabled }: Args) {
  const hideDistanceSv = useSharedValue(computeLiveImmersiveHideDistance(stageWidth));
  const translateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const [immersive, setImmersive] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    hideDistanceSv.value = computeLiveImmersiveHideDistance(stageWidth);
  }, [hideDistanceSv, stageWidth]);

  const snapToHidden = useCallback(
    (hidden: boolean) => {
      const dist = computeLiveImmersiveHideDistance(stageWidth);
      translateX.value = withSpring(hidden ? -dist : 0, LIVE_IMMERSIVE_SPRING);
      setImmersive(hidden);
    },
    [stageWidth, translateX],
  );

  const restore = useCallback(() => {
    snapToHidden(false);
  }, [snapToHidden]);

  useEffect(() => {
    if (!enabled) restore();
  }, [enabled, restore]);

  useEffect(() => {
    restore();
  }, [stageWidth, restore]);

  const commitImmersive = useCallback((hidden: boolean) => {
    if (!mountedRef.current) return;
    setImmersive(hidden);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        // Prefer vertical show-to-show paging: fail this pan quickly on upward/downward swipes.
        .activeOffsetX([-18, 18])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          'worklet';
          dragStartX.value = translateX.value;
        })
        .onUpdate((event) => {
          'worklet';
          const dist = hideDistanceSv.value;
          const next = dragStartX.value + event.translationX;
          translateX.value = Math.min(0, Math.max(-dist, next));
        })
        .onEnd((event) => {
          'worklet';
          const dist = hideDistanceSv.value;
          const startedHidden = dragStartX.value <= -dist * 0.5;
          const hidden = resolveLiveImmersiveSnap({
            translateX: translateX.value,
            hideDistance: dist,
            velocityX: event.velocityX,
            translationX: event.translationX,
            startedHidden,
          });
          translateX.value = withSpring(hidden ? -dist : 0, LIVE_IMMERSIVE_SPRING, (finished) => {
            if (finished) runOnJS(commitImmersive)(hidden);
          });
        }),
    [commitImmersive, dragStartX, enabled, hideDistanceSv, translateX],
  );

  const chromeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return {
    pan,
    chromeStyle,
    immersive,
    restore,
  };
}
