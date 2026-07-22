import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchHostConsole,
  fetchHostStream,
  fetchSellerLiveReadiness,
  hostConsoleRoomToDetail,
  patchLiveRoomAction,
  patchLiveRoomStreamPaused,
  provisionHostStream,
  rotateHostStreamKey,
  type HostConsolePayload,
  type HostStreamPayload,
  type LiveRoomHostDetail,
} from '../api/liveHostRepository';
import { useAuth } from '../auth/AuthContext';
import { SellerLiveHostView } from '../components/seller/liveOverlay/SellerLiveHostView';
import { LiveConsoleWarningBanner } from '../components/seller/liveConsole/LiveConsoleWarningBanner';
import { sanitizeLiveError, type SanitizedLiveError } from '../components/seller/liveConsole/liveConsoleErrors';
import { useKeepScreenAwakeWhileFocused } from '../hooks/useKeepScreenAwakeWhileFocused';
import { useMobileStagePublish } from '../hooks/useMobileStagePublish';
import { isStageWebrtcEnabled } from '../lib/liveStreamPlayback';
import { logVaultCommandCenter } from '../lib/logVaultCommandCenterFlow';
import { notifyLiveDiscoveryChanged } from '../lib/notifyLiveDiscoveryChanged';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerHostRoom'>;

