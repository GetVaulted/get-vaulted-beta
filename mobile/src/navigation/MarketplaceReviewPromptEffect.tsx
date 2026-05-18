import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import { useMarketplaceReviewPrompts } from '../hooks/useMarketplaceReviewPrompts';
import { openWriteReview } from './openPlatform';
import { rootNavigationRef } from './rootNavigationRef';

/** Prompts for completed marketplace orders needing reviews. */
export function MarketplaceReviewPromptEffect() {
  const { user } = useAuth();
  const { pending, scan, promptNext } = useMarketplaceReviewPrompts(user?.id);

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void scan();
    }, 2500);
    return () => task.cancel();
  }, [scan]);

  useEffect(() => {
    if (!user?.id || !pending.length) return;
    const task = deferAfterFirstPaint(() => {
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
    }, 3200);
    return () => task.cancel();
  }, [pending.length, promptNext, user?.id]);

  return null;
}
