import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchHostConsole,
  fetchHostStream,
  fetchLiveRoomForHost,
  fetchSellerLiveReadiness,
  patchLiveRoomAction,
  provisionHostStream,
  rotateHostStreamKey,
  type HostStreamPayload,
  type LiveRoomHostDetail,
} from '../api/liveHostRepository';
import { useAuth } from '../auth/AuthContext';
import { SellerLiveHostView } from '../components/seller/liveOverlay/SellerLiveHostView';
import { LiveConsoleWarningBanner } from '../components/seller/liveConsole/LiveConsoleWarningBanner';
import { sanitizeLiveError, type SanitizedLiveError } from '../components/seller/liveConsole/liveConsoleErrors';
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

  useEffect(() => {
    logVaultCommandCenter('host_screen_mount', { roomId, hasToken: Boolean(token) });
  }, [roomId, token]);

  const [room, setRoom] = useState<LiveRoomHostDetail | null>(null);
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
    logVaultCommandCenter('room_fetch_start', { roomId, endpoint: 'GET /api/live-rooms/:id' });
    try {
      const r = await fetchLiveRoomForHost(token, roomId);
      setRoom(r);
      logVaultCommandCenter('room_fetch_ok', { roomId: r.id, status: r.status, roomType: r.roomType });
      return r;
    } catch (e) {
      logVaultCommandCenter('room_fetch_failed', {
        roomId,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }, [roomId, token]);

  const reloadConsoleMetrics = useCallback(async () => {
    if (!token) return;
    logVaultCommandCenter('host_console_fetch_start', { roomId, endpoint: 'GET /api/live-rooms/:id/host-console' });
    try {
      const c = await fetchHostConsole(token, roomId);
      setThumbnailUrl(c.room.thumbnailUrl ?? null);
    } catch (e) {
      logVaultCommandCenter('host_console_fetch_failed', {
        roomId,
        error: e instanceof Error ? e.message : String(e),
      });
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
      await reloadConsoleMetrics();
    } catch (e) {
      setRoomError(sanitizeLiveError(e, 'room'));
      throw e;
    }
  }, [reloadConsoleMetrics, reloadRoom, reloadStream, token]);

  const stagePublish = useMobileStagePublish({
    roomId,
    accessToken: token ?? '',
    previewEnabled: stageWebrtcEnabled && Boolean(token) && !loading && Boolean(room),
    onBroadcastStarted: async () => {
      try {
        const current = room ?? (await reloadRoom());
        if (current?.status !== 'scheduled') return;
        await markRoomLiveOnServer();
        await notifyLiveDiscoveryChanged();
      } catch {
        /* onStartBroadcast surfaces errors to the host UI */
      }
    },
    onStreamRefresh: () => void reloadStream(true),
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
        await reloadRoom();
      } catch (e) {
        if (!cancelled) {
          setRoomError(sanitizeLiveError(e, 'room'));
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;
      try {
        const readiness = await fetchSellerLiveReadiness(token);
        if (!cancelled) {
          setReadinessBlocked(readiness.canGoLive ? null : readiness.issues);
        }
      } catch {
        if (!cancelled) setReadinessBlocked(null);
      }
      if (!cancelled) await reloadStream(false);
      if (!cancelled) await reloadConsoleMetrics();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadConsoleMetrics, reloadRoom, reloadStream, token]);

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

  const markRoomLiveOnServer = useCallback(async () => {
    if (!token) return;
    const current = room ?? (await reloadRoom());
    if (current?.status !== 'scheduled') return;
    await patchLiveRoomAction(token, roomId, 'start');
  }, [room, roomId, token, reloadRoom]);

  const onStartBroadcast = async () => {
    if (!token) return;
    setBusy('start');
    setRoomError(null);
    try {
      // Publish to IVS Stage first so streamHealth is live before buyers attach playback.
      if (stageWebrtcEnabled) {
        await stagePublish.start();
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

  const onStopBroadcast = async () => {
    if (!token) return;
    setBusy('refresh');
    try {
      await stagePublish.stop();
      await reloadStream(true);
    } catch (e) {
      setStreamWarning(sanitizeLiveError(e, 'stream'));
    } finally {
      setBusy(null);
    }
  };

  const onStartShow = async () => {
    if (!token) return;
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
    if (!token) return;
    setBusy('end');
    try {
      await stagePublish.releaseCamera();
      await patchLiveRoomAction(token, roomId, 'end');
      await notifyLiveDiscoveryChanged();
      await reload();
    } catch (e) {
      setRoomError(sanitizeLiveError(e, 'room'));
    } finally {
      setBusy(null);
    }
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

  const serverUrl = ingestEndpoint ?? stream?.ingestEndpoint ?? null;
  const streamKey = oneTimeKey;

  const streamConnected = useMemo(() => {
    if (stagePublish.phase === 'live') return true;
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
              void reload();
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
          cameraPermissionState: stagePublish.permissionState,
          cameraPermissionError: stagePublish.permissionError,
          cameraPermissionRetrying,
          onRetryCameraPermission: () => void onRetryCameraPermission(),
          onFlipCamera,
          onStartBroadcast: () => void onStartBroadcast(),
          onStopBroadcast: () => void onStopBroadcast(),
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
