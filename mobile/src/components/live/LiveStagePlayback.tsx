import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ActivityIndicator, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { useVideoPlayer, VideoView, isPictureInPictureSupported, type VideoPlayer } from 'expo-video';
import { setStageAudioOutputEnabled, leaveStage } from 'expo-realtime-ivs-broadcast';
import { useLiveStagePlayback, type LivePlaybackMode } from '../../hooks/useLiveStagePlayback';
import { useHlsLiveEdgeSeek } from '../../hooks/useHlsLiveEdgeSeek';
import { useStageRemotePictureInPicture } from '../../hooks/useStageRemotePictureInPicture';
import { leaveStageSerialized } from '../../lib/ivsStageGate';
import {
  isBuyerStageWebrtcRejoinBlocked,
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
  LIVE_BACKGROUND_SUSPEND_DWELL_MS,
  LIVE_PIP_RETRY_DELAYS_MS,
  LIVE_VIDEO_STICKY_MS,
  isLivePictureInPictureAppState,
  shouldAttemptLivePictureInPicture,
  shouldMuteHlsUnderLiveWebrtc,
  shouldPrepareLivePictureInPicture,
  shouldPromoteHlsOverStageDuringGap,
  shouldShowHlsLayerForLivePip,
  shouldUseStickyLiveVideoPaint,
  shouldWarmLiveHlsPipCompanion,
} from '../../lib/livePlaybackAppState';
import { isLivePlaybackCommerceHoldActive } from '../../lib/livePlaybackCommerceHold';
import { setLiveStagePipKeepAlive } from '../../lib/liveStagePipKeepAlive';
import { liveStageContentFitForStreamMode, liveStageContentFitForPlayback } from '../../lib/liveRoomViewport';
import { viewerLifecycleLog } from '../../lib/viewerLifecycleLog';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';
import { StageSubscriberVideo } from './StageSubscriberVideo';

/**
 * System PiP (swipe home → OS floating window):
 * - stage_webrtc: native IVS remote-stream PiP (the video buyers actually watch)
 * - channel_hls: expo-video PiP
 *
 * Manual QA: home swipe on WebRTC live; HLS-only live; PaymentSheet must not PiP;
 * return restores room; mute respected; no double audio; closing the PiP window's own X (both
 * stage_webrtc and channel_hls) stops video AND audio without a force-quit, and returning to the
 * show afterward re-initializes playback normally.
 *
 * stage_webrtc dismissal (native IVS): driven by `useStageRemotePictureInPicture`'s
 * `stagePipDismissed`, which is set from the real native PiP delegate distinction (restore-tap vs.
 * the window's own close/X — see `isStagePipUserDismissal`), not from AppState. A 2026-08 attempt
 * at this crashed in TestFlight (build 216) by deactivating the iOS audio session while the native
 * PiP controller was still armed; the fix now disables the PiP controller first (inside the hook,
 * on the real dismissal event) and only then lets this component deactivate Stage audio / leave
 * the Stage session — see the `stagePipDismissed` effect below.
 */
