import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ActivityIndicator, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { setStageAudioOutputEnabled } from 'expo-realtime-ivs-broadcast';
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
import { LIVE_BACKGROUND_SUSPEND_DWELL_MS } from '../../lib/livePlaybackAppState';
import { isLivePlaybackCommerceHoldActive } from '../../lib/livePlaybackCommerceHold';
import { liveStageContentFitForStreamMode } from '../../lib/liveRoomViewport';
import { viewerLifecycleLog } from '../../lib/viewerLifecycleLog';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';
import { StageSubscriberVideo } from './StageSubscriberVideo';

/** PiP + hidden HLS companion caused delayed audio echo; leave off until reworked. */
const LIVE_PICTURE_IN_PICTURE_ENABLED = false;

type Props = {
  roomId: string;
  roomStatus: 'scheduled' | 'live' | 'ended';
  scheduledStartAtIso?: string | null;
  thumbnailUrl: string;
  /** Short looping promo while the room is still scheduled. */
  teaserVideoUrl?: string | null;
  /** When omitted, falls back to legacy `enabled` boolean. */
  playbackMode?: LivePlaybackMode;
  enabled?: boolean;
  accessToken?: string;
  refreshNonce?: number;
  /** Bumps on each new focus visit — surfaced in the __DEV__ diagnostic label + plan log. */
  roomVisitNonce?: number;
  /**
   * Immediate streamPaused from realtime `stream_status` (before GET /stream catches up).
   * `null` = no hint; boolean overrides until the next stream fetch confirms.
   */
  realtimeStreamPaused?: boolean | null;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  /** Override auto fit (cover for phone Stage, contain for OBS/HLS). */
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
  teaserVideoUrl = null,
  playbackMode,
  enabled = true,
  accessToken,
  refreshNonce,
  roomVisitNonce = 0,
  realtimeStreamPaused = null,
  muted,
  onMutedChange,
  contentFit: contentFitOverride,
  onBroadcastGateChange,
}: Props) {
  const mode: LivePlaybackMode = playbackMode ?? (enabled ? 'active' : 'off');
  const isForeground = mode === 'active';
  // Neighbors (prefetch) keep their HLS mirror warm so switching to them is instant.
  const hlsWarm = mode === 'active' || mode === 'prefetch';
  // Set true once the WebRTC surface actually paints; drives the seamless HLS->WebRTC swap on the
  // settled show. Reset whenever this surface stops using WebRTC.
  const [webrtcReady, setWebrtcReady] = useState(false);
  // Debounced: brief exit→return must not leave Stage (native crash). Only true after dwell.
  const [stageMediaSuspended, setStageMediaSuspended] = useState(false);
  // After a committed background leave, keep Stage subscribe off until playback parks on HLS.
  // Clearing suspend while transport is still `webrtc` would rejoin the poisoned singleton.
  const [blockStageAfterBackgroundLeave, setBlockStageAfterBackgroundLeave] = useState(false);
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const suspendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didCommitSuspendRef = useRef(false);
  const mainVideoRef = useRef<VideoView>(null);
  const playback = useLiveStagePlayback({ roomId, playbackMode: mode, accessToken, refreshNonce, roomVisitNonce });

  useEffect(() => {
    if (!blockStageAfterBackgroundLeave) return;
    if (playback.transport !== 'webrtc') {
      setBlockStageAfterBackgroundLeave(false);
    }
  }, [blockStageAfterBackgroundLeave, playback.transport]);

  // Host Play after the buyer backgrounded: allow Stage again once pause clears.
  useEffect(() => {
    if (realtimeStreamPaused === false) {
      setBlockStageAfterBackgroundLeave(false);
    }
  }, [realtimeStreamPaused]);

  useEffect(() => {
    if (realtimeStreamPaused == null) return;
    playback.applyRealtimeStreamPaused(realtimeStreamPaused);
  }, [playback.applyRealtimeStreamPaused, realtimeStreamPaused]);

  const playbackUrl = playback.stream?.playbackUrl ?? null;
  const streamHealth = playback.stream?.streamHealth ?? 'offline';
  // Only server/realtime pause = Host paused. Local no-frames is "waiting", not minimize.
  const streamPaused =
    playback.stream?.streamPaused === true || realtimeStreamPaused === true;
  const transport = playback.transport;
  const contentFit =
    contentFitOverride ?? liveStageContentFitForStreamMode(playback.stream?.streamMode);
  const viewerTransport = playback.viewerTransport;
  const reconnectFailed = playback.reconnectFailed;

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
  // Keep Stage subscribed while Host paused (TikTok/Whatnot/eBay). Unmounting Stage on pause
  // leave-latches buyers onto a dead HLS mirror and "Waiting for host video" after Play.
  const useWebrtc = transport === 'webrtc' && enabled && playbackActive;
  const hlsAttachable = Boolean(playbackUrl && shouldAttachHlsPlayback(streamHealth, playbackUrl));
  // Hold the HLS mirror on the settled show through the WebRTC upgrade until WebRTC paints, so the
  // swap has no black "connecting" gap. Neighbors buffer HLS muted+hidden for instant switching.
  const webrtcUpgradeHold = useWebrtc && !webrtcReady && !streamPaused;
  const attachHls =
    !streamPaused && hlsAttachable && ((transport === 'hls' && hlsWarm) || webrtcUpgradeHold);

  useEffect(() => {
    if (!useWebrtc || !isForeground) setWebrtcReady(false);
  }, [useWebrtc, isForeground]);

  useEffect(() => {
    viewerLifecycleLog(isForeground ? 'screen_focused' : 'screen_blurred', {
      roomId,
      mode,
      transport,
    });
  }, [isForeground, mode, roomId, transport]);

  const handleWebrtcConnected = useCallback(() => {
    setWebrtcReady(true);
    playback.onVideoReady();
  }, [playback.onVideoReady]);

  const hlsPlayerSetup = (p: VideoPlayer) => {
    p.loop = false;
    p.muted = muted;
    p.volume = 1;
    // Foreground surface takes exclusive audio focus so live HLS isn't ducked; warm neighbor
    // buffers mix so they don't steal the audio session from the active show.
    p.audioMixingMode = isForeground ? 'doNotMix' : 'mixWithOthers';
    p.staysActiveInBackground = LIVE_PICTURE_IN_PICTURE_ENABLED;
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
      viewerLifecycleLog('play_called', { roomId, transport: 'hls' });
    } catch {
      /* ignore */
    }
  }, [roomId]);

  const safeVideoReplace = useCallback(
    (target: VideoPlayer, url: string) => {
      try {
        target.replace(url);
        viewerLifecycleLog('source_loaded', { roomId, transport: 'hls', playbackUrl: url });
        safeVideoPlay(target);
      } catch {
        /* ignore */
      }
    },
    [roomId, safeVideoPlay],
  );

  const player = useVideoPlayer(attachHls ? playbackUrl : null, hlsPlayerSetup);

  useHlsLiveEdgeSeek(player, attachHls && playback.videoHasData);

  useEffect(() => {
    if (!attachHls) return;
    player.muted = muted;
    player.volume = muted ? 0 : 1;
    // Only the foreground surface takes exclusive audio focus. Warm neighbor buffers must not grab
    // `doNotMix`, or several muted background players fight the active player for the audio session.
    player.audioMixingMode = isForeground ? 'doNotMix' : 'mixWithOthers';
  }, [attachHls, muted, isForeground, player]);

  // WebRTC Stage audio ignores expo-video `muted` — apply the buyer mute toggle via the patched
  // Stage audio-output gate. Only the active WebRTC surface owns this; restore on teardown so a
  // muted show cannot leave the device/session silent after swipe-away.
  useEffect(() => {
    const stageLive = useWebrtc && !stageMediaSuspended;
    if (!stageLive) {
      if (isForeground) {
        void setStageAudioOutputEnabled(true).catch(() => {});
      }
      return;
    }
    void setStageAudioOutputEnabled(!muted).catch(() => {});
    return () => {
      void setStageAudioOutputEnabled(true).catch(() => {});
    };
  }, [useWebrtc, stageMediaSuspended, muted, isForeground]);

  // Hard-stop HLS audio whenever this slide is not the active playback surface. Adjacent pager
  // pages stay mounted (page ± 1 are kept warm), and on Android an expo-video player keeps
  // decoding audio even after its VideoView unmounts — so a show→show swipe bleeds the previous
  // room's sound until the old slide finally unmounts. Pausing + muting here is the audio
  // equivalent of tearing down the surface. When this slide becomes the active HLS surface again,
  // the muted + safeVideoReplace effects above restore the correct state and resume playback.
  useEffect(() => {
    if (attachHls) return;
    try {
      player.pause();
      player.muted = true;
    } catch {
      /* player may be released during pager unmount */
    }
  }, [attachHls, player]);

  // Load + play whenever HLS is attachable (includes re-entry after playbackMode off→active).
  useEffect(() => {
    if (!attachHls || !playbackUrl) return;
    viewerLifecycleLog('player_created', { roomId, transport: 'hls', foreground: isForeground });
    safeVideoReplace(player, playbackUrl);
  }, [attachHls, isForeground, playbackUrl, player, roomId, safeVideoReplace]);

  useEffect(() => {
    const clearSuspendTimer = () => {
      if (suspendTimerRef.current != null) {
        clearTimeout(suspendTimerRef.current);
        suspendTimerRef.current = null;
      }
    };
    const sub = AppState.addEventListener('change', (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;

      if (next === 'background') {
        // Debounce: quick exit→return must not leave Stage (native IVS crash on remount).
        clearSuspendTimer();
        // Stripe PaymentSheet / 3DS is another Android Activity → AppState background.
        // Do not leave Stage while the buyer is mid-checkout.
        if (isLivePlaybackCommerceHoldActive()) {
          viewerLifecycleLog('commerce_hold_skip_suspend', { roomId });
          return;
        }
        suspendTimerRef.current = setTimeout(() => {
          suspendTimerRef.current = null;
          if (prevAppStateRef.current !== 'background') return;
          if (isLivePlaybackCommerceHoldActive()) {
            viewerLifecycleLog('commerce_hold_skip_suspend', { roomId, at: 'timer' });
            return;
          }
          didCommitSuspendRef.current = true;
          setStageMediaSuspended(true);
        }, LIVE_BACKGROUND_SUSPEND_DWELL_MS);
        return;
      }

      if (next === 'active') {
        clearSuspendTimer();
        const wasSuspended = didCommitSuspendRef.current;
        didCommitSuspendRef.current = false;
        setStageMediaSuspended(false);
        // After a committed background leave, do NOT remount Stage / re-activate WebRTC.
        // Playback parks on HLS; block Stage until transport is no longer webrtc.
        if (wasSuspended && prev !== 'active') {
          setBlockStageAfterBackgroundLeave(true);
        }
      }
    });
    return () => {
      clearSuspendTimer();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- AppState subscription is mount-lifetime
  }, []);

  useEffect(() => {
    if (!attachHls) return;
    const markReady = () => playback.onVideoReady();
    const sub = player.addListener('statusChange', (evt) => {
      viewerLifecycleLog('player_state_changed', {
        roomId,
        transport: 'hls',
        status: evt.status,
        attemptId: playback.playbackAttemptId,
        playbackUrl,
      });
      if (evt.status === 'readyToPlay') markReady();
      if (evt.status === 'error') {
        viewerLifecycleLog('player_error', {
          roomId,
          transport: 'hls',
          attemptId: playback.playbackAttemptId,
          message: evt.error?.message ?? null,
        });
        playback.onVideoError();
      }
    });
    // Buffering breadcrumb — helps distinguish "URL present but no segments" from a real player error.
    const playingSub = player.addListener('playingChange', (evt) => {
      viewerLifecycleLog('player_playing_change', {
        roomId,
        transport: 'hls',
        isPlaying: evt.isPlaying,
        status: player.status,
        attemptId: playback.playbackAttemptId,
      });
    });
    if (player.status === 'readyToPlay') markReady();
    return () => {
      sub.remove();
      playingSub.remove();
    };
  }, [attachHls, player, playback.onVideoReady, playback.onVideoError, playback.playbackAttemptId, playbackUrl, roomId]);

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
  // Render the HLS VideoView only when it's the visible surface: on the foreground show, and only
  // until WebRTC actually paints. Neighbors keep `attachHls` (buffering) but never render a view.
  const showHlsLayer = attachHls && isForeground && !webrtcReady && surface !== 'error';
  const showVideoLayer = showWebrtcLayer || showHlsLayer;
  const teaserUrl = typeof teaserVideoUrl === 'string' ? teaserVideoUrl.trim() : '';
  const showTeaserLayer =
    Boolean(teaserUrl) &&
    isForeground &&
    !roomLifecycleLive &&
    roomStatus === 'scheduled' &&
    !showVideoLayer;
  const teaserPlayer = useVideoPlayer(showTeaserLayer ? teaserUrl : null, (p) => {
    p.loop = true;
    p.muted = muted;
    p.volume = muted ? 0 : 1;
    p.audioMixingMode = 'doNotMix';
    try {
      p.play();
    } catch {
      /* ignore */
    }
  });
  useEffect(() => {
    if (!showTeaserLayer) {
      try {
        teaserPlayer.pause();
        teaserPlayer.muted = true;
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      teaserPlayer.loop = true;
      teaserPlayer.muted = muted;
      teaserPlayer.volume = muted ? 0 : 1;
      teaserPlayer.play();
    } catch {
      /* ignore */
    }
  }, [showTeaserLayer, muted, teaserPlayer, teaserUrl]);
  const showThumbnail =
    Boolean(thumbnailUrl) &&
    !showTeaserLayer &&
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
    // Watchdog gave up — keep auto-recovering; never push buyers to a Retry CTA (host pause / brief drops).
    if (reconnectFailed && roomLifecycleLive && roomStatus !== 'ended') {
      return (
        <StandbyOverlay
          title="Reconnecting…"
          body="Restoring your live stream connection."
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
          contentFit={contentFit}
          contentPosition="center"
        />
      ) : null}

      {showTeaserLayer ? (
        <VideoView
          player={teaserPlayer}
          style={styles.video}
          contentFit={contentFit}
          nativeControls={false}
          allowsPictureInPicture={false}
          startsPictureInPictureAutomatically={false}
          collapsable={false}
        />
      ) : null}

      {showWebrtcLayer ? (
        <StageSubscriberVideo
          roomId={roomId}
          accessToken={accessToken}
          active={useWebrtc && !stageMediaSuspended && !blockStageAfterBackgroundLeave}
          hostPaused={streamPaused}
          refreshNonce={refreshNonce}
          subscribeEpoch={playback.webrtcSubscribeEpoch}
          contentFit={contentFit}
          onConnected={handleWebrtcConnected}
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
          allowsPictureInPicture={LIVE_PICTURE_IN_PICTURE_ENABLED}
          startsPictureInPictureAutomatically={false}
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
          {(surface === 'loading' || surface === 'connecting') && roomLifecycleLive && !reconnectFailed ? (
            <ActivityIndicator color={colors.gold} style={styles.loader} />
          ) : null}
          {standbyContent}
        </View>
      ) : null}

      {__DEV__ && isForeground ? (
        <View style={styles.diagBadge} pointerEvents="none">
          <Text style={styles.diagText}>
            {`transport: ${transport}`}
            {`\nviewer: ${viewerTransport}`}
            {`\nurl: ${playbackUrl ? 'yes' : 'no'}`}
            {`\nstage: ${
              !useWebrtc
                ? 'off'
                : viewerTransport === 'failed'
                  ? 'failed'
                  : webrtcReady
                    ? 'joined'
                    : 'joining'
            }`}
            {`\nvideoTrack: ${playback.videoHasData ? 'yes' : 'no'}`}
            {`\nhlsState: ${
              playback.playerFatal
                ? 'error'
                : !attachHls
                  ? 'idle'
                  : transport === 'hls' && playback.videoHasData
                    ? 'playing'
                    : 'loading'
            }`}
            {`\nvisit: ${roomVisitNonce}  attempt: ${playback.playbackAttemptId}`}
          </Text>
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
  standbyWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  loader: { marginBottom: spacing.md },
  diagBadge: {
    position: 'absolute',
    top: 96,
    left: 8,
    zIndex: 99,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,80,0.5)',
  },
  diagText: {
    color: '#ffe66b',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
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
