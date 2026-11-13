"use client";

import { useEffect, useRef } from "react";
import { logIvsWeb } from "@/lib/ivs-web-broadcast-log";

type ViewerSession = {
  appId: string;
  channel: string;
  hostUid: number;
  uid: number;
  token: string;
  expiresInSeconds: number;
};

const JOIN_ATTEMPTS = 3;
const JOIN_RETRY_MS = 1_500;
/** Renew the pass this long before it lapses. */
const TOKEN_RENEW_LEAD_MS = 5 * 60_000;

export function parseViewerSession(raw: unknown): ViewerSession | null {
  if (!raw || typeof raw !== "object") return null;
  const a = (raw as Record<string, unknown>).agora;
  if (!a || typeof a !== "object") return null;
  const s = a as Record<string, unknown>;
  const appId = typeof s.appId === "string" ? s.appId.trim() : "";
  const channel = typeof s.channel === "string" ? s.channel.trim() : "";
  const token = typeof s.token === "string" ? s.token.trim() : "";
  const hostUid = typeof s.hostUid === "number" && Number.isFinite(s.hostUid) ? s.hostUid : 0;
  const uid = typeof s.uid === "number" && Number.isFinite(s.uid) ? s.uid : 0;
  const expiresInSeconds = typeof s.expiresInSeconds === "number" ? s.expiresInSeconds : 0;
  if (!appId || !channel || !token || hostUid <= 0) return null;
  return { appId, channel, hostUid, uid, token, expiresInSeconds };
}

async function fetchViewerSession(roomId: string): Promise<ViewerSession> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/agora-viewer`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const raw = (await res.json().catch(() => null)) as unknown;
  const session = parseViewerSession(raw);
  if (!res.ok || !session) throw new Error(`viewer_pass_${res.status}`);
  return session;
}

/**
 * Buyer / guest side of the direct Agora provider. When `active`, joins the room's Agora channel as
 * audience (subscribe-only) and attaches the host's audio + video to `videoRef`, the same element the
 * other transports use. Same callbacks as `useStageSubscribe`.
 */
export function useAgoraSubscribe({
  roomId,
  videoRef,
  active,
  muted,
  refreshNonce,
  subscribeEpoch,
  onConnected,
  onFailed,
  onDisconnected,
}: {
  roomId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  muted: boolean;
  refreshNonce?: number;
  subscribeEpoch?: number;
  onConnected: () => void;
  onFailed: (reason: string) => void;
  onDisconnected?: () => void;
}) {
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const streamRef = useRef<MediaStream | null>(null);
  const cbRef = useRef({ onConnected, onFailed, onDisconnected });
  cbRef.current = { onConnected, onFailed, onDisconnected };

  useEffect(() => {
    const el = videoRef.current;
    if (el && streamRef.current && el.srcObject === streamRef.current) {
      el.muted = muted;
      el.volume = 1;
    }
  }, [muted, videoRef]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let connected = false;
    let renewTimer: number | null = null;
    // Typed loosely on purpose: the SDK is loaded on demand so it never weighs on pages without live video.
    let client: import("agora-rtc-sdk-ng").IAgoraRTCClient | null = null;
    const stream = new MediaStream();
    streamRef.current = stream;

    const attach = () => {
      const el = videoRef.current;
      if (!el) return;
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = mutedRef.current;
      el.volume = 1;
      void el.play().catch(() => {
        /* autoplay may be blocked; the player's tap-for-sound UI handles it */
      });
    };

    const scheduleRenew = (expiresInSeconds: number) => {
      if (renewTimer != null) window.clearTimeout(renewTimer);
      const delay = Math.max(30_000, expiresInSeconds * 1000 - TOKEN_RENEW_LEAD_MS);
      renewTimer = window.setTimeout(() => {
        void (async () => {
          if (cancelled || !client) return;
          try {
            const next = await fetchViewerSession(roomId);
            if (cancelled || !client) return;
            await client.renewToken(next.token);
            scheduleRenew(next.expiresInSeconds);
          } catch {
            /* the will-expire event or a rejoin recovers */
          }
        })();
      }, delay);
    };

    const run = async () => {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      if (cancelled) return;
      AgoraRTC.setLogLevel(3);
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= JOIN_ATTEMPTS && !cancelled; attempt += 1) {
        try {
          const session = await fetchViewerSession(roomId);
          if (cancelled) return;
          const c = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
          client = c;
          await c.setClientRole("audience");

          c.on("user-published", async (user, mediaType) => {
            if (cancelled || user.uid !== session.hostUid) return;
            try {
              await c.subscribe(user, mediaType);
            } catch {
              return;
            }
            const track = mediaType === "video" ? user.videoTrack : user.audioTrack;
            const mst = track?.getMediaStreamTrack();
            if (!mst) return;
            for (const old of mediaType === "video" ? stream.getVideoTracks() : stream.getAudioTracks()) {
              stream.removeTrack(old);
            }
            stream.addTrack(mst);
            attach();
            if (mediaType === "video" && !connected) {
              connected = true;
              logIvsWeb("agora subscribe connected", { roomId });
              cbRef.current.onConnected();
            }
          });
          c.on("user-unpublished", (user, mediaType) => {
            if (cancelled || user.uid !== session.hostUid) return;
            if (mediaType === "video") {
              for (const t of stream.getVideoTracks()) stream.removeTrack(t);
              if (connected) {
                connected = false;
                cbRef.current.onDisconnected?.();
              }
            }
          });
          c.on("user-left", (user) => {
            if (cancelled || user.uid !== session.hostUid) return;
            if (connected) {
              connected = false;
              cbRef.current.onDisconnected?.();
            }
          });
          c.on("token-privilege-will-expire", () => {
            void (async () => {
              if (cancelled) return;
              try {
                const next = await fetchViewerSession(roomId);
                if (!cancelled) await c.renewToken(next.token);
              } catch {
                /* connection-state-change reports a hard failure */
              }
            })();
          });
          c.on("connection-state-change", (cur, _prev, reason) => {
            if (cancelled) return;
            if (cur === "DISCONNECTED" && reason !== "LEAVE") {
              cbRef.current.onFailed(`agora_${String(reason).toLowerCase()}`);
            }
          });

          await c.join(session.appId, session.channel, session.token, session.uid || null);
          scheduleRenew(session.expiresInSeconds);
          logIvsWeb("agora subscribe joined", { roomId, attempt });
          return;
        } catch (err) {
          lastErr = err;
          if (client) {
            try {
              await client.leave();
            } catch {
              /* ignore */
            }
            client = null;
          }
          if (attempt < JOIN_ATTEMPTS) await new Promise((r) => window.setTimeout(r, JOIN_RETRY_MS * attempt));
        }
      }
      if (!cancelled) {
        cbRef.current.onFailed(lastErr instanceof Error ? lastErr.message : "agora_join_failed");
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (renewTimer != null) window.clearTimeout(renewTimer);
      const c = client;
      client = null;
      if (c) {
        c.removeAllListeners();
        void c.leave().catch(() => {});
      }
      for (const t of stream.getTracks()) {
        try {
          stream.removeTrack(t);
        } catch {
          /* ignore */
        }
      }
      const el = videoRef.current;
      if (el && el.srcObject === stream) el.srcObject = null;
      streamRef.current = null;
    };
  }, [active, roomId, refreshNonce, subscribeEpoch, videoRef]);
}
