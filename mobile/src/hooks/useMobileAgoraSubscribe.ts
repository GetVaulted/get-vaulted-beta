import { useEffect, useRef, useState } from 'react';
import type * as AgoraSdk from 'react-native-agora';
import { fetchAgoraViewerSession, type AgoraViewerSession } from '../api/agoraViewerRepository';
import { getAgoraEngine, loadAgoraSdk } from '../lib/agoraEngine';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';

const JOIN_ATTEMPTS = 3;
const JOIN_RETRY_MS = 1_500;
/** Renew the pass this long before it lapses. */
const TOKEN_RENEW_LEAD_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Buyer side of the direct Agora provider: join the room's channel as audience and report when the
 * host's video is on screen. Same callbacks as `useMobileStageSubscribe` so the player drives either
 * one the same way. The Agora engine is a process-wide singleton, so only the `active` room is joined;
 * leaving (inactive / unmount) always leaves the channel so the next show or the host screen can join.
 */
export function useMobileAgoraSubscribe(args: {
  roomId: string;
  accessToken?: string;
  active: boolean;
  /** Host Pause: stay in the channel while the host's video is intentionally gone. */
  hostPaused?: boolean;
  refreshNonce?: number;
  subscribeEpoch?: number;
  onConnected: () => void;
  onFailed: (reason: string) => void;
  onDisconnected: () => void;
}): { remoteUid: number | null } {
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const cbRef = useRef(args);
  cbRef.current = args;

  useEffect(() => {
    if (!args.active) {
      setRemoteUid(null);
      return undefined;
    }
    const lib = loadAgoraSdk();
    if (!lib) {
      // Older app build without the Agora native module: cannot watch an Agora show.
      cbRef.current.onFailed('agora_unavailable');
      return undefined;
    }

    let cancelled = false;
    let joined = false;
    let connected = false;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;
    let engine: AgoraSdk.IRtcEngine | null = null;
    let session: AgoraViewerSession | null = null;
    let handler: AgoraSdk.IRtcEngineEventHandler | null = null;
    const roomId = args.roomId;

    const markConnected = (uid: number) => {
      setRemoteUid(uid);
      if (!connected) {
        connected = true;
        viewerLifecycleLog('agora_viewer_video_ready', { roomId });
        cbRef.current.onConnected();
      }
    };

    const scheduleRenew = (expiresInSeconds: number) => {
      if (renewTimer != null) clearTimeout(renewTimer);
      const delay = Math.max(30_000, expiresInSeconds * 1000 - TOKEN_RENEW_LEAD_MS);
      renewTimer = setTimeout(() => {
        void (async () => {
          if (cancelled || !engine) return;
          try {
            const next = await fetchAgoraViewerSession(roomId, cbRef.current.accessToken);
            if (cancelled || !engine) return;
            session = next;
            engine.renewToken(next.token);
            scheduleRenew(next.expiresInSeconds);
          } catch {
            /* the next onTokenPrivilegeWillExpire / rejoin recovers */
          }
        })();
      }, delay);
    };

    const run = async () => {
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= JOIN_ATTEMPTS && !cancelled; attempt += 1) {
        try {
          session = await fetchAgoraViewerSession(roomId, cbRef.current.accessToken);
          if (cancelled) return;
          engine = getAgoraEngine(session.appId);
          handler = {
            onJoinChannelSuccess: () => {
              joined = true;
            },
            onUserJoined: (_c, uid) => {
              if (uid === session?.hostUid) setRemoteUid(uid);
            },
            onUserOffline: (_c, uid) => {
              if (uid !== session?.hostUid) return;
              setRemoteUid(null);
              if (connected) {
                connected = false;
                cbRef.current.onDisconnected();
              }
            },
            onRemoteVideoStateChanged: (_c, uid, state) => {
              if (uid !== session?.hostUid) return;
              const S = lib.RemoteVideoState;
              if (state === S.RemoteVideoStateDecoding) markConnected(uid);
            },
            onTokenPrivilegeWillExpire: () => {
              void (async () => {
                if (cancelled || !engine) return;
                try {
                  const next = await fetchAgoraViewerSession(roomId, cbRef.current.accessToken);
                  if (cancelled || !engine) return;
                  session = next;
                  engine.renewToken(next.token);
                  scheduleRenew(next.expiresInSeconds);
                } catch {
                  /* handled by connection-state failure below */
                }
              })();
            },
            onConnectionStateChanged: (_c, state) => {
              if (state === lib.ConnectionStateType.ConnectionStateFailed && !cancelled) {
                cbRef.current.onFailed('agora_connection_failed');
              }
            },
            onError: (code, msg) => {
              if (!joined && !cancelled) cbRef.current.onFailed(msg || `agora_error_${code}`);
            },
          };
          engine.registerEventHandler(handler);
          engine.enableVideo();
          engine.enableAudio();
          const code = engine.joinChannel(session.token, session.channel, session.uid, {
            channelProfile: lib.ChannelProfileType.ChannelProfileLiveBroadcasting,
            clientRoleType: lib.ClientRoleType.ClientRoleAudience,
            autoSubscribeAudio: true,
            autoSubscribeVideo: true,
            publishCameraTrack: false,
            publishMicrophoneTrack: false,
          });
          if (typeof code === 'number' && code < 0) {
            throw new Error(`Could not join live video (code ${code}).`);
          }
          scheduleRenew(session.expiresInSeconds);
          viewerLifecycleLog('agora_viewer_joining', { roomId, attempt });
          return;
        } catch (err) {
          lastErr = err;
          if (handler && engine) {
            try {
              engine.unregisterEventHandler(handler);
            } catch {
              /* ignore */
            }
            handler = null;
          }
          if (attempt < JOIN_ATTEMPTS) await sleep(JOIN_RETRY_MS * attempt);
        }
      }
      if (!cancelled) {
        cbRef.current.onFailed(lastErr instanceof Error ? lastErr.message : 'agora_join_failed');
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (renewTimer != null) clearTimeout(renewTimer);
      if (engine) {
        try {
          if (handler) engine.unregisterEventHandler(handler);
          engine.leaveChannel();
        } catch {
          /* ignore */
        }
      }
      setRemoteUid(null);
    };
    // hostPaused is intentionally not a dependency: pausing must not leave the channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.active, args.roomId, args.refreshNonce, args.subscribeEpoch]);

  return { remoteUid };
}
