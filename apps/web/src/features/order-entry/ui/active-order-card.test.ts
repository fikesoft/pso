import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ActiveOrder } from '@pos/contracts';
import { ActiveOrderCard } from './active-order-card';
import { activeOrderMessages, paymentMessages } from '@pos/ui/locales';
function order(): ActiveOrder {
  return {
    id: 'order',
    number: 7,
    status: 'COMPLETED',
    serviceType: 'DELIVERY',
    source: null,
    total: '999999999.99',
    currency: 'MDL',
    createdAt: '2026-09-26T10:00:00Z',
    kitchenStatus: 'READY',
    paymentStatus: 'PARTIALLY_REFUNDED',
    deliveryStatus: null,
    paymentSummary: {
      status: 'PARTIALLY_REFUNDED',
      collectedAmount: '999999999.99',
      refundedAmount: '0.01',
      netPaidAmount: '999999999.98',
      outstandingAmount: '0.01',
    },
    activeReasons: ['FINANCIAL_REVIEW', 'DELIVERY_UNKNOWN'],
  } as ActiveOrder;
}
describe('active order presentation', () => {
  it('prioritizes cashier financial state without treating review as outstanding collection', () => {
    const html = renderToStaticMarkup(
      createElement(ActiveOrderCard, {
        order: order(),
        timezone: 'Europe/Chisinau',
        disabled: false,
        mode: 'cashier',
        onOpen: () => {},
      }),
    );
    expect(html).toContain('Detalii și plăți');
    expect(html).toContain('nu indică automat o nouă obligație');
    expect(html).not.toContain('Sold rămas');
    expect(html.indexOf(paymentMessages.net)).toBeLessThan(
      html.indexOf(`<dt>${activeOrderMessages.operation}</dt>`),
    );
    expect(html.indexOf('Rambursată parțial')).toBeLessThan(html.indexOf(paymentMessages.net));
    expect(html).toContain('Stare istorică neînregistrată');
  });
  it('keeps cashier outstanding exactly as returned by the server', () => {
    const value = { ...order(), activeReasons: ['PAYMENT_OUTSTANDING'] } as ActiveOrder;
    const html = renderToStaticMarkup(
      createElement(ActiveOrderCard, {
        order: value,
        timezone: 'Europe/Chisinau',
        disabled: true,
        mode: 'cashier',
        onOpen: () => {},
      }),
    );
    expect(html).toContain('Sold rămas');
    expect(html).toContain('0.01');
    expect(html).toContain('999999999.98');
    expect(html).toContain('disabled');
    expect(html.indexOf('Sold rămas')).toBeLessThan(
      html.indexOf(`<dt>${activeOrderMessages.operation}</dt>`),
    );
  });
  it('keeps completed, refunded and unknown delivery independent without suggesting collection', () => {
    const html = renderToStaticMarkup(
      createElement(ActiveOrderCard, {
        order: order(),
        timezone: 'Europe/Chisinau',
        disabled: true,
        onOpen: () => {},
      }),
    );
    expect(html).toContain('Finalizată');
    expect(html).toContain('Rambursată parțial');
    expect(html).toContain('Stare istorică neînregistrată');
    expect(html).toContain('Verificare financiară');
    expect(html).toContain('nu indică automat o nouă obligație');
    expect(html).toContain('999999999.99');
    expect(html).toContain('999999999.98');
    expect(html).not.toContain('Sold rămas');
    expect(html).not.toContain('PARTIALLY_REFUNDED');
    expect(html).not.toContain('DELIVERY_UNKNOWN');
    expect(html).toContain('disabled');
  });
  it('shows a server outstanding reason exactly alongside a separate unsent kitchen state', () => {
    const value = {
      ...order(),
      status: 'CONFIRMED',
      kitchenStatus: 'NOT_SENT',
      paymentStatus: 'UNPAID',
      activeReasons: ['OPERATIONAL', 'PAYMENT_OUTSTANDING'],
    } as ActiveOrder;
    const html = renderToStaticMarkup(
      createElement(ActiveOrderCard, {
        order: value,
        timezone: 'Europe/Chisinau',
        disabled: false,
        onOpen: () => {},
      }),
    );
    expect(html).toContain('Netrimisă în bucătărie');
    expect(html).toContain('Sold rămas');
    expect(html).toContain('0.01');
    expect(html).toContain('Confirmată');
  });
});
