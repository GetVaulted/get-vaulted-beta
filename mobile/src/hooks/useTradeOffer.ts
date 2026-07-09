import { useCallback, useEffect, useState } from 'react';
import { fetchTradeOfferById, subscribeTradeOffer } from '../api/tradeOffersRepository';
import { isWebTradeApiConfigured } from '../api/tradeOffersWebApi';
import type { TradeOfferVM } from '../types/tradeOffers';

export function useTradeOffer(offerId: string | undefined): {
  offer: TradeOfferVM | null;
  loading: boolean;
  reload: () => Promise<void>;
  isStaticMock: boolean;
} {
  const [offer, setOffer] = useState<TradeOfferVM | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!offerId) {
      setOffer(null);
      return;
    }
    const row = await fetchTradeOfferById(offerId);
    setOffer(row);
  }, [offerId]);

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    if (!offerId) return;
    const { unsubscribe } = subscribeTradeOffer(offerId, () => {
      void reload();
    });
    return unsubscribe;
  }, [offerId, reload]);

  useEffect(() => {
    if (!offerId || !isWebTradeApiConfigured()) return;
    const timer = setInterval(() => {
      void reload();
    }, 12_000);
    return () => clearInterval(timer);
  }, [offerId, reload]);

  return { offer, loading, reload, isStaticMock: false };
}
