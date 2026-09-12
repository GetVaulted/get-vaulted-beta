import { describe, expect, it } from 'vitest';
import { countAwaitingShipmentSales, isAwaitingShipmentSale } from './sellerAwaitingShipment';

describe('isAwaitingShipmentSale', () => {
  it('counts paid pending/processing only (matches web hub)', () => {
    expect(
      isAwaitingShipmentSale({ paymentStatus: 'paid', fulfillmentStatus: 'pending', status: 'paid' }),
    ).toBe(true);
    expect(
      isAwaitingShipmentSale({
        paymentStatus: 'paid',
        fulfillmentStatus: 'processing',
        status: 'paid',
      }),
    ).toBe(true);
  });

  it('excludes shipped, delivered, and unlabeled paid that already have labels', () => {
    expect(
      isAwaitingShipmentSale({
        paymentStatus: 'paid',
        fulfillmentStatus: 'label_created',
        status: 'paid',
      }),
    ).toBe(false);
    expect(
      isAwaitingShipmentSale({
        paymentStatus: 'paid',
        fulfillmentStatus: 'in_transit',
        status: 'shipped',
      }),
    ).toBe(false);
    expect(
      isAwaitingShipmentSale({
        paymentStatus: 'paid',
        fulfillmentStatus: 'delivered',
        status: 'delivered',
      }),
    ).toBe(false);
  });

  it('excludes unpaid and cancelled', () => {
    expect(
      isAwaitingShipmentSale({
        paymentStatus: 'pending_payment',
        fulfillmentStatus: 'pending',
        status: 'pending',
      }),
    ).toBe(false);
    expect(
      isAwaitingShipmentSale({
        paymentStatus: 'paid',
        fulfillmentStatus: 'pending',
        status: 'cancelled',
      }),
    ).toBe(false);
  });

  it('countAwaitingShipmentSales does not inflate with all paid sales', () => {
    expect(
      countAwaitingShipmentSales([
        { paymentStatus: 'paid', fulfillmentStatus: 'pending', status: 'paid' },
        { paymentStatus: 'paid', fulfillmentStatus: 'in_transit', status: 'shipped' },
        { paymentStatus: 'paid', fulfillmentStatus: 'delivered', status: 'delivered' },
      ]),
    ).toBe(1);
  });
});
