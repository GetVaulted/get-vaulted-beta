import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  fetchCompletedOrdersForUser,
  isOrderCompleteForReview,
  type VaultOrderRow,
} from '../api/ordersRepository';
import { hasReviewedReference } from '../platform/platformStore';
import { markReviewReminderSent, wasReviewReminderSent } from '../platform/orderReviewStore';
import { notifyReviewReminder } from '../platform/notificationStore';
import { emitNotificationBadgeChanged } from '../platform/notificationEvents';
import type { ReviewType } from '../platform/types';

export type PendingOrderReview = {
  order: VaultOrderRow;
  reviewType: ReviewType;
  subjectUserId: string;
  subjectDisplayName: string;
};

export function useMarketplaceReviewPrompts(userId: string | undefined) {
  const [pending, setPending] = useState<PendingOrderReview[]>([]);

  const scan = useCallback(async () => {
    if (!userId) {
      setPending([]);
      return;
    }
    const completed = await fetchCompletedOrdersForUser(userId);
    const queue: PendingOrderReview[] = [];

    for (const order of completed) {
      if (!isOrderCompleteForReview(order.status)) continue;

      const asBuyer = order.buyerId === userId;
      const reviewType: ReviewType = asBuyer ? 'buyer_to_seller' : 'seller_to_buyer';
      const subjectUserId = asBuyer ? order.sellerId : order.buyerId;
      const already = await hasReviewedReference(userId, order.id, reviewType);
      if (already) continue;

      const subjectDisplayName = asBuyer
        ? order.sellerUsername
          ? `@${order.sellerUsername}`
          : 'Seller'
        : order.buyerUsername
          ? `@${order.buyerUsername}`
          : 'Buyer';

      queue.push({ order, reviewType, subjectUserId, subjectDisplayName });

      const reminded = await wasReviewReminderSent(order.id);
      if (!reminded) {
        await notifyReviewReminder(userId, order.listingTitle, order.id, asBuyer);
        await markReviewReminderSent(order.id);
        emitNotificationBadgeChanged();
      }
    }

    setPending(queue);
  }, [userId]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const promptNext = useCallback(
    (onReview: (p: PendingOrderReview) => void) => {
      if (!pending.length) return;
      const next = pending[0];
      const role = next.reviewType === 'buyer_to_seller' ? 'seller' : 'buyer';
      Alert.alert(
        'Leave a vault review',
        `Your order for “${next.order.listingTitle}” is complete. Rate this ${role} to strengthen vault trust.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Review now', onPress: () => onReview(next) },
        ],
      );
    },
    [pending],
  );

  return { pending, scan, promptNext };
}
