import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTradeOffersForUser } from '../api/tradeOffersRepository';
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
  loading: boolean;
  refreshing: boolean;
  source: TradeFeedSource;
  refresh: () => Promise<void>;
} {
  const [all, setAll] = useState<TradeOfferVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<TradeFeedSource>('unconfigured');

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured()) {
      setAll([]);
      setSource('unconfigured');
      return;
    }
    try {
      const rows = await fetchTradeOffersForUser(userId);
      setAll(rows);
      setSource('live');
    } catch (e) {
      console.warn('useTradeCenterFeed', e);
      setAll([]);
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
    if (!userId) {
      return { incoming: [], counters: [], sent: [], active: [], completed: [] };
    }
    return partitionTradeOffers(all, userId);
  }, [all, userId]);

  return { sections, all, loading, refreshing: refreshing, source, refresh: pull };
}
