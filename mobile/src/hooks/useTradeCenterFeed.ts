import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTradeOffersForUser } from '../api/tradeOffersRepository';
import { isWebTradeApiConfigured } from '../api/tradeOffersWebApi';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import type { TradeOfferVM } from '../types/tradeOffers';
import { partitionTradeOffers, type TradeSections } from '../trade/tradeSections';

export type TradeFeedSource = 'live' | 'unconfigured';

export function useTradeCenterFeed(
  userId: string | undefined,
  options?: { onAfterRefresh?: () => void },
): {
  sections: TradeSections;
  all: TradeOfferVM[];
  participantUserId: string | undefined;
  feedError: string | null;
  loading: boolean;
  refreshing: boolean;
  source: TradeFeedSource;
  refresh: () => Promise<void>;
} {
  const [all, setAll] = useState<TradeOfferVM[]>([]);
  const [participantUserId, setParticipantUserId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<TradeFeedSource>('unconfigured');
  const [feedError, setFeedError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || (!isWebTradeApiConfigured() && !isSupabaseConfigured())) {
      setAll([]);
      setParticipantUserId(undefined);
      setFeedError(null);
      setSource('unconfigured');
      return;
    }
    try {
      const feed = await fetchTradeOffersForUser(userId);
      setAll(feed.offers);
      setParticipantUserId(feed.participantUserId);
      setFeedError(feed.loadError);
      setSource('live');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load trade offers.';
      console.warn('useTradeCenterFeed', e);
      setAll([]);
      setParticipantUserId(userId);
      setFeedError(message);
      setSource('live');
    }
  }, [userId]);

  const onAfterRefreshRef = useRef(options?.onAfterRefresh);
  onAfterRefreshRef.current = options?.onAfterRefresh;

  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => {
      setLoading(false);
      onAfterRefreshRef.current?.();
    });
  }, [refresh]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('trade-center-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_offers', filter: `sender_id=eq.${userId}` },
        () => {
          void refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_offers', filter: `recipient_id=eq.${userId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId || !isWebTradeApiConfigured()) return;
    const timer = setInterval(() => {
      void refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [userId, refresh]);

  const pull = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
      onAfterRefreshRef.current?.();
    }
  }, [refresh]);

  const sections = useMemo(() => {
    const partitionId = participantUserId ?? userId;
    if (!partitionId) {
      return { incoming: [], counters: [], sent: [], active: [], completed: [] };
    }
    return partitionTradeOffers(all, partitionId);
  }, [all, participantUserId, userId]);

  return { sections, all, participantUserId, feedError, loading, refreshing: refreshing, source, refresh: pull };
}
