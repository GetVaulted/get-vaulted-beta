import { describe, expect, it } from 'vitest';
import {
  bundleIsAwaitingPrintOrShip,
  bundleOrdersReadyToShip,
  countShipQueueActions,
  orderIdsAwaitingBundledLabel,
  sellerShipQueuePhase,
  sellerShipQueueStage,
  tabForShipQueuePhase,
} from './sellerShipQueue';

describe('sellerShipQueuePhase', () => {
  it('maps paid unlabeled → needs_label', () => {
    expect(
      sellerShipQueuePhase({
        id: 'o1',
        status: 'paid',
        paymentStatus: 'paid',
        fulfillmentStatus: 'pending',
        shippoTransactionId: null,
        labelUrl: null,
        trackingNumber: null,
      }),
    ).toBe('needs_label');
  });

  it('maps label_created → print_and_ship / pending_shipment', () => {
    const order = {
      id: 'o1',
      status: 'paid',
      paymentStatus: 'paid',
      fulfillmentStatus: 'label_created',
      shippoTransactionId: 'tx_1',
      labelUrl: 'https://example.com/label.pdf',
      trackingNumber: '1Z999',
    };
    expect(sellerShipQueuePhase(order)).toBe('print_and_ship');
    expect(sellerShipQueueStage(order)).toBe('pending_shipment');
  });

  it('maps carrier scan → shipped stage', () => {
    const order = {
      id: 'o1',
      status: 'shipped',
      paymentStatus: 'paid',
      fulfillmentStatus: 'in_transit',
      shippoTransactionId: 'tx_1',
      labelUrl: 'https://example.com/label.pdf',
      trackingNumber: '1Z999',
    };
    expect(sellerShipQueuePhase(order)).toBe('in_transit');
    expect(sellerShipQueueStage(order)).toBe('shipped');
  });

  it('hides per-order needs_label when awaiting bundle', () => {
    const skip = orderIdsAwaitingBundledLabel([
      {
        bundled: true,
        canCreateBundledLabel: true,
        orders: [
          { id: 'a', shipAlone: false, paymentStatus: 'paid', hasLabel: false },
          { id: 'b', shipAlone: false, paymentStatus: 'paid', hasLabel: false },
        ],
      },
    ]);
    expect(skip.has('a')).toBe(true);
    expect(
      countShipQueueActions(
        [
          {
            id: 'a',
            status: 'paid',
            paymentStatus: 'paid',
            fulfillmentStatus: 'pending',
            shippoTransactionId: null,
            labelUrl: null,
            trackingNumber: null,
          },
          {
            id: 'c',
            status: 'paid',
            paymentStatus: 'paid',
            fulfillmentStatus: 'pending',
            shippoTransactionId: null,
            labelUrl: null,
            trackingNumber: null,
          },
        ],
        { skipOrderIds: skip },
      ).needsLabel,
    ).toBe(1);
  });
});

describe('bundle ship-it-yourself eligibility (mirrors web)', () => {
  it('only paid orders that have not shipped yet are marked', () => {
    const ready = bundleOrdersReadyToShip([
      { id: 'a', paymentStatus: 'paid', orderStatus: 'paid' },
      { id: 'b', paymentStatus: 'paid', orderStatus: 'pending' },
      { id: 'c', paymentStatus: 'paid', orderStatus: 'shipped' },
      { id: 'd', paymentStatus: 'pending_payment', orderStatus: 'pending' },
      { id: 'e', paymentStatus: 'paid', orderStatus: 'delivered' },
    ]);
    expect(ready.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('is empty when every paid order already shipped', () => {
    expect(
      bundleOrdersReadyToShip([
        { id: 'a', paymentStatus: 'paid', orderStatus: 'shipped' },
        { id: 'b', paymentStatus: 'paid', orderStatus: 'delivered' },
      ]),
    ).toEqual([]);
  });
});

describe('labeled bundle card visibility (mirrors web printBundles)', () => {
  const labeled = { canCreateBundledLabel: false, bundledLabel: { labelUrl: 'https://x/label.pdf' } };
  it('shows while at least one order is still pending/paid', () => {
    expect(
      bundleIsAwaitingPrintOrShip({ ...labeled, orders: [{ orderStatus: 'shipped' }, { orderStatus: 'paid' }] }),
    ).toBe(true);
  });
  it('goes away once every order in the bundle has shipped', () => {
    expect(
      bundleIsAwaitingPrintOrShip({ ...labeled, orders: [{ orderStatus: 'shipped' }, { orderStatus: 'delivered' }] }),
    ).toBe(false);
  });
  it('does not show without a label, or while a label can still be created', () => {
    expect(
      bundleIsAwaitingPrintOrShip({
        canCreateBundledLabel: false,
        bundledLabel: null,
        orders: [{ orderStatus: 'paid' }],
      }),
    ).toBe(false);
    expect(
      bundleIsAwaitingPrintOrShip({
        canCreateBundledLabel: true,
        bundledLabel: { labelUrl: 'https://x/label.pdf' },
        orders: [{ orderStatus: 'paid' }],
      }),
    ).toBe(false);
  });
});

describe('tabForShipQueuePhase (mirrors web)', () => {
  it('keeps print_and_ship under Needs label; only dropped-off orders are Pending shipment', () => {
    expect(tabForShipQueuePhase('needs_label')).toBe('needs_label');
    expect(tabForShipQueuePhase('print_and_ship')).toBe('needs_label');
    expect(tabForShipQueuePhase('awaiting_carrier')).toBe('pending_shipment');
    expect(tabForShipQueuePhase('in_transit')).toBe('shipped');
    expect(tabForShipQueuePhase('done')).toBe('complete');
    expect(tabForShipQueuePhase('wait_payment')).toBeNull();
  });
});
