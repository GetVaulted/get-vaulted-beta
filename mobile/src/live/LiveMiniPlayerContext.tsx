import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type LiveMiniPlayerSession = {
  roomId: string;
  title: string;
  hostLabel: string;
  thumbnailUrl: string;
  accessToken?: string;
};

type LiveMiniPlayerContextValue = {
  session: LiveMiniPlayerSession | null;
  paused: boolean;
  /** Minimize the current live show into the TikTok-style floating player. */
  minimize: (session: LiveMiniPlayerSession) => void;
  /** Close the floating player and stop playback. */
  close: () => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
};

const LiveMiniPlayerContext = createContext<LiveMiniPlayerContextValue | null>(null);

export function LiveMiniPlayerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LiveMiniPlayerSession | null>(null);
  const [paused, setPaused] = useState(false);

  const minimize = useCallback((next: LiveMiniPlayerSession) => {
    setSession(next);
    setPaused(false);
  }, []);

  const close = useCallback(() => {
    setSession(null);
    setPaused(false);
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const value = useMemo(
    () => ({
      session,
      paused,
      minimize,
      close,
      setPaused,
      togglePaused,
    }),
    [session, paused, minimize, close, togglePaused],
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
