import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useMarketplaceReviewPrompts } from '../hooks/useMarketplaceReviewPrompts';
import { openWriteReview } from './openPlatform';
import { rootNavigationRef } from './rootNavigationRef';

/** Prompts for completed marketplace orders needing reviews. */
export function MarketplaceReviewPromptEffect() {
  const { user } = useAuth();
  const { pending, scan, promptNext } = useMarketplaceReviewPrompts(user?.id);

  useEffect(() => {
    void scan();
  }, [scan]);

  useEffect(() => {
    if (!user?.id || !pending.length) return;
    const t = setTimeout(() => {
      promptNext((p) => {
        if (rootNavigationRef.isReady()) {
          openWriteReview({
            reviewType: p.reviewType,
            referenceId: p.order.id,
            subjectUserId: p.subjectUserId,
            subjectDisplayName: p.subjectDisplayName,
          });
        }
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [pending.length, promptNext, user?.id]);

  return null;
}
