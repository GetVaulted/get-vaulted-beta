import { ActivityIndicator, Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { StageHostPreviewVideo } from './StageHostPreviewVideo';
import { SellerCameraPermissionGate } from './SellerCameraPermissionGate';
import type { SellerCameraFacing } from '../../../lib/sellerHostCamera';
import type { SellerCameraPermissionState } from '../../../hooks/useMobileStagePublish';
import { colors } from '../../../theme';

export function SellerLiveStreamBackdrop({
  thumbnailUrl,
  roomLive,
  streamConnected,
  biddingUrgent: _biddingUrgent,
  useStageCamera,
  showCameraPreview,
  cameraFacing,
  permissionState,
  permissionError,
  onRetryCameraPermission,
  permissionRetrying,
}: {
  thumbnailUrl?: string | null;
  roomLive: boolean;
  streamConnected: boolean;
  biddingUrgent?: boolean;
  /** When true, prefer live camera over listing thumbnail. */
  useStageCamera: boolean;
  showCameraPreview: boolean;
  cameraFacing: SellerCameraFacing;
  permissionState: SellerCameraPermissionState;
  permissionError: string | null;
  onRetryCameraPermission: () => void;
  permissionRetrying?: boolean;
}) {
  const ken = useRef(new Animated.Value(1)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (useStageCamera) return;
    const kenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ken, { toValue: 1.035, duration: 9000, useNativeDriver: true }),
        Animated.timing(ken, { toValue: 1, duration: 9000, useNativeDriver: true }),
      ]),
    );
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 14000, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 14000, useNativeDriver: true }),
      ]),
    );
    kenLoop.start();
    driftLoop.start();
    return () => {
      kenLoop.stop();
      driftLoop.stop();
    };
  }, [drift, ken, useStageCamera]);

  const showLiveFeed = showCameraPreview && permissionState === 'granted';
  const mountPreviewSurface =
    useStageCamera && permissionState !== 'denied' && permissionState !== 'unavailable';
  const permissionBlocked =
    useStageCamera && (permissionState === 'denied' || permissionState === 'unavailable');
  const thumb = thumbnailUrl?.trim();
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });

  return (
    <View style={styles.root}>
      <StageHostPreviewVideo
        active={mountPreviewSurface && showLiveFeed}
        cameraFacing={cameraFacing}
        contentFit="cover"
      />
      {permissionBlocked && permissionError ? (
        <SellerCameraPermissionGate
          message={permissionError}
          onRetry={onRetryCameraPermission}
          retrying={permissionRetrying}
        />
      ) : null}
      {!useStageCamera && thumb ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ scale: ken }, { translateX }] }]}
        >
          <Image
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            blurRadius={roomLive && streamConnected ? 0 : Platform.OS === 'ios' ? 2 : 1}
          />
        </Animated.View>
      ) : null}
      {!roomLive && useStageCamera && (permissionState === 'requesting' || permissionState === 'idle') ? (
        <View style={styles.previewLane} pointerEvents="box-none">
          <ActivityIndicator color={colors.gold} size="small" />
          <Text style={styles.previewTxt}>Starting camera…</Text>
          {permissionState === 'idle' ? (
            <Pressable style={styles.previewRetry} onPress={onRetryCameraPermission} disabled={permissionRetrying}>
              <Text style={styles.previewRetryTxt}>{permissionRetrying ? 'Retrying…' : 'Retry camera'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : useStageCamera && permissionState === 'granted' && !showLiveFeed ? (
        <View style={styles.previewLane} pointerEvents="box-none">
          <ActivityIndicator color={colors.gold} size="small" />
          <Text style={styles.previewTxt}>Starting camera…</Text>
          <Pressable style={styles.previewRetry} onPress={onRetryCameraPermission} disabled={permissionRetrying}>
            <Text style={styles.previewRetryTxt}>{permissionRetrying ? 'Retrying…' : 'Retry camera'}</Text>
          </Pressable>
        </View>
      ) : !roomLive && useStageCamera && showLiveFeed ? (
        <View style={styles.previewLane} pointerEvents="none">
          <View style={styles.previewDot} />
          <Text style={styles.previewTxt}>Rear camera preview · tap play when ready</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  previewLane: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  previewDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  previewTxt: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  previewRetry: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  previewRetryTxt: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
  },
});
