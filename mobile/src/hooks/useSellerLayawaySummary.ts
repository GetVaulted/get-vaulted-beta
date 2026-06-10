import { useCallback, useEffect, useState } from 'react';
import {
  fetchSellerLayaways,
  type SellerLayawayCounts,
  type SellerLayawayRow,
} from '../api/layawayRepository';
import { useAuth } from '../auth/AuthContext';
import { useVaultEcosystemEvents } from './useVaultEcosystemEvents';

export function useSellerLayawaySummary(accessToken: string | undefined) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<SellerLayawayCounts | null>(null);
  const [layaways, setLayaways] = useState<SellerLayawayRow[]>([]);
  const [recent, setRecent] = useState<SellerLayawayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const hasLayaways = layaways.length > 0;

  const reload = useCallback(async () => {
    if (!accessToken) {
      setCounts(null);
      setLayaways([]);
      setRecent([]);
      setLoadedOnce(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchSellerLayaways(accessToken);
      setCounts(data.counts);
      setLayaways(data.layaways);
      setRecent(data.layaways.slice(0, 3));
      setLoadedOnce(true);
    } catch {
      if (!loadedOnce) {
        setCounts({ active: 0, readyToShip: 0, overdueOrDefaulted: 0 });
        setLayaways([]);
        setRecent([]);
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadedOnce]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onLayaway = useCallback(() => {
    void reload();
  }, [reload]);

  useVaultEcosystemEvents(user?.id, {
    enabled: Boolean(accessToken && user?.id),
    onLayaway,
  });

  return { counts, layaways, recent, loading, loadedOnce, hasLayaways, reload };
}
