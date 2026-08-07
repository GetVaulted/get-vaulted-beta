import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type LiveActiveTransport = 'webrtc' | 'hls';
export type LiveActiveMode = 'room' | 'mini' | 'none';

export type LiveActiveSessionMeta = {
  roomId: string;
  accessToken?: string;
  transport: LiveActiveTransport;
  title: string;
  hostLabel: string;
  thumbnailUrl: string;
  /** HLS URL when transport is hls (or Stage failover mirror). */
  playbackUrl?: string | null;
  hostPaused?: boolean;
  subscribeEpoch?: number;
  foregroundResumeNonce?: number;
  contentFit?: 'cover' | 'contain';
  muted?: boolean;
  onConnected?: () => void;
  onFailed?: (reason: string) => void;
  onDisconnected?: () => void;
};

export type LiveMiniPos = { x: number; y: number };

type LiveActiveSessionContextValue = {
  mode: LiveActiveMode;
  session: LiveActiveSessionMeta | null;
  paused: boolean;
  miniPos: LiveMiniPos;
  setMiniPos: (pos: LiveMiniPos) => void;
  /**
   * Register the active room's playback with the root surface.
   * Call from LiveStagePlayback while the buyer is on the active page.
   * Cleanup is a no-op while mode is `mini` (Back must not leave Stage).
   */
  attach: (meta: LiveActiveSessionMeta) => () => void;
  /** Update fields without changing mode (paint callbacks, pause, epoch, etc.). */
  patch: (partial: Partial<LiveActiveSessionMeta>) => void;
  /** Back → float: same surface, layout only. */
  minimize: (meta?: Partial<LiveActiveSessionMeta>) => void;
  /** Expand float back to full room layout (navigate separately). */
  expand: () => void;
  /** X on float — tear down Stage / release playback. */
  close: () => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  /** True when root surface owns this room's Stage/HLS pixels. */
  isHostingRoom: (roomId: string) => boolean;
  wasMinimizedRecently: (withinMs?: number) => boolean;
};

const LiveActiveSessionContext = createContext<LiveActiveSessionContextValue | null>(null);

const DEFAULT_MINIMIZE_GRACE_MS = 2_500;
export const LIVE_MINI_PLAYER_W = 168;
export const LIVE_MINI_PLAYER_H = 298;
export const LIVE_MINI_EDGE_PAD = 10;

