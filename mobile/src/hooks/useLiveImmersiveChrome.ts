import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const hideDistance = computeLiveImmersiveHideDistance(stageWidth);
  const translateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const [immersive, setImmersive] = useState(false);

  const snapToHidden = useCallback(
    (hidden: boolean) => {
      translateX.value = withSpring(hidden ? -hideDistance : 0, LIVE_IMMERSIVE_SPRING);
      setImmersive(hidden);
    },
    [hideDistance, translateX],
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
    setImmersive(hidden);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onBegin(() => {
          dragStartX.value = translateX.value;
        })
        .onUpdate((event) => {
          const next = dragStartX.value + event.translationX;
          translateX.value = Math.min(0, Math.max(-hideDistance, next));
        })
        .onEnd((event) => {
          const startedHidden = dragStartX.value <= -hideDistance * 0.5;
          const hidden = resolveLiveImmersiveSnap({
            translateX: translateX.value,
            hideDistance,
            velocityX: event.velocityX,
            translationX: event.translationX,
            startedHidden,
          });
          translateX.value = withSpring(hidden ? -hideDistance : 0, LIVE_IMMERSIVE_SPRING, (finished) => {
            if (finished) runOnJS(commitImmersive)(hidden);
          });
        }),
    [commitImmersive, dragStartX, enabled, hideDistance, translateX],
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
