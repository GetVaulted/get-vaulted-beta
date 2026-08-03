import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type LiveMiniPlayerSession = {
  roomId: string;
  title: string;
  hostLabel: string;
  thumbnailUrl: string;
  accessToken?: string;
  /** Warm HLS URL handed off from the in-room player (same string — no cache-bust). */
  playbackUrl?: string | null;
};

type WarmHls = {
  roomId: string;
  playbackUrl: string;
};

type LiveMiniPlayerContextValue = {
  session: LiveMiniPlayerSession | null;
  paused: boolean;
  /** Shared expo-video player — stays alive across Back → mini and home → OS PiP. */
  player: VideoPlayer;
  /** Stable HLS URL currently loaded into `player` (warm room and/or mini). */
  playbackSourceUrl: string | null;
  /** True while a live room has registered its HLS mirror (before or during mini). */
  hasWarmHls: boolean;
  /** Peek the warm URL for a room (used on Back so minimize does not depend on cache). */
  peekWarmPlaybackUrl: (roomId: string) => string | null;
  /**
   * Keep HLS buffering at app root while the buyer is in a live room.
   * Must be called with the raw playback URL (never cache-busted) so handoff is seamless.
   */
  warmHls: (roomId: string, playbackUrl: string) => void;
  /** Drop warm registration when leaving a room that is not minimized. */
  clearWarmHls: (roomId: string) => void;
  /** Minimize the current live show into the TikTok-style floating player. */
  minimize: (session: LiveMiniPlayerSession) => void;
  /** Close the floating player and stop playback. */
  close: () => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
};

const LiveMiniPlayerContext = createContext<LiveMiniPlayerContextValue | null>(null);

function normalizeHlsUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim() || null;
  return trimmed || null;
}

export function LiveMiniPlayerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LiveMiniPlayerSession | null>(null);
  const [paused, setPaused] = useState(false);
  const [warm, setWarm] = useState<WarmHls | null>(null);
  const warmRef = useRef<WarmHls | null>(null);
  const sessionRef = useRef<LiveMiniPlayerSession | null>(null);
  // Do NOT assign refs from state on every render — minimize() writes refs synchronously
  // so leave-room cleanup can see them before setState commits. A parent re-render in
  // that window would otherwise wipe the refs back to the stale null session/warm.
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    warmRef.current = warm;
  }, [warm]);

  const sessionUrl = normalizeHlsUrl(session?.playbackUrl);
  const warmUrl = normalizeHlsUrl(warm?.playbackUrl);
  // Prefer the already-warm URL when minimizing the same room so useVideoPlayer does not reload.
  const playbackSourceUrl =
    (session && warm && session.roomId === warm.roomId && warmUrl) ||
    sessionUrl ||
    warmUrl ||
    null;

  const player = useVideoPlayer(playbackSourceUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.volume = 1;
    p.audioMixingMode = 'mixWithOthers';
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    try {
      p.targetOffsetFromLive = 0.35;
    } catch {
      /* older native builds */
    }
    p.bufferOptions = {
      preferredForwardBufferDuration: 1,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 0.5,
    };
    try {
      p.play();
    } catch {
      /* ignore */
    }
  });

  // Keep the native player advancing whenever we have a source.
  useEffect(() => {
    if (!playbackSourceUrl) return;
    try {
      if (session) {
        player.muted = paused;
        player.volume = paused ? 0 : 1;
        player.audioMixingMode = 'doNotMix';
        player.showNowPlayingNotification = true;
        if (paused) player.pause();
        else player.play();
      } else {
        // In-room companion: mute under WebRTC, keep buffering for PiP / mini handoff.
        player.muted = true;
        player.volume = 0;
        player.audioMixingMode = 'mixWithOthers';
        player.showNowPlayingNotification = false;
        player.play();
      }
    } catch {
      /* ignore */
    }
  }, [playbackSourceUrl, player, session, paused]);

  const warmHls = useCallback((roomId: string, playbackUrl: string) => {
    const url = normalizeHlsUrl(playbackUrl);
    if (!roomId || !url) return;
    // Sync ref first — room unmount cleanup can race React setState and wipe warm
    // before minimize's session lands, which nulls the shared player mid-handoff.
    const next = { roomId, playbackUrl: url };
    warmRef.current = next;
    setWarm((prev) => {
      if (prev?.roomId === roomId && prev.playbackUrl === url) return prev;
      return next;
    });
  }, []);

  const clearWarmHls = useCallback((roomId: string) => {
    // Prefer refs — setState from minimize may not have re-rendered yet when the
    // leaving room's effect cleanup runs (Back → mini race).
    if (sessionRef.current?.roomId === roomId) return;
    if (warmRef.current?.roomId !== roomId) return;
    warmRef.current = null;
    setWarm((prev) => {
      if (!prev || prev.roomId !== roomId) return prev;
      if (sessionRef.current?.roomId === roomId) return prev;
      return null;
    });
  }, []);

  const peekWarmPlaybackUrl = useCallback((roomId: string) => {
    const current = warmRef.current;
    if (current?.roomId === roomId) return current.playbackUrl;
    return null;
  }, []);

  const minimize = useCallback((next: LiveMiniPlayerSession) => {
    const fromWarm =
      next.roomId && warmRef.current?.roomId === next.roomId
        ? warmRef.current.playbackUrl
        : null;
    const url = normalizeHlsUrl(next.playbackUrl) || fromWarm;
    const sessionNext = { ...next, playbackUrl: url };
    // Sync before setState so leave-room clearWarmHls cannot drop the source.
    sessionRef.current = sessionNext;
    setSession(sessionNext);
    setPaused(false);
    if (url) {
      const warmNext = { roomId: next.roomId, playbackUrl: url };
      warmRef.current = warmNext;
      setWarm(warmNext);
    }
    // Kick decode immediately — WebRTC→HLS handoff often leaves a frozen last frame.
    try {
      player.muted = false;
      player.volume = 1;
      player.audioMixingMode = 'doNotMix';
      try {
        player.targetOffsetFromLive = 0.35;
      } catch {
        /* ignore */
      }
      player.play();
    } catch {
      /* ignore */
    }
  }, [player]);

  const close = useCallback(() => {
    sessionRef.current = null;
    warmRef.current = null;
    setSession(null);
    setWarm(null);
    setPaused(false);
    try {
      player.pause();
      player.muted = true;
    } catch {
      /* ignore */
    }
  }, [player]);

  const togglePaused = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const value = useMemo(
    () => ({
      session,
      paused,
      player,
      playbackSourceUrl,
      hasWarmHls: Boolean(warmUrl),
      peekWarmPlaybackUrl,
      warmHls,
      clearWarmHls,
      minimize,
      close,
      setPaused,
      togglePaused,
    }),
    [
      session,
      paused,
      player,
      playbackSourceUrl,
      warmUrl,
      peekWarmPlaybackUrl,
      warmHls,
      clearWarmHls,
      minimize,
      close,
      togglePaused,
    ],
  );

  return <LiveMiniPlayerContext.Provider value={value}>{children}</LiveMiniPlayerContext.Provider>;
}

export function useLiveMiniPlayer(): LiveMiniPlayerContextValue {
  const ctx = useContext(LiveMiniPlayerContext);
  if (!ctx) {
    throw new Error('useLiveMiniPlayer must be used within LiveMiniPlayerProvider');
  }
  return ctx;
}

/** Safe for screens that may render outside the provider during tests. */
export function useLiveMiniPlayerOptional(): LiveMiniPlayerContextValue | null {
  return useContext(LiveMiniPlayerContext);
}
