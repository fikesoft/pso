import { expect, it } from 'vitest';
import type { KitchenTicket } from '@pos/contracts';
import {
  kitchenBatchElapsed,
  kitchenItemsSeverity,
  kitchenTicketSeverity,
} from './kitchen-severity';

function fixture(): KitchenTicket {
  const createdAt = '2026-10-04T00:00:00.000Z';
  return {
    id: 'ticket',
    orderId: 'order',
    locationId: 'location',
    orderNumber: 1,
    orderVersion: 2,
    revision: 1,
    serviceType: 'DINE_IN',
    tableLabel: '1',
    status: 'QUEUED',
    version: 1,
    createdAt,
    updatedAt: createdAt,
    items: [10, 100].map((warningSeconds, index) => ({
      id: `item-${index}`,
      orderItemId: `order-item-${index}`,
      position: index,
      courseNumber: 0,
      productName: `Produs ${index}`,
      productSku: `SKU-${index}`,
      quantity: '1.000',
      note: null,
      modifierGroups: [],
      alertThresholds: { warningSeconds, criticalSeconds: warningSeconds * 2 },
    })),
    batches: [0, 1].map((index) => ({
      id: `batch-${index}`,
      status: 'QUEUED',
      version: 1,
      courseNumber: 0,
      firedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      station: { id: `station-${index}`, code: `S${index}`, name: `Stație ${index}` },
      ticketItemIds: [`item-${index}`],
    })),
  };
}

it('severitatea agregată urmărește articolul cel mai întârziat și pragurile exacte', () => {
  const { items } = fixture();
  expect(kitchenItemsSeverity(items, 9)).toBe('NORMAL');
  expect(kitchenItemsSeverity(items, 10)).toBe('WARNING');
  expect(kitchenItemsSeverity(items, 20)).toBe('CRITICAL');
  expect(kitchenItemsSeverity([...items].reverse(), 20)).toBe('CRITICAL');
  expect(kitchenItemsSeverity(items, undefined)).toBeUndefined();
  expect(kitchenItemsSeverity(items, NaN)).toBeUndefined();
});

it('filtrul stației exclude întârzierea altor stații și grupurile gata nu mai alertează', () => {
  const ticket = fixture();
  const now = Date.parse(ticket.createdAt) + 30000;
  expect(kitchenTicketSeverity(ticket, ticket.batches, now)).toBe('CRITICAL');
  expect(kitchenTicketSeverity(ticket, [ticket.batches[1]!], now)).toBe('NORMAL');
  ticket.batches[0]!.status = 'READY';
  ticket.status = 'PARTIALLY_READY';
  expect(kitchenBatchElapsed(ticket.batches[0]!, now)).toBeUndefined();
  expect(kitchenTicketSeverity(ticket, ticket.batches, now)).toBe('NORMAL');
  expect(kitchenTicketSeverity(ticket, [ticket.batches[0]!], now)).toBeUndefined();
  ticket.batches[1]!.status = 'CANCELLED';
  expect(kitchenTicketSeverity(ticket, ticket.batches, now)).toBeUndefined();
});

it('READY și CANCELLED nu alertează chiar dacă datele grupurilor sunt vechi', () => {
  const ticket = fixture();
  const now = Date.parse(ticket.createdAt) + 300000;
  expect(kitchenTicketSeverity(ticket, ticket.batches, undefined)).toBeUndefined();
  ticket.status = 'READY';
  expect(kitchenTicketSeverity(ticket, ticket.batches, now)).toBeUndefined();
  ticket.status = 'CANCELLED';
  expect(kitchenTicketSeverity(ticket, ticket.batches, now)).toBeUndefined();
});

it('etapele în așteptare nu alertează, iar lansarea pornește timpul de la firedAt', () => {
  const ticket = fixture();
  const batch = ticket.batches[0]!;
  batch.courseNumber = 1;
  batch.firedAt = null;
  const now = Date.parse(ticket.createdAt) + 300000;
  expect(kitchenBatchElapsed(batch, now)).toBeUndefined();
  expect(kitchenTicketSeverity(ticket, [batch], now)).toBeUndefined();
  batch.firedAt = new Date(now - 10000).toISOString();
  expect(kitchenBatchElapsed(batch, now)).toBe(10);
  expect(kitchenTicketSeverity(ticket, [batch], now)).toBe('WARNING');
});
