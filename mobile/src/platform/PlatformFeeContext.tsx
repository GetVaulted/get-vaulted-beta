import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY,
  fetchPlatformMarketplaceFeePolicy,
  formatVaultedFeeRateLabel,
  type PlatformMarketplaceFeePolicy,
} from '../api/platformFeeRepository';

type PlatformFeeContextValue = {
  policy: PlatformMarketplaceFeePolicy;
  loading: boolean;
  refresh: () => Promise<void>;
  platformFeePercent: number;
  feeRateLabel: string;
};

const PlatformFeeContext = createContext<PlatformFeeContextValue>({
  policy: DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY,
  loading: true,
  refresh: async () => {},
  platformFeePercent: DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY.platformFeePercent,
  feeRateLabel: DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY.feeRateLabel,
});

export function PlatformFeeProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<PlatformMarketplaceFeePolicy>(DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const next = await fetchPlatformMarketplaceFeePolicy({ force });
      setPolicy(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const value = useMemo(
    (): PlatformFeeContextValue => ({
      policy,
      loading,
      refresh: () => refresh(true),
      platformFeePercent: policy.platformFeePercent,
      feeRateLabel: policy.feeRateLabel,
    }),
    [loading, policy, refresh],
  );

  return <PlatformFeeContext.Provider value={value}>{children}</PlatformFeeContext.Provider>;
}

export function usePlatformFee(): PlatformFeeContextValue {
  return useContext(PlatformFeeContext);
}

export { formatVaultedFeeRateLabel };
