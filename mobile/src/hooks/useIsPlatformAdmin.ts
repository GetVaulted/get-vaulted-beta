import { useCallback, useEffect, useState } from 'react';
import { fetchAdminMe } from '../api/adminOpsRepository';

/**
 * Platform admin probe for gated Ops entry.
 * Returns false while loading or when the user is not an admin.
 */
export function useIsPlatformAdmin(accessToken: string | undefined | null): {
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(Boolean(accessToken));

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setIsAdmin(await fetchAdminMe(accessToken));
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isAdmin, loading, refresh };
}