export function SellerHostRoomScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const roomId = route.params.roomId;

  useKeepScreenAwakeWhileFocused('live-room-host');

  useEffect(() => {
    logVaultCommandCenter('host_screen_mount', { roomId, hasToken: Boolean(token) });
  }, [roomId, token]);

  const [room, setRoom] = useState<LiveRoomHostDetail | null>(null);
  const [initialConsole, setInitialConsole] = useState<HostConsolePayload | null>(null);
  const [stream, setStream] = useState<HostStreamPayload | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [ingestEndpoint, setIngestEndpoint] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamChecking, setStreamChecking] = useState(false);
  const [busy, setBusy] = useState<'provision' | 'rotate' | 'refresh' | 'start' | 'end' | null>(null);
  const [roomError, setRoomError] = useState<SanitizedLiveError | null>(null);
  const [streamWarning, setStreamWarning] = useState<SanitizedLiveError | null>(null);
  const [readinessBlocked, setReadinessBlocked] = useState<string[] | null>(null);
  const [cameraPermissionRetrying, setCameraPermissionRetrying] = useState(false);

  const stageWebrtcEnabled = isStageWebrtcEnabled();

  const reloadRoom = useCallback(async () => {
    if (!token) return null;
    logVaultCommandCenter('host_console_fetch_start', { roomId, endpoint: 'GET /api/live-rooms/:id/host-console' });
    try {
      const consoleData = await fetchHostConsole(token, roomId, { force: true });
      const detail = hostConsoleRoomToDetail(consoleData.room);
      setRoom(detail);
      setInitialConsole(consoleData);
      setThumbnailUrl(consoleData.room.thumbnailUrl ?? null);
      logVaultCommandCenter('room_fetch_ok', { roomId: detail.id, status: detail.status, roomType: detail.roomType });
      return detail;
    } catch (e) {
      logVaultCommandCenter('host_console_fetch_failed', {
        roomId,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }, [roomId, token]);

  const reloadStream = useCallback(
    async (sync: boolean) => {
      if (!token) return;
      setStreamChecking(true);
      try {
        const s = await fetchHostStream(token, roomId, { sync });
        setStream(s.stream);
        if (s.stream.ingestEndpoint) setIngestEndpoint(s.stream.ingestEndpoint);
        setStreamWarning(null);
      } catch (e) {
        setStream(null);
        setStreamWarning(sanitizeLiveError(e, 'stream'));
      } finally {
        setStreamChecking(false);
      }
    },
    [roomId, token],
  );

  const reload = useCallback(async () => {
    if (!token) return;
    setRoomError(null);
    try {
      await reloadRoom();
      await reloadStream(false);
    } catch (e) {
      setRoomError(sanitizeLiveError(e, 'room'));
      throw e;
    }
  }, [reloadRoom, reloadStream, token]);

  const markRoomLiveOnServer = useCallback(async () => {
    if (!token) return;
    const current = room ?? (await reloadRoom());
    if (current?.status !== 'scheduled') return;
    await patchLiveRoomAction(token, roomId, 'start');
  }, [room, roomId, token, reloadRoom]);

  const stagePublish = useMobileStagePublish({
    roomId,
    accessToken: token ?? '',
    previewEnabled: stageWebrtcEnabled && Boolean(token) && !loading && Boolean(room),
    onBroadcastStarted: async () => {
      try {
        // Only runs after publish is confirmed — never mark the room live on a half-open Stage join.
        const current = room ?? (await reloadRoom());
        if (current?.status !== 'scheduled') return;
        await markRoomLiveOnServer();
        await notifyLiveDiscoveryChanged();
        await reloadRoom();
      } catch {
        /* onStartBroadcast surfaces errors to the host UI */
      }
    },
    onStreamRefresh: () => void reloadStream(true),
    onBackgroundAutoPause: () => {
      // Same signal as the Pause button so buyers see "Host paused" immediately.
      // Do not await reloadStream here — iOS suspends the app before that round-trip finishes.
      setStream((prev) => (prev ? { ...prev, streamPaused: true } : prev));
      if (!token) return;
      void patchLiveRoomStreamPaused(token, roomId, true).catch(() => {
        /* retried when host returns to the app while still paused */
      });
    },
  });

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setRoomError(sanitizeLiveError('Sign in to host this room.'));
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setRoomError(null);
      try {
        logVaultCommandCenter('room_fetch_start', { roomId, endpoint: 'GET /api/live-rooms/:id/host-console' });
        const [consoleData, streamPack] = await Promise.all([
          fetchHostConsole(token, roomId),
          fetchHostStream(token, roomId, { sync: false }).catch((e) => {
            if (!cancelled) {
              setStream(null);
              setStreamWarning(sanitizeLiveError(e, 'stream'));
            }
            return null;
          }),
        ]);
        if (cancelled) return;
        const detail = hostConsoleRoomToDetail(consoleData.room);
        setRoom(detail);
        setInitialConsole(consoleData);
        setThumbnailUrl(consoleData.room.thumbnailUrl ?? null);
        if (streamPack) {
          setStream(streamPack.stream);
          if (streamPack.stream.ingestEndpoint) setIngestEndpoint(streamPack.stream.ingestEndpoint);
          setStreamWarning(null);
        }
        setLoading(false);
        logVaultCommandCenter('room_fetch_ok', { roomId: detail.id, status: detail.status, roomType: detail.roomType });

        void fetchSellerLiveReadiness(token)
          .then((readiness) => {
            if (cancelled) return;
            setReadinessBlocked(readiness.canGoLive ? null : readiness.issues);
          })
          .catch(() => {
            if (!cancelled) setReadinessBlocked(null);
          });
      } catch (e) {
        if (!cancelled) {
          setRoomError(sanitizeLiveError(e, 'room'));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, token]);

  const onProvision = async () => {
    if (!token) return;
    setBusy('provision');
    setStreamWarning(null);
    setRevealKey(false);
    try {
      const p = await provisionHostStream(token, roomId);
      setStream(p.stream);
      setIngestEndpoint(p.ingestEndpoint);
      setOneTimeKey(p.oneTimeStreamKey);
    } catch (e) {
      setStreamWarning(sanitizeLiveError(e, 'stream'));
    } finally {
      setBusy(null);
    }
  };

  const onRotateKey = async () => {
    if (!token) return;
    setBusy('rotate');
    setRevealKey(false);
    try {
      const p = await rotateHostStreamKey(token, roomId);
      setStream(p.stream);
      setIngestEndpoint(p.ingestEndpoint);
      setOneTimeKey(p.oneTimeStreamKey);
    } catch (e) {
      setStreamWarning(sanitizeLiveError(e, 'stream'));
    } finally {
      setBusy(null);
    }
  };

  const endShow = useCallback(async () => {
    if (!token) return;
    setBusy('end');
    setRoomError(null);
    try {
      await stagePublish.releaseCamera();
      const current = room ?? (await reloadRoom());
      if (current?.status === 'live') {
        await patchLiveRoomAction(token, roomId, 'end');
      }
      await notifyLiveDiscoveryChanged();
      await reload();
    } catch (e) {
      setRoomError(sanitizeLiveError(e, 'room'));
    } finally {
      setBusy(null);
    }
  }, [room, roomId, reload, stagePublish, token, reloadRoom]);

  const onStartBroadcast = async (opts?: { force?: boolean }) => {
    if (!token) return;
    setBusy('start');
    setRoomError(null);
    try {
      if (stageWebrtcEnabled) {
        const published = await stagePublish.start(opts?.force ? { force: true } : undefined);
        if (!published) {
          // Keep room scheduled / do not announce live when the camera never went on air.
          return;
        }
      }
      const current = room ?? (await reloadRoom());
      if (current?.status === 'scheduled') {
        await markRoomLiveOnServer();
      }
      await notifyLiveDiscoveryChanged();
      await reload();
    } catch (e) {
      setRoomError(sanitizeLiveError(e, 'room'));
      if (stagePublish.isPublishing) {
        await stagePublish.stop().catch(() => undefined);
      }
    } finally {
      setBusy(null);
    }
  };

  // If the host re-opens the console while the show is still live (force-quit recovery), resume publish.
  // Skip when streamPaused — background/Pause already parked the show on Host Paused until Resume.
  // Do not fight a failed Go Live (broadcastError) or a start already in flight.
  const autoResumeRef = useRef(false);
  useEffect(() => {
    if (loading || !token || !room || !stageWebrtcEnabled) return;
    if (room.status !== 'live') return;
    if (stream?.streamPaused === true) return;
    if (stagePublish.phase !== 'idle') return;
    if (stagePublish.error) return;
    if (!stagePublish.localPreviewReady) return;
    if (busy === 'start' || busy === 'end') return;
    if (autoResumeRef.current) return;
    autoResumeRef.current = true;
    void onStartBroadcast();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once per live room open
  }, [
    loading,
    token,
    room?.status,
    room?.id,
    stream?.streamPaused,
    stageWebrtcEnabled,
    stagePublish.phase,
    stagePublish.error,
    stagePublish.localPreviewReady,
    busy,
  ]);

  const onStopBroadcast = async () => {
    await endShow();
  };

  const onPauseBroadcast = async () => {
    if (!token) return;
    setBusy('refresh');
    try {
      await patchLiveRoomStreamPaused(token, roomId, true);
      await stagePublish.pause();
      await reloadStream(false);
    } catch (e) {
      setStreamWarning(sanitizeLiveError(e, 'stream'));
    } finally {
      setBusy(null);
    }
  };

  const onResumeBroadcast = async () => {
    if (!token) return;
    setBusy('refresh');
    try {
      await patchLiveRoomStreamPaused(token, roomId, false);
      await stagePublish.resume();
      await reloadStream(false);
    } catch (e) {
      setStreamWarning(sanitizeLiveError(e, 'stream'));
    } finally {
      setBusy(null);
    }
  };

  const onStartShow = async () => {
    if (!token || stageWebrtcEnabled) return;
    setBusy('start');
    setRoomError(null);
    try {
      await markRoomLiveOnServer();
      await notifyLiveDiscoveryChanged();
      await reload();
    } catch (e) {
      setRoomError(sanitizeLiveError(e, 'room'));
    } finally {
      setBusy(null);
    }
  };

  const onEndShow = async () => {
    await endShow();
  };

  const onRetryCameraPermission = async () => {
    setCameraPermissionRetrying(true);
    try {
      await stagePublish.retryPreviewPermission();
    } finally {
      setCameraPermissionRetrying(false);
    }
  };

  const onFlipCamera = () => {
    void stagePublish.flipCamera();
  };

  const onToggleMicMute = () => {
    void stagePublish.toggleMicrophoneMute();
  };

  const serverUrl = ingestEndpoint ?? stream?.ingestEndpoint ?? null;
  const streamKey = oneTimeKey;

  const streamConnected = useMemo(() => {
    if (stagePublish.phase === 'live' || stagePublish.phase === 'paused') return true;
    const h = (stream?.streamHealth ?? '').toLowerCase();
    return h === 'live' || h === 'connecting';
  }, [stream?.streamHealth, stagePublish.phase]);

  const showCameraPreview = stagePublish.localPreviewReady;

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={styles.loadingLbl}>Opening command center…</Text>
      </View>
    );
  }

  if (!token || !room) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        {roomError ? (
          <LiveConsoleWarningBanner
            error={roomError}
            onRetry={() => {
              setRoomError(null);
              setLoading(true);
              void reload()
                .catch(() => undefined)
                .finally(() => setLoading(false));
            }}
          />
        ) : (
          <Text style={styles.loadingLbl}>
            Could not load vault event{roomId ? ` (${roomId.slice(0, 8)}…)` : ''}. Pull back and try again.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {streamWarning ? (
        <View style={[styles.streamBanner, { top: insets.top + 52 }]}>
          <LiveConsoleWarningBanner
            error={streamWarning}
            onRetry={() => void reloadStream(true)}
            retrying={streamChecking}
          />
        </View>
      ) : null}
      <SellerLiveHostView
        navigation={navigation}
        roomId={roomId}
        accessToken={token}
        initialConsole={initialConsole}
        host={{
          room,
          stream,
          thumbnailUrl,
          streamConnected,
          roomError,
          streamWarning,
          readinessBlocked,
          busy,
          revealKey,
          serverUrl,
          streamKey,
          onReload: () => void reload(),
          onReloadStream: (sync) => void reloadStream(sync),
          onProvision: () => void onProvision(),
          onRotateKey: () => void onRotateKey(),
          onToggleReveal: () => setRevealKey((v) => !v),
          onStartShow: () => void onStartShow(),
          onEndShow: () => void onEndShow(),
          broadcastPhase: stagePublish.phase,
          broadcastError: stagePublish.error,
          stageWebrtcEnabled,
          showCameraPreview,
          cameraFacing: stagePublish.cameraFacing,
          cameraZoom: stagePublish.cameraZoom,
          zoomStops: stagePublish.zoomStops,
          onSetCameraZoom: (factor: number) => void stagePublish.setCameraZoom(factor),
          cameraPermissionState: stagePublish.permissionState,
          cameraPermissionError: stagePublish.permissionError,
          cameraPermissionRetrying,
          onRetryCameraPermission: () => void onRetryCameraPermission(),
          onFlipCamera,
          microphoneMuted: stagePublish.microphoneMuted,
          onToggleMicMute,
          onStartBroadcast: () => void onStartBroadcast(),
          onRetryBroadcast: () => void onStartBroadcast({ force: true }),
          onStopBroadcast: () => void onStopBroadcast(),
          onPauseBroadcast: () => void onPauseBroadcast(),
          onResumeBroadcast: () => void onResumeBroadcast(),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingLbl: { color: colors.textMuted, fontSize: 14 },
  streamBanner: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 18,
  },
});