const LIVE_PICTURE_IN_PICTURE_ENABLED = true;

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
  /**
   * True when the room's realtime channel is connected. Passed straight through to
   * useLiveStagePlayback to back off the active-surface poll cadence while realtime is doing the
   * real work — see that hook's `realtimeConnected` doc comment.
   */
  realtimeConnected?: boolean;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  /** Override auto fit (cover for phone Stage, contain for OBS/HLS). */
  contentFit?: 'cover' | 'contain';
  onBroadcastGateChange?: (gate: LiveRoomBroadcastGate) => void;
  /**
   * Fires with the RAW polled `streamPaused` from GET /stream — deliberately not merged with
   * `realtimeStreamPaused`. The caller owns that merge (see `VerticalLiveFeed`'s
   * `realtimeStreamPaused` state) and needs the unmerged signal to reconcile a stale realtime
   * "paused" hint that never got its matching "unpaused" broadcast (dropped message / a
   * resubscribe race during the exact moment the host resumed — most likely right after a host
   * app crash + reconnect). The GET /stream poll here keeps running and self-heals regardless of
   * realtime delivery, so once it confirms unpaused, the parent can safely clear a stuck latch —
   * see this component's own `realtimeStreamPaused` doc comment above ("boolean overrides until
   * the next stream fetch confirms"), which this callback is what actually fulfills.
   */
  onPolledStreamPausedChange?: (paused: boolean) => void;
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
  realtimeConnected = false,
  muted,
  onMutedChange,
  contentFit: contentFitOverride,
  onBroadcastGateChange,
  onPolledStreamPausedChange,
}: Props) {
  const mode: LivePlaybackMode = playbackMode ?? (enabled ? 'active' : 'off');
  const isForeground = mode === 'active';
  // Neighbors (prefetch) keep their HLS mirror warm so switching to them is instant.
  const hlsWarm = mode === 'active' || mode === 'prefetch';
  // Set true once Stage reports a remote stream + we remount the native surface.
  // HLS stays under that surface until then so cold Stage→HLS mirrors don't blank the buyer.
  const [webrtcReady, setWebrtcReady] = useState(false);
  // Debounced: brief exit→return must not leave Stage (native crash). Only true after dwell.
  const [stageMediaSuspended, setStageMediaSuspended] = useState(false);
  // After a committed background leave, keep Stage subscribe off until playback parks on HLS
  // (or the first-frame watchdog clears the latch and remounts WebRTC).
  const [blockStageAfterBackgroundLeave, setBlockStageAfterBackgroundLeave] = useState(false);
  // Remount ExpoIVSRemoteStreamView after OS background — reusing the same native surface stays black.
  const [foregroundResumeNonce, setForegroundResumeNonce] = useState(0);
  /**
   * After first paint, hold "had video" briefly when frames drop so standby doesn't flash black
   * on Stage remount / brief disconnect. Cleared after LIVE_VIDEO_STICKY_MS or room change.
   */
  const [stickyVideoPaint, setStickyVideoPaint] = useState(false);
  /** Lift HLS over Stage while the native surface remounts (black until first frame). */
  const [stageRemountCover, setStageRemountCover] = useState(false);
  const prevStageSurfaceKeyRef = useRef<string | null>(null);
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const suspendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didCommitSuspendRef = useRef(false);
  const mainVideoRef = useRef<VideoView>(null);
  const pipRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isForegroundRef = useRef(isForeground);
  const roomIdRef = useRef(roomId);
  const mutedRef = useRef(muted);
  // Full computed "should this page's HLS audio be silent" state (buyer mute OR the WebRTC-takes-
  // audio case below) — kept current every render so `useHlsLiveEdgeSeek`'s poll loop can
  // re-assert it (see that hook's own comment for why this redundancy is needed on Android).
  const desiredHlsMutedRef = useRef(true);
  // Tracks whether THIS page instance was ever the one actually joined to Stage — see the
  // redundant-leave-on-unmount effect further down for why this guard matters (every pager page,
  // including neighbors that never joined, mounts its own LiveStagePlayback).
  const useWebrtcRef = useRef(false);
  isForegroundRef.current = isForeground;
  roomIdRef.current = roomId;
  mutedRef.current = muted;
  const [pipActive, setPipActive] = useState(false);
  /**
   * Home / app-switcher: lift HLS above Stage at full opacity so iOS can start
   * Picture-in-Picture. A covered / near-invisible companion cannot enter PiP.
   */
  const [pipSurfaceActive, setPipSurfaceActive] = useState(false);
  const [appBackgrounded, setAppBackgrounded] = useState(
    () => AppState.currentState === 'background',
  );
  // True once the buyer explicitly closes the OS PiP window (native X) while the app is still
  // backgrounded. Nothing is visibly playing the video at that point, so audio (HLS or Stage)
  // must stop — appBackgrounded staying true must not be read as "PiP is still up."
  const [pipDismissedWhileBackgrounded, setPipDismissedWhileBackgrounded] = useState(false);
  // Same idea, but latched from the native Stage `stagePipDismissed` signal (see the effect near
  // `player`). That flag is only true for one tick — cleared immediately after this component
  // reacts to it — so it can't gate the HLS-companion mute effect below, which re-runs whenever
  // `stageMediaSuspended` changes and would otherwise unmute + replay the companion right after
  // this effect paused it. This stays true for the rest of the background dwell instead.
  const [stageAudioDismissed, setStageAudioDismissed] = useState(false);
  const prevPipActiveRef = useRef(false);
  const playback = useLiveStagePlayback({
    roomId,
    playbackMode: mode,
    accessToken,
    refreshNonce,
    roomVisitNonce,
    realtimeConnected,
  });
  const stagePipReadyRef = useRef(false);

  // `setStageAudioOutputEnabled` is NOT a cheap flag flip: iOS deactivates/reactivates the whole
  // AVAudioSession (`session.setActive`), and Android mutes/unmutes the device's entire
  // STREAM_MUSIC channel. Either one produces an audible glitch/pop when it actually fires.
  // Several effects below recompute the desired enabled state and re-run on every dependency
  // change (appBackgrounded, pipSurfaceActive, stagePipReady, stagePipActive, isForeground, ...) —
  // several of which flip in quick succession during a single PiP-enter or PiP-return gesture.
  // One of those effects also unconditionally re-armed `enabled: true` in its cleanup on every
  // re-run, so a single gesture could fire true→false→true→false native calls within under a
  // second — audible as choppy/stuttering audio, independent of the double-audio-source bug
  // fixed separately in `muteForWebrtcAudio`. Route every call through this wrapper so only a
  // genuine change in the target value ever reaches the native layer.
  const stageAudioOutputEnabledRef = useRef<boolean | null>(null);
  const setStageAudioOutputEnabledDeduped = useCallback(
    (enabled: boolean, reason: string) => {
      if (stageAudioOutputEnabledRef.current === enabled) return;
      stageAudioOutputEnabledRef.current = enabled;
      viewerLifecycleLog('stage_audio_output_enabled', { roomId: roomIdRef.current, enabled, reason });
      void setStageAudioOutputEnabled(enabled).catch(() => {
        // Unknown native state after a failed call — allow the next divergent value through
        // rather than trusting a dedup value that may not actually be applied.
        stageAudioOutputEnabledRef.current = null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!blockStageAfterBackgroundLeave) return;
    // Parked on HLS/none, first frame painted, or watchdog cleared the leave latch for remount.
    if (
      playback.transport !== 'webrtc' ||
      playback.videoHasData ||
      !isBuyerStageWebrtcRejoinBlocked(roomId)
    ) {
      setBlockStageAfterBackgroundLeave(false);
    }
  }, [
    blockStageAfterBackgroundLeave,
    playback.transport,
    playback.videoHasData,
    playback.webrtcSubscribeEpoch,
    roomId,
  ]);

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
  // HLS (OBS + Stage composition mirrors) is almost always landscape — contain avoids crop-zoom.
  // WebRTC Stage from a phone stays cover. Override wins for both layers.
  const webrtcContentFit =
    contentFitOverride ?? liveStageContentFitForStreamMode(playback.stream?.streamMode);
  const hlsContentFit =
    contentFitOverride ??
    liveStageContentFitForPlayback({
      streamMode: playback.stream?.streamMode,
      transport: 'hls',
    });
  const contentFit = transport === 'hls' ? hlsContentFit : webrtcContentFit;
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

  // Raw polled value only — deliberately NOT the `streamPaused` above, which is already OR'd
  // with `realtimeStreamPaused`. See this callback's doc comment on `Props`.
  useEffect(() => {
    onPolledStreamPausedChange?.(playback.stream?.streamPaused === true);
  }, [onPolledStreamPausedChange, playback.stream?.streamPaused]);

  const streamSignalLive = streamHealth.toLowerCase() === 'live' || streamHealth.toLowerCase() === 'connecting';
  const roomLifecycleLive = roomStatus === 'live' || streamSignalLive;

  const playbackActive = isForeground;
  // Keep Stage subscribed while Host paused (TikTok/Whatnot/eBay). Unmounting Stage on pause
  // leave-latches buyers onto a dead HLS mirror and "Waiting for host video" after Play.
  const useWebrtc = transport === 'webrtc' && enabled && playbackActive;
  useWebrtcRef.current = useWebrtc;
  const webrtcReadyRef = useRef(false);
  webrtcReadyRef.current = webrtcReady;
  // In-room Stage owns pixels. Back→mini uses shared HLS warm player (pre-hoist path).
  const stageRemotePipEnabled =
    LIVE_PICTURE_IN_PICTURE_ENABLED && useWebrtc && webrtcReady && !streamPaused;
  const { stagePipReady, stagePipActive, stagePipDismissed, clearStagePipDismissed } =
    useStageRemotePictureInPicture({
      enabled: stageRemotePipEnabled,
      roomId,
    });
  stagePipReadyRef.current = stagePipReady || stagePipActive;
  useEffect(() => {
    setLiveStagePipKeepAlive(stagePipReady || stagePipActive);
    return () => {
      setLiveStagePipKeepAlive(false);
    };
  }, [stagePipReady, stagePipActive]);

  const hlsAttachable = Boolean(playbackUrl && shouldAttachHlsPlayback(streamHealth, playbackUrl));
  // Hold the HLS mirror under WebRTC until Stage connects (and as a cold-mirror safety net while
  // waiting for first paint). Neighbors buffer HLS muted+hidden for instant switching.
  const webrtcUpgradeHold = useWebrtc && !webrtcReady && !streamPaused;
  const warmPipCompanion =
    LIVE_PICTURE_IN_PICTURE_ENABLED &&
    shouldWarmLiveHlsPipCompanion({
      playbackActive,
      useWebrtc,
      roomLifecycleLive,
      playbackUrl,
    });
  const attachHls =
    !streamPaused &&
    hlsAttachable &&
    ((transport === 'hls' && hlsWarm) ||
      webrtcUpgradeHold ||
      (useWebrtc && !playback.videoHasData) ||
      warmPipCompanion ||
      (LIVE_PICTURE_IN_PICTURE_ENABLED && (pipActive || appBackgrounded) && hlsAttachable));

  // NOTE: Do NOT close a mini player here — in-app mini was removed; OS PiP owns home-swipe.

  useEffect(() => {
    if (!useWebrtc || !isForeground) setWebrtcReady(false);
  }, [useWebrtc, isForeground]);

  // New room in the pager: never keep the prior show's "WebRTC painted" flag (it hid HLS forever).
  useEffect(() => {
    setWebrtcReady(false);
    setStickyVideoPaint(false);
    setStageRemountCover(false);
    prevStageSurfaceKeyRef.current = null;
  }, [roomId]);

  // Grace window after first paint — brief gaps must not flash the dark standby overlay.
  useEffect(() => {
    if (playback.videoHasData) {
      setStickyVideoPaint(true);
      return;
    }
    const id = setTimeout(() => {
      setStickyVideoPaint(false);
    }, LIVE_VIDEO_STICKY_MS);
    return () => clearTimeout(id);
  }, [playback.videoHasData]);

  // Native Stage surface remount (subscribe epoch / foreground resume) paints black until first
  // frame — lift HLS over it for that gap.
  useEffect(() => {
    if (!useWebrtc) {
      prevStageSurfaceKeyRef.current = null;
      setStageRemountCover(false);
      return;
    }
    const surfaceKey = `${playback.webrtcSubscribeEpoch}:${foregroundResumeNonce}`;
    const prev = prevStageSurfaceKeyRef.current;
    prevStageSurfaceKeyRef.current = surfaceKey;
    if (prev != null && prev !== surfaceKey && webrtcReady) {
      setStageRemountCover(true);
    }
  }, [useWebrtc, playback.webrtcSubscribeEpoch, foregroundResumeNonce, webrtcReady]);

  useEffect(() => {
    viewerLifecycleLog(isForeground ? 'screen_focused' : 'screen_blurred', {
      roomId,
      mode,
      transport,
    });
  }, [isForeground, mode, roomId, transport]);

  const handleWebrtcConnected = useCallback(() => {
    // Remote participant + stream present. Remounted surface (subscribeEpoch / foregroundResumeNonce)
    // is the in-app equivalent of force-quit for a black IVS view. Clear waiting so buyers aren't
    // stuck on "Waiting for host video" when Stage is live and HLS is still cold.
    setWebrtcReady(true);
    setStageRemountCover(false);
    playback.onVideoReady();
  }, [playback.onVideoReady]);

  const handleWebrtcDisconnected = useCallback(() => {
    // Stage remote dropped — promote HLS immediately (don't wait for reconnect UI delay).
    setStageRemountCover(true);
    playback.onWebrtcDisconnected();
  }, [playback.onWebrtcDisconnected]);

  const handleWebrtcFailed = useCallback(
    (reason: string) => {
      setStageRemountCover(true);
      playback.onWebrtcFailed(reason);
    },
    [playback.onWebrtcFailed],
  );

  const hlsPlayerSetup = (p: VideoPlayer) => {
    p.loop = false;
    p.muted = muted;
    p.volume = 1;
    // Foreground surface takes exclusive audio focus so live HLS isn't ducked; warm neighbor
    // buffers mix so they don't steal the audio session from the active show.
    p.audioMixingMode = isForeground ? 'doNotMix' : 'mixWithOthers';
    p.staysActiveInBackground = LIVE_PICTURE_IN_PICTURE_ENABLED;
    p.bufferOptions = {
      preferredForwardBufferDuration: 1,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 0.5,
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
  const playerRef = useRef(player);
  playerRef.current = player;

  useHlsLiveEdgeSeek(player, attachHls && playback.videoHasData, desiredHlsMutedRef);

  // Detect the expo-video PiP window being explicitly stopped (buyer tapped its own X) while
  // still backgrounded. `appBackgrounded` alone stays true either way, so it can't tell us this
  // happened — only the start→stop transition on `pipActive` can.
  useEffect(() => {
    const wasActive = prevPipActiveRef.current;
    prevPipActiveRef.current = pipActive;
    if (wasActive && !pipActive && (appBackgrounded || pipSurfaceActive)) {
      setPipDismissedWhileBackgrounded(true);
    } else if (pipActive) {
      setPipDismissedWhileBackgrounded(false);
    }
  }, [pipActive, appBackgrounded, pipSurfaceActive]);
  useEffect(() => {
    if (!appBackgrounded && !pipSurfaceActive) {
      setPipDismissedWhileBackgrounded(false);
      setStageAudioDismissed(false);
    }
  }, [appBackgrounded, pipSurfaceActive]);

  // Native Stage (WebRTC) PiP window explicitly closed via its own X — `stagePipDismissed` only
  // fires for that real native dismissal, never for a restore-tap (see `isStagePipUserDismissal`).
  // `useStageRemotePictureInPicture` has already disabled the PiP controller by this point; finish
  // the teardown here: stop Stage audio, leave the Stage session (stops WebRTC video + audio at
  // the source, same path as a committed background suspend), and quiet the HLS companion so
  // nothing keeps playing into the backgrounded void. Marking the suspend as committed lets the
  // existing AppState 'active' handler remount Stage fresh when the buyer reopens the app.
  useEffect(() => {
    if (!stagePipDismissed) return;
    if (isLivePlaybackCommerceHoldActive()) {
      clearStagePipDismissed();
      return;
    }
    setStageAudioOutputEnabledDeduped(false, 'stage_pip_dismissed');
    didCommitSuspendRef.current = true;
    setStageMediaSuspended(true);
    setStageAudioDismissed(true);
    try {
      player.pause();
      player.muted = true;
    } catch {
      /* player may be released during teardown */
    }
    viewerLifecycleLog('stage_pip_dismissed_teardown', { roomId });
    clearStagePipDismissed();
  }, [stagePipDismissed, clearStagePipDismissed, player, roomId, setStageAudioOutputEnabledDeduped]);

  useEffect(() => {
    if (!attachHls) return;
    // Prefer Stage audio when joined (lower latency) but keep HLS video as the visible safety net
    // until webrtcReady flips the layer order. In PiP / background, HLS is the only audible path —
    // unless the buyer just closed that PiP window, in which case nothing is visible and we must
    // mute + pause rather than keep playing into the void.
    const dismissedWhileBackgrounded = pipDismissedWhileBackgrounded || stageAudioDismissed;
    // `shouldMuteHlsUnderLiveWebrtc`'s `pipActive` param means "native Stage remote PiP is
    // genuinely active" (see its doc comment) — it must be `stagePipActive`, not the local
    // `pipActive` state, which only tracks the OLD expo-video/HLS PiP surface and is never true
    // while Stage remote PiP is what's actually showing (Stage PiP is preferred whenever
    // available; HLS PiP is only a fallback — see `attemptHlsPictureInPicture`'s
    // `if (stagePipReadyRef.current) return;` guard). Passing the wrong flag here meant this
    // branch never fired during a real Stage PiP session, so HLS stayed unmuted the entire time
    // the buyer was in the mini viewer — playing at the same time as Stage's own native audio
    // output (`setStageAudioOutputEnabled`), which is exactly the garbled/choppy "echo" audio
    // this function's doc comment describes, and the residual audio briefly surviving the
    // return to full-screen while state settles back to the terminal `webrtcReady && useWebrtc`
    // mute case below.
    //
    // `usingStagePip: stagePipReady || stagePipActive` — not just `stagePipActive` — closes the
    // narrower gap right at the swipe itself: `appBackgrounded` flips true pre-emptively (iOS
    // `inactive`) before the native controller confirms `started`, and in that window `pipActive`
    // is still false while Stage audio is still live. `stagePipReady` is armed well before any
    // background transition (see `useStageRemotePictureInPicture`), so it's true for that whole
    // gap and keeps the HLS mirror muted through it — matching the audio-output effect above,
    // which already used `stagePipReady || stagePipActive` for the same reason.
    const usingStagePip = stagePipReady || stagePipActive;
    const muteForWebrtcAudio = shouldMuteHlsUnderLiveWebrtc({
      webrtcReady,
      useWebrtc,
      stageSuspended: stageMediaSuspended,
      pipActive: pipActive || stagePipActive,
      appBackgrounded: appBackgrounded || pipSurfaceActive,
      pipDismissedWhileBackgrounded: dismissedWhileBackgrounded,
      usingStagePip,
    });
    desiredHlsMutedRef.current = muted || muteForWebrtcAudio;
    try {
      player.muted = muted || muteForWebrtcAudio;
      player.volume = muted || muteForWebrtcAudio ? 0 : 1;
      // PiP / home-swipe needs exclusive playback audio session (moviePlayback).
      player.audioMixingMode =
        isForeground || pipSurfaceActive || pipActive || appBackgrounded ? 'doNotMix' : 'mixWithOthers';
      player.staysActiveInBackground = LIVE_PICTURE_IN_PICTURE_ENABLED;
      if (dismissedWhileBackgrounded) {
        player.pause();
      } else if (pipSurfaceActive || pipActive || appBackgrounded) {
        player.play();
      }
    } catch {
      /* released player during handoff */
    }
  }, [
    attachHls,
    muted,
    isForeground,
    player,
    webrtcReady,
    useWebrtc,
    stageMediaSuspended,
    pipActive,
    stagePipActive,
    stagePipReady,
    appBackgrounded,
    pipSurfaceActive,
    pipDismissedWhileBackgrounded,
    stageAudioDismissed,
  ]);

  // WebRTC Stage audio ignores expo-video `muted` — apply the buyer mute toggle via the patched
  // Stage audio-output gate. NEVER deactivate Stage audio while native Stage PiP is ready/active —
  // setActive(false) kills the PiP source (and has caused native crashes when called in that state).
  // HLS-surrogate PiP still mutes Stage.
  //
  // `usingStagePip` below (false → deactivate) is now SAFE to act on: `useStageRemotePictureInPicture`
  // only flips `stagePipReady` false AFTER it has already called `disablePictureInPicture()` on a
  // genuine window dismissal (never on a restore-tap — see `isStagePipUserDismissal`), so this
  // effect's `setStageAudioOutputEnabled(false)` below can no longer race the still-armed PiP
  // controller. A 2026-08 attempt added that same call here without that ordering guarantee —
  // `stagePipReady` could still be true at the moment it ran — and crashed in TestFlight (build
  // 216). The primary teardown (leaving the Stage session, pausing the HLS companion) happens in
  // the `stagePipDismissed` effect above; this effect is a second, now-safe layer for audio.
  //
  // No cleanup here on purpose: this used to unconditionally re-enable audio in its cleanup on
  // EVERY re-run (not just a genuine exit from the "stageLive" branch), so a single PiP-enter or
  // PiP-return gesture — which flips several of this effect's dependencies in quick succession —
  // could fire several true/false native toggles within under a second. Each branch below already
  // computes the fully-correct desired state for the current inputs on every render, and
  // `setStageAudioOutputEnabledDeduped` only lets an actual change reach native, so no separate
  // "restore" step is needed when deps change. A real unmount (component leaving entirely) still
  // needs its own restore — see the dedicated effect right below this one.
  useEffect(() => {
    const usingStagePip = stagePipReady || stagePipActive;
    if (!usingStagePip && (appBackgrounded || pipActive || pipSurfaceActive)) {
      setStageAudioOutputEnabledDeduped(false, 'backgrounded_no_stage_pip');
      return;
    }
    // Buyer backed out to a different in-app screen/tab (not an OS background — `appBackgrounded`
    // stays false for that). `resolvePlaybackMode`'s "soft keep on blur" drops this page to
    // 'prefetch' instead of tearing Stage down, so it can resume instantly if the buyer comes
    // right back — but that means `isForeground` goes false while Stage can still be the one that
    // was actually joined a moment ago. The branch below only ever *enables* audio when
    // `isForeground`; it never explicitly disables it for "not foreground, but also not
    // backgrounded/PiP" — so a Stage session already playing when the buyer navigated away kept
    // outputting audio with nothing to stop it (reported as "backed out and it kept playing until
    // I closed the app"). Explicitly silence it here for that gap.
    if (!usingStagePip && !isForeground) {
      setStageAudioOutputEnabledDeduped(false, 'screen_not_focused');
      return;
    }
    const stageLive = useWebrtc && !stageMediaSuspended;
    if (!stageLive) {
      if (isForeground) {
        setStageAudioOutputEnabledDeduped(true, 'foreground_stage_not_live');
      }
      return;
    }
    setStageAudioOutputEnabledDeduped(!muted, 'stage_live');
  }, [
    useWebrtc,
    stageMediaSuspended,
    muted,
    isForeground,
    appBackgrounded,
    pipActive,
    pipSurfaceActive,
    stagePipReady,
    stagePipActive,
    setStageAudioOutputEnabledDeduped,
  ]);

  // Unmount-only safety net: if this playback surface goes away entirely (pager swipe to a
  // different show, screen unmount) while the effect above had left Stage audio disabled, restore
  // it so we don't leave the shared audio session/stream muted behind us.
  useEffect(() => {
    return () => {
      setStageAudioOutputEnabledDeduped(true, 'unmount_restore');
    };
  }, [setStageAudioOutputEnabledDeduped]);

  // Redundant, forceful leave on a REAL unmount of this playback surface (buyer backed all the way
  // out of the live room — the screen itself leaves the navigation stack, not just loses focus).
  // `StageSubscriberVideo`/`useMobileStageSubscribe` already leave the Stage session when their own
  // `active` prop goes false, but that depends on this component staying mounted long enough for a
  // render with the updated prop to land before the whole tree is torn down — not guaranteed during
  // a stack pop. Buyers reported Stage audio continuing to play until they force-closed the app
  // after backing out, which matches exactly that gap.
  //
  // GUARDED by `useWebrtcRef`: the Stage SDK is a process-wide singleton (see
  // `StageSubscriberVideo`'s own comment) — every pager page, including warm neighbors that never
  // joined Stage, mounts its own `LiveStagePlayback` and will eventually unmount too (falling out of
  // the warm radius as the buyer scrolls on). An unconditional `leaveStage()` here would risk a
  // neighbor's unmount kicking the *actually* active page off Stage. Only call it if this specific
  // page instance was the one that had `useWebrtc` true at some point — if the normal `active`-prop
  // path already left cleanly beforehand, `useWebrtcRef.current` is already false here and this is a
  // no-op. Declared after the effect above so its cleanup (leave the Stage session) runs before that
  // one's (restore the shared audio-output gate) on unmount, since cleanups fire in reverse
  // declaration order.
  useEffect(() => {
    return () => {
      if (useWebrtcRef.current) {
        void leaveStageSerialized(() => leaveStage());
      }
    };
  }, []);

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
    const clearPipRetries = () => {
      for (const t of pipRetryTimersRef.current) clearTimeout(t);
      pipRetryTimersRef.current = [];
    };
    let preparePipTimer: ReturnType<typeof setTimeout> | null = null;
    const clearPreparePip = () => {
      if (preparePipTimer != null) {
        clearTimeout(preparePipTimer);
        preparePipTimer = null;
      }
    };
    /** HLS/expo-video PiP only — never used when native Stage remote PiP is ready. */
    const attemptHlsPictureInPicture = () => {
      if (!LIVE_PICTURE_IN_PICTURE_ENABLED) return;
      if (stagePipReadyRef.current) return;
      if (isLivePlaybackCommerceHoldActive()) {
        viewerLifecycleLog('commerce_hold_skip_pip', { roomId: roomIdRef.current });
        return;
      }
      if (!isPictureInPictureSupported()) {
        viewerLifecycleLog('pip_unsupported', { roomId: roomIdRef.current });
        return;
      }
      clearPipRetries();
      setStageAudioOutputEnabledDeduped(false, 'hls_pip_fallback_start');
      try {
        const p = playerRef.current;
        const userMuted = mutedRef.current;
        p.muted = userMuted;
        p.volume = userMuted ? 0 : 1;
        p.play();
        p.targetOffsetFromLive = 0.35;
      } catch {
        /* ignore */
      }
      for (const delayMs of LIVE_PIP_RETRY_DELAYS_MS) {
        const timer = setTimeout(() => {
          if (!isLivePictureInPictureAppState(prevAppStateRef.current)) return;
          if (isLivePlaybackCommerceHoldActive()) return;
          if (stagePipReadyRef.current) return;
          const view = mainVideoRef.current;
          if (!view) {
            viewerLifecycleLog('pip_retry_no_view', { roomId: roomIdRef.current, delayMs });
            return;
          }
          void view
            .startPictureInPicture()
            .then(() => {
              viewerLifecycleLog('hls_pip_started', { roomId: roomIdRef.current, delayMs });
              clearPipRetries();
            })
            .catch((err) => {
              viewerLifecycleLog('hls_pip_start_failed', {
                roomId: roomIdRef.current,
                delayMs,
                message: err instanceof Error ? err.message : String(err),
              });
            });
        }, delayMs);
        pipRetryTimersRef.current.push(timer);
      }
    };

    const sub = AppState.addEventListener('change', (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;
      const usingStagePip = stagePipReadyRef.current;

      if (shouldPrepareLivePictureInPicture(next, prev)) {
        clearPreparePip();
        if (isLivePlaybackCommerceHoldActive()) return;
        // WebRTC already painting → Stage remote PiP owns home. Do not promote HLS / leave Stage.
        if (usingStagePip || webrtcReadyRef.current) {
          setAppBackgrounded(true);
          viewerLifecycleLog('stage_pip_prepare_home', { roomId: roomIdRef.current });
          preparePipTimer = setTimeout(() => {
            preparePipTimer = null;
            if (prevAppStateRef.current === 'active') {
              setAppBackgrounded(false);
            }
          }, 40);
          return;
        }
        setPipSurfaceActive(true);
        setAppBackgrounded(true);
        attemptHlsPictureInPicture();
        preparePipTimer = setTimeout(() => {
          preparePipTimer = null;
          if (prevAppStateRef.current === 'active') {
            setPipSurfaceActive(false);
            setAppBackgrounded(false);
            return;
          }
          attemptHlsPictureInPicture();
        }, 40);
        return;
      }

      if (next === 'background') {
        clearPreparePip();
        clearSuspendTimer();
        if (isLivePlaybackCommerceHoldActive()) {
          viewerLifecycleLog('commerce_hold_skip_suspend', { roomId: roomIdRef.current });
          return;
        }
        setAppBackgrounded(true);
        // Keep Stage subscribed while WebRTC was live — leaving after 700ms causes the
        // black/reconnect cut on home swipe. Stage remote PiP needs the session intact.
        if (usingStagePip || webrtcReadyRef.current) {
          viewerLifecycleLog('stage_pip_skip_suspend', { roomId: roomIdRef.current });
          return;
        }
        setPipSurfaceActive(true);
        if (shouldAttemptLivePictureInPicture(next, prev)) {
          attemptHlsPictureInPicture();
        }
        suspendTimerRef.current = setTimeout(() => {
          suspendTimerRef.current = null;
          if (prevAppStateRef.current !== 'background') return;
          if (isLivePlaybackCommerceHoldActive()) {
            viewerLifecycleLog('commerce_hold_skip_suspend', { roomId: roomIdRef.current, at: 'timer' });
            return;
          }
          if (stagePipReadyRef.current || webrtcReadyRef.current) return;
          didCommitSuspendRef.current = true;
          setStageMediaSuspended(true);
        }, LIVE_BACKGROUND_SUSPEND_DWELL_MS);
        return;
      }

      if (next === 'active') {
        clearPreparePip();
        setPipSurfaceActive(false);
        setAppBackgrounded(false);
        clearSuspendTimer();
        clearPipRetries();
        const wasSuspended = didCommitSuspendRef.current;
        didCommitSuspendRef.current = false;
        setStageMediaSuspended(false);
        // Only remount Stage after a real suspend — keep-alive / Stage PiP return must stay fluid.
        if (wasSuspended && prev !== 'active' && !stagePipReadyRef.current) {
          setBlockStageAfterBackgroundLeave(true);
          setForegroundResumeNonce((n) => n + 1);
        }
      }
    });
    return () => {
      clearSuspendTimer();
      clearPipRetries();
      clearPreparePip();
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

  const videoPaintForUi = shouldUseStickyLiveVideoPaint({
    videoHasData: playback.videoHasData,
    stickyActive: stickyVideoPaint,
  });

  const surface =
    useWebrtc
      ? videoPaintForUi
        ? 'live'
        : playback.reconnecting
          ? 'reconnecting'
          : roomLifecycleLive
            ? 'connecting'
            : 'offline'
      : // HLS surface uses sticky paint so health/attach flaps don't flash connecting→standby.
        videoPaintForUi && hlsSurface === 'connecting'
          ? 'live'
          : videoPaintForUi && hlsSurface === 'loading'
            ? 'live'
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
  // Keep HLS mounted under Stage for failover + PiP warm companion. Neighbors never render a VideoView.
  const showHlsLayer = shouldShowHlsLayerForLivePip({
    attachHls,
    playbackActive: isForeground,
    surfaceError: surface === 'error',
    webrtcReady,
    warmPipCompanion,
    pipActive,
    appBackgrounded,
  });
  /** When Stage is painted, keep the HLS companion under it — unless home-swipe needs HLS PiP. */
  const promoteHlsForOsPip =
    LIVE_PICTURE_IN_PICTURE_ENABLED &&
    pipSurfaceActive &&
    !stagePipReady &&
    !stagePipActive;
  const promoteHlsForStageGap = shouldPromoteHlsOverStageDuringGap({
    useWebrtc,
    webrtcReady,
    stageRemountCover,
    videoHasData: playback.videoHasData,
  });
  const hlsCompanionUnderWebrtc =
    showHlsLayer &&
    showWebrtcLayer &&
    webrtcReady &&
    !promoteHlsForOsPip &&
    !promoteHlsForStageGap;
  const showVideoLayer = showWebrtcLayer || (showHlsLayer && !hlsCompanionUnderWebrtc);
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
    (!showVideoLayer || !videoPaintForUi || surface === 'offline');
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
      (roomLifecycleLive && !videoPaintForUi));

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
    // Only a real live show can be "reconnecting" — a scheduled show that hasn't gone live yet
    // has nothing to reconnect to. A premature WebRTC/HLS attach attempt failing here must fall
    // through to the scheduled-phase messaging below, not claim we lost a connection we never had.
    if (surface === 'reconnecting' && roomLifecycleLive) {
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
    if (roomLifecycleLive && (surface === 'connecting' || surface === 'loading' || !videoPaintForUi)) {
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

      {hlsCompanionUnderWebrtc ? (
        <>
          {/* HLS under Stage — Stage remote PiP captures the visible WebRTC view. */}
          <VideoView
            ref={mainVideoRef}
            player={player}
            style={styles.hlsPipCompanion}
            contentFit={hlsContentFit}
            nativeControls={false}
            allowsPictureInPicture={false}
            startsPictureInPictureAutomatically={false}
            onPictureInPictureStart={() => setPipActive(true)}
            onPictureInPictureStop={() => setPipActive(false)}
            collapsable={false}
          />
          <StageSubscriberVideo
            roomId={roomId}
            accessToken={accessToken}
            active={useWebrtc && !stageMediaSuspended && !blockStageAfterBackgroundLeave}
            hostPaused={streamPaused}
            latchRejoinOnLeave={stageMediaSuspended || blockStageAfterBackgroundLeave}
            refreshNonce={refreshNonce}
            subscribeEpoch={playback.webrtcSubscribeEpoch}
            foregroundResumeNonce={foregroundResumeNonce}
            contentFit={webrtcContentFit}
            onConnected={handleWebrtcConnected}
            onFailed={handleWebrtcFailed}
            onDisconnected={handleWebrtcDisconnected}
          />
        </>
      ) : (
        <>
          {showWebrtcLayer ? (
            <StageSubscriberVideo
              roomId={roomId}
              accessToken={accessToken}
              active={useWebrtc && !stageMediaSuspended && !blockStageAfterBackgroundLeave}
              hostPaused={streamPaused}
              latchRejoinOnLeave={stageMediaSuspended || blockStageAfterBackgroundLeave}
              refreshNonce={refreshNonce}
              subscribeEpoch={playback.webrtcSubscribeEpoch}
              foregroundResumeNonce={foregroundResumeNonce}
              contentFit={webrtcContentFit}
              onConnected={handleWebrtcConnected}
              onFailed={handleWebrtcFailed}
              onDisconnected={handleWebrtcDisconnected}
            />
          ) : null}
          {showHlsLayer ? (
            <VideoView
              ref={mainVideoRef}
              player={player}
              style={styles.video}
              contentFit={hlsContentFit}
              nativeControls={false}
              allowsPictureInPicture={LIVE_PICTURE_IN_PICTURE_ENABLED}
              startsPictureInPictureAutomatically={LIVE_PICTURE_IN_PICTURE_ENABLED}
              onPictureInPictureStart={() => setPipActive(true)}
              onPictureInPictureStop={() => setPipActive(false)}
              collapsable={false}
            />
          ) : null}
        </>
      )}

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
  /** Warm HLS under Stage for mini-player handoff — Stage native PiP owns home-swipe. */
  hlsPipCompanion: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
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
