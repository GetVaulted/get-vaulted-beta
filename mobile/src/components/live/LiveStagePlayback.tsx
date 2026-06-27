import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useLiveStagePlayback, type LivePlaybackMode } from '../../hooks/useLiveStagePlayback';
import { useHlsLiveEdgeSeek } from '../../hooks/useHlsLiveEdgeSeek';
import {
  resolveLivePlaybackSurfaceState,
  shouldAttachHlsPlayback,
} from '../../lib/liveStreamPlayback';
import {
  formatScheduledStartLong,
  getCountdownParts,
  pad2,
  parseScheduledStartMs,
  resolveScheduledPrereleasePhase,
} from '../../lib/liveStreamScheduled';
import { LIVE_STAGE_CONTENT_FIT } from '../../lib/liveRoomViewport';
import { colors, radii, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';
import { StageSubscriberVideo } from './StageSubscriberVideo';

type Props = {
  roomId: string;
  roomStatus: 'scheduled' | 'live' | 'ended';
  scheduledStartAtIso?: string | null;
  thumbnailUrl: string;
  /** When omitted, falls back to legacy `enabled` boolean. */
  playbackMode?: LivePlaybackMode;
  enabled?: boolean;
  accessToken?: string;
  refreshNonce?: number;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  contentFit?: 'cover' | 'contain';
};

function StandbyOverlay({
  title,
  body,
  kicker = 'Vaulted Live',
}: {
  title: string;
  body?: string;
  kicker?: string;
}) {
  return (
    <View style={styles.standbyCenter} pointerEvents="none">
      <LiveRoomText style={styles.standbyKicker}>{kicker}</LiveRoomText>
      <LiveRoomText style={styles.standbyTitle}>{title}</LiveRoomText>
      {body ? <LiveRoomText style={styles.standbyBody}>{body}</LiveRoomText> : null}
    </View>
  );
}

function CountdownOverlay({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const parts = getCountdownParts(now, targetMs);
  const h = parts.hours > 99 ? String(parts.hours) : pad2(parts.hours);
  return (
    <View style={styles.standbyCenter} pointerEvents="none">
      <LiveRoomText style={styles.standbyKicker}>Vaulted Live</LiveRoomText>
      <LiveRoomText style={styles.countdownLabel}>Live in</LiveRoomText>
      <View style={styles.countdownRow}>
        <View style={styles.countdownUnit}>
          <LiveRoomText style={styles.countdownNum}>{h}</LiveRoomText>
          <LiveRoomText style={styles.countdownUnitLbl}>Hrs</LiveRoomText>
        </View>
        <LiveRoomText style={styles.countdownSep}>:</LiveRoomText>
        <View style={styles.countdownUnit}>
          <LiveRoomText style={styles.countdownNum}>{pad2(parts.minutes)}</LiveRoomText>
          <LiveRoomText style={styles.countdownUnitLbl}>Min</LiveRoomText>
        </View>
        <LiveRoomText style={styles.countdownSep}>:</LiveRoomText>
        <View style={styles.countdownUnit}>
          <LiveRoomText style={styles.countdownNum}>{pad2(parts.seconds)}</LiveRoomText>
          <LiveRoomText style={styles.countdownUnitLbl}>Sec</LiveRoomText>
        </View>
      </View>
    </View>
  );
}

function PlaybackDebugOverlay({
  transport,
  streamMode,
  stageAvailable,
}: {
  transport: string;
  streamMode: string;
  stageAvailable: boolean;
}) {
  if (!__DEV__) return null;
  return (
    <View style={styles.debugOverlay} pointerEvents="none">
      <LiveRoomText style={styles.debugTitle}>Live Playback Debug</LiveRoomText>
      <LiveRoomText style={styles.debugLine}>transport: {transport}</LiveRoomText>
      <LiveRoomText style={styles.debugLine}>streamMode: {streamMode}</LiveRoomText>
      <LiveRoomText style={styles.debugLine}>stageAvailable: {stageAvailable ? 'y' : 'n'}</LiveRoomText>
    </View>
  );
}

export function LiveStagePlayback({
  roomId,
  roomStatus,
  scheduledStartAtIso,
  thumbnailUrl,
  playbackMode,
  enabled = true,
  accessToken,
  refreshNonce,
  muted,
  onMutedChange,
  contentFit = 'cover',
}: Props) {
  const mode: LivePlaybackMode = playbackMode ?? (enabled ? 'active' : 'off');
  const isForeground = mode === 'active';
  const playback = useLiveStagePlayback({ roomId, playbackMode: mode, accessToken, refreshNonce });

  const playbackUrl = playback.stream?.playbackUrl ?? null;
  const streamHealth = playback.stream?.streamHealth ?? 'offline';
  const streamPaused = playback.stream?.streamPaused === true;
  const streamMode = playback.stream?.streamMode ?? 'channel_hls';
  const stageAvailable = playback.stream?.stageAvailable ?? false;
  const transport = playback.transport;
  const streamSignalLive = streamHealth.toLowerCase() === 'live' || streamHealth.toLowerCase() === 'connecting';
  const roomLifecycleLive = roomStatus === 'live' || streamSignalLive;

  const useWebrtc = transport === 'webrtc' && enabled;
  const attachHls = transport === 'hls' && Boolean(playbackUrl && shouldAttachHlsPlayback(streamHealth, playbackUrl));
  /** WebRTC is foreground-only; keep a hidden HLS player so system PiP works when the app backgrounds. */
  const attachHlsPip =
    useWebrtc &&
    isForeground &&
    roomLifecycleLive &&
    Boolean(playbackUrl && shouldAttachHlsPlayback(streamHealth, playbackUrl));

  const hlsPlayerSetup = (p: VideoPlayer) => {
    p.loop = false;
    p.muted = muted;
    p.bufferOptions = {
      preferredForwardBufferDuration: 3,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 1,
    };
    p.play();
  };

  const player = useVideoPlayer(attachHls ? playbackUrl : null, hlsPlayerSetup);

  const pipPlayer = useVideoPlayer(attachHlsPip ? playbackUrl : null, hlsPlayerSetup);

  useHlsLiveEdgeSeek(player, attachHls && playback.videoHasData);
  useHlsLiveEdgeSeek(pipPlayer, attachHlsPip);

  useEffect(() => {
    if (!attachHls) return;
    player.muted = muted;
  }, [attachHls, muted, player]);

  useEffect(() => {
    if (!attachHlsPip) return;
    pipPlayer.muted = muted;
  }, [attachHlsPip, muted, pipPlayer]);

  useEffect(() => {
    if (!attachHls || !playbackUrl) return;
    player.replace(playbackUrl);
    player.play();
  }, [attachHls, playbackUrl, player]);

  useEffect(() => {
    if (!attachHlsPip || !playbackUrl) return;
    pipPlayer.replace(playbackUrl);
    pipPlayer.play();
  }, [attachHlsPip, playbackUrl, pipPlayer]);

  useEffect(() => {
    if (!attachHls) return;
    const markReady = () => playback.onVideoReady();
    const sub = player.addListener('statusChange', (evt) => {
      if (evt.status === 'readyToPlay') markReady();
      if (evt.status === 'error') playback.onVideoError();
    });
    if (player.status === 'readyToPlay') markReady();
    return () => sub.remove();
  }, [attachHls, player, playback.onVideoReady, playback.onVideoError]);

  const hlsSurface = resolveLivePlaybackSurfaceState({
    loading: playback.loading,
    fetchFailed: playback.fetchFailed,
    reconnecting: playback.reconnecting,
    streamHealth,
    playbackUrl,
    videoHasRenderableData: playback.videoHasData,
    playerFatal: playback.playerFatal,
    roomLifecycleLive,
  });

  const surface =
    useWebrtc
      ? playback.reconnecting
        ? 'reconnecting'
        : playback.videoHasData
          ? 'live'
          : roomLifecycleLive
            ? 'connecting'
            : 'offline'
      : hlsSurface;

  const scheduledStartMs = useMemo(
    () => parseScheduledStartMs(scheduledStartAtIso),
    [scheduledStartAtIso],
  );
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (roomLifecycleLive) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [roomLifecycleLive]);

  const scheduledPhase = useMemo(() => {
    if (roomLifecycleLive) return null;
    return resolveScheduledPrereleasePhase(Date.now(), scheduledStartMs, roomLifecycleLive);
  }, [roomLifecycleLive, scheduledStartMs, tick]);

  const showWebrtcLayer = useWebrtc && surface !== 'error';
  const showHlsLayer = attachHls && surface !== 'error';
  const showVideoLayer = showWebrtcLayer || showHlsLayer;
  const streamAttaching =
    roomLifecycleLive && showVideoLayer && (transport === 'hls' || transport === 'webrtc');
  const showThumbnail =
    Boolean(thumbnailUrl) &&
    (!showVideoLayer || (!playback.videoHasData && !streamAttaching) || surface === 'offline');
  const showStandby =
    isForeground &&
    (roomStatus === 'ended' ||
      (streamPaused && roomLifecycleLive) ||
      surface === 'offline' ||
      surface === 'loading' ||
      surface === 'reconnecting' ||
      surface === 'error' ||
      (!roomLifecycleLive && roomStatus !== 'ended') ||
      (roomLifecycleLive && !playback.videoHasData && !streamAttaching));

  const standbyContent = (() => {
    if (streamPaused && roomLifecycleLive) {
      return (
        <StandbyOverlay
          title="Host paused"
          body="The host stepped away briefly. Hang tight — we'll be back soon."
        />
      );
    }
    if (surface === 'reconnecting') {
      return (
        <StandbyOverlay title="Reconnecting…" body="Restoring your live stream connection." />
      );
    }
    if (surface === 'error' && roomLifecycleLive) {
      return (
        <StandbyOverlay
          title="Stream unavailable"
          body="We couldn't load the stream. Try again shortly."
        />
      );
    }
    if (roomStatus === 'ended') {
      return <StandbyOverlay title="Live has Ended" />;
    }
    if (roomLifecycleLive && (surface === 'connecting' || surface === 'loading' || !playback.videoHasData)) {
      return (
        <StandbyOverlay
          title="Waiting for host video"
          body="The host is live — video appears when the stream signal is ready."
        />
      );
    }
    if (scheduledPhase === 'far' && scheduledStartAtIso) {
      return (
        <StandbyOverlay
          title={formatScheduledStartLong(scheduledStartAtIso)}
          body="Check back closer to showtime."
          kicker="This show goes live on"
        />
      );
    }
    if (scheduledPhase === 'countdown' && scheduledStartMs != null) {
      return <CountdownOverlay targetMs={scheduledStartMs} />;
    }
    if (scheduledPhase === 'post_start') {
      return (
        <StandbyOverlay
          title="Waiting on host"
          body="The show is scheduled to start now. We're waiting for the host to go live."
        />
      );
    }
    return (
      <StandbyOverlay
        title="Waiting on host"
        body="The stream will appear when the host connects."
      />
    );
  })();

  return (
    <View style={styles.root}>
      {showThumbnail ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit === 'cover' ? LIVE_STAGE_CONTENT_FIT : 'contain'}
          contentPosition="center"
        />
      ) : null}

      {showWebrtcLayer ? (
        <StageSubscriberVideo
          roomId={roomId}
          accessToken={accessToken}
          active={useWebrtc}
          refreshNonce={refreshNonce}
          subscribeEpoch={playback.webrtcSubscribeEpoch}
          contentFit={contentFit}
          onConnected={playback.onVideoReady}
          onFailed={playback.onWebrtcFailed}
          onDisconnected={playback.onWebrtcDisconnected}
        />
      ) : null}

      {showHlsLayer ? (
        <VideoView
          player={player}
          style={styles.video}
          contentFit={contentFit}
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically
        />
      ) : null}

      {attachHlsPip ? (
        <VideoView
          player={pipPlayer}
          style={styles.pipHidden}
          contentFit={contentFit}
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically
        />
      ) : null}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.28)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {showStandby ? (
        <View style={styles.standbyWrap}>
          {(surface === 'loading' || surface === 'connecting') && roomLifecycleLive ? (
            <ActivityIndicator color={colors.gold} style={styles.loader} />
          ) : null}
          {standbyContent}
        </View>
      ) : null}

      {showVideoLayer && muted ? (
        <Pressable
          style={styles.unmutePill}
          onPress={() => onMutedChange(false)}
          accessibilityRole="button"
          accessibilityLabel="Unmute stream"
        >
          <Ionicons name="volume-mute" size={14} color={colors.gold} />
          <LiveRoomText style={styles.unmuteText}>Tap for sound</LiveRoomText>
        </Pressable>
      ) : null}

      <PlaybackDebugOverlay
        transport={transport}
        streamMode={streamMode}
        stageAvailable={stageAvailable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  pipHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  standbyWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  loader: { marginBottom: spacing.md },
  standbyCenter: { alignItems: 'center', maxWidth: 320 },
  standbyKicker: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  standbyTitle: {
    color: '#f4f4f5',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  standbyBody: {
    color: 'rgba(161,161,170,0.95)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  countdownLabel: {
    color: 'rgba(161,161,170,0.95)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  countdownUnit: { alignItems: 'center' },
  countdownNum: {
    color: colors.gold,
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  countdownUnitLbl: {
    color: 'rgba(113,113,122,0.95)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  countdownSep: {
    color: 'rgba(234,179,8,0.45)',
    fontSize: 22,
    fontWeight: '300',
    marginBottom: 18,
  },
  unmutePill: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    left: '15%',
    right: '15%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  unmuteText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  debugOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    maxWidth: 180,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.35)',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  debugTitle: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  debugLine: {
    color: 'rgba(254,243,199,0.95)',
    fontSize: 9,
    fontFamily: 'Menlo',
    lineHeight: 14,
  },
});
