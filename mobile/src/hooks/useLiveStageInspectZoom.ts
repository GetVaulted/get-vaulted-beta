import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  clampLiveStageInspectScale,
  clampLiveStageInspectTranslation,
  isLiveStageInspectZoomActive,
  LIVE_STAGE_INSPECT_MIN_SCALE,
  LIVE_STAGE_INSPECT_SPRING,
} from '../lib/liveStageInspectZoom';

type Args = {
  enabled: boolean;
  /** Fired when inspect zoom becomes active or fully returns to rest. */
  onActiveChange?: (active: boolean) => void;
};

/**
 * Temporary live-stage inspect: two-finger pinch to zoom (continuous) + two-finger pan
 * to look around. Always springs back to 1x when fingers lift — not a sticky zoom mode.
 */
export function useLiveStageInspectZoom({ enabled, onActiveChange }: Args) {
  const scale = useSharedValue(LIVE_STAGE_INSPECT_MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const pinchStartScale = useSharedValue(LIVE_STAGE_INSPECT_MIN_SCALE);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);
  const activeRef = useRef(false);

  const setActive = useCallback(
    (active: boolean) => {
      if (activeRef.current === active) return;
      activeRef.current = active;
      onActiveChange?.(active);
    },
    [onActiveChange],
  );

  const reset = useCallback(() => {
    scale.value = LIVE_STAGE_INSPECT_MIN_SCALE;
    translateX.value = 0;
    translateY.value = 0;
    setActive(false);
  }, [scale, setActive, translateX, translateY]);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  const snapHome = useCallback(() => {
    'worklet';
    scale.value = withSpring(LIVE_STAGE_INSPECT_MIN_SCALE, LIVE_STAGE_INSPECT_SPRING, (finished) => {
      if (finished) runOnJS(setActive)(false);
    });
    translateX.value = withSpring(0, LIVE_STAGE_INSPECT_SPRING);
    translateY.value = withSpring(0, LIVE_STAGE_INSPECT_SPRING);
  }, [scale, setActive, translateX, translateY]);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .enabled(enabled)
      .onBegin(() => {
        'worklet';
        pinchStartScale.value = scale.value;
        runOnJS(setActive)(true);
      })
      .onUpdate((event) => {
        'worklet';
        const next = clampLiveStageInspectScale(pinchStartScale.value * event.scale);
        scale.value = next;
        translateX.value = clampLiveStageInspectTranslation(
          translateX.value,
          next,
          containerWidth.value,
        );
        translateY.value = clampLiveStageInspectTranslation(
          translateY.value,
          next,
          containerHeight.value,
        );
      })
      .onFinalize(() => {
        'worklet';
        snapHome();
      });

    const pan = Gesture.Pan()
      .enabled(enabled)
      .minPointers(2)
      .maxPointers(2)
      .averageTouches(true)
      .onBegin(() => {
        'worklet';
        panStartX.value = translateX.value;
        panStartY.value = translateY.value;
        if (isLiveStageInspectZoomActive(scale.value)) {
          runOnJS(setActive)(true);
        }
      })
      .onUpdate((event) => {
        'worklet';
        if (!isLiveStageInspectZoomActive(scale.value)) return;
        translateX.value = clampLiveStageInspectTranslation(
          panStartX.value + event.translationX,
          scale.value,
          containerWidth.value,
        );
        translateY.value = clampLiveStageInspectTranslation(
          panStartY.value + event.translationY,
          scale.value,
          containerHeight.value,
        );
      })
      .onFinalize(() => {
        'worklet';
        // Pinch usually owns the reset; this covers two-finger pan-only finalize.
        if (isLiveStageInspectZoomActive(scale.value)) {
          snapHome();
        }
      });

    return Gesture.Simultaneous(pinch, pan);
  }, [
    containerHeight,
    containerWidth,
    enabled,
    panStartX,
    panStartY,
    pinchStartScale,
    scale,
    setActive,
    snapHome,
    translateX,
    translateY,
  ]);

  const videoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const onLayout = useCallback(
    (width: number, height: number) => {
      containerWidth.value = width;
      containerHeight.value = height;
    },
    [containerHeight, containerWidth],
  );

  return useMemo(
    () => ({
      gesture,
      videoStyle,
      onLayout,
      reset,
    }),
    [gesture, onLayout, reset, videoStyle],
  );
}
