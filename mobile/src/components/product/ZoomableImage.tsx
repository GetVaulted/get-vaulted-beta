import { useCallback } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  ZOOMABLE_IMAGE_DOUBLE_TAP_SCALE,
  ZOOMABLE_IMAGE_MAX_SCALE,
  ZOOMABLE_IMAGE_MIN_SCALE,
  clampScale,
  clampTranslation,
  nextDoubleTapScale,
} from '../../lib/zoomableImage';

type ZoomableImageProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Full-screen zoomable image for the marketplace lightbox: pinch-to-zoom, drag-to-pan
 * while zoomed, and double-tap to toggle between rest and a fixed zoomed-in scale.
 * Mount with a fresh `key` per image (e.g. `key={uri}`) so zoom/pan state resets
 * whenever the lightbox opens a different photo.
 */
export function ZoomableImage({ uri, style }: ZoomableImageProps) {
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      containerWidth.value = event.nativeEvent.layout.width;
      containerHeight.value = event.nativeEvent.layout.height;
    },
    [containerHeight, containerWidth],
  );

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      'worklet';
      scale.value = clampScale(savedScale.value * event.scale, ZOOMABLE_IMAGE_MIN_SCALE, ZOOMABLE_IMAGE_MAX_SCALE);
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      if (scale.value <= ZOOMABLE_IMAGE_MIN_SCALE) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      const clampedX = clampTranslation(translateX.value, scale.value, containerWidth.value);
      const clampedY = clampTranslation(translateY.value, scale.value, containerHeight.value);
      translateX.value = withTiming(clampedX);
      translateY.value = withTiming(clampedY);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      if (scale.value <= ZOOMABLE_IMAGE_MIN_SCALE) return;
      translateX.value = clampTranslation(
        savedTranslateX.value + event.translationX,
        scale.value,
        containerWidth.value,
      );
      translateY.value = clampTranslation(
        savedTranslateY.value + event.translationY,
        scale.value,
        containerHeight.value,
      );
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      const next = nextDoubleTapScale(scale.value, ZOOMABLE_IMAGE_DOUBLE_TAP_SCALE, ZOOMABLE_IMAGE_MIN_SCALE);
      scale.value = withTiming(next);
      savedScale.value = next;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    });

  const panAndPinch = Gesture.Simultaneous(pinchGesture, panGesture);
  const composedGesture = Gesture.Race(doubleTapGesture, panAndPinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={[styles.wrap, style]} onLayout={onLayout}>
      <GestureDetector gesture={composedGesture}>
        <Animated.Image source={{ uri }} style={[styles.image, animatedStyle]} resizeMode="contain" />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
});
