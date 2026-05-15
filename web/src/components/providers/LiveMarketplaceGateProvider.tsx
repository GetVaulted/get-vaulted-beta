"use client";

import { createContext, useContext, type ReactNode } from "react";

type LiveMarketplaceGateContextValue = {
  liveMarketplaceEnabled: boolean;
};

const LiveMarketplaceGateContext = createContext<LiveMarketplaceGateContextValue>({
  liveMarketplaceEnabled: true,
});

export function LiveMarketplaceGateProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <LiveMarketplaceGateContext.Provider value={{ liveMarketplaceEnabled: enabled }}>
      {children}
    </LiveMarketplaceGateContext.Provider>
  );
}

export function useLiveMarketplaceEnabled(): boolean {
  return useContext(LiveMarketplaceGateContext).liveMarketplaceEnabled;
}
