import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useSellerSetupState } from '../hooks/useSellerSetupState';
import { normalizeSellerShipFromZip } from '../lib/seller-shipping-readiness';
import { useCreateListingDraft } from './CreateListingDraftContext';

/** Prefills marketplace + live ship-from ZIP from seller onboarding address when empty. */
export function useSellerShipFromZipPrefill(): string | null {
  const { session, user } = useAuth();
  const setup = useSellerSetupState(session?.access_token, user?.id, Boolean(user?.id));
  const { form, setForm } = useCreateListingDraft();
  const appliedRef = useRef(false);

  const sellerZip = normalizeSellerShipFromZip(setup.seller?.shipFromZip);

  useEffect(() => {
    if (!sellerZip) return;
    const needsMarketplace = !form.shipFromZip.trim();
    const needsLive = !form.liveShipFromZip.trim();
    if (!needsMarketplace && !needsLive) {
      appliedRef.current = true;
      return;
    }
    if (appliedRef.current && !needsMarketplace && !needsLive) return;
    setForm({
      ...(needsMarketplace ? { shipFromZip: sellerZip } : {}),
      ...(needsLive ? { liveShipFromZip: sellerZip } : {}),
    });
    appliedRef.current = true;
  }, [sellerZip, form.shipFromZip, form.liveShipFromZip, setForm]);

  return sellerZip;
}
