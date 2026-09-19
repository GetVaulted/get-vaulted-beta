import { orderHasLabelFile, orderHasPurchasedLabel } from './sellerShippingLabelState';

export type SellerOrderDisplayFields = {
  paymentStatus: string;
  fulfillmentStatus: string;
  status: string;
  sellerNextAction?: string;
  labelUrl?: string | null;
  shippoTransactionId?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
};

export function resolveSellerOrderHeadline(order: SellerOrderDisplayFields): {
  headline: string;
  subheadline: string;
} {
  const hasLabel = orderHasPurchasedLabel(order);
  const hasFile = orderHasLabelFile(order.labelUrl);
  const fs = order.fulfillmentStatus;

  if (order.paymentStatus !== 'paid') {
    return {
      headline: 'Awaiting buyer payment',
      subheadline: order.sellerNextAction?.trim() || 'Fulfillment unlocks after payment clears.',
    };
  }
  if (hasLabel && hasFile && fs === 'label_created') {
    return { headline: 'Label created — print and ship', subheadline: 'Your label is ready. Pack and drop off.' };
  }
  if (hasLabel && !hasFile) {
    return {
      headline: 'Label file missing',
      subheadline: 'Retry lookup or regenerate to recover your label.',
    };
  }
  if (fs === 'in_transit' || fs === 'out_for_delivery') {
    return {
      headline: fs === 'out_for_delivery' ? 'Out for delivery' : 'In transit',
      subheadline: order.trackingNumber?.trim() ? `Tracking ${order.trackingNumber.trim()}` : 'Carrier updates appear here.',
    };
  }
  if (fs === 'delivered') {
    return { headline: 'Delivered', subheadline: 'Payout moves through hold after delivery.' };
  }
  if (!hasLabel) {
    return {
      headline: 'Ready to ship',
      subheadline: order.sellerNextAction?.trim() || 'Create a shipping label to print and ship.',
    };
  }
  return {
    headline: fs.replace(/_/g, ' '),
    subheadline: order.sellerNextAction?.trim() || 'Review fulfillment details below.',
  };
}

export type SellerQuickActionKind =
  | 'create_label'
  | 'print_label'
  | 'download_label'
  | 'copy_tracking'
  | 'open_tracking'
  | 'retrieve_label'
  | 'regenerate_label'
  | 'mark_dropped_off';

export type SellerQuickAction = {
  kind: SellerQuickActionKind;
  label: string;
  primary?: boolean;
};

export function resolveSellerQuickActions(order: SellerOrderDisplayFields): SellerQuickAction[] {
  const hasLabel = orderHasPurchasedLabel(order);
  const hasFile = orderHasLabelFile(order.labelUrl);
  const actions: SellerQuickAction[] = [];

  if (order.paymentStatus === 'paid' && !hasLabel) {
    actions.push({ kind: 'create_label', label: 'Create label', primary: true });
  }
  if (hasFile && order.labelUrl?.trim()) {
    actions.push({ kind: 'print_label', label: 'Print label', primary: !actions.some((a) => a.primary) });
    actions.push({ kind: 'download_label', label: 'Download' });
  }
  if (
    order.paymentStatus === 'paid' &&
    hasLabel &&
    order.fulfillmentStatus === 'label_created' &&
    order.status !== 'shipped'
  ) {
    actions.push({ kind: 'mark_dropped_off', label: 'Dropped off', primary: !actions.some((a) => a.primary) });
  }
  if (order.trackingNumber?.trim()) {
    actions.push({ kind: 'copy_tracking', label: 'Copy tracking' });
  }
  if (order.trackingUrl?.trim()) {
    actions.push({ kind: 'open_tracking', label: 'Open tracking' });
  }
  if (hasLabel && !hasFile) {
    if (order.shippoTransactionId?.trim()) {
      actions.push({ kind: 'retrieve_label', label: 'Retry lookup', primary: true });
    }
    actions.push({ kind: 'regenerate_label', label: 'Regenerate', primary: !order.shippoTransactionId?.trim() });
  }

  return actions;
}

export type SellerTimelineStep = {
  key: string;
  title: string;
  state: 'complete' | 'current' | 'upcoming';
};

export function buildSellerTimelineCompact(order: SellerOrderDisplayFields & { status: string }): SellerTimelineStep[] {
  const paid = order.paymentStatus === 'paid';
  const hasLabel = orderHasPurchasedLabel(order);
  const delivered = order.fulfillmentStatus === 'delivered';
  const inTransit =
    order.fulfillmentStatus === 'in_transit' ||
    order.fulfillmentStatus === 'out_for_delivery' ||
    order.status === 'shipped';

  const steps: SellerTimelineStep[] = [
    { key: 'ordered', title: 'Ordered', state: 'complete' },
    { key: 'paid', title: 'Paid', state: paid ? 'complete' : 'current' },
    { key: 'label', title: 'Label', state: 'upcoming' },
    { key: 'transit', title: 'Transit', state: 'upcoming' },
    { key: 'delivered', title: 'Delivered', state: 'upcoming' },
  ];

  if (!paid) return steps;
  steps[1]!.state = 'complete';
  if (delivered) {
    steps[2]!.state = 'complete';
    steps[3]!.state = 'complete';
    steps[4]!.state = 'complete';
    return steps;
  }
  if (inTransit) {
    steps[2]!.state = 'complete';
    steps[3]!.state = 'current';
    return steps;
  }
  if (hasLabel) {
    steps[2]!.state = 'current';
    return steps;
  }
  steps[2]!.state = 'current';
  return steps;
}
