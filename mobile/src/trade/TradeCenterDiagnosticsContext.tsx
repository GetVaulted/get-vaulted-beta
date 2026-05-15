import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type TradeCenterDiagnosticsValue = {
  lastFeedRefreshAt: number | null;
  markFeedRefreshed: () => void;
};

const TradeCenterDiagnosticsContext = createContext<TradeCenterDiagnosticsValue | null>(null);

export function TradeCenterDiagnosticsProvider({ children }: { children: ReactNode }) {
  const [lastFeedRefreshAt, setLastFeedRefreshAt] = useState<number | null>(null);
  const markFeedRefreshed = useCallback(() => {
    setLastFeedRefreshAt(Date.now());
  }, []);
  const value = useMemo(
    () => ({ lastFeedRefreshAt, markFeedRefreshed }),
    [lastFeedRefreshAt, markFeedRefreshed],
  );
  return (
    <TradeCenterDiagnosticsContext.Provider value={value}>{children}</TradeCenterDiagnosticsContext.Provider>
  );
}

export function useTradeCenterDiagnostics(): TradeCenterDiagnosticsValue | null {
  return useContext(TradeCenterDiagnosticsContext);
}
