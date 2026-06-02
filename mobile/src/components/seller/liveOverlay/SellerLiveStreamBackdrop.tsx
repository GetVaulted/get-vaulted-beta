import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { CinematicVignetteOverlay } from './CinematicVignetteOverlay';
import { LiveStreamEnergyLayer } from './LiveStreamEnergyLayer';
import { OnAirPill } from './OnAirPill';
import { SellerCameraPermissionGate } from './SellerCameraPermissionGate';
import { StageHostPreviewVideo } from './StageHostPreviewVideo';
import type { SellerCameraFacing } from '../../../lib/sellerHostCamera';
import type { SellerCameraPermissionState } from '../../../hooks/useMobileStagePublish';
import { colors } from '../../../theme';

const DEFAULT_GRADIENT: [string, string, string] = ['#121018', '#0a0a0c', '#050506'];

export function SellerLiveStreamBackdrop({
  thumbnailUrl,
  roomLive,
  streamConnected,
  biddingUrgent,
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
  const alive = roomLive || showLiveFeed || permissionState === 'requesting' || Boolean(thumbnailUrl?.trim());
  const permissionBlocked =
    useStageCamera && (permissionState === 'denied' || permissionState === 'unavailable');
  const thumb = thumbnailUrl?.trim();
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={DEFAULT_GRADIENT} style={StyleSheet.absoluteFill} />
      <StageHostPreviewVideo
        active={showLiveFeed}
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
      {!useStageCamera && !thumb ? (
        <LinearGradient
          colors={['rgba(212,175,55,0.08)', 'transparent', 'rgba(80,40,120,0.1)']}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <LiveStreamEnergyLayer active={alive} />
      <CinematicVignetteOverlay urgent={biddingUrgent} />
      {roomLive ? (
        <OnAirPill label={showLiveFeed && streamConnected ? 'LIVE' : 'ON AIR'} liveFeed={showLiveFeed && streamConnected} />
      ) : useStageCamera && permissionState === 'requesting' ? (
        <View style={styles.previewLane} pointerEvents="none">
          <ActivityIndicator color={colors.gold} size="small" />
          <Text style={styles.previewTxt}>Starting camera…</Text>
        </View>
      ) : useStageCamera && showLiveFeed ? (
        <View style={styles.previewLane} pointerEvents="none">
          <View style={styles.previewDot} />
          <Text style={styles.previewTxt}>Rear camera preview · tap Go live when ready</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
