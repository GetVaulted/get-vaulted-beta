/** Temporary seller queue diagnostics — enable with EXPO_PUBLIC_SELLER_QUEUE_DEBUG=1 */
export function logSellerQueue(
  event: 'queue_length' | 'render_mode' | 'active_item' | 'add_item_success',
  detail?: Record<string, unknown>,
): void {
  const enabled =
    (typeof __DEV__ !== 'undefined' && __DEV__) ||
    process.env.EXPO_PUBLIC_SELLER_QUEUE_DEBUG === '1';
  if (!enabled) return;
  console.log(`[seller-queue] ${event}`, detail ?? '');
}
