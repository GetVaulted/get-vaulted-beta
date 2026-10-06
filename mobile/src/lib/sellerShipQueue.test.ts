import { describe, expect, it } from 'vitest';
import {
  countShipQueueActions,
  orderIdsAwaitingBundledLabel,
  sellerShipQueuePhase,
  sellerShipQueueStage,
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
