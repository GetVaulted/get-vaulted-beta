"use client";

import { useEffect, useRef } from "react";
import type {
  Stage,
  StageConnectionState as StageConnectionStateType,
  StageError,
  StageParticipantInfo,
  StageStream,
} from "amazon-ivs-web-broadcast";
import { logIvsWeb } from "@/lib/ivs-web-broadcast-log";

/** If no remote media arrives within this window, fail over to HLS. */
const CONNECT_TIMEOUT_MS = 12_000;

/** True when the browser can subscribe to a WebRTC Stage (RTCPeerConnection available). */
export function isWebRtcPlaybackSupported(): boolean {
  return typeof window !== "undefined" && typeof window.RTCPeerConnection !== "undefined";
}

/** Client kill-switch — set NEXT_PUBLIC_LIVE_STAGE_ENABLED="false" to force HLS everywhere. */
export function isStageWebrtcEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LIVE_STAGE_ENABLED !== "false";
}

/**
 * Buyer-side WebRTC subscriber. When `active`, fetches a subscribe-only participant token, joins the
 * room's IVS Real-Time Stage, and attaches the host participant's remote tracks to `videoRef`.
 *
 * On any failure (no token / guest / unsupported / timeout / connection error) it calls `onFailed`
 * so the player can fall back to HLS. Leaving the stage + detaching tracks happens on cleanup.
 */
export function useStageSubscribe({
  roomId,
  videoRef,
  active,
  muted,
  onConnected,
  onFailed,
}: {
  roomId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  muted: boolean;
  onConnected: () => void;
  onFailed: (reason: string) => void;
}) {
  const stageRef = useRef<Stage | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const cbRef = useRef({ onConnected, onFailed });
  cbRef.current = { onConnected, onFailed };

  // Keep the attached element's muted state in sync without re-joining the stage.
  useEffect(() => {
    const el = videoRef.current;
    if (el && streamRef.current && el.srcObject === streamRef.current) {
      el.muted = muted;
    }
  }, [muted, videoRef]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let connected = false;
    let timeoutId: number | null = null;

    const stream = new MediaStream();
    streamRef.current = stream;

    const fail = (reason: string) => {
      if (cancelled) return;
      logIvsWeb("stage subscribe failed", { roomId, reason });
      cbRef.current.onFailed(reason);
    };

    const attach = () => {
      const el = videoRef.current;
      if (!el) return;
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = mutedRef.current;
      void el.play().catch(() => {
        /* autoplay may be blocked; the player's tap-for-sound UI handles it */
      });
    };

    void (async () => {
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/stage-token`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) {
          fail(`token_http_${res.status}`);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { stage?: { token?: string } };
        const token = body.stage?.token?.trim();
        if (!token) {
          fail("token_missing");
          return;
        }
        if (cancelled) return;

        const ivs = await import("amazon-ivs-web-broadcast");
        if (cancelled) return;

        const stage = new ivs.Stage(token, {
          stageStreamsToPublish: () => [],
          shouldPublishParticipant: () => false,
          shouldSubscribeToParticipant: (participant: StageParticipantInfo) =>
            participant.isLocal ? ivs.SubscribeType.NONE : ivs.SubscribeType.AUDIO_VIDEO,
        });
        stageRef.current = stage;

        stage.on(
          ivs.StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED,
          (participant: StageParticipantInfo, streams: StageStream[]) => {
            if (participant.isLocal) return;
            for (const s of streams) {
              try {
                stream.addTrack(s.mediaStreamTrack);
              } catch {
                /* track may already be added */
              }
            }
            attach();
            if (!connected) {
              connected = true;
              if (timeoutId != null) {
                window.clearTimeout(timeoutId);
                timeoutId = null;
              }
              logIvsWeb("stage subscribe connected", { roomId });
              cbRef.current.onConnected();
            }
          },
        );
        stage.on(
          ivs.StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED,
          (participant: StageParticipantInfo, streams: StageStream[]) => {
            if (participant.isLocal) return;
            for (const s of streams) {
              try {
                stream.removeTrack(s.mediaStreamTrack);
              } catch {
                /* already removed */
              }
            }
          },
        );
        stage.on(ivs.StageEvents.STAGE_CONNECTION_STATE_CHANGED, (state: StageConnectionStateType) => {
          logIvsWeb("stage subscribe state", { roomId, state });
          if (state === ivs.StageConnectionState.ERRORED) fail("connection_errored");
        });
        stage.on(ivs.StageEvents.ERROR, (err: StageError) => {
          logIvsWeb("stage subscribe error", {
            roomId,
            name: err?.name,
            code: err?.code,
            category: err?.category,
            message: err?.message,
          });
        });

        await stage.join();
        timeoutId = window.setTimeout(() => {
          if (!connected) fail("connect_timeout");
        }, CONNECT_TIMEOUT_MS);
      } catch (err) {
        fail(err instanceof Error ? err.message : "subscribe_throw");
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      try {
        stageRef.current?.leave();
      } catch {
        /* ignore */
      }
      stageRef.current = null;
      const el = videoRef.current;
      if (el && el.srcObject === streamRef.current) {
        el.srcObject = null;
      }
      for (const track of streamRef.current?.getTracks() ?? []) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current = null;
    };
  }, [active, roomId, videoRef]);
}
