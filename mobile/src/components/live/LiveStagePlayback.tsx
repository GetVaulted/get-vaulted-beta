import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ActivityIndicator, StyleSheet, View, type AppStateStatus } from 'react-native';
import { useVideoPlayer, VideoView, isPictureInPictureSupported, type VideoPlayer } from 'expo-video';
import { useLiveStagePlayback, type LivePlaybackMode } from '../../hooks/useLiveStagePlayback';
import { useHlsLiveEdgeSeek } from '../../hooks/useHlsLiveEdgeSeek';
import {
  resolveLivePlaybackSurfaceState,
  shouldAttachHlsPlayback,
} from '../../lib/liveStreamPlayback';
import type { LiveRoomBroadcastGate } from '../../lib/liveRoomBroadcastOnAir';
import {
  formatScheduledStartLong,
  getCountdownParts,
  pad2,
  parseScheduledStartMs,
  resolveScheduledPrereleasePhase,
} from '../../lib/liveStreamScheduled';
import {
  LIVE_PIP_RETRY_DELAYS_MS,
  shouldAttemptLivePictureInPicture,
  shouldSuspendLiveStageMedia,
  shouldWarmLiveHlsPipCompanion,
} from '../../lib/livePlaybackAppState';
import { LIVE_STAGE_CONTENT_FIT } from '../../lib/liveRoomViewport';
import { colors, spacing } from '../../theme';
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
  onBroadcastGateChange?: (gate: LiveRoomBroadcastGate) => void;
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
  onBroadcastGateChange,
}: Props) {
  const mode: LivePlaybackMode = playbackMode ?? (enabled ? 'active' : 'off');
  const isForeground = mode === 'active';
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);
  const appStateRef = useRef(appState);
  const prevAppStateRef = useRef<AppStateStatus>(appState);
  appStateRef.current = appState;
  const mainVideoRef = useRef<VideoView>(null);
  const pipVideoRef = useRef<VideoView>(null);
  const pipReadyRef = useRef(false);
  const pipStartingRef = useRef(false);
  const pipRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playbackContextRef = useRef({
    useWebrtc: false,
    attachHls: false,
    attachHlsPip: false,
  });
  const playback = useLiveStagePlayback({ roomId, playbackMode: mode, accessToken, refreshNonce });

  const playbackUrl = playback.stream?.playbackUrl ?? null;
  const streamHealth = playback.stream?.streamHealth ?? 'offline';
  const streamPaused = playback.stream?.streamPaused === true;
  const transport = playback.transport;

  useEffect(() => {
    onBroadcastGateChange?.({
      status: roomStatus,
      streamHealth,
      streamPaused,
      streamMode: playback.stream?.streamMode ?? 'channel_hls',
      streamStartedAt: playback.stream?.streamStartedAt ?? null,
      streamEndedAt: playback.stream?.streamEndedAt ?? null,
    });
  }, [
    onBroadcastGateChange,
    playback.stream?.streamEndedAt,
    playback.stream?.streamMode,
    playback.stream?.streamStartedAt,
    roomStatus,
    streamHealth,
    streamPaused,
  ]);

  const streamSignalLive = streamHealth.toLowerCase() === 'live' || streamHealth.toLowerCase() === 'connecting';
  const roomLifecycleLive = roomStatus === 'live' || streamSignalLive;

  const playbackActive = isForeground;
  const useWebrtc = transport === 'webrtc' && enabled && playbackActive;
  const attachHls =
    transport === 'hls' &&
    playbackActive &&
    Boolean(playbackUrl && shouldAttachHlsPlayback(streamHealth, playbackUrl));
  /** WebRTC is foreground-only; keep a hidden HLS player warm so PiP can attach when the app backgrounds. */
  const attachHlsPip = shouldWarmLiveHlsPipCompanion({
    playbackActive: isForeground,
    useWebrtc,
    roomLifecycleLive,
    playbackUrl,
  });
  const stageMediaSuspended = shouldSuspendLiveStageMedia(appState);
  const pipAutoStart =
    isPictureInPictureSupported() && Boolean(playbackUrl) && (attachHls || attachHlsPip);
  playbackContextRef.current = { useWebrtc, attachHls, attachHlsPip };

  const clearPipRetryTimers = useCallback(() => {
    for (const timer of pipRetryTimersRef.current) clearTimeout(timer);
    pipRetryTimersRef.current = [];
  }, []);

  const hlsPlayerSetup = (p: VideoPlayer) => {
    p.loop = false;
    p.muted = muted;
    p.staysActiveInBackground = true;
    p.bufferOptions = {
      preferredForwardBufferDuration: 3,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 1,
    };
    try {
      p.play();
    } catch {
      /* player may be released during pager unmount */
    }
  };

  const safeVideoPlay = useCallback((target: VideoPlayer) => {
    try {
      target.play();
    } catch {
      /* ignore */
    }
  }, []);

  const safeVideoReplace = useCallback(
    (target: VideoPlayer, url: string) => {
      try {
        target.replace(url);
        safeVideoPlay(target);
      } catch {
        /* ignore */
      }
    },
    [safeVideoPlay],
  );

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
    safeVideoReplace(player, playbackUrl);
  }, [attachHls, playbackUrl, player, safeVideoReplace]);

  useEffect(() => {
    if (!attachHlsPip || !playbackUrl) return;
    safeVideoReplace(pipPlayer, playbackUrl);
  }, [attachHlsPip, playbackUrl, pipPlayer, safeVideoReplace]);

  const tryStartPictureInPicture = useCallback(async () => {
    if (pipStartingRef.current || appStateRef.current === 'active') return;
    if (!isPictureInPictureSupported()) {
      if (__DEV__) {
        console.warn(
          '[LiveStagePlayback] PiP is not supported in this build. Use the Get Vaulted dev client or TestFlight — Expo Go cannot enable PiP.',
        );
      }
      return;
    }

    const { useWebrtc: webrtc, attachHls: hls, attachHlsPip: hlsPip } = playbackContextRef.current;
    const usePipCompanion = webrtc && hlsPip;
    const useMainHls = hls && !usePipCompanion;
    if (!usePipCompanion && !useMainHls) {
      if (__DEV__) {
        console.warn('[LiveStagePlayback] PiP skipped — stream is not on an HLS-capable path yet.', {
          transport: playbackContextRef.current,
        });
      }
      return;
    }

    const viewRef = usePipCompanion ? pipVideoRef : mainVideoRef;
    if (!viewRef.current) return;

    if (usePipCompanion) {
      safeVideoPlay(pipPlayer);
    } else {
      safeVideoPlay(player);
    }

    pipStartingRef.current = true;
    try {
      await viewRef.current.startPictureInPicture();
    } catch (err) {
      if (__DEV__) {
        console.warn('[LiveStagePlayback] startPictureInPicture failed', err);
      }
    } finally {
      pipStartingRef.current = false;
    }
  }, [pipPlayer, player, safeVideoPlay]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;
      appStateRef.current = next;
      setAppState(next);
      if (shouldAttemptLivePictureInPicture(next, prev)) {
        clearPipRetryTimers();
        for (const delayMs of LIVE_PIP_RETRY_DELAYS_MS) {
          pipRetryTimersRef.current.push(
            setTimeout(() => {
              void tryStartPictureInPicture();
            }, delayMs),
          );
        }
      } else if (next === 'active') {
        clearPipRetryTimers();
      }
    });
    return () => {
      clearPipRetryTimers();
      sub.remove();
    };
  }, [clearPipRetryTimers, tryStartPictureInPicture]);

  useEffect(() => {
    if (!attachHlsPip) {
      pipReadyRef.current = false;
      return undefined;
    }
    const syncReady = () => {
      pipReadyRef.current = pipPlayer.status === 'readyToPlay';
    };
    const sub = pipPlayer.addListener('statusChange', (evt) => {
      pipReadyRef.current = evt.status === 'readyToPlay';
      if (evt.status === 'readyToPlay' && appStateRef.current === 'background') {
        void tryStartPictureInPicture();
      }
    });
    syncReady();
    return () => sub.remove();
  }, [attachHlsPip, pipPlayer, tryStartPictureInPicture]);

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
      ? playback.videoHasData
        ? 'live'
        : playback.reconnecting
          ? 'reconnecting'
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
  const showThumbnail =
    Boolean(thumbnailUrl) &&
    (!showVideoLayer || !playback.videoHasData || surface === 'offline');
  const showStandby =
    isForeground &&
    (roomStatus === 'ended' ||
      (streamPaused && roomLifecycleLive) ||
      surface === 'offline' ||
      surface === 'loading' ||
      surface === 'connecting' ||
      surface === 'reconnecting' ||
      surface === 'error' ||
      (!roomLifecycleLive && roomStatus === 'scheduled') ||
      (roomLifecycleLive && !playback.videoHasData));

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
          active={useWebrtc && !stageMediaSuspended}
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
          ref={mainVideoRef}
          player={player}
          style={styles.video}
          contentFit={contentFit}
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically={pipAutoStart}
          collapsable={false}
        />
      ) : null}

      {attachHlsPip ? (
        <VideoView
          ref={pipVideoRef}
          player={pipPlayer}
          style={styles.pipHidden}
          contentFit={contentFit}
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically={pipAutoStart}
          collapsable={false}
        />
      ) : null}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.28)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {showStandby ? (
        <View style={styles.standbyWrap} pointerEvents="none">
          {(surface === 'loading' || surface === 'connecting') && roomLifecycleLive ? (
            <ActivityIndicator color={colors.gold} style={styles.loader} />
          ) : null}
          {standbyContent}
        </View>
      ) : null}
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
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 2,
    height: 2,
    opacity: 0.02,
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
});