export function LiveActiveSessionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<LiveActiveMode>('none');
  const [session, setSession] = useState<LiveActiveSessionMeta | null>(null);
  const [paused, setPaused] = useState(false);
  const [miniPos, setMiniPos] = useState<LiveMiniPos>({ x: LIVE_MINI_EDGE_PAD, y: 72 });
  const modeRef = useRef(mode);
  const sessionRef = useRef(session);
  const minimizedAtMsRef = useRef(0);
  /** Bumps on every attach so React effect re-runs do not tear down Stage. */
  const attachGenerationRef = useRef(0);
  modeRef.current = mode;
  sessionRef.current = session;

  const attach = useCallback((meta: LiveActiveSessionMeta) => {
    const generation = ++attachGenerationRef.current;
    const prev = sessionRef.current;
    const prevMode = modeRef.current;
    const next = { ...meta };
    // Same room already hosted: patch in place (effect re-runs must not remount Stage).
    if (prev?.roomId === meta.roomId && (prevMode === 'room' || prevMode === 'mini')) {
      sessionRef.current = { ...prev, ...next };
      setSession(sessionRef.current);
      if (prevMode === 'mini') {
        modeRef.current = 'room';
        setMode('room');
      }
      setPaused(false);
    } else {
      sessionRef.current = next;
      setSession(next);
      modeRef.current = 'room';
      setMode('room');
      setPaused(false);
    }

    return () => {
      // Effect re-run: a newer attach already replaced this one — keep Stage joined.
      if (attachGenerationRef.current !== generation) return;
      // Back → mini: LiveStagePlayback unmounts but Stage must stay joined.
      if (modeRef.current === 'mini' && sessionRef.current?.roomId === meta.roomId) {
        return;
      }
      // Defer so a same-tick re-attach (React cleanup → effect) can bump generation first.
      const roomId = meta.roomId;
      queueMicrotask(() => {
        if (attachGenerationRef.current !== generation) return;
        if (modeRef.current === 'mini' && sessionRef.current?.roomId === roomId) return;
        if (sessionRef.current?.roomId === roomId && modeRef.current === 'room') {
          sessionRef.current = null;
          modeRef.current = 'none';
          setSession(null);
          setMode('none');
          setPaused(false);
        }
      });
    };
  }, []);

  const patch = useCallback((partial: Partial<LiveActiveSessionMeta>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      sessionRef.current = next;
      return next;
    });
  }, []);

  const minimize = useCallback((meta?: Partial<LiveActiveSessionMeta>) => {
    const base = sessionRef.current;
    if (!base && !meta?.roomId) return;
    const next: LiveActiveSessionMeta = {
      roomId: meta?.roomId ?? base!.roomId,
      accessToken: meta?.accessToken ?? base?.accessToken,
      transport: meta?.transport ?? base?.transport ?? 'webrtc',
      title: meta?.title ?? base?.title ?? 'Live show',
      hostLabel: meta?.hostLabel ?? base?.hostLabel ?? '',
      thumbnailUrl: meta?.thumbnailUrl ?? base?.thumbnailUrl ?? '',
      playbackUrl: meta?.playbackUrl ?? base?.playbackUrl,
      hostPaused: meta?.hostPaused ?? base?.hostPaused,
      subscribeEpoch: meta?.subscribeEpoch ?? base?.subscribeEpoch,
      foregroundResumeNonce: meta?.foregroundResumeNonce ?? base?.foregroundResumeNonce,
      contentFit: meta?.contentFit ?? base?.contentFit,
      muted: meta?.muted ?? base?.muted,
      onConnected: meta?.onConnected ?? base?.onConnected,
      onFailed: meta?.onFailed ?? base?.onFailed,
      onDisconnected: meta?.onDisconnected ?? base?.onDisconnected,
    };
    minimizedAtMsRef.current = Date.now();
    sessionRef.current = next;
    modeRef.current = 'mini';
    setSession(next);
    setMode('mini');
    setPaused(false);
  }, []);

  const expand = useCallback(() => {
    if (modeRef.current !== 'mini') return;
    modeRef.current = 'room';
    setMode('room');
  }, []);

  const close = useCallback(() => {
    sessionRef.current = null;
    modeRef.current = 'none';
    minimizedAtMsRef.current = 0;
    setSession(null);
    setMode('none');
    setPaused(false);
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const isHostingRoom = useCallback((roomId: string) => {
    const s = sessionRef.current;
    const m = modeRef.current;
    return Boolean(s && s.roomId === roomId && (m === 'room' || m === 'mini'));
  }, []);

  const wasMinimizedRecently = useCallback((withinMs = DEFAULT_MINIMIZE_GRACE_MS) => {
    const at = minimizedAtMsRef.current;
    if (!at) return false;
    return Date.now() - at < withinMs;
  }, []);

  const value = useMemo(
    () => ({
      mode,
      session,
      paused,
      miniPos,
      setMiniPos,
      attach,
      patch,
      minimize,
      expand,
      close,
      setPaused,
      togglePaused,
      isHostingRoom,
      wasMinimizedRecently,
    }),
    [
      mode,
      session,
      paused,
      miniPos,
      attach,
      patch,
      minimize,
      expand,
      close,
      togglePaused,
      isHostingRoom,
      wasMinimizedRecently,
    ],
  );

  return (
    <LiveActiveSessionContext.Provider value={value}>{children}</LiveActiveSessionContext.Provider>
  );
}

export function useLiveActiveSession(): LiveActiveSessionContextValue {
  const ctx = useContext(LiveActiveSessionContext);
  if (!ctx) {
    throw new Error('useLiveActiveSession must be used within LiveActiveSessionProvider');
  }
  return ctx;
}

export function useLiveActiveSessionOptional(): LiveActiveSessionContextValue | null {
  return useContext(LiveActiveSessionContext);
}
