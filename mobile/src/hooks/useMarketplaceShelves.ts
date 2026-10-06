import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { fetchMarketplaceProductsByIds } from '../api/listingsFeedRepository';
import { addToWatchlist, fetchAccountWatchlist, removeFromWatchlist } from '../api/watchlistRepository';
import { useAuth } from '../auth/AuthContext';
import { navigateToAuthWelcome } from '../navigation/rootNavigationRef';
import { getRecentlyViewedIds } from '../lib/recentlyViewed';
import type { Product } from '../types';

/** Most tiles shown in each horizontal row. */
const SHELF_LIMIT = 12;

function isAvailable(product: Product | undefined): product is Product {
  return Boolean(product) && (product!.listingStatus === undefined || product!.listingStatus === 'active');
}

/**
 * Data for the "Recently viewed" and "Your favorites" rows above the marketplace grid, plus the
 * heart toggle on every tile. Recents live on the device; favorites are the account watchlist.
 */
export function useMarketplaceShelves() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const token = session?.access_token ?? null;
  const [recents, setRecents] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const busyRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const [recentIds, watch] = await Promise.all([
      getRecentlyViewedIds(userId),
      token ? fetchAccountWatchlist(token) : Promise.resolve([]),
    ]);
    const watchIds = watch.filter((w) => w.status === 'active').map((w) => w.listingId);
    setSavedIds(new Set(watch.map((w) => w.listingId)));

    const wanted = [...new Set([...recentIds.slice(0, SHELF_LIMIT), ...watchIds.slice(0, SHELF_LIMIT)])];
    const products = wanted.length ? await fetchMarketplaceProductsByIds(wanted) : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    setRecents(
      recentIds
        .map((id) => byId.get(id))
        .filter(isAvailable)
        .slice(0, SHELF_LIMIT),
    );
    setFavorites(
      watchIds
        .map((id) => byId.get(id))
        .filter(isAvailable)
        .slice(0, SHELF_LIMIT),
    );
  }, [userId, token]);

  useFocusEffect(
    useCallback(() => {
      void refresh().catch(() => undefined);
    }, [refresh]),
  );

  const toggleSaved = useCallback(
    async (product: Product) => {
      if (!token) {
        Alert.alert('Sign in to save favorites', 'Create a free account to keep a favorites list.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => navigateToAuthWelcome() },
        ]);
        return;
      }
      if (busyRef.current.has(product.id)) return;
      busyRef.current.add(product.id);
      const wasSaved = savedIds.has(product.id);

      const apply = (saved: boolean) => {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (saved) next.add(product.id);
          else next.delete(product.id);
          return next;
        });
        setFavorites((prev) =>
          saved
            ? prev.some((p) => p.id === product.id)
              ? prev
              : [product, ...prev].slice(0, SHELF_LIMIT)
            : prev.filter((p) => p.id !== product.id),
        );
      };

      apply(!wasSaved);
      try {
        const ok = wasSaved ? await removeFromWatchlist(token, product.id) : await addToWatchlist(token, product.id);
        if (!ok) apply(wasSaved);
      } catch {
        apply(wasSaved);
      } finally {
        busyRef.current.delete(product.id);
      }
    },
    [token, savedIds],
  );

  return { recents, favorites, savedIds, toggleSaved, refresh };
}
