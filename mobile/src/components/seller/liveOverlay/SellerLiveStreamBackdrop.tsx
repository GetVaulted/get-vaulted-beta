import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { CinematicVignetteOverlay } from './CinematicVignetteOverlay';
import { LiveStreamEnergyLayer } from './LiveStreamEnergyLayer';
import { OnAirPill } from './OnAirPill';
import { colors } from '../../../theme';

const DEFAULT_GRADIENT: [string, string, string] = ['#121018', '#0a0a0c', '#050506'];

export function SellerLiveStreamBackdrop({
  thumbnailUrl,
  roomLive,
  streamConnected,
  biddingUrgent,
}: {
  thumbnailUrl: string | null;
  roomLive: boolean;
  streamConnected: boolean;
  biddingUrgent?: boolean;
}) {
  const ken = useRef(new Animated.Value(1)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const previewPulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
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
  }, [drift, ken]);

  useEffect(() => {
    if (roomLive) return;
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(previewPulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(previewPulse, { toValue: 0.45, duration: 1100, useNativeDriver: true }),
      ]),
    );
    p.start();
    return () => p.stop();
  }, [previewPulse, roomLive]);

  const thumb = thumbnailUrl?.trim();
  const showLiveFeed = roomLive && streamConnected;
  const alive = roomLive || Boolean(thumb);
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={DEFAULT_GRADIENT} style={StyleSheet.absoluteFill} />
      {thumb ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ scale: ken }, { translateX }] },
          ]}
        >
          <Image
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            blurRadius={showLiveFeed ? 0 : Platform.OS === 'ios' ? 2 : 1}
          />
        </Animated.View>
      ) : null}
      {!thumb ? (
        <LinearGradient
          colors={['rgba(212,175,55,0.08)', 'transparent', 'rgba(80,40,120,0.1)']}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <LiveStreamEnergyLayer active={alive} />
      <CinematicVignetteOverlay urgent={biddingUrgent} />
      {roomLive ? (
        <OnAirPill label={showLiveFeed ? 'LIVE' : 'ON AIR'} liveFeed={showLiveFeed} />
      ) : (
        <Animated.View style={[styles.previewLane, { opacity: previewPulse }]} pointerEvents="none">
          <View style={styles.previewDot} />
          <Text style={styles.previewTxt}>Preview lane · camera warming</Text>
        </Animated.View>
      )}
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
