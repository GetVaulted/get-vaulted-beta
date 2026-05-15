/**
 * Contracts for a future live stack (IVS, Agora, Mux Live, etc.).
 * UI consumes LiveSessionViewModel; the player + signaling swap behind this boundary.
 */
export type LiveSessionId = string;

export type LiveSessionViewModel = {
  id: LiveSessionId;
  title: string;
  playbackUrl: string | null;
  chatChannelId: string | null;
  auctionLotId: string | null;
};

export type LiveSessionRepository = {
  watch: (id: LiveSessionId) => Promise<LiveSessionViewModel>;
  leave: (id: LiveSessionId) => Promise<void>;
};
